/**
 * Citinet Hub API — Mission 1 + Governance (Tier 1)
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
 *   GET    /api/posts                     — list posts (auth required)
 *   POST   /api/posts                     — create post (auth required)
 *   PATCH  /api/posts/:id                 — update post (auth required)
 *   DELETE /api/posts/:id                 — delete post (auth required)
 *   GET    /api/posts/:id/replies         — list replies (auth required)
 *   POST   /api/posts/:id/replies         — create reply (auth required)
 */

const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
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

const uploadBg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB cap for background images
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_posts (
        id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        category      VARCHAR(20)  NOT NULL DEFAULT 'DISCUSSION',
        title         VARCHAR(500) NOT NULL,
        body          TEXT         NOT NULL DEFAULT '',
        author_id     UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        media_file_id UUID REFERENCES hub_files(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ  DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_post_replies (
        id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id   UUID REFERENCES hub_posts(id) ON DELETE CASCADE,
        author_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        body      TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_atlas_pins (
        id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id   UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        latitude    DOUBLE PRECISION NOT NULL,
        longitude   DOUBLE PRECISION NOT NULL,
        title       VARCHAR(200)     NOT NULL,
        description TEXT,
        category    VARCHAR(20)      NOT NULL DEFAULT 'poi',
        created_at  TIMESTAMPTZ      DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_config (
        key   VARCHAR(100) PRIMARY KEY,
        value TEXT         NOT NULL DEFAULT ''
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_featured (
        id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        type           VARCHAR(10)  NOT NULL DEFAULT 'post',
        ref_id         UUID         REFERENCES hub_posts(id) ON DELETE CASCADE,
        title          VARCHAR(200) NOT NULL,
        caption        TEXT,
        category_label VARCHAR(50),
        image_url      TEXT,
        display_order  INT          NOT NULL DEFAULT 0,
        created_by     UUID         REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at     TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_vendors (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id   UUID         NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
        name            VARCHAR(100) NOT NULL,
        description     TEXT,
        category        TEXT         DEFAULT 'General',
        logo_file_name  TEXT,
        banner_mode     TEXT,
        banner_image_file_name TEXT,
        banner_color    TEXT,
        banner_gradient_from TEXT,
        banner_gradient_to TEXT,
        contact_email   TEXT,
        contact_phone   TEXT,
        website         TEXT,
        hours           TEXT,
        created_at      TIMESTAMPTZ  DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  DEFAULT NOW(),
        UNIQUE(owner_user_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_listings (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id       UUID          NOT NULL REFERENCES hub_vendors(id) ON DELETE CASCADE,
        title           VARCHAR(200)  NOT NULL,
        description     TEXT,
        price           DECIMAL(10,2),
        price_type      TEXT          DEFAULT 'fixed',
        category        TEXT          DEFAULT 'Other',
        image_file_name TEXT,
        condition       TEXT,
        is_active       BOOLEAN       DEFAULT TRUE,
        created_at      TIMESTAMPTZ   DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_user_preferences (
        user_id  UUID         REFERENCES hub_users(id) ON DELETE CASCADE,
        key      VARCHAR(100) NOT NULL,
        value    TEXT,
        PRIMARY KEY (user_id, key)
      )
    `);
    // Migrations — add columns that may not exist on older schemas
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS avatar_url             TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS display_name           TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS location               TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS bio                    TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS tags                   TEXT[]`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ DEFAULT NOW()`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS profile_headline       TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banner_mode            TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banner_color           TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banner_gradient_from   TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banner_gradient_to     TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banner_image_file_name TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS website                TEXT`);
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS last_seen_at          TIMESTAMPTZ`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_users_last_seen ON hub_users(last_seen_at)`);
    // Governance — role system
    await client.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`);
    await client.query(`UPDATE hub_users SET role = 'admin' WHERE is_admin = TRUE AND role = 'member'`);
    // Governance — moderation log
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_mod_log (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id    UUID        REFERENCES hub_users(id) ON DELETE SET NULL,
        action_type VARCHAR(50) NOT NULL,
        target_type VARCHAR(20),
        target_id   TEXT,
        target_name TEXT,
        reason      TEXT,
        meta        JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_mod_log_created ON hub_mod_log(created_at DESC)`);
    // Governance — polls
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_polls (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        question   TEXT        NOT NULL,
        options    JSONB       NOT NULL DEFAULT '[]',
        created_by UUID        REFERENCES hub_users(id) ON DELETE SET NULL,
        closes_at  TIMESTAMPTZ,
        closed     BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_poll_votes (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id      UUID        NOT NULL REFERENCES hub_polls(id) ON DELETE CASCADE,
        voter_id     UUID        NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
        option_index INT         NOT NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(poll_id, voter_id)
      )
    `);
    // Governance linkage migrations
    await client.query(`ALTER TABLE hub_polls    ADD COLUMN IF NOT EXISTS request_id  UUID REFERENCES hub_requests(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE hub_polls    ADD COLUMN IF NOT EXISTS quorum_pct  INT  NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE hub_polls    ADD COLUMN IF NOT EXISTS pass_pct    INT  NOT NULL DEFAULT 50`);
    await client.query(`ALTER TABLE hub_requests ADD COLUMN IF NOT EXISTS poll_id     UUID REFERENCES hub_polls(id)    ON DELETE SET NULL`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS logo_file_name TEXT`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS banner_mode TEXT`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS banner_image_file_name TEXT`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS banner_color TEXT`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS banner_gradient_from TEXT`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS banner_gradient_to TEXT`);
    await client.query(`ALTER TABLE hub_post_replies ADD COLUMN IF NOT EXISTS reply_to_reply_id UUID REFERENCES hub_post_replies(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE hub_post_replies ADD COLUMN IF NOT EXISTS reply_to_user_id  UUID REFERENCES hub_users(id)       ON DELETE SET NULL`);
    // Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_notifications (
        id         SERIAL       PRIMARY KEY,
        user_id    UUID         NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
        type       VARCHAR(50)  NOT NULL,
        actor_id   UUID         REFERENCES hub_users(id) ON DELETE SET NULL,
        ref_id     TEXT,
        read       BOOLEAN      DEFAULT false,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_hub_notifications_user_unread
      ON hub_notifications(user_id, read) WHERE read = false
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
      `SELECT u.id, u.username, u.is_admin, u.role
       FROM hub_sessions s
       JOIN hub_users u ON s.user_id = u.id
       WHERE s.token = $1`,
      [token]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = result.rows[0];
    // Fire-and-forget presence heartbeat — no await so it never blocks the request
    pool.query('UPDATE hub_users SET last_seen_at = NOW() WHERE id = $1', [req.user.id]).catch(() => {});
    next();
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

// ── Governance helpers ────────────────────────────────────

/** True for admins AND moderators — used for content moderation gates */
function isMod(user) {
  return user.role === 'admin' || user.role === 'moderator' || user.is_admin === true;
}

/** Write an immutable mod-log entry. Fire-and-forget safe. */
async function logMod(actorId, actionType, targetType, targetId, targetName, reason, meta) {
  return pool.query(
    `INSERT INTO hub_mod_log (actor_id, action_type, target_type, target_id, target_name, reason, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorId ?? null, actionType, targetType ?? null, targetId ? String(targetId) : null, targetName ?? null, reason ?? null, meta ? JSON.stringify(meta) : null]
  ).catch(err => console.error('logMod error:', err));
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

// Root — browser landing. If a portal URL is configured (the hosted React app),
// redirect there with this hub's URL pre-filled so the join flow auto-connects.
// Otherwise return a minimal HTML page that identifies this as a Citinet hub API.
app.get('/', (req, res) => {
  // If the portal is bundled into this image, serve it directly.
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  // Fallback: no bundled portal — redirect to PORTAL_URL if configured,
  // otherwise show the plain hub info page.
  const portalUrl = process.env.PORTAL_URL || '';
  const tunnelUrl = process.env.TUNNEL_URL || `${req.protocol}://${req.get('host')}`;
  const hubName   = process.env.HUB_NAME   || 'Citinet Hub';

  if (portalUrl) {
    const joinUrl = `${portalUrl.replace(/\/$/, '')}/join?url=${encodeURIComponent(tunnelUrl)}`;
    return res.redirect(302, joinUrl);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${hubName}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#1e293b}
h1{font-size:1.5rem;font-weight:700}p{color:#475569;line-height:1.6}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:.9em}
a{color:#7c3aed}</style></head>
<body>
<h1>${hubName}</h1>
<p>This is a <strong>Citinet community hub</strong> API. To join this hub, open the Citinet app and enter this URL:</p>
<p><code>${tunnelUrl}</code></p>
<p>Don't have the app? Ask the hub admin for the join link.</p>
</body></html>`);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.2.0' });
});

app.get('/api/info', async (_req, res) => {
  // Read overrides from hub_config DB (set by admin via PATCH /api/hub-info).
  // Falls back to env vars baked in at startup.
  let cfg = {};
  try {
    const r = await pool.query('SELECT key, value FROM hub_config');
    for (const row of r.rows) cfg[row.key] = row.value;
  } catch { /* db may not be ready yet — use env fallback */ }

  const name        = cfg.hub_name        || process.env.HUB_NAME        || '';
  const location    = cfg.hub_location    || process.env.HUB_LOCATION    || '';
  const description = cfg.hub_description || process.env.HUB_DESCRIPTION || '';

  res.json({
    node_name:       name,
    name:            name,
    hub_name:        name,
    hub_slug:        process.env.HUB_SLUG       || '',
    location:        location,
    hub_location:    location,
    description:     description,
    hub_description: description,
    hub_visibility:  process.env.HUB_VISIBILITY || 'local',
    tunnel_url:      process.env.TUNNEL_URL      || '',
    lan_ip:          getLanIp(),
    api_port:        PORT,
  });
});

// Update hub identity fields (name, location, description) — admin only.
// Persists to hub_config table so changes survive container restarts.
app.patch('/api/hub-info', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { name, location, description } = req.body || {};
  const updates = [];
  if (name        !== undefined) updates.push(['hub_name',        String(name).trim()]);
  if (location    !== undefined) updates.push(['hub_location',    String(location).trim()]);
  if (description !== undefined) updates.push(['hub_description', String(description).trim()]);
  if (updates.length === 0) return res.status(400).json({ error: 'No fields provided' });
  try {
    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO hub_config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', async (_req, res) => {
  let userCount = 0;
  let onlineNow = 0;
  try {
    const r = await pool.query('SELECT COUNT(*) AS c FROM hub_users');
    userCount = parseInt(r.rows[0].c, 10);
    const o = await pool.query(
      `SELECT COUNT(*) AS c FROM hub_users WHERE last_seen_at > NOW() - INTERVAL '5 minutes'`
    );
    onlineNow = parseInt(o.rows[0].c, 10);
  } catch { /* db not ready yet */ }

  res.json({
    online:      true,
    uptime:      uptimeStr(),
    user_count:  userCount,
    online_now:  onlineNow,
    node_name:   process.env.HUB_NAME || '',
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
      `INSERT INTO hub_users (username, email, password_hash, is_admin, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, is_admin, role, avatar_url`,
      [username.trim().toLowerCase(), email || '', hash, isFirst, isFirst ? 'admin' : 'member']
    );

    const user = result.rows[0];
    const token = generateToken();
    await pool.query(
      'INSERT INTO hub_sessions (token, user_id) VALUES ($1, $2)',
      [token, user.id]
    );

    res.json({
      token,
      userId: user.id,
      username: user.username,
      isAdmin: user.is_admin,
      role:    user.role,
      avatar_url:   user.avatar_url   || null,
      display_name: user.display_name || null,
      location:     user.location     || null,
      bio:          user.bio          || null,
      tags:         user.tags         || [],
    });
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

    res.json({
      token,
      userId: user.id,
      username: user.username,
      isAdmin: user.is_admin,
      role:    user.role ?? (user.is_admin ? 'admin' : 'member'),
      avatar_url:   user.avatar_url   || null,
      display_name: user.display_name || null,
      location:     user.location     || null,
      bio:          user.bio          || null,
      tags:         user.tags         || [],
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Change password
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM hub_users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE hub_users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Upload avatar
app.post('/api/auth/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const avatarKey = `avatars/${req.user.id}.${ext}`;

  try {
    await minioClient.putObject(
      STORAGE_BUCKET,
      avatarKey,
      req.file.buffer,
      req.file.size,
      { 'Content-Type': req.file.mimetype }
    );

    // Store relative key so it works even if tunnel URL changes
    await pool.query('UPDATE hub_users SET avatar_url = $1 WHERE id = $2', [avatarKey, req.user.id]);
    res.json({ avatar_key: avatarKey });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Avatar upload failed' });
  }
});

// Serve avatar (no auth — avatars are visible to hub members)
app.get('/api/auth/avatar/:userId', async (req, res) => {
  if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

  try {
    const result = await pool.query('SELECT avatar_url FROM hub_users WHERE id = $1', [req.params.userId]);
    const user = result.rows[0];
    if (!user || !user.avatar_url) return res.status(404).json({ error: 'No avatar' });

    const stat = await minioClient.statObject(STORAGE_BUCKET, user.avatar_url).catch(() => null);
    const stream = await minioClient.getObject(STORAGE_BUCKET, user.avatar_url);
    res.setHeader('Content-Type', stat?.metaData?.['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    stream.pipe(res);
  } catch (err) {
    console.error('Avatar serve error:', err);
    res.status(500).json({ error: 'Failed to load avatar' });
  }
});

// Upload profile banner image
app.post('/api/auth/profile-banner', authenticate, upload.single('banner'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const bannerKey = `profile_banners/${req.user.id}.${ext}`;

  try {
    await minioClient.putObject(STORAGE_BUCKET, bannerKey, req.file.buffer, req.file.size, { 'Content-Type': req.file.mimetype });
    await pool.query(
      `UPDATE hub_users SET banner_image_file_name = $1, banner_mode = 'image', updated_at = NOW() WHERE id = $2`,
      [bannerKey, req.user.id]
    );
    res.json({ banner_key: bannerKey });
  } catch (err) {
    console.error('Profile banner upload error:', err);
    res.status(500).json({ error: 'Banner upload failed' });
  }
});

// Serve profile banner (no auth — visible to hub members)
app.get('/api/auth/profile-banner/:userId', async (req, res) => {
  if (!minioClient) return res.status(503).json({ error: 'Storage not available' });
  try {
    const result = await pool.query('SELECT banner_image_file_name FROM hub_users WHERE id = $1', [req.params.userId]);
    const user = result.rows[0];
    if (!user?.banner_image_file_name) return res.status(404).json({ error: 'No banner' });
    const stat = await minioClient.statObject(STORAGE_BUCKET, user.banner_image_file_name).catch(() => null);
    const stream = await minioClient.getObject(STORAGE_BUCKET, user.banner_image_file_name);
    res.setHeader('Content-Type', stat?.metaData?.['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    stream.pipe(res);
  } catch (err) {
    console.error('Profile banner serve error:', err);
    res.status(500).json({ error: 'Failed to load banner' });
  }
});

// Update own profile (display name, location, bio, tags, headline, banner, website)
app.patch('/api/auth/profile', authenticate, async (req, res) => {
  const { display_name, location, bio, tags, profile_headline, banner_mode, banner_color, banner_gradient_from, banner_gradient_to, website } = req.body || {};
  const fields = [];
  const values = [];
  let idx = 1;

  if (display_name        !== undefined) { fields.push(`display_name = $${idx++}`);        values.push(display_name || null); }
  if (location            !== undefined) { fields.push(`location = $${idx++}`);             values.push(location || null); }
  if (bio                 !== undefined) { fields.push(`bio = $${idx++}`);                  values.push(bio || null); }
  if (tags                !== undefined) { fields.push(`tags = $${idx++}`);                 values.push(Array.isArray(tags) ? tags : []); }
  if (profile_headline    !== undefined) { fields.push(`profile_headline = $${idx++}`);     values.push(profile_headline || null); }
  if (banner_mode         !== undefined) { fields.push(`banner_mode = $${idx++}`);          values.push(banner_mode || null); }
  if (banner_color        !== undefined) { fields.push(`banner_color = $${idx++}`);         values.push(banner_color || null); }
  if (banner_gradient_from !== undefined) { fields.push(`banner_gradient_from = $${idx++}`); values.push(banner_gradient_from || null); }
  if (banner_gradient_to  !== undefined) { fields.push(`banner_gradient_to = $${idx++}`);   values.push(banner_gradient_to || null); }
  if (website             !== undefined) { fields.push(`website = $${idx++}`);              values.push(website || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  fields.push(`updated_at = NOW()`);
  values.push(req.user.id);

  try {
    const result = await pool.query(
      `UPDATE hub_users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id AS user_id, username, display_name, location, bio, tags, avatar_url, is_admin, created_at, updated_at,
                 profile_headline, banner_mode, banner_color, banner_gradient_from, banner_gradient_to, banner_image_file_name, website`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── Authenticated routes ──────────────────────────────────

app.get('/api/members', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS user_id, username, display_name, location, bio, tags,
              is_admin, created_at, avatar_url,
              profile_headline, banner_mode, banner_color, banner_gradient_from, banner_gradient_to, banner_image_file_name, website
       FROM hub_users ORDER BY created_at`
    );
    res.json({ members: result.rows });
  } catch (err) {
    console.error('Members error:', err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// Get a single member's public profile
app.get('/api/members/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS user_id, username, display_name, location, bio, tags,
              avatar_url, is_admin, created_at,
              profile_headline, banner_mode, banner_color, banner_gradient_from, banner_gradient_to, banner_image_file_name, website
       FROM hub_users WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Member not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Member profile error:', err);
    res.status(500).json({ error: 'Failed to load member profile' });
  }
});

// Toggle admin status for a member (admin only)
app.patch('/api/members/:id/admin', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const targetId = req.params.id;
  const { is_admin } = req.body;
  if (typeof is_admin !== 'boolean') return res.status(400).json({ error: 'is_admin must be a boolean' });
  // Prevent the last admin from demoting themselves
  if (!is_admin && targetId === req.user.id) {
    const { rows } = await pool.query("SELECT COUNT(*) AS c FROM hub_users WHERE is_admin = true");
    if (parseInt(rows[0].c, 10) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin' });
    }
  }
  try {
    const result = await pool.query(
      'UPDATE hub_users SET is_admin = $1 WHERE id = $2 RETURNING id, username, is_admin',
      [is_admin, targetId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Member not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Toggle admin error:', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// Set member role (admin only)
app.patch('/api/members/:id/role', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && !req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const targetId = req.params.id;
  const { role } = req.body;
  const VALID_ROLES = ['member', 'moderator', 'admin'];
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  if (role !== 'admin' && targetId === req.user.id) {
    const { rows } = await pool.query(`SELECT COUNT(*) AS c FROM hub_users WHERE role = 'admin' OR is_admin = TRUE`);
    if (parseInt(rows[0].c, 10) <= 1) return res.status(400).json({ error: 'Cannot demote the last admin' });
  }
  try {
    const { rows: target } = await pool.query('SELECT username, role FROM hub_users WHERE id = $1', [targetId]);
    if (!target[0]) return res.status(404).json({ error: 'Member not found' });
    const prevRole = target[0].role;
    const { rows } = await pool.query(
      `UPDATE hub_users SET role = $1, is_admin = ($1 = 'admin'), updated_at = NOW() WHERE id = $2
       RETURNING id, username, role, is_admin`,
      [role, targetId]
    );
    const action = role === 'moderator' ? 'promote_moderator'
                 : prevRole === 'moderator' ? 'demote_moderator'
                 : role === 'admin' ? 'promote_admin' : 'demote_admin';
    logMod(req.user.id, action, 'user', targetId, target[0].username, null, { from: prevRole, to: role });
    res.json(rows[0]);
  } catch (err) {
    console.error('Set role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Remove a member (admin only, cannot remove yourself)
app.delete('/api/members/:id', authenticate, async (req, res) => {
  if (!req.user.is_admin && req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' });
  try {
    const { rows } = await pool.query('SELECT username FROM hub_users WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM hub_users WHERE id = $1', [req.params.id]);
    logMod(req.user.id, 'remove_member', 'user', req.params.id, rows[0]?.username ?? null, null, null);
    res.sendStatus(204);
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Delete own account (requires password confirmation)
app.delete('/api/auth/account', authenticate, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required' });
  try {
    // Verify password first
    const result = await pool.query('SELECT password_hash FROM hub_users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    // 1. Delete files from MinIO storage before removing DB records
    if (minioClient) {
      const files = await pool.query('SELECT file_key FROM hub_files WHERE owner_id = $1', [req.user.id]);
      for (const file of files.rows) {
        await minioClient.removeObject(STORAGE_BUCKET, file.file_key).catch(() => {});
      }
    }

    // 2. Delete content owned by the user
    await pool.query('DELETE FROM hub_atlas_pins WHERE author_id = $1', [req.user.id]);
    await pool.query('DELETE FROM hub_post_replies WHERE author_id = $1', [req.user.id]);

    // Delete posts (and their associated media files via DB cascade if set up,
    // but also clean up MinIO for post media files explicitly)
    if (minioClient) {
      const postFiles = await pool.query(
        `SELECT f.file_key FROM hub_files f
         JOIN hub_posts p ON p.media_file_id = f.id
         WHERE p.author_id = $1`, [req.user.id]
      );
      for (const file of postFiles.rows) {
        await minioClient.removeObject(STORAGE_BUCKET, file.file_key).catch(() => {});
      }
    }
    await pool.query('DELETE FROM hub_posts WHERE author_id = $1', [req.user.id]);

    // 3. Delete the user — CASCADE handles sessions, hub_files rows, conversation_members
    await pool.query('DELETE FROM hub_users WHERE id = $1', [req.user.id]);

    res.sendStatus(204);
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
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

    // Notify all other conversation members
    const recipients = await pool.query(
      `SELECT user_id FROM hub_conversation_members WHERE conversation_id = $1 AND user_id != $2`,
      [id, req.user.id]
    );
    for (const row of recipients.rows) {
      pool.query(
        `INSERT INTO hub_notifications (user_id, type, actor_id, ref_id) VALUES ($1, 'message', $2, $3)`,
        [row.user_id, req.user.id, id]
      ).catch(() => {});
    }

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
// Excludes system-managed files (hub backgrounds, etc.) from all listings
app.get('/api/files', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS file_id, file_name, file_key, mime_type, size_bytes,
              owner_id, is_public, uploaded_at
       FROM hub_files
       WHERE (owner_id = $1 OR is_public = true)
         AND file_name NOT LIKE 'bg-%'
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

// ── Notifications ─────────────────────────────────────────

const FEATURE_TYPES = { feed: ['reply'], messages: ['message'] };

// Get unread counts grouped by feature
app.get('/api/notifications/counts', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT type, COUNT(*) AS count FROM hub_notifications
       WHERE user_id = $1 AND read = false
       GROUP BY type`,
      [req.user.id]
    );
    const counts = { feed: 0, messages: 0 };
    for (const row of result.rows) {
      if (FEATURE_TYPES.feed.includes(row.type))     counts.feed     += parseInt(row.count, 10);
      if (FEATURE_TYPES.messages.includes(row.type)) counts.messages += parseInt(row.count, 10);
    }
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notification counts' });
  }
});

// Mark all notifications for a feature as read
app.post('/api/notifications/mark-read', authenticate, async (req, res) => {
  const { feature } = req.body || {};
  const types = FEATURE_TYPES[feature];
  if (!types) return res.status(400).json({ error: 'Invalid feature' });
  try {
    await pool.query(
      `UPDATE hub_notifications SET read = true
       WHERE user_id = $1 AND type = ANY($2::text[]) AND read = false`,
      [req.user.id, types]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// ── Public file serving (for post images) ────────────────

// Serves files marked is_public=true without auth — needed so <img> tags work in the feed.
// Supports HTTP Range requests so browsers can stream video without downloading the whole file.
app.get('/api/public/files/:filename', async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);
  try {
    const result = await pool.query(
      `SELECT * FROM hub_files WHERE file_name = $1 AND is_public = true LIMIT 1`,
      [fileName]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

    const mimeType = file.mime_type || 'application/octet-stream';
    const totalSize = file.size_bytes ? parseInt(file.size_bytes, 10) : null;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const rangeHeader = req.headers['range'];
    if (rangeHeader && totalSize) {
      const [unit, rangeStr] = rangeHeader.split('=');
      if (unit !== 'bytes' || !rangeStr) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      const [startStr, endStr] = rangeStr.split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : totalSize - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= totalSize) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', chunkSize);
      const stream = await minioClient.getPartialObject(STORAGE_BUCKET, file.file_key, start, chunkSize);
      stream.pipe(res);
    } else {
      if (totalSize) res.setHeader('Content-Length', totalSize);
      const stream = await minioClient.getObject(STORAGE_BUCKET, file.file_key);
      stream.pipe(res);
    }
  } catch (err) {
    console.error('Public file error:', err);
    res.status(500).json({ error: 'Failed to load file' });
  }
});

// ── Post routes ───────────────────────────────────────────

const POST_CATEGORIES = ['DISCUSSION', 'ANNOUNCEMENT', 'PROJECT', 'REQUEST'];

// List posts — chronological, newest first, optional category filter
app.get('/api/posts', authenticate, async (req, res) => {
  const lim = Math.min(parseInt(req.query.limit) || 50, 100);
  const cat = (req.query.category || '').toUpperCase();

  try {
    const params = [];
    const where = cat && POST_CATEGORIES.includes(cat)
      ? (params.push(cat), `WHERE p.category = $${params.length}`)
      : '';

    const { rows } = await pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.created_at, p.updated_at,
              u.id AS author_id, u.username AS author_username,
              f.file_name AS media_file_name,
              (SELECT COUNT(*) FROM hub_post_replies r WHERE r.post_id = p.id)::int AS reply_count
       FROM hub_posts p
       LEFT JOIN hub_users u ON p.author_id = u.id
       LEFT JOIN hub_files f ON p.media_file_id = f.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, lim]
    );
    res.json({ posts: rows });
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: 'Failed to list posts' });
  }
});

// Create a post (with optional image upload)
app.post('/api/posts', authenticate, upload.single('media'), async (req, res) => {
  const { category, title, body } = req.body || {};
  const cat = (category || '').toUpperCase();

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!POST_CATEGORIES.includes(cat)) {
    return res.status(400).json({ error: `category must be one of: ${POST_CATEGORIES.join(', ')}` });
  }

  try {
    let mediaFileId = null;

    if (req.file) {
      const fileKey = `${req.user.id}/${req.file.originalname}`;
      if (minioClient) {
        await minioClient.putObject(
          STORAGE_BUCKET, fileKey, req.file.buffer, req.file.size,
          { 'Content-Type': req.file.mimetype }
        );
      }
      const fileResult = await pool.query(
        `INSERT INTO hub_files (file_name, file_key, mime_type, size_bytes, owner_id, is_public)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (file_key) DO UPDATE SET uploaded_at = NOW()
         RETURNING id`,
        [req.file.originalname, fileKey, req.file.mimetype, req.file.size, req.user.id]
      );
      mediaFileId = fileResult.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO hub_posts (category, title, body, author_id, media_file_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, category, title, body, created_at, updated_at`,
      [cat, title.trim(), body?.trim() || '', req.user.id, mediaFileId]
    );

    const post = result.rows[0];
    res.json({
      ...post,
      author_id:       req.user.id,
      author_username: req.user.username,
      media_file_name: req.file?.originalname || null,
      reply_count:     0,
    });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update a post (author or admin)
app.patch('/api/posts/:id', authenticate, async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      `UPDATE hub_posts p
       SET title = $1, body = $2, updated_at = NOW()
       WHERE p.id = $3 AND (p.author_id = $4 OR $5 = true)
       RETURNING p.id, p.author_id, p.category, p.title, p.body,
                 p.media_file_id, p.created_at, p.updated_at`,
      [title.trim(), body?.trim() || '', req.params.id, req.user.id, req.user.is_admin]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Post not found or you do not have permission' });
    }
    const postData = result.rows[0];
    const [userResult, fileResult] = await Promise.all([
      pool.query(`SELECT username FROM hub_users WHERE id = $1`, [postData.author_id]),
      postData.media_file_id
        ? pool.query(`SELECT file_name FROM hub_files WHERE id = $1`, [postData.media_file_id])
        : Promise.resolve({ rows: [] }),
    ]);
    res.json({
      ...postData,
      author_username:  userResult.rows[0]?.username || 'Unknown',
      media_file_name:  fileResult.rows[0]?.file_name || null,
      reply_count:      0,
    });
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete a post (author, admin, or moderator)
app.delete('/api/posts/:id', authenticate, async (req, res) => {
  const canMod = isMod(req.user);
  try {
    const { rows: post } = await pool.query(
      `SELECT p.id, p.title, p.author_id, u.username AS author_username
       FROM hub_posts p LEFT JOIN hub_users u ON p.author_id = u.id WHERE p.id = $1`,
      [req.params.id]
    );
    if (!post[0]) return res.status(404).json({ error: 'Post not found' });
    if (post[0].author_id !== req.user.id && !canMod) return res.status(403).json({ error: 'Not authorised' });
    await pool.query('DELETE FROM hub_posts WHERE id = $1', [req.params.id]);
    if (post[0].author_id !== req.user.id) {
      logMod(req.user.id, 'delete_post', 'post', req.params.id, post[0].title ?? null, null, { author: post[0].author_username });
    }
    res.sendStatus(204);
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// List replies for a post
app.get('/api/posts/:id/replies', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.post_id, r.body, r.created_at,
              u.id   AS author_id,       u.username  AS author_username,
              r.reply_to_reply_id,       r.reply_to_user_id,
              ru.username AS reply_to_username
       FROM hub_post_replies r
       LEFT JOIN hub_users u  ON r.author_id        = u.id
       LEFT JOIN hub_users ru ON r.reply_to_user_id = ru.id
       WHERE r.post_id = $1
       ORDER BY r.created_at ASC`,
      [req.params.id]
    );
    res.json({ replies: rows });
  } catch (err) {
    console.error('List replies error:', err);
    res.status(500).json({ error: 'Failed to load replies' });
  }
});

// Post a reply
app.post('/api/posts/:id/replies', authenticate, async (req, res) => {
  const { body, reply_to_reply_id, reply_to_user_id } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Reply cannot be empty' });

  try {
    const post = await pool.query('SELECT id, author_id FROM hub_posts WHERE id = $1', [req.params.id]);
    if (!post.rows[0]) return res.status(404).json({ error: 'Post not found' });

    const result = await pool.query(
      `INSERT INTO hub_post_replies (post_id, author_id, body, reply_to_reply_id, reply_to_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, post_id, body, created_at, reply_to_reply_id, reply_to_user_id`,
      [req.params.id, req.user.id, body.trim(), reply_to_reply_id || null, reply_to_user_id || null]
    );

    await pool.query(`UPDATE hub_posts SET updated_at = NOW() WHERE id = $1`, [req.params.id]);

    // Notify post author (skip if replying to own post)
    const postAuthorId = post.rows[0].author_id;
    const notifiedUsers = new Set();
    if (postAuthorId && postAuthorId !== req.user.id) {
      notifiedUsers.add(postAuthorId);
      pool.query(
        `INSERT INTO hub_notifications (user_id, type, actor_id, ref_id) VALUES ($1, 'reply', $2, $3)`,
        [postAuthorId, req.user.id, req.params.id]
      ).catch(() => {});
    }
    // Also notify the person being directly replied to (if different from post author)
    if (reply_to_user_id && reply_to_user_id !== req.user.id && !notifiedUsers.has(reply_to_user_id)) {
      pool.query(
        `INSERT INTO hub_notifications (user_id, type, actor_id, ref_id) VALUES ($1, 'reply', $2, $3)`,
        [reply_to_user_id, req.user.id, req.params.id]
      ).catch(() => {});
    }

    // Fetch reply_to_username to include in response
    let reply_to_username = null;
    if (reply_to_user_id) {
      const u = await pool.query('SELECT username FROM hub_users WHERE id = $1', [reply_to_user_id]);
      reply_to_username = u.rows[0]?.username ?? null;
    }

    res.json({
      ...result.rows[0],
      author_id:        req.user.id,
      author_username:  req.user.username,
      reply_to_username,
    });
  } catch (err) {
    console.error('Post reply error:', err);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

// Get a single post by ID
app.get('/api/posts/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.created_at, p.updated_at,
              u.id AS author_id, u.username AS author_username,
              f.file_name AS media_file_name,
              (SELECT COUNT(*) FROM hub_post_replies r WHERE r.post_id = p.id)::int AS reply_count
       FROM hub_posts p
       LEFT JOIN hub_users u ON p.author_id = u.id
       LEFT JOIN hub_files f ON p.media_file_id = f.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// ── Featured routes ────────────────────────────────────────

// List featured items (auth required)
app.get('/api/featured', authenticate, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fi.id, fi.type, fi.ref_id, fi.title, fi.caption, fi.category_label,
              fi.image_url, fi.display_order, fi.created_at,
              f.file_name AS media_file_name,
              u.username  AS author_username
       FROM hub_featured fi
       LEFT JOIN hub_posts p ON fi.ref_id = p.id
       LEFT JOIN hub_files f ON p.media_file_id = f.id
       LEFT JOIN hub_users u ON p.author_id = u.id
       ORDER BY fi.display_order ASC, fi.created_at ASC`
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('List featured error:', err);
    res.status(500).json({ error: 'Failed to list featured items' });
  }
});

// Pin a post or add a custom card (admin or moderator)
app.post('/api/featured', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  const { type = 'post', ref_id, title, caption, category_label, image_url } = req.body || {};

  try {
    const countResult = await pool.query('SELECT COUNT(*) FROM hub_featured');
    if (parseInt(countResult.rows[0].count, 10) >= 5) {
      return res.status(400).json({ error: 'Maximum of 5 featured items allowed' });
    }

    let resolvedTitle = title?.trim();
    let resolvedCaption = caption?.trim() || null;
    let resolvedLabel = category_label?.trim() || null;

    if (type === 'post') {
      if (!ref_id) return res.status(400).json({ error: 'ref_id required for post type' });
      if (!resolvedTitle) {
        const post = await pool.query(
          'SELECT title, body, category FROM hub_posts WHERE id = $1', [ref_id]
        );
        if (!post.rows[0]) return res.status(404).json({ error: 'Post not found' });
        resolvedTitle  = post.rows[0].title;
        resolvedCaption = resolvedCaption ?? (post.rows[0].body?.slice(0, 160) || null);
        resolvedLabel   = resolvedLabel   ?? post.rows[0].category;
      }
    } else if (type === 'custom') {
      if (!resolvedTitle) return res.status(400).json({ error: 'title is required for custom type' });
    } else {
      return res.status(400).json({ error: 'type must be post or custom' });
    }

    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM hub_featured'
    );
    const displayOrder = orderResult.rows[0].next;

    const { rows } = await pool.query(
      `INSERT INTO hub_featured
         (type, ref_id, title, caption, category_label, image_url, display_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, type, ref_id, title, caption, category_label, image_url, display_order, created_at`,
      [type, ref_id || null, resolvedTitle, resolvedCaption, resolvedLabel,
       image_url || null, displayOrder, req.user.id]
    );
    logMod(req.user.id, 'pin_featured', 'featured', rows[0].id, resolvedTitle, null, { type });
    res.json(rows[0]);
  } catch (err) {
    console.error('Create featured error:', err);
    res.status(500).json({ error: 'Failed to create featured item' });
  }
});

// Remove a featured item (admin or moderator)
app.delete('/api/featured/:id', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  try {
    const { rows } = await pool.query(
      'DELETE FROM hub_featured WHERE id = $1 RETURNING id, title', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Featured item not found' });
    logMod(req.user.id, 'remove_featured', 'featured', req.params.id, rows[0].title ?? null, null, null);
    res.sendStatus(204);
  } catch (err) {
    console.error('Delete featured error:', err);
    res.status(500).json({ error: 'Failed to delete featured item' });
  }
});

app.patch('/api/featured/reorder', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ids must be an array of strings' });
  }
  try {
    await Promise.all(
      ids.map((id, index) =>
        pool.query('UPDATE hub_featured SET display_order = $1 WHERE id = $2', [index, id])
      )
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Reorder featured error:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

// ── Feature requests routes ────────────────────────────────

// Ensure hub_requests table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS hub_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       UUID REFERENCES hub_users(id) ON DELETE SET NULL,
    problem         TEXT NOT NULL,
    who_it_helps    TEXT,
    expected_outcome TEXT,
    data_involved   TEXT NOT NULL DEFAULT 'none',
    scope           TEXT NOT NULL DEFAULT 'hub_only',
    priority        TEXT NOT NULL DEFAULT 'nice_to_have',
    status          TEXT NOT NULL DEFAULT 'submitted',
    admin_note      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(err => console.error('hub_requests table creation error:', err));

// Submit a feature request (any authenticated user)
app.post('/api/requests', authenticate, async (req, res) => {
  const { problem, who_it_helps, expected_outcome, data_involved, scope, priority } = req.body || {};
  if (!problem?.trim()) return res.status(400).json({ error: 'problem is required' });

  const VALID_DATA     = ['none', 'public', 'private'];
  const VALID_SCOPE    = ['hub_only', 'all_hubs'];
  const VALID_PRIORITY = ['nice_to_have', 'important', 'urgent'];

  if (data_involved && !VALID_DATA.includes(data_involved))
    return res.status(400).json({ error: `data_involved must be one of: ${VALID_DATA.join(', ')}` });
  if (scope && !VALID_SCOPE.includes(scope))
    return res.status(400).json({ error: `scope must be one of: ${VALID_SCOPE.join(', ')}` });
  if (priority && !VALID_PRIORITY.includes(priority))
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITY.join(', ')}` });

  try {
    const { rows } = await pool.query(
      `INSERT INTO hub_requests (author_id, problem, who_it_helps, expected_outcome, data_involved, scope, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, author_id, problem, who_it_helps, expected_outcome, data_involved, scope, priority, status, admin_note, created_at, updated_at,
                 (SELECT username FROM hub_users WHERE id = $1) AS author_username`,
      [
        req.user.id,
        problem.trim(),
        who_it_helps?.trim() || null,
        expected_outcome?.trim() || null,
        data_involved || 'none',
        scope || 'hub_only',
        priority || 'nice_to_have',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Submit request error:', err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// List all requests (admin only)
app.get('/api/requests', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.author_id, r.problem, r.who_it_helps, r.expected_outcome,
              r.data_involved, r.scope, r.priority, r.status, r.admin_note,
              r.poll_id, r.created_at, r.updated_at, u.username AS author_username,
              p.question AS poll_question, p.closed AS poll_closed,
              p.quorum_pct, p.pass_pct
       FROM hub_requests r
       LEFT JOIN hub_users u  ON r.author_id = u.id
       LEFT JOIN hub_polls p  ON r.poll_id   = p.id
       ORDER BY
         CASE r.priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
         r.created_at DESC`
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('List requests error:', err);
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

// Update request status (admin or moderator)
app.patch('/api/requests/:id', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  const { status, admin_note } = req.body || {};
  const VALID_STATUS = ['submitted', 'needs_clarification', 'under_review', 'approved', 'building', 'shipped', 'declined'];
  if (status && !VALID_STATUS.includes(status))
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  try {
    const { rows } = await pool.query(
      `UPDATE hub_requests
       SET status = COALESCE($1, status),
           admin_note = COALESCE($2, admin_note),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status || null, admin_note !== undefined ? admin_note : null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update request error:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// ── Moderation log routes ─────────────────────────────────

// List mod log (all authenticated members — public governance record)
app.get('/api/mod-log', authenticate, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  ?? '50', 10), 100);
  const offset = parseInt(req.query.offset ?? '0', 10);
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.action_type, l.target_type, l.target_id, l.target_name,
              l.reason, l.meta, l.created_at,
              u.id AS actor_id, u.username AS actor_username, u.avatar_url AS actor_avatar_url
       FROM hub_mod_log l
       LEFT JOIN hub_users u ON l.actor_id = u.id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: total } = await pool.query('SELECT COUNT(*) AS c FROM hub_mod_log');
    res.json({ entries: rows, total: parseInt(total[0].c, 10) });
  } catch (err) {
    console.error('Mod log error:', err);
    res.status(500).json({ error: 'Failed to load mod log' });
  }
});

// ── Polls routes ──────────────────────────────────────────

// Helper: compute outcome of a closed poll (null = no quorum, true = passed, false = failed)
function computePollOutcome(vote_counts, total_votes, member_count, quorum_pct, pass_pct) {
  if (quorum_pct > 0 && member_count > 0) {
    const needed = Math.ceil(member_count * quorum_pct / 100);
    if (total_votes < needed) return null; // quorum not met
  }
  if (total_votes === 0) return null;
  const maxVotes = Math.max(...vote_counts);
  const leadingPct = Math.round((maxVotes / total_votes) * 100);
  return leadingPct >= pass_pct;
}

// Helper: after a vote, check thresholds and auto-close + advance request if passed
async function checkPollThreshold(pollId) {
  try {
    const { rows: polls } = await pool.query(
      `SELECT p.id, p.question, p.options, p.quorum_pct, p.pass_pct, p.request_id, p.closed
       FROM hub_polls p WHERE p.id = $1`, [pollId]
    );
    const poll = polls[0];
    if (!poll || poll.closed) return;

    const { rows: votes } = await pool.query(
      `SELECT option_index FROM hub_poll_votes WHERE poll_id = $1`, [pollId]
    );
    const { rows: members } = await pool.query(`SELECT COUNT(*) AS c FROM hub_users`);
    const memberCount = parseInt(members[0].c, 10);
    const totalVotes = votes.length;
    const voteCounts = Array.from({ length: poll.options.length }, (_, i) =>
      votes.filter(v => v.option_index === i).length
    );

    // Only auto-close if quorum is set AND met, or if pass_pct is 100 (unanimous required)
    if (poll.quorum_pct === 0) return; // no auto-close without a quorum target
    const needed = Math.ceil(memberCount * poll.quorum_pct / 100);
    if (totalVotes < needed) return; // quorum not yet met

    const outcome = computePollOutcome(voteCounts, totalVotes, memberCount, poll.quorum_pct, poll.pass_pct);
    if (outcome === null) return;

    // Close the poll
    await pool.query(`UPDATE hub_polls SET closed = TRUE WHERE id = $1`, [pollId]);
    logMod(null, 'close_poll', 'poll', pollId, poll.question, 'Auto-closed: quorum reached', { outcome, total_votes: totalVotes, member_count: memberCount });

    // Advance linked request if passed
    if (poll.request_id && outcome === true) {
      await pool.query(
        `UPDATE hub_requests SET status = 'approved', updated_at = NOW() WHERE id = $1 AND status NOT IN ('shipped','declined','approved')`,
        [poll.request_id]
      );
      logMod(null, 'approve_request', 'request', poll.request_id, null, 'Auto-approved: linked poll passed', { poll_id: pollId });
    }
  } catch (err) {
    console.error('checkPollThreshold error:', err);
  }
}

// Create a poll (admin or moderator)
app.post('/api/polls', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  const { question, options, closes_at, request_id, quorum_pct, pass_pct } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: 'question is required' });
  if (!Array.isArray(options) || options.length < 2 || options.length > 5)
    return res.status(400).json({ error: 'options must be an array of 2–5 strings' });
  if (options.some(o => typeof o !== 'string' || !o.trim()))
    return res.status(400).json({ error: 'All options must be non-empty strings' });
  const qPct  = typeof quorum_pct === 'number' ? Math.min(100, Math.max(0, quorum_pct)) : 0;
  const pPct  = typeof pass_pct   === 'number' ? Math.min(100, Math.max(1, pass_pct))   : 50;
  try {
    const { rows } = await pool.query(
      `INSERT INTO hub_polls (question, options, created_by, closes_at, request_id, quorum_pct, pass_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, question, options, created_by, closes_at, closed, created_at, request_id, quorum_pct, pass_pct`,
      [question.trim(), JSON.stringify(options.map(o => o.trim())), req.user.id, closes_at || null, request_id || null, qPct, pPct]
    );
    // Back-link: update request with this poll_id
    if (request_id) {
      await pool.query(`UPDATE hub_requests SET poll_id = $1 WHERE id = $2`, [rows[0].id, request_id]);
    }
    logMod(req.user.id, 'create_poll', 'poll', rows[0].id, question.trim(), null, { request_id: request_id || null, quorum_pct: qPct, pass_pct: pPct });
    res.status(201).json({ ...rows[0], vote_counts: options.map(() => 0), my_vote: null, total_votes: 0, passed: null });
  } catch (err) {
    console.error('Create poll error:', err);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// List polls with vote counts + caller's own vote + outcome
app.get('/api/polls', authenticate, async (req, res) => {
  try {
    const { rows: polls } = await pool.query(
      `SELECT p.id, p.question, p.options, p.created_by, p.closes_at, p.closed,
              p.created_at, p.request_id, p.quorum_pct, p.pass_pct,
              u.username AS created_by_username,
              r.problem  AS request_problem
       FROM hub_polls p
       LEFT JOIN hub_users    u ON p.created_by  = u.id
       LEFT JOIN hub_requests r ON p.request_id  = r.id
       ORDER BY p.created_at DESC`
    );
    if (polls.length === 0) return res.json({ polls: [] });

    const pollIds = polls.map(p => p.id);
    const { rows: allVotes } = await pool.query(
      `SELECT poll_id, option_index, voter_id FROM hub_poll_votes WHERE poll_id = ANY($1)`,
      [pollIds]
    );
    const { rows: members } = await pool.query(`SELECT COUNT(*) AS c FROM hub_users`);
    const memberCount = parseInt(members[0].c, 10);

    const result = polls.map(poll => {
      const votes = allVotes.filter(v => v.poll_id === poll.id);
      const vote_counts = Array.from({ length: poll.options.length }, (_, i) =>
        votes.filter(v => v.option_index === i).length
      );
      const myVote = votes.find(v => v.voter_id === req.user.id);
      const isClosed = poll.closed || (poll.closes_at && new Date(poll.closes_at) < new Date());
      const passed   = isClosed
        ? computePollOutcome(vote_counts, votes.length, memberCount, poll.quorum_pct, poll.pass_pct)
        : null;
      return {
        ...poll,
        vote_counts,
        total_votes:  votes.length,
        member_count: memberCount,
        my_vote:      myVote != null ? myVote.option_index : null,
        passed,
      };
    });
    res.json({ polls: result });
  } catch (err) {
    console.error('List polls error:', err);
    res.status(500).json({ error: 'Failed to list polls' });
  }
});

// Vote on a poll (any member, one vote per poll — upsert to allow changing)
app.post('/api/polls/:id/vote', authenticate, async (req, res) => {
  const { option_index } = req.body || {};
  if (typeof option_index !== 'number' || option_index < 0)
    return res.status(400).json({ error: 'option_index must be a non-negative integer' });
  try {
    const { rows: poll } = await pool.query(
      'SELECT id, options, closed, closes_at, quorum_pct FROM hub_polls WHERE id = $1', [req.params.id]
    );
    if (!poll[0]) return res.status(404).json({ error: 'Poll not found' });
    if (poll[0].closed || (poll[0].closes_at && new Date(poll[0].closes_at) < new Date()))
      return res.status(400).json({ error: 'Poll is closed' });
    if (option_index >= poll[0].options.length)
      return res.status(400).json({ error: 'Invalid option_index' });
    await pool.query(
      `INSERT INTO hub_poll_votes (poll_id, voter_id, option_index)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, voter_id) DO UPDATE SET option_index = $3, created_at = NOW()`,
      [req.params.id, req.user.id, option_index]
    );
    // Fire-and-forget threshold check
    if (poll[0].quorum_pct > 0) checkPollThreshold(req.params.id);
    res.json({ ok: true, option_index });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

// Close a poll manually (admin or moderator)
app.patch('/api/polls/:id/close', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  try {
    const { rows } = await pool.query(
      `UPDATE hub_polls SET closed = TRUE WHERE id = $1 RETURNING id, question, request_id, quorum_pct, pass_pct`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Poll not found' });

    // Compute outcome and advance linked request if passed
    const { rows: votes } = await pool.query(`SELECT option_index FROM hub_poll_votes WHERE poll_id = $1`, [req.params.id]);
    const { rows: members } = await pool.query(`SELECT COUNT(*) AS c FROM hub_users`);
    const memberCount = parseInt(members[0].c, 10);
    const voteCounts = Array.from({ length: 0 }, () => 0); // placeholder — recomputed below
    const totalVotes = votes.length;
    const poll = rows[0];
    const optionCountRes = await pool.query(`SELECT options FROM hub_polls WHERE id = $1`, [req.params.id]);
    const optionCount = (optionCountRes.rows[0]?.options ?? []).length;
    const fullCounts = Array.from({ length: optionCount }, (_, i) =>
      votes.filter(v => v.option_index === i).length
    );
    const outcome = computePollOutcome(fullCounts, totalVotes, memberCount, poll.quorum_pct, poll.pass_pct);

    logMod(req.user.id, 'close_poll', 'poll', req.params.id, poll.question, null, { outcome, total_votes: totalVotes });

    if (poll.request_id && outcome === true) {
      await pool.query(
        `UPDATE hub_requests SET status = 'approved', updated_at = NOW() WHERE id = $1 AND status NOT IN ('shipped','declined','approved')`,
        [poll.request_id]
      );
      logMod(req.user.id, 'approve_request', 'request', poll.request_id, null, 'Poll passed', { poll_id: req.params.id });
    }

    res.json({ ok: true, passed: outcome });
  } catch (err) {
    console.error('Close poll error:', err);
    res.status(500).json({ error: 'Failed to close poll' });
  }
});

// ── Atlas pin routes ───────────────────────────────────────

const ATLAS_CATEGORIES = ['meetup', 'safety', 'avoid', 'infrastructure', 'poi'];

// List all pins
app.get('/api/atlas/pins', authenticate, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.latitude, p.longitude, p.title, p.description, p.category, p.created_at,
              u.username AS author_username
       FROM hub_atlas_pins p
       LEFT JOIN hub_users u ON p.author_id = u.id
       ORDER BY p.created_at DESC`
    );
    res.json({ pins: rows });
  } catch (err) {
    console.error('List atlas pins error:', err);
    res.status(500).json({ error: 'Failed to list pins' });
  }
});

// Create a pin
app.post('/api/atlas/pins', authenticate, async (req, res) => {
  const { latitude, longitude, title, description, category } = req.body || {};

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude must be numbers' });
  }
  if (!ATLAS_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${ATLAS_CATEGORIES.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO hub_atlas_pins (author_id, latitude, longitude, title, description, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, latitude, longitude, title, description, category, created_at`,
      [req.user.id, latitude, longitude, title.trim(), description?.trim() || null, category]
    );
    res.json({ ...rows[0], author_username: req.user.username });
  } catch (err) {
    console.error('Create atlas pin error:', err);
    res.status(500).json({ error: 'Failed to create pin' });
  }
});

// Delete a pin (author or admin)
app.delete('/api/atlas/pins/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM hub_atlas_pins WHERE id = $1 AND (author_id = $2 OR $3 = true) RETURNING id`,
      [req.params.id, req.user.id, req.user.is_admin]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pin not found or not authorized' });
    res.sendStatus(204);
  } catch (err) {
    console.error('Delete atlas pin error:', err);
    res.status(500).json({ error: 'Failed to delete pin' });
  }
});

// ── Marketplace / Vendor routes ────────────────────────────────────────────

// All active listings (joined with vendor name)
app.get('/api/marketplace/listings', authenticate, async (req, res) => {
  const { category } = req.query;
  try {
    let query = `
      SELECT l.*, v.name AS vendor_name, v.logo_file_name AS vendor_logo_file_name
      FROM hub_listings l
      JOIN hub_vendors v ON l.vendor_id = v.id
      WHERE l.is_active = TRUE
    `;
    const params = [];
    if (category && category !== 'All') {
      params.push(category.toString().toUpperCase());
      query += ` AND UPPER(l.category) = $${params.length}`;
    }
    query += ' ORDER BY l.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get listings error:', err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// All vendors
app.get('/api/vendors', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, COUNT(l.id)::int AS listing_count
      FROM hub_vendors v
      LEFT JOIN hub_listings l ON l.vendor_id = v.id AND l.is_active = TRUE
      GROUP BY v.id
      ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// My vendor page — MUST be before /api/vendors/:id
app.get('/api/vendors/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM hub_vendors WHERE owner_user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No vendor page' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// Single vendor + their listings
app.get('/api/vendors/:id', authenticate, async (req, res) => {
  try {
    const vendorResult = await pool.query('SELECT * FROM hub_vendors WHERE id = $1', [req.params.id]);
    if (vendorResult.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    const listingsResult = await pool.query(
      'SELECT * FROM hub_listings WHERE vendor_id = $1 AND is_active = TRUE ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ vendor: vendorResult.rows[0], listings: listingsResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// Create vendor page (one per user)
app.post('/api/vendors', authenticate, async (req, res) => {
  const {
    name,
    description,
    category,
    logo_file_name,
    banner_mode,
    banner_image_file_name,
    banner_color,
    banner_gradient_from,
    banner_gradient_to,
    contact_email,
    contact_phone,
    website,
    hours,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Vendor name is required' });

  const normalizedBannerMode = ['image', 'solid', 'gradient'].includes(banner_mode) ? banner_mode : null;

  try {
    const result = await pool.query(`
      INSERT INTO hub_vendors (
        owner_user_id, name, description, category,
        logo_file_name, banner_mode, banner_image_file_name, banner_color, banner_gradient_from, banner_gradient_to,
        contact_email, contact_phone, website, hours
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      req.user.id,
      name.trim(),
      description || null,
      category || 'General',
      logo_file_name || null,
      normalizedBannerMode,
      banner_image_file_name || null,
      banner_color || null,
      banner_gradient_from || null,
      banner_gradient_to || null,
      contact_email || null,
      contact_phone || null,
      website || null,
      hours || null,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a vendor page' });
    console.error('Create vendor error:', err);
    res.status(500).json({ error: 'Failed to create vendor page' });
  }
});

// Update my vendor page
app.patch('/api/vendors/me', authenticate, async (req, res) => {
  const {
    name,
    description,
    category,
    logo_file_name,
    banner_mode,
    banner_image_file_name,
    banner_color,
    banner_gradient_from,
    banner_gradient_to,
    contact_email,
    contact_phone,
    website,
    hours,
  } = req.body;

  const normalizedBannerMode = ['image', 'solid', 'gradient'].includes(banner_mode) ? banner_mode : null;

  try {
    const result = await pool.query(`
      UPDATE hub_vendors
      SET name          = COALESCE($1, name),
          description   = COALESCE($2, description),
          category      = COALESCE($3, category),
          logo_file_name = COALESCE($4, logo_file_name),
          banner_mode = COALESCE($5, banner_mode),
          banner_image_file_name = COALESCE($6, banner_image_file_name),
          banner_color = COALESCE($7, banner_color),
          banner_gradient_from = COALESCE($8, banner_gradient_from),
          banner_gradient_to = COALESCE($9, banner_gradient_to),
          contact_email = COALESCE($10, contact_email),
          contact_phone = COALESCE($11, contact_phone),
          website       = COALESCE($12, website),
          hours         = COALESCE($13, hours),
          updated_at    = NOW()
      WHERE owner_user_id = $14
      RETURNING *
    `, [
      name || null,
      description || null,
      category || null,
      logo_file_name || null,
      normalizedBannerMode,
      banner_image_file_name || null,
      banner_color || null,
      banner_gradient_from || null,
      banner_gradient_to || null,
      contact_email || null,
      contact_phone || null,
      website || null,
      hours || null,
      req.user.id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor page not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vendor page' });
  }
});

// Create a listing (user must have vendor page)
app.post('/api/marketplace/listings', authenticate, async (req, res) => {
  const { title, description, price, price_type, category, image_file_name, condition } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  try {
    const vendorResult = await pool.query(
      'SELECT id FROM hub_vendors WHERE owner_user_id = $1',
      [req.user.id]
    );
    if (vendorResult.rows.length === 0) {
      return res.status(403).json({ error: 'You need a vendor page to create listings' });
    }
    const vendorId = vendorResult.rows[0].id;
    const result = await pool.query(`
      INSERT INTO hub_listings (vendor_id, title, description, price, price_type, category, image_file_name, condition)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [vendorId, title.trim(), description || null,
        price != null ? parseFloat(price) : null,
        price_type || 'fixed', category || 'Other',
        image_file_name || null, condition || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create listing error:', err);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// Update a listing (owner only)
app.patch('/api/marketplace/listings/:id', authenticate, async (req, res) => {
  const { title, description, price, price_type, category, image_file_name, condition, is_active } = req.body;
  try {
    const check = await pool.query(`
      SELECT l.id FROM hub_listings l
      JOIN hub_vendors v ON l.vendor_id = v.id
      WHERE l.id = $1 AND v.owner_user_id = $2
    `, [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });
    const result = await pool.query(`
      UPDATE hub_listings
      SET title           = COALESCE($1, title),
          description     = COALESCE($2, description),
          price           = COALESCE($3::decimal, price),
          price_type      = COALESCE($4, price_type),
          category        = COALESCE($5, category),
          image_file_name = COALESCE($6, image_file_name),
          condition       = COALESCE($7, condition),
          is_active       = COALESCE($8, is_active),
          updated_at      = NOW()
      WHERE id = $9
      RETURNING *
    `, [title || null, description || null,
        price != null ? parseFloat(price) : null,
        price_type || null, category || null,
        image_file_name || null, condition || null,
        is_active != null ? is_active : null,
        req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// Delete a listing (owner only)
app.delete('/api/marketplace/listings/:id', authenticate, async (req, res) => {
  try {
    const check = await pool.query(`
      SELECT l.id FROM hub_listings l
      JOIN hub_vendors v ON l.vendor_id = v.id
      WHERE l.id = $1 AND v.owner_user_id = $2
    `, [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('DELETE FROM hub_listings WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// ── Marketplace banner config ────────────────────────────

const BANNER_CONFIG_KEYS = [
  'marketplace_banner_image',
  'marketplace_banner_position',
  'marketplace_banner_title',
  'marketplace_banner_subtitle',
];

app.get('/api/marketplace-config', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT key, value FROM hub_config WHERE key = ANY($1)',
      [BANNER_CONFIG_KEYS]
    );
    const config = {};
    result.rows.forEach(r => { config[r.key] = r.value; });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/marketplace-config', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const entries = Object.entries(req.body || {}).filter(([k]) => BANNER_CONFIG_KEYS.includes(k));
  if (entries.length === 0) return res.status(400).json({ error: 'No valid fields provided' });
  try {
    for (const [key, value] of entries) {
      if (value === null || value === '') {
        await pool.query('DELETE FROM hub_config WHERE key = $1', [key]);
      } else {
        await pool.query(
          `INSERT INTO hub_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, String(value)]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User Preferences ─────────────────────────────────────

const PREF_KEYS = ['background_type', 'background_value', 'background_brightness'];

app.get('/api/me/preferences', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM hub_user_preferences WHERE user_id = $1`,
      [req.user.id]
    );
    const prefs = {};
    for (const row of result.rows) prefs[row.key] = row.value;
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/me/preferences', authenticate, async (req, res) => {
  try {
    const entries = Object.entries(req.body || {}).filter(([k]) => PREF_KEYS.includes(k));
    for (const [key, val] of entries) {
      if (val === null || val === '') {
        await pool.query(
          `DELETE FROM hub_user_preferences WHERE user_id = $1 AND key = $2`,
          [req.user.id, key]
        );
      } else {
        await pool.query(
          `INSERT INTO hub_user_preferences (user_id, key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
          [req.user.id, key, String(val)]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/me/preferences/background-image', authenticate, uploadBg.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `bg-${req.user.id}-${Date.now()}.${ext}`;

  try {
    // Remove any previous background image for this user
    const old = await pool.query(
      `SELECT file_key FROM hub_files WHERE owner_id = $1 AND file_name LIKE 'bg-' || $2 || '-%'`,
      [req.user.id, req.user.id]
    );
    for (const row of old.rows) {
      await minioClient.removeObject(STORAGE_BUCKET, row.file_key).catch(() => {});
    }
    await pool.query(
      `DELETE FROM hub_files WHERE owner_id = $1 AND file_name LIKE 'bg-' || $2 || '-%'`,
      [req.user.id, req.user.id]
    );

    await minioClient.putObject(STORAGE_BUCKET, fileName, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype,
    });
    await pool.query(
      `INSERT INTO hub_files (file_name, file_key, mime_type, size_bytes, owner_id, is_public)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [fileName, fileName, req.file.mimetype, req.file.size, req.user.id]
    );
    res.json({ name: fileName });
  } catch (err) {
    console.error('BG image upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── Hub App config (DB-backed, admin-managed) ────────────
// Stores installed app configs in hub_app_configs table.
// Falls back to env vars if the table row is absent.

async function ensureAppConfigTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_app_configs (
      capability  TEXT PRIMARY KEY,
      app_url     TEXT NOT NULL,
      app_key     TEXT NOT NULL,
      app_name    TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppConfig(capability) {
  try {
    const r = await pool.query(`SELECT * FROM hub_app_configs WHERE capability = $1`, [capability]);
    if (r.rows.length) return { url: r.rows[0].app_url, key: r.rows[0].app_key, name: r.rows[0].app_name };
  } catch {}
  // Fallback to env vars
  const envUrl = process.env[`${capability.toUpperCase()}_APP_URL`];
  const envKey = process.env[`${capability.toUpperCase()}_APP_KEY`];
  if (envUrl && envKey) return { url: envUrl, key: envKey };
  return null;
}

// GET /api/admin/apps — list installed app configs (admin only)
app.get('/api/admin/apps', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    await ensureAppConfigTable();
    const r = await pool.query(`SELECT capability, app_url, app_name, updated_at FROM hub_app_configs ORDER BY capability`);
    // Also surface env-var-only configs
    const rows = r.rows;
    const capabilities = ['initiatives'];
    const result = capabilities.map(cap => {
      const row = rows.find(r => r.capability === cap);
      if (row) return { capability: cap, appUrl: row.app_url, appName: row.app_name, source: 'db', updatedAt: row.updated_at };
      const envUrl = process.env[`${cap.toUpperCase()}_APP_URL`];
      if (envUrl) return { capability: cap, appUrl: envUrl, appName: null, source: 'env' };
      return { capability: cap, appUrl: null, appName: null, source: null };
    });
    res.json({ apps: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/apps/:capability — install or update an app (admin only)
app.put('/api/admin/apps/:capability', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { capability } = req.params;
  const { appUrl, appKey } = req.body;
  if (!appUrl || !appKey) return res.status(400).json({ error: 'appUrl and appKey are required' });

  try {
    await ensureAppConfigTable();

    // Verify the app responds before saving
    let appName = null;
    try {
      const testRes = await fetch(`${appUrl}/api/hub-app/info`, {
        headers: { 'x-hub-api-key': appKey },
        signal: AbortSignal.timeout(8000),
      });
      if (testRes.ok) {
        const info = await testRes.json();
        appName = info.name ?? null;
      } else if (testRes.status === 401) {
        return res.status(502).json({ error: 'Invalid API key — check HUB_APP_KEY matches' });
      } else if (testRes.status === 404) {
        return res.status(502).json({ error: 'App URL reached but hub-app contract not found — is this the right URL?' });
      } else {
        return res.status(502).json({ error: `App responded with ${testRes.status} — check the URL` });
      }
    } catch (err) {
      const msg = err?.name === 'TimeoutError' ? 'Connection timed out — is the app running and reachable?' : 'Could not reach the app — check the URL and try again';
      return res.status(502).json({ error: msg });
    }

    await pool.query(
      `INSERT INTO hub_app_configs (capability, app_url, app_key, app_name, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (capability) DO UPDATE
       SET app_url = EXCLUDED.app_url, app_key = EXCLUDED.app_key, app_name = EXCLUDED.app_name, updated_at = NOW()`,
      [capability, appUrl, appKey, appName]
    );

    // Hot-reload the provider so it takes effect immediately without restart
    APP_PROVIDERS[capability] = { url: appUrl, key: appKey };

    res.json({ capability, appUrl, appName, installed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/apps/:capability — uninstall an app (admin only)
app.delete('/api/admin/apps/:capability', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { capability } = req.params;
  try {
    await ensureAppConfigTable();
    await pool.query(`DELETE FROM hub_app_configs WHERE capability = $1`, [capability]);
    APP_PROVIDERS[capability] = { url: null, key: null };
    res.json({ uninstalled: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Hub App integration ───────────────────────────────────
// Any app that implements the /api/hub-app/ contract and accepts
// x-hub-api-key can be installed as a capability provider.

const APP_PROVIDERS = {
  initiatives: {
    url: process.env.INITIATIVES_APP_URL,
    key: process.env.INITIATIVES_APP_KEY,
  },
};

async function getProvider(capability) {
  // In-memory cache (hot-reloaded by admin routes)
  const cached = APP_PROVIDERS[capability];
  if (cached?.url && cached?.key) return cached;
  // Try DB / env fallback
  const config = await getAppConfig(capability);
  if (config) {
    APP_PROVIDERS[capability] = { url: config.url, key: config.key };
    return APP_PROVIDERS[capability];
  }
  return null;
}

async function proxyToApp(provider, path, method = 'GET', body, actingUsername) {
  const url = `${provider.url}/api/hub-app${path}`;
  const headers = { 'x-hub-api-key': provider.key, 'Content-Type': 'application/json' };
  if (actingUsername) headers['x-hub-user-email'] = `${actingUsername}@hub.citinet`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  return { status: res.status, data };
}

// Ensure/create a Society+ user for the current Citinet user
async function ensureAppUser(provider, username) {
  const email = `${username}@hub.citinet`;
  await proxyToApp(provider, '/users/ensure', 'POST', { email, name: username });
}

// GET /api/initiatives/app-info  — metadata about the installed initiatives app
app.get('/api/initiatives/app-info', async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.json(null); // no app configured — hub-agnostic mode
  try {
    const { status, data } = await proxyToApp(p, '/info');
    res.status(status).json(data);
  } catch {
    res.json(null); // fail silently — UI degrades gracefully
  }
});

// GET /api/initiatives
app.get('/api/initiatives', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, '/initiatives');
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/initiatives
app.post('/api/initiatives', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    await ensureAppUser(p, req.user.username);
    const body = { ...req.body, creatorEmail: `${req.user.username}@hub.citinet`, creatorName: req.user.username };
    const { status, data } = await proxyToApp(p, '/initiatives', 'POST', body);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/initiatives/:id
app.get('/api/initiatives/:id', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/initiatives/${req.params.id}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/initiatives/:id
app.patch('/api/initiatives/:id', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/initiatives/${req.params.id}`, 'PATCH', req.body, req.user.username);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/initiatives/:id
app.delete('/api/initiatives/:id', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/initiatives/${req.params.id}`, 'DELETE', undefined, req.user.username);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/initiatives/:id/goals
app.post('/api/initiatives/:id/goals', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/initiatives/${req.params.id}/goals`, 'POST', req.body, req.user.username);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/initiatives/goals/:goalId
app.patch('/api/initiatives/goals/:goalId', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/goals/${req.params.goalId}`, 'PATCH', req.body, req.user.username);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/initiatives/goals/:goalId
app.delete('/api/initiatives/goals/:goalId', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/goals/${req.params.goalId}`, 'DELETE', undefined, req.user.username);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/initiatives/:id/join
app.post('/api/initiatives/:id/join', authenticate, async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.status(503).json({ error: 'Initiatives app not configured' });
  try {
    const { status, data } = await proxyToApp(p, `/initiatives/${req.params.id}/join`, 'POST', {}, req.user.username);
    res.status(status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Serve portal (bundled into image at build time) ───────
// When the dist/ folder exists, the hub serves its own UI at /.
// API routes defined above always take precedence.
// The SPA fallback returns index.html for any unmatched GET so
// React Router handles client-side navigation (e.g. /feed, /atlas).
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

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
