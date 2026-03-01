/**
 * Citinet Hub API — Mission 1
 *
 * Endpoints:
 *   GET    /health                        — readiness probe
 *   GET    /api/info                      — hub identity (public)
 *   GET    /api/status                    — live stats (public)
 *   POST   /api/auth/register             — create account
 *   POST   /api/auth/login               — authenticate
 *   GET    /api/members                   — member list (auth required)
 *   GET    /api/conversations             — stub (auth required)
 *   GET    /api/files                     — list files (auth required)
 *   POST   /api/files                     — upload file (auth required)
 *   GET    /api/files/:filename           — download file (auth required)
 *   DELETE /api/files/:filename           — delete file (auth required)
 *   PATCH  /api/files/:filename           — toggle visibility (auth required)
 */

const express = require('express');
const os = require('os');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const Minio = require('minio');

const app = express();
const PORT = parseInt(process.env.PORT || '9090', 10);
const START_TIME = Date.now();
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'hub-files';

// ── Storage client (MinIO) ────────────────────────────────

let minioClient = null;

if (process.env.STORAGE_URL && process.env.STORAGE_ACCESS_KEY) {
  try {
    const storageUrl = new URL(process.env.STORAGE_URL);
    minioClient = new Minio.Client({
      endPoint: storageUrl.hostname,
      port: parseInt(storageUrl.port || '9000', 10),
      useSSL: storageUrl.protocol === 'https:',
      accessKey: process.env.STORAGE_ACCESS_KEY,
      secretKey: process.env.STORAGE_SECRET_KEY || '',
    });
  } catch (err) {
    console.warn('Storage client init failed:', err.message);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── Middleware ────────────────────────────────────────────

app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Database ──────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_users (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        username      VARCHAR(50) UNIQUE NOT NULL,
        email         VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        is_admin      BOOLEAN     DEFAULT FALSE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_sessions (
        token      VARCHAR(64) PRIMARY KEY,
        user_id    UUID REFERENCES hub_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_files (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        file_name   VARCHAR(500) NOT NULL,
        file_key    VARCHAR(1000) NOT NULL UNIQUE,
        mime_type   VARCHAR(200),
        size_bytes  BIGINT       DEFAULT 0,
        owner_id    UUID REFERENCES hub_users(id) ON DELETE CASCADE,
        is_public   BOOLEAN      DEFAULT FALSE,
        uploaded_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_conversations (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        kind       VARCHAR(10) NOT NULL DEFAULT 'dm',
        name       VARCHAR(255),
        created_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_conversation_members (
        conversation_id UUID REFERENCES hub_conversations(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES hub_users(id) ON DELETE CASCADE,
        joined_at       TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES hub_conversations(id) ON DELETE CASCADE,
        sender_id       UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        body            TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_message_attachments (
        message_id UUID REFERENCES hub_messages(id) ON DELETE CASCADE,
        file_id    UUID REFERENCES hub_files(id) ON DELETE CASCADE,
        PRIMARY KEY (message_id, file_id)
      )
    `);
  } finally {
    client.release();
  }
}

async function ensureBucket() {
  if (!minioClient) return;
  try {
    const exists = await minioClient.bucketExists(STORAGE_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(STORAGE_BUCKET, 'us-east-1');
      console.log(`Created storage bucket: ${STORAGE_BUCKET}`);
    }
  } catch (err) {
    console.warn('Bucket setup failed (will retry on first upload):', err.message);
  }
}

// ── Auth helpers ──────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.is_admin
       FROM hub_sessions s
       JOIN hub_users u ON s.user_id = u.id
       WHERE s.token = $1`,
      [token]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = result.rows[0];
    next();
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

// ── Helpers ───────────────────────────────────────────────

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function uptimeStr() {
  const secs = Math.floor((Date.now() - START_TIME) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Public routes ─────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.2.0' });
});

app.get('/api/info', (_req, res) => {
  res.json({
    node_name:       process.env.HUB_NAME        || '',
    name:            process.env.HUB_NAME        || '',
    hub_name:        process.env.HUB_NAME        || '',
    hub_slug:        process.env.HUB_SLUG        || '',
    location:        process.env.HUB_LOCATION    || '',
    hub_location:    process.env.HUB_LOCATION    || '',
    description:     process.env.HUB_DESCRIPTION || '',
    hub_description: process.env.HUB_DESCRIPTION || '',
    hub_visibility:  process.env.HUB_VISIBILITY  || 'local',
    tunnel_url:      process.env.TUNNEL_URL       || '',
    lan_ip:          getLanIp(),
    api_port:        PORT,
  });
});

app.get('/api/status', async (_req, res) => {
  let userCount = 0;
  try {
    const r = await pool.query('SELECT COUNT(*) AS c FROM hub_users');
    userCount = parseInt(r.rows[0].c, 10);
  } catch { /* db not ready yet */ }

  res.json({
    online:     true,
    uptime:     uptimeStr(),
    user_count: userCount,
    node_name:  process.env.HUB_NAME || '',
  });
});

// ── Auth routes ───────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const countRes = await pool.query('SELECT COUNT(*) AS c FROM hub_users');
    const isFirst = parseInt(countRes.rows[0].c, 10) === 0;

    const result = await pool.query(
      `INSERT INTO hub_users (username, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, is_admin`,
      [username.trim().toLowerCase(), email || '', hash, isFirst]
    );

    const user = result.rows[0];
    const token = generateToken();
    await pool.query(
      'INSERT INTO hub_sessions (token, user_id) VALUES ($1, $2)',
      [token, user.id]
    );

    res.json({ token, userId: user.id, username: user.username, isAdmin: user.is_admin });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken. Try logging in instead.' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM hub_users WHERE username = $1',
      [username.trim().toLowerCase()]
    );
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = generateToken();
    await pool.query(
      'INSERT INTO hub_sessions (token, user_id) VALUES ($1, $2)',
      [token, user.id]
    );

    res.json({ token, userId: user.id, username: user.username, isAdmin: user.is_admin });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Authenticated routes ──────────────────────────────────

app.get('/api/members', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id AS user_id, username, is_admin, created_at FROM hub_users ORDER BY created_at'
    );
    res.json({ members: result.rows });
  } catch (err) {
    console.error('Members error:', err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// ── Conversation routes ───────────────────────────────────

// List conversations the current user is a member of
app.get('/api/conversations', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.id AS conversation_id,
         c.kind,
         c.name,
         c.created_by,
         c.created_at,
         c.updated_at,
         (
           SELECT json_agg(json_build_object('user_id', u.id, 'username', u.username)
                           ORDER BY cm.joined_at)
           FROM hub_conversation_members cm
           JOIN hub_users u ON cm.user_id = u.id
           WHERE cm.conversation_id = c.id
         ) AS members,
         (
           SELECT json_build_object(
             'message_id',      m.id,
             'conversation_id', m.conversation_id,
             'sender_id',       m.sender_id,
             'sender_username', su.username,
             'body',            m.body,
             'created_at',      m.created_at
           )
           FROM hub_messages m
           LEFT JOIN hub_users su ON m.sender_id = su.id
           WHERE m.conversation_id = c.id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) AS last_message
       FROM hub_conversations c
       JOIN hub_conversation_members me ON c.id = me.conversation_id AND me.user_id = $1
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('List conversations error:', err);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Create a DM or group conversation
app.post('/api/conversations', authenticate, async (req, res) => {
  const { kind, peer_user_id, participant_ids, name } = req.body || {};

  if (kind !== 'dm' && kind !== 'group') {
    return res.status(400).json({ error: 'kind must be dm or group' });
  }

  try {
    if (kind === 'dm') {
      if (!peer_user_id) return res.status(400).json({ error: 'peer_user_id required for DM' });

      // Return existing DM if one already exists between these two users
      const existing = await pool.query(
        `SELECT c.id FROM hub_conversations c
         JOIN hub_conversation_members m1 ON c.id = m1.conversation_id AND m1.user_id = $1
         JOIN hub_conversation_members m2 ON c.id = m2.conversation_id AND m2.user_id = $2
         WHERE c.kind = 'dm'
         LIMIT 1`,
        [req.user.id, peer_user_id]
      );

      if (existing.rows[0]) {
        // Fetch and return the full existing conversation
        const full = await pool.query(
          `SELECT c.id AS conversation_id, c.kind, c.name, c.created_by, c.created_at, c.updated_at,
                  json_agg(json_build_object('user_id', u.id, 'username', u.username)) AS members
           FROM hub_conversations c
           JOIN hub_conversation_members cm ON c.id = cm.conversation_id
           JOIN hub_users u ON cm.user_id = u.id
           WHERE c.id = $1
           GROUP BY c.id`,
          [existing.rows[0].id]
        );
        return res.json(full.rows[0]);
      }

      // Verify peer exists
      const peer = await pool.query('SELECT id FROM hub_users WHERE id = $1', [peer_user_id]);
      if (!peer.rows[0]) return res.status(404).json({ error: 'User not found' });

      const conv = await pool.query(
        `INSERT INTO hub_conversations (kind, created_by) VALUES ('dm', $1) RETURNING *`,
        [req.user.id]
      );
      await pool.query(
        `INSERT INTO hub_conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3)`,
        [conv.rows[0].id, req.user.id, peer_user_id]
      );

      const full = await pool.query(
        `SELECT c.id AS conversation_id, c.kind, c.name, c.created_by, c.created_at, c.updated_at,
                json_agg(json_build_object('user_id', u.id, 'username', u.username)) AS members
         FROM hub_conversations c
         JOIN hub_conversation_members cm ON c.id = cm.conversation_id
         JOIN hub_users u ON cm.user_id = u.id
         WHERE c.id = $1
         GROUP BY c.id`,
        [conv.rows[0].id]
      );
      return res.json(full.rows[0]);
    }

    // Group conversation
    const allIds = [...new Set([req.user.id, ...(participant_ids || [])])];
    if (allIds.length < 2) return res.status(400).json({ error: 'Groups need at least 2 members' });

    const conv = await pool.query(
      `INSERT INTO hub_conversations (kind, name, created_by) VALUES ('group', $1, $2) RETURNING *`,
      [name || null, req.user.id]
    );

    const values = allIds.map((id, i) => `($1, $${i + 2})`).join(', ');
    await pool.query(
      `INSERT INTO hub_conversation_members (conversation_id, user_id) VALUES ${values}`,
      [conv.rows[0].id, ...allIds]
    );

    const full = await pool.query(
      `SELECT c.id AS conversation_id, c.kind, c.name, c.created_by, c.created_at, c.updated_at,
              json_agg(json_build_object('user_id', u.id, 'username', u.username)) AS members
       FROM hub_conversations c
       JOIN hub_conversation_members cm ON c.id = cm.conversation_id
       JOIN hub_users u ON cm.user_id = u.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [conv.rows[0].id]
    );
    return res.json(full.rows[0]);
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages for a conversation (newest-first, paginated by cursor)
app.get('/api/conversations/:id/messages', authenticate, async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before; // message ID to paginate before

  try {
    // Must be a member
    const member = await pool.query(
      `SELECT 1 FROM hub_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not a member of this conversation' });

    let rows;
    if (before) {
      // Cursor: messages older than the given message ID
      const { rows: r } = await pool.query(
        `SELECT m.id AS message_id, m.conversation_id, m.sender_id,
                u.username AS sender_username, m.body, m.created_at
         FROM hub_messages m
         LEFT JOIN hub_users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1
           AND m.created_at < (SELECT created_at FROM hub_messages WHERE id = $2)
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [id, before, limit]
      );
      rows = r;
    } else {
      const { rows: r } = await pool.query(
        `SELECT m.id AS message_id, m.conversation_id, m.sender_id,
                u.username AS sender_username, m.body, m.created_at
         FROM hub_messages m
         LEFT JOIN hub_users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [id, limit]
      );
      rows = r;
    }

    // Return in chronological order (UI renders oldest→newest)
    res.json({ messages: rows.reverse() });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send a message
app.post('/api/conversations/:id/messages', authenticate, async (req, res) => {
  const { id } = req.params;
  const { body, attachment_ids } = req.body || {};

  try {
    // Must be a member
    const member = await pool.query(
      `SELECT 1 FROM hub_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not a member of this conversation' });

    // Insert message
    const msgResult = await pool.query(
      `INSERT INTO hub_messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id AS message_id, conversation_id, sender_id, body, created_at`,
      [id, req.user.id, body || '']
    );
    const msg = msgResult.rows[0];

    // Link any file attachments
    const attachments = [];
    if (Array.isArray(attachment_ids) && attachment_ids.length > 0) {
      for (const fileId of attachment_ids) {
        await pool.query(
          `INSERT INTO hub_message_attachments (message_id, file_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [msg.message_id, fileId]
        ).catch(() => {}); // ignore unknown file IDs

        const fileRow = await pool.query(
          `SELECT id AS file_id, file_name, mime_type, size_bytes AS size FROM hub_files WHERE id = $1`,
          [fileId]
        );
        if (fileRow.rows[0]) attachments.push(fileRow.rows[0]);
      }
    }

    // Bump conversation updated_at so it floats to top of list
    await pool.query(`UPDATE hub_conversations SET updated_at = NOW() WHERE id = $1`, [id]);

    res.json({
      message_id:      msg.message_id,
      conversation_id: id,
      sender_id:       req.user.id,
      sender_username: req.user.username,
      body:            msg.body,
      attachments:     attachments.length > 0 ? attachments : undefined,
      created_at:      msg.created_at,
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── File routes ───────────────────────────────────────────

// List files — own files + public files from others
app.get('/api/files', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS file_id, file_name, file_key, mime_type, size_bytes,
              owner_id, is_public, uploaded_at
       FROM hub_files
       WHERE owner_id = $1 OR is_public = true
       ORDER BY uploaded_at DESC`,
      [req.user.id]
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Upload file
app.post('/api/files', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const isPublic = req.body.is_public === 'true';
  // Prefix with owner ID to avoid collisions between users with same filename
  const fileKey = `${req.user.id}/${req.file.originalname}`;

  try {
    if (minioClient) {
      await minioClient.putObject(
        STORAGE_BUCKET,
        fileKey,
        req.file.buffer,
        req.file.size,
        { 'Content-Type': req.file.mimetype }
      );
    }

    const result = await pool.query(
      `INSERT INTO hub_files (file_name, file_key, mime_type, size_bytes, owner_id, is_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (file_key) DO UPDATE
         SET size_bytes  = EXCLUDED.size_bytes,
             mime_type   = EXCLUDED.mime_type,
             is_public   = EXCLUDED.is_public,
             uploaded_at = NOW()
       RETURNING id AS file_id, file_name, size_bytes, mime_type, is_public, uploaded_at`,
      [req.file.originalname, fileKey, req.file.mimetype, req.file.size, req.user.id, isPublic]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Download file
app.get('/api/files/:filename', authenticate, async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);

  try {
    const result = await pool.query(
      `SELECT * FROM hub_files
       WHERE file_name = $1 AND (owner_id = $2 OR is_public = true)
       LIMIT 1`,
      [fileName, req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];

    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

    const stream = await minioClient.getObject(STORAGE_BUCKET, file.file_key);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    if (file.size_bytes) res.setHeader('Content-Length', file.size_bytes);
    stream.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Delete file
app.delete('/api/files/:filename', authenticate, async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);

  try {
    const result = await pool.query(
      `DELETE FROM hub_files WHERE file_name = $1 AND owner_id = $2 RETURNING file_key`,
      [fileName, req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });

    if (minioClient) {
      await minioClient.removeObject(STORAGE_BUCKET, result.rows[0].file_key).catch(() => {});
    }

    res.sendStatus(204);
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Toggle file visibility
app.patch('/api/files/:filename', authenticate, async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);
  const { is_public } = req.body;

  try {
    const result = await pool.query(
      `UPDATE hub_files SET is_public = $1
       WHERE file_name = $2 AND owner_id = $3
       RETURNING id`,
      [is_public, fileName, req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Patch error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── Start ─────────────────────────────────────────────────

async function start() {
  try {
    await initDb();
    console.log('Database tables ready');
  } catch (err) {
    console.warn('DB init failed (will retry on first request):', err.message);
  }

  await ensureBucket();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Citinet API listening on port ${PORT}`);
    console.log(`  Hub:        ${process.env.HUB_NAME || '(unnamed)'}`);
    console.log(`  Visibility: ${process.env.HUB_VISIBILITY || 'local'}`);
    console.log(`  Storage:    ${minioClient ? STORAGE_BUCKET + ' (MinIO)' : 'not configured'}`);
    if (process.env.TUNNEL_URL) {
      console.log(`  Tunnel:     ${process.env.TUNNEL_URL}`);
    }
  });
}

start();
