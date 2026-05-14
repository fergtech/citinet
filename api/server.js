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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const busboy = require('busboy');
const Minio = require('minio');

const app = express();
const PORT = parseInt(process.env.PORT || '9090', 10);
const START_TIME = Date.now();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://citinet-ollama:11434';

// In-memory cache for public file metadata (avoids DB hit on every Range request)
const publicFileCache = new Map(); // fileName → { row, cachedAt }
const PUBLIC_FILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'hub-files';

// Short-lived download tokens — lets authenticated users get a plain URL they
// can open in a new tab for native browser streaming (no JS arrayBuffer needed).
// token → { userId, fileName, fileKey, expiresAt }
const downloadTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [t, d] of downloadTokens) { if (d.expiresAt < now) downloadTokens.delete(t); }
}, 10 * 60 * 1000);

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

// Trust first proxy hop — required when running behind Tailscale/Funnel or any reverse proxy.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
app.set('trust proxy', 1);

// ── Security headers (helmet) ─────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,       // SPA manages its own CSP
  crossOriginEmbedderPolicy: false,   // needed for MinIO media blobs
  crossOriginResourcePolicy: false,   // allow cross-origin <img> loads (avatars/banners from hub to citinet.cloud)
}));

// ── CORS ──────────────────────────────────────────────────
// The hub API uses Bearer tokens for auth — no cookies — so wildcard CORS is
// safe for all routes. Any legitimate citinet client must be able to reach this
// hub regardless of what headers Tailscale Funnel or other proxies strip.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Rate limiting ─────────────────────────────────────────
// Strict limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
});

// General API limit — generous, just prevents hammering
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 300,                   // 300 req/min per IP — covers normal usage
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/public/'), // public file serving exempt
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api/', apiLimiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Please wait a moment.' },
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
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
      CREATE TABLE IF NOT EXISTS hub_post_embeddings (
        post_id     UUID PRIMARY KEY REFERENCES hub_posts(id) ON DELETE CASCADE,
        embedding   JSONB NOT NULL,
        embedded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_ai_conversations (
        id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID         REFERENCES hub_users(id) ON DELETE CASCADE,
        title      VARCHAR(200) NOT NULL DEFAULT 'New conversation',
        created_at TIMESTAMPTZ  DEFAULT NOW(),
        updated_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_ai_messages (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID        REFERENCES hub_ai_conversations(id) ON DELETE CASCADE,
        role            VARCHAR(20) NOT NULL,
        content         TEXT        NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ DEFAULT NOW()
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
    // Governance — feature requests (must come before hub_polls which references it)
    await client.query(`
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
    `);
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
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS web_public BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE hub_vendors ADD COLUMN IF NOT EXISTS slug TEXT`);
    // Backfill slugs for existing vendors (idempotent)
    {
      const { rows: noSlug } = await client.query(`SELECT id, name FROM hub_vendors WHERE slug IS NULL`);
      for (const v of noSlug) {
        const base = (v.name || 'vendor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'vendor';
        let slug = base, n = 1;
        for (;;) {
          const { rows } = await client.query(`SELECT 1 FROM hub_vendors WHERE slug = $1 AND id != $2`, [slug, v.id]);
          if (!rows.length) break;
          slug = `${base}-${n++}`;
        }
        await client.query(`UPDATE hub_vendors SET slug = $1 WHERE id = $2`, [slug, v.id]);
      }
    }
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS hub_vendors_slug_idx ON hub_vendors(slug)`);
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
    // Spaces
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_spaces (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        slug             VARCHAR(100) NOT NULL UNIQUE,
        name             VARCHAR(200) NOT NULL,
        description      TEXT,
        visibility       VARCHAR(20)  NOT NULL DEFAULT 'public',
        banner_file_name TEXT,
        created_by       UUID         REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ  DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_space_members (
        space_id  UUID        REFERENCES hub_spaces(id)  ON DELETE CASCADE,
        user_id   UUID        REFERENCES hub_users(id)   ON DELETE CASCADE,
        role      VARCHAR(20) NOT NULL DEFAULT 'member',
        status    VARCHAR(20) NOT NULL DEFAULT 'active',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (space_id, user_id)
      )
    `);
    await client.query(`ALTER TABLE hub_posts  ADD COLUMN IF NOT EXISTS space_id           UUID    REFERENCES hub_spaces(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE hub_posts  ADD COLUMN IF NOT EXISTS shared_to_feed     BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE hub_posts  ADD COLUMN IF NOT EXISTS event_date         TIMESTAMPTZ`);
    await client.query(`ALTER TABLE hub_posts  ADD COLUMN IF NOT EXISTS event_location     VARCHAR(300)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_posts_space_id ON hub_posts(space_id)`);
    await client.query(`ALTER TABLE hub_files  ADD COLUMN IF NOT EXISTS space_id           UUID    REFERENCES hub_spaces(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE hub_spaces ADD COLUMN IF NOT EXISTS banner_mode        TEXT`);
    await client.query(`ALTER TABLE hub_spaces ADD COLUMN IF NOT EXISTS banner_color       TEXT`);
    await client.query(`ALTER TABLE hub_spaces ADD COLUMN IF NOT EXISTS banner_gradient_from TEXT`);
    await client.query(`ALTER TABLE hub_spaces ADD COLUMN IF NOT EXISTS banner_gradient_to   TEXT`);
    await client.query(`ALTER TABLE hub_spaces ADD COLUMN IF NOT EXISTS banner_image_file_name TEXT`);
    await client.query(`ALTER TABLE hub_spaces ADD COLUMN IF NOT EXISTS web_public BOOLEAN NOT NULL DEFAULT FALSE`);
    // Session expiry column (migration for existing installs)
    await client.query(`ALTER TABLE hub_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'`);
    // Notes
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_notes (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id    UUID        NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
        title       TEXT        NOT NULL DEFAULT '',
        body_rich   JSONB,
        body_plain  TEXT        NOT NULL DEFAULT '',
        is_pinned   BOOLEAN     NOT NULL DEFAULT FALSE,
        is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
        color       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_notes_owner ON hub_notes(owner_id, is_archived)`);
    await client.query(`ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE`);
    // Note web-public sharing — anyone with link, no auth required
    await client.query(`ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS is_web_public BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS is_blog_published BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS web_body_plain TEXT`);
    await client.query(`ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS web_body_rich JSONB`);
    // File visibility — web_public allows anyone-with-link access (no auth required)
    await client.query(`ALTER TABLE hub_files ADD COLUMN IF NOT EXISTS web_public BOOLEAN NOT NULL DEFAULT FALSE`);
    // E2E Encryption — key registry
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_user_keys (
        user_id     UUID PRIMARY KEY REFERENCES hub_users(id) ON DELETE CASCADE,
        public_key  TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_key_backups (
        user_id           UUID PRIMARY KEY REFERENCES hub_users(id) ON DELETE CASCADE,
        encrypted_payload TEXT NOT NULL,
        salt              TEXT NOT NULL,
        iv                TEXT NOT NULL,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Stable hub identity — generated once, never changes even if hub is renamed
    await client.query(`
      INSERT INTO hub_config (key, value)
      SELECT 'hub_node_id', gen_random_uuid()::text
      WHERE NOT EXISTS (SELECT 1 FROM hub_config WHERE key = 'hub_node_id')
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
       WHERE s.token = $1 AND s.expires_at > NOW()`,
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
  // Prefer explicit env var — required when running in Docker (container only sees bridge IP)
  if (process.env.LAN_IP) return process.env.LAN_IP;
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
  let enabledApps   = null;
  if (cfg.enabled_apps) {
    try { enabledApps = JSON.parse(cfg.enabled_apps); } catch {}
  } else if (process.env.ENABLED_APPS) {
    // Fallback: parse comma-separated list written by setup script into .env
    enabledApps = process.env.ENABLED_APPS.split(',').map(s => s.trim()).filter(Boolean);
    if (enabledApps.length === 0) enabledApps = null;
  }

  res.json({
    node_id:         cfg.hub_node_id             || process.env.HUB_SLUG || '',
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
    enabled_apps:    enabledApps,
  });
});

// Update hub identity fields (name, location, description) — admin only.
// Persists to hub_config table so changes survive container restarts.
app.patch('/api/hub-info', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { name, location, description, enabled_apps } = req.body || {};
  const updates = [];
  if (name         !== undefined) updates.push(['hub_name',        String(name).trim()]);
  if (location     !== undefined) updates.push(['hub_location',    String(location).trim()]);
  if (description  !== undefined) updates.push(['hub_description', String(description).trim()]);
  if (enabled_apps !== undefined) {
    // null = clear (all apps enabled); array = store as JSON
    updates.push(['enabled_apps', enabled_apps === null ? null : JSON.stringify(enabled_apps)]);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields provided' });
  try {
    for (const [key, value] of updates) {
      if (value === null) {
        await pool.query('DELETE FROM hub_config WHERE key = $1', [key]);
      } else {
        await pool.query(
          `INSERT INTO hub_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, value]
        );
      }
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

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
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
      `INSERT INTO hub_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
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

app.post('/api/auth/login', authLimiter, async (req, res) => {
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
      `INSERT INTO hub_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
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

// Logout — invalidates the session token server-side
app.post('/api/auth/logout', authenticate, async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  try {
    await pool.query('DELETE FROM hub_sessions WHERE token = $1', [token]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
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

    const ext = (user.avatar_url.split('.').pop() || 'jpg').toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
    const contentType = mimeMap[ext] || 'image/jpeg';
    const stream = await minioClient.getObject(STORAGE_BUCKET, user.avatar_url);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
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
    const ext = (user.banner_image_file_name.split('.').pop() || 'jpg').toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
    const contentType = mimeMap[ext] || 'image/jpeg';
    const stream = await minioClient.getObject(STORAGE_BUCKET, user.banner_image_file_name);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
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

    const ATTACH_AGG = `
      COALESCE(
        JSON_AGG(JSON_BUILD_OBJECT(
          'file_id', hf.id, 'file_name', hf.file_name,
          'mime_type', hf.mime_type, 'size', hf.size_bytes
        )) FILTER (WHERE hf.id IS NOT NULL),
        '[]'
      ) AS attachments`;

    let rows;
    if (before) {
      const { rows: r } = await pool.query(
        `SELECT m.id AS message_id, m.conversation_id, m.sender_id,
                u.username AS sender_username, m.body, m.created_at, ${ATTACH_AGG}
         FROM hub_messages m
         LEFT JOIN hub_users u ON m.sender_id = u.id
         LEFT JOIN hub_message_attachments hma ON hma.message_id = m.id
         LEFT JOIN hub_files hf ON hf.id = hma.file_id
         WHERE m.conversation_id = $1
           AND m.created_at < (SELECT created_at FROM hub_messages WHERE id = $2)
         GROUP BY m.id, u.username
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [id, before, limit]
      );
      rows = r;
    } else {
      const { rows: r } = await pool.query(
        `SELECT m.id AS message_id, m.conversation_id, m.sender_id,
                u.username AS sender_username, m.body, m.created_at, ${ATTACH_AGG}
         FROM hub_messages m
         LEFT JOIN hub_users u ON m.sender_id = u.id
         LEFT JOIN hub_message_attachments hma ON hma.message_id = m.id
         LEFT JOIN hub_files hf ON hf.id = hma.file_id
         WHERE m.conversation_id = $1
         GROUP BY m.id, u.username
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
              owner_id, is_public, web_public, uploaded_at
       FROM hub_files
       WHERE (owner_id = $1 OR is_public = true)
         AND file_name NOT LIKE 'bg-%'
         AND space_id IS NULL
       ORDER BY uploaded_at DESC`,
      [req.user.id]
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Upload file — streams directly to MinIO, no memory buffer, no size cap.
// is_public is passed as a query param (?is_public=true) so it is available
// before the file stream starts (FormData field ordering is not guaranteed).
app.post('/api/files', authenticate, (req, res) => {
  if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

  const isPublic = req.query.is_public === 'true';

  // Disable socket/response timeouts for large uploads
  req.socket.setTimeout(0);
  res.setTimeout(0);

  const bb = busboy({ headers: req.headers });
  let fileHandled = false;

  bb.on('file', (fieldName, fileStream, info) => {
    fileHandled = true;
    const filename = info.filename || 'upload';
    const mimeType = info.mimeType || 'application/octet-stream';
    const fileKey = `${req.user.id}/${filename}`;

    // Stream directly from the HTTP request body into MinIO — no RAM buffering.
    // Passing undefined as size lets MinIO use chunked/streaming upload mode.
    minioClient.putObject(STORAGE_BUCKET, fileKey, fileStream, undefined, { 'Content-Type': mimeType })
      .then(() => minioClient.statObject(STORAGE_BUCKET, fileKey))
      .then(async (stat) => {
        const result = await pool.query(
          `INSERT INTO hub_files (file_name, file_key, mime_type, size_bytes, owner_id, is_public, web_public)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (file_key) DO UPDATE
             SET size_bytes  = EXCLUDED.size_bytes,
                 mime_type   = EXCLUDED.mime_type,
                 is_public   = EXCLUDED.is_public,
                 web_public  = EXCLUDED.web_public,
                 uploaded_at = NOW()
           RETURNING id AS file_id, file_name, size_bytes, mime_type, is_public, web_public, uploaded_at`,
          [filename, fileKey, mimeType, stat.size, req.user.id, isPublic, false]
        );
        if (!res.headersSent) res.json(result.rows[0]);
      })
      .catch((err) => {
        console.error('Upload error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Upload failed' });
      });
  });

  bb.on('finish', () => {
    if (!fileHandled && !res.headersSent) {
      res.status(400).json({ error: 'No file provided' });
    }
  });

  bb.on('error', (err) => {
    console.error('Busboy error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Upload failed' });
  });

  req.pipe(bb);
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

    const mimeType = file.mime_type || 'application/octet-stream';
    const totalSize = file.size_bytes ? parseInt(file.size_bytes, 10) : null;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

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
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Issue a short-lived download token for a file the caller has access to.
// The token can be embedded in a plain URL so the browser can download natively
// (no JS arrayBuffer, no memory limit, browser shows its own download progress).
app.post('/api/files/:filename/token', authenticate, async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);
  try {
    const result = await pool.query(
      `SELECT file_key FROM hub_files
       WHERE file_name = $1 AND (owner_id = $2 OR is_public = true) LIMIT 1`,
      [fileName, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });

    const token = crypto.randomBytes(32).toString('hex');
    downloadTokens.set(token, {
      userId: req.user.id,
      fileName,
      fileKey: result.rows[0].file_key,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour — multi-use within window so Range/seeking works
    });
    res.json({ token, expires_in: 3600 });
  } catch (err) {
    console.error('Token issue error:', err);
    res.status(500).json({ error: 'Failed to generate download token' });
  }
});

// Stream a file using a short-lived token — no Authorization header required.
// Used by the frontend to trigger native browser downloads for any file size.
app.get('/api/files/:filename/download', async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);
  const rawToken = req.query.token;

  if (!rawToken) return res.status(401).json({ error: 'Token required' });

  const tokenData = downloadTokens.get(rawToken);
  if (!tokenData || tokenData.fileName !== fileName || tokenData.expiresAt < Date.now()) {
    downloadTokens.delete(rawToken);
    return res.status(401).json({ error: 'Invalid or expired download token' });
  }
  // Token stays valid until TTL — allows multiple Range requests (video seeking, resumable downloads)

  try {
    const result = await pool.query(
      `SELECT * FROM hub_files WHERE file_name = $1 AND (owner_id = $2 OR is_public = true) LIMIT 1`,
      [fileName, tokenData.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

    const mimeType = file.mime_type || 'application/octet-stream';
    const totalSize = file.size_bytes ? parseInt(file.size_bytes, 10) : null;

    res.setHeader('Content-Type', mimeType);
    // "attachment" forces the browser to download rather than display
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    res.socket.setTimeout(0);

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
    console.error('Token download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
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
    publicFileCache.delete(fileName);
    res.sendStatus(204);
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Set file visibility — three tiers: private | hub | web
// private: is_public=false, web_public=false  (owner only)
// hub:     is_public=true,  web_public=false  (hub members, auth required)
// web:     is_public=true,  web_public=true   (anyone with the link, no auth)
app.patch('/api/files/:filename', authenticate, async (req, res) => {
  const fileName = decodeURIComponent(req.params.filename);
  const { visibility } = req.body;

  if (!['private', 'hub', 'web'].includes(visibility)) {
    return res.status(400).json({ error: 'visibility must be private, hub, or web' });
  }

  const is_public  = visibility !== 'private';
  const web_public = visibility === 'web';

  try {
    const result = await pool.query(
      `UPDATE hub_files SET is_public = $1, web_public = $2
       WHERE file_name = $3 AND owner_id = $4
       RETURNING id`,
      [is_public, web_public, fileName, req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });
    publicFileCache.delete(fileName);
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
    let file;
    const cached = publicFileCache.get(fileName);
    if (cached && (Date.now() - cached.cachedAt) < PUBLIC_FILE_CACHE_TTL) {
      file = cached.row;
    } else {
      const result = await pool.query(
        `SELECT * FROM hub_files WHERE file_name = $1 AND (is_public = true OR web_public = true) LIMIT 1`,
        [fileName]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'File not found' });
      file = result.rows[0];
      publicFileCache.set(fileName, { row: file, cachedAt: Date.now() });
    }
    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });

    const mimeType = file.mime_type || 'application/octet-stream';
    const totalSize = file.size_bytes ? parseInt(file.size_bytes, 10) : null;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

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

// GET /api/spaces/:slug/files/:filename — serve a space-scoped file (auth + membership required)
// Accepts token via Authorization header OR ?token= query param (needed for <img>/<video> src tags)
app.get('/api/spaces/:slug/files/:filename', async (req, res) => {
  const rawToken = (req.headers.authorization || '').replace(/^Bearer /i, '').trim()
    || (req.query.token || '').trim();
  if (!rawToken) return res.status(401).json({ error: 'Authorization required' });

  const { rows: authRows } = await pool.query(
    `SELECT u.id FROM hub_sessions s JOIN hub_users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [rawToken]
  );
  if (!authRows[0]) return res.status(401).json({ error: 'Invalid or expired token' });
  const userId = authRows[0].id;

  const fileName = decodeURIComponent(req.params.filename);
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rows: memRows } = await pool.query(
      `SELECT status FROM hub_space_members WHERE space_id = $1 AND user_id = $2`,
      [spaceRows[0].id, userId]
    );
    if (!memRows[0] || memRows[0].status !== 'active') return res.status(403).json({ error: 'Members only' });

    const { rows } = await pool.query(
      `SELECT * FROM hub_files WHERE file_name = $1 AND space_id = $2 LIMIT 1`,
      [fileName, spaceRows[0].id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });
    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });
    const file = rows[0];
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (file.size_bytes) res.setHeader('Content-Length', file.size_bytes);
    const stream = await minioClient.getObject(STORAGE_BUCKET, file.file_key);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces/:slug/banner — serve space banner image
app.get('/api/spaces/:slug/banner', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, banner_image_file_name FROM hub_spaces WHERE slug = $1`, [req.params.slug]
    );
    if (!rows[0]?.banner_image_file_name) return res.status(404).json({ error: 'No banner' });
    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });
    const fileKey = `space-banners/${rows[0].id}/${rows[0].banner_image_file_name}`;
    const stream = await minioClient.getObject(STORAGE_BUCKET, fileKey);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Post routes ───────────────────────────────────────────

const POST_CATEGORIES = ['DISCUSSION', 'ANNOUNCEMENT', 'PROJECT', 'REQUEST', 'EVENT'];

// List posts — chronological, newest first, optional category filter
app.get('/api/posts', authenticate, async (req, res) => {
  const lim = Math.min(parseInt(req.query.limit) || 50, 100);
  const cat = (req.query.category || '').toUpperCase();

  try {
    const params = [];
    const where = cat && POST_CATEGORIES.includes(cat)
      ? (params.push(cat), `WHERE p.category = $${params.length}`)
      : '';

    // Main feed: posts with no space_id, OR space posts shared to feed
    const spaceClause = `(p.space_id IS NULL OR p.shared_to_feed = TRUE)`;
    const combinedWhere = where
      ? `${where} AND ${spaceClause}`
      : `WHERE ${spaceClause}`;

    const { rows } = await pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.created_at, p.updated_at,
              p.space_id, p.shared_to_feed, p.event_date, p.event_location,
              u.id AS author_id, u.username AS author_username,
              f.file_name AS media_file_name,
              s.name AS space_name, s.slug AS space_slug,
              (SELECT COUNT(*) FROM hub_post_replies r WHERE r.post_id = p.id)::int AS reply_count
       FROM hub_posts p
       LEFT JOIN hub_users u ON p.author_id = u.id
       LEFT JOIN hub_files f ON p.media_file_id = f.id
       LEFT JOIN hub_spaces s ON s.id = p.space_id
       ${combinedWhere}
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
  const { category, title, body, event_date, event_location } = req.body || {};
  const cat = (category || '').toUpperCase();

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!POST_CATEGORIES.includes(cat)) {
    return res.status(400).json({ error: `category must be one of: ${POST_CATEGORIES.join(', ')}` });
  }
  if (cat === 'EVENT' && !event_date) {
    return res.status(400).json({ error: 'event_date is required for EVENT posts' });
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
         ON CONFLICT (file_key) DO UPDATE SET uploaded_at = NOW(), is_public = true
         RETURNING id`,
        [req.file.originalname, fileKey, req.file.mimetype, req.file.size, req.user.id]
      );
      mediaFileId = fileResult.rows[0].id;
    }

    const eventDateVal = (cat === 'EVENT' && event_date) ? new Date(event_date) : null;
    const eventLocVal  = (cat === 'EVENT' && event_location?.trim()) ? event_location.trim() : null;

    const result = await pool.query(
      `INSERT INTO hub_posts (category, title, body, author_id, media_file_id, event_date, event_location)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, category, title, body, created_at, updated_at, event_date, event_location`,
      [cat, title.trim(), body?.trim() || '', req.user.id, mediaFileId, eventDateVal, eventLocVal]
    );

    // Ensure post-attached media is always publicly readable
    if (mediaFileId) {
      pool.query('UPDATE hub_files SET is_public = true WHERE id = $1', [mediaFileId]).catch(() => {});
    }

    const post = result.rows[0];
    res.json({
      ...post,
      author_id:       req.user.id,
      author_username: req.user.username,
      media_file_name: req.file?.originalname || null,
      reply_count:     0,
    });
    // Non-blocking: embed new post for RAG
    embedPost(post.id, post.title, post.body, post.category).catch(() => {});
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update a post (author or admin)
app.patch('/api/posts/:id', authenticate, upload.single('media'), async (req, res) => {
  const { title, body, event_date, event_location, remove_media } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  try {
    const { rows } = await pool.query(
      'SELECT id, author_id, category, media_file_id FROM hub_posts WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    if (rows[0].author_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    const existing = rows[0];

    // Media: keep existing unless removing or replacing
    let mediaFileId = existing.media_file_id;
    if (remove_media === 'true') mediaFileId = null;
    if (req.file) {
      const fileKey = `${req.user.id}/${req.file.originalname}`;
      if (minioClient) {
        await minioClient.putObject(STORAGE_BUCKET, fileKey, req.file.buffer, req.file.size, { 'Content-Type': req.file.mimetype });
      }
      const fileResult = await pool.query(
        `INSERT INTO hub_files (file_name, file_key, mime_type, size_bytes, owner_id, is_public)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (file_key) DO UPDATE SET uploaded_at = NOW(), is_public = true
         RETURNING id`,
        [req.file.originalname, fileKey, req.file.mimetype, req.file.size, req.user.id]
      );
      mediaFileId = fileResult.rows[0].id;
    }

    const params = [title.trim(), body?.trim() || '', mediaFileId];
    const sets = ['title = $1', 'body = $2', 'media_file_id = $3', 'updated_at = NOW()'];
    if (existing.category === 'EVENT') {
      params.push(event_date ? new Date(event_date) : null);
      sets.push(`event_date = $${params.length}`);
      params.push(event_location?.trim() || null);
      sets.push(`event_location = $${params.length}`);
    }
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE hub_posts SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, author_id, category, title, body, media_file_id, event_date, event_location, created_at, updated_at`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Post not found' });
    const postData = result.rows[0];
    const [userResult, fileResult] = await Promise.all([
      pool.query('SELECT username FROM hub_users WHERE id = $1', [postData.author_id]),
      postData.media_file_id
        ? pool.query('SELECT file_name FROM hub_files WHERE id = $1', [postData.media_file_id])
        : Promise.resolve({ rows: [] }),
    ]);
    // Ensure post-attached media is always publicly readable
    if (postData.media_file_id) {
      pool.query('UPDATE hub_files SET is_public = true WHERE id = $1', [postData.media_file_id]).catch(() => {});
    }
    res.json({
      ...postData,
      author_username: userResult.rows[0]?.username || 'Unknown',
      media_file_name: fileResult.rows[0]?.file_name || null,
      reply_count: 0,
    });
    embedPost(postData.id, postData.title, postData.body, postData.category).catch(() => {});
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

// GET /api/events/upcoming — future EVENT posts sorted by event_date asc
app.get('/api/events/upcoming', authenticate, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.event_date, p.event_location,
              p.created_at, p.updated_at,
              u.id AS author_id, u.username AS author_username,
              f.file_name AS media_file_name,
              (SELECT COUNT(*) FROM hub_post_replies r WHERE r.post_id = p.id)::int AS reply_count
       FROM hub_posts p
       LEFT JOIN hub_users u ON p.author_id = u.id
       LEFT JOIN hub_files f ON p.media_file_id = f.id
       WHERE p.category = 'EVENT' AND p.event_date >= NOW() - INTERVAL '2 hours'
       ORDER BY p.event_date ASC
       LIMIT $1`,
      [limit]
    );
    res.json({ events: rows });
  } catch (err) {
    console.error('Upcoming events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
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
              p.author_id AS author_id,
              u.username  AS author_username
       FROM hub_featured fi
       LEFT JOIN hub_posts p ON fi.ref_id = p.id
       LEFT JOIN hub_files f ON p.media_file_id = f.id
       LEFT JOIN hub_users u ON p.author_id = u.id
       ORDER BY fi.display_order ASC, fi.created_at ASC`
    );
    // Rewrite localhost image URLs to the hub's public tunnel URL so featured
    // card images work on devices other than the hub machine itself.
    const tunnelUrl = (process.env.TUNNEL_URL || '').replace(/\/$/, '');
    const localhostRe = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
    const items = rows.map(row => {
      if (tunnelUrl && row.image_url && localhostRe.test(row.image_url)) {
        return { ...row, image_url: row.image_url.replace(localhostRe, tunnelUrl) };
      }
      return row;
    });
    res.json({ items });
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

// Edit a featured item's text/label/image (admin or moderator)
app.patch('/api/featured/:id', authenticate, async (req, res) => {
  if (!isMod(req.user)) return res.status(403).json({ error: 'Admin or moderator access required' });
  const { title, caption, category_label, image_url } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE hub_featured
       SET title          = COALESCE(NULLIF($1, ''), title),
           caption        = $2,
           category_label = $3,
           image_url      = $4
       WHERE id = $5
       RETURNING id, type, ref_id, title, caption, category_label, image_url, display_order, created_at`,
      [
        title?.trim() || null,
        caption?.trim() || null,
        category_label?.trim() || null,
        image_url?.trim() || null,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Featured item not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update featured error:', err);
    res.status(500).json({ error: 'Failed to update featured item' });
  }
});

// ── Feature requests routes ────────────────────────────────

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

// ── Key registry routes ───────────────────────────────────
// Server stores public keys only — private keys never leave the client.

// Register / update own public key
app.post('/api/keys', authenticate, async (req, res) => {
  const { publicKeyJwk } = req.body || {};
  if (!publicKeyJwk || typeof publicKeyJwk !== 'string') {
    return res.status(400).json({ error: 'publicKeyJwk required' });
  }
  try {
    await pool.query(
      `INSERT INTO hub_user_keys (user_id, public_key, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET public_key = EXCLUDED.public_key, updated_at = NOW()`,
      [req.user.id, publicKeyJwk],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: /api/keys/backup MUST come before /api/keys/:userId to avoid the wildcard swallowing it.

// Store own encrypted key backup (server never sees plaintext keys)
app.post('/api/keys/backup', authenticate, async (req, res) => {
  const { encrypted_payload, salt, iv } = req.body || {};
  if (!encrypted_payload || !salt || !iv) {
    return res.status(400).json({ error: 'encrypted_payload, salt, and iv are required' });
  }
  try {
    await pool.query(
      `INSERT INTO hub_key_backups (user_id, encrypted_payload, salt, iv, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET encrypted_payload = EXCLUDED.encrypted_payload, salt = EXCLUDED.salt, iv = EXCLUDED.iv, updated_at = NOW()`,
      [req.user.id, encrypted_payload, salt, iv],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retrieve own encrypted key backup (for cross-device recovery)
app.get('/api/keys/backup', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT encrypted_payload, salt, iv FROM hub_key_backups WHERE user_id = $1',
      [req.user.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'No backup found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get any user's public key (for encrypting to them)
app.get('/api/keys/:userId', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT public_key FROM hub_user_keys WHERE user_id = $1', [req.params.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No key registered for this user' });
    res.json({ publicKeyJwk: r.rows[0].public_key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notes routes (private, owner-only) ────────────────────

app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const archived = req.query.archived === 'true';
    const { rows } = await pool.query(
      `SELECT id, owner_id, title, body_rich, body_plain, is_pinned, is_archived, is_public, is_web_public, color, created_at, updated_at
       FROM hub_notes
       WHERE owner_id = $1 AND is_archived = $2
       ORDER BY is_pinned DESC, updated_at DESC`,
      [req.user.id, archived]
    );
    res.json({ notes: rows });
  } catch (err) {
    console.error('List notes error:', err);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

app.get('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, owner_id, title, body_rich, body_plain, is_pinned, is_archived, is_public, is_web_public, color, created_at, updated_at
       FROM hub_notes WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Note not found' });
    // Owner can always read; others can only read public, non-archived notes
    const note = rows[0];
    if (note.owner_id !== req.user.id && (!note.is_public || note.is_archived)) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (err) {
    console.error('Get note error:', err);
    res.status(500).json({ error: 'Failed to get note' });
  }
});

app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title = '', body_rich = null, body_plain = '', color = null } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO hub_notes (owner_id, title, body_rich, body_plain, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_id, title, body_rich, body_plain, is_pinned, is_archived, is_public, color, created_at, updated_at`,
      [req.user.id, title, body_rich ? JSON.stringify(body_rich) : null, body_plain, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.patch('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM hub_notes WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Note not found' });

    const isAdminOrMod = req.user.is_admin || req.user.role === 'moderator';

    if (req.body.is_web_public === true && !isAdminOrMod) {
      return res.status(403).json({ error: 'Only admins and moderators can publish notes to the public web' });
    }
    if (req.body.is_blog_published === true && !isAdminOrMod) {
      return res.status(403).json({ error: 'Only admins and moderators can publish notes to the blog' });
    }

    const allowed = ['title', 'body_rich', 'body_plain', 'is_pinned', 'is_archived', 'is_public', 'is_web_public', 'is_blog_published', 'web_body_plain', 'web_body_rich', 'color'];
    const updates = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = $${i++}`);
        values.push((key === 'body_rich' || key === 'web_body_rich') && req.body[key] ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE hub_notes SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, owner_id, title, body_rich, body_plain, is_pinned, is_archived, is_public, color, created_at, updated_at`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Public notes for a user's profile — returns non-archived public notes (auth required, any member)
app.get('/api/members/:userId/public-notes', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, owner_id, title, body_plain, body_rich, is_pinned, is_archived, is_public, color, created_at, updated_at
       FROM hub_notes
       WHERE owner_id = $1 AND is_public = TRUE AND is_archived = FALSE
       ORDER BY is_pinned DESC, updated_at DESC`,
      [req.params.userId]
    );
    res.json({ notes: rows });
  } catch (err) {
    console.error('Public notes error:', err);
    res.status(500).json({ error: 'Failed to load public notes' });
  }
});

app.delete('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM hub_notes WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Note not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Public vendor profile — no auth required, only if web_public = true
app.get('/api/public/vendors/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM hub_vendors WHERE slug = $1 AND web_public = TRUE`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Vendor not found or not public' });
    const vendor = rows[0];
    const { rows: listings } = await pool.query(
      `SELECT * FROM hub_listings WHERE vendor_id = $1 AND is_active = TRUE ORDER BY created_at DESC`,
      [vendor.id]
    );
    res.json({ vendor, listings });
  } catch (err) {
    console.error('Public vendor error:', err);
    res.status(500).json({ error: 'Failed to load vendor' });
  }
});

// Public notes feed — no auth required, returns all web_public notes for blog use
app.get('/api/public/notes', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const { rows } = await pool.query(
      `SELECT n.id, n.title, n.web_body_plain, n.color, n.created_at, n.updated_at,
              u.username AS author
       FROM hub_notes n
       JOIN hub_users u ON n.owner_id = u.id
       WHERE n.is_blog_published = TRUE AND n.is_archived = FALSE
       ORDER BY n.updated_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ notes: rows });
  } catch (err) {
    console.error('Public notes feed error:', err);
    res.status(500).json({ error: 'Failed to load notes feed' });
  }
});

// Public note share — no auth required, only if is_web_public = true
app.get('/api/public/notes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.owner_id, u.username AS author, n.title,
              n.web_body_plain, n.web_body_rich, n.color, n.created_at, n.updated_at
       FROM hub_notes n
       JOIN hub_users u ON n.owner_id = u.id
       WHERE n.id = $1 AND n.is_blog_published = TRUE AND n.is_archived = FALSE`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Note not found or not public' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Public note error:', err);
    res.status(500).json({ error: 'Failed to load note' });
  }
});

// Public space share — no auth required, only if web_public = true (or SP society)
app.get('/api/public/spaces/:slug', async (req, res) => {
  try {
    // SP proxy spaces: societies are inherently public — no web_public flag needed
    const sp = await getSpacesProvider();
    if (sp && isSPSlug(req.params.slug)) {
      const [spaceResult, postsResult] = await Promise.all([
        proxyToApp(sp, `/societies/${req.params.slug}`, 'GET', undefined, null).catch(() => ({ status: 502, data: null })),
        proxyToApp(sp, `/societies/${req.params.slug}/posts`, 'GET', undefined, null).catch(() => ({ status: 200, data: [] })),
      ]);
      if (spaceResult.status !== 200) return res.status(404).json({ error: 'Space not found' });
      return res.json({ space: spaceResult.data, posts: postsResult.status === 200 ? postsResult.data : [] });
    }

    const { rows: spaceRows } = await pool.query(
      `SELECT id, slug, name, description, visibility, banner_mode, banner_color,
              banner_gradient_from, banner_gradient_to, banner_image_file_name,
              web_public, created_at, updated_at,
              (SELECT COUNT(*) FROM hub_space_members WHERE space_id = hub_spaces.id AND status = 'active') AS member_count
       FROM hub_spaces WHERE slug = $1 AND web_public = TRUE`,
      [req.params.slug]
    );
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found or not public' });
    const space = spaceRows[0];
    const { rows: posts } = await pool.query(
      `SELECT p.id, p.title, p.body, p.category, p.created_at,
              hf.file_name AS media_file_name,
              u.username AS author_username,
              (SELECT COUNT(*) FROM hub_post_replies r WHERE r.post_id = p.id) AS reply_count
       FROM hub_posts p
       JOIN hub_users u ON u.id = p.author_id
       LEFT JOIN hub_files hf ON hf.id = p.media_file_id
       WHERE p.space_id = $1
       ORDER BY p.created_at DESC LIMIT 50`,
      [space.id]
    );
    res.json({ space, posts });
  } catch (err) {
    console.error('Public space error:', err);
    res.status(500).json({ error: 'Failed to load space' });
  }
});

// Public space file — no auth, only if space is web_public
app.get('/api/public/spaces/:slug/files/:filename', async (req, res) => {
  try {
    const fileName = decodeURIComponent(req.params.filename);
    const { rows: spaceRows } = await pool.query(
      `SELECT id FROM hub_spaces WHERE slug = $1 AND web_public = TRUE`, [req.params.slug]
    );
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found or not public' });
    const { rows } = await pool.query(
      `SELECT file_key, mime_type, size_bytes FROM hub_files WHERE file_name = $1 AND space_id = $2 LIMIT 1`,
      [fileName, spaceRows[0].id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });
    if (!minioClient) return res.status(503).json({ error: 'Storage not available' });
    res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (rows[0].size_bytes) res.setHeader('Content-Length', rows[0].size_bytes);
    const stream = await minioClient.getObject(STORAGE_BUCKET, rows[0].file_key);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const slug = await generateVendorSlug(name.trim());
    const result = await pool.query(`
      INSERT INTO hub_vendors (
        owner_user_id, name, description, category,
        logo_file_name, banner_mode, banner_image_file_name, banner_color, banner_gradient_from, banner_gradient_to,
        contact_email, contact_phone, website, hours, slug
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      slug,
    ]);
    if (logo_file_name) {
      await pool.query(
        `UPDATE hub_files SET is_public = true
         WHERE owner_id = $1 AND file_name = $2`,
        [req.user.id, logo_file_name]
      );
    }
    if (banner_image_file_name) {
      await pool.query(
        `UPDATE hub_files SET is_public = true
         WHERE owner_id = $1 AND file_name = $2`,
        [req.user.id, banner_image_file_name]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a vendor page' });
    console.error('Create vendor error:', err);
    res.status(500).json({ error: 'Failed to create vendor page' });
  }
});

// ── Vendor slug generator ──────────────────────────────────
async function generateVendorSlug(name, excludeId = null) {
  const base = (name || 'vendor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'vendor';
  let slug = base, n = 1;
  for (;;) {
    const q = excludeId
      ? `SELECT 1 FROM hub_vendors WHERE slug = $1 AND id != $2`
      : `SELECT 1 FROM hub_vendors WHERE slug = $1`;
    const { rows } = await pool.query(q, excludeId ? [slug, excludeId] : [slug]);
    if (!rows.length) return slug;
    slug = `${base}-${n++}`;
  }
}

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
    web_public,
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
          web_public    = COALESCE($15, web_public),
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
      web_public != null ? !!web_public : null,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor page not found' });
    if (logo_file_name) {
      await pool.query(
        `UPDATE hub_files SET is_public = true
         WHERE owner_id = $1 AND file_name = $2`,
        [req.user.id, logo_file_name]
      );
    }
    if (banner_image_file_name) {
      await pool.query(
        `UPDATE hub_files SET is_public = true
         WHERE owner_id = $1 AND file_name = $2`,
        [req.user.id, banner_image_file_name]
      );
    }
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

// GET /api/admin/apps/debug — dump raw DB rows + probe each app (temporary diagnostic)
app.get('/api/admin/apps/debug', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    await ensureAppConfigTable();
    const r = await pool.query(`SELECT capability, app_url, app_name, updated_at FROM hub_app_configs ORDER BY capability`);
    const probes = [];
    for (const row of r.rows) {
      try {
        const infoRes = await fetch(`${row.app_url}/api/hub-app/info`, {
          headers: { 'x-hub-api-key': row.app_key },
          signal: AbortSignal.timeout(5000),
        });
        const info = infoRes.ok ? await infoRes.json() : { error: infoRes.status };
        probes.push({ appUrl: row.app_url, infoResponse: info });
      } catch (err) {
        probes.push({ appUrl: row.app_url, infoResponse: { error: err.message } });
      }
      break; // only probe first distinct URL
    }
    res.json({ dbRows: r.rows, probes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/apps — list installed app configs (admin only)
app.get('/api/admin/apps', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    await ensureAppConfigTable();
    const r = await pool.query(`SELECT capability, app_url, app_name, updated_at FROM hub_app_configs ORDER BY capability`);
    const result = r.rows.map(row => ({
      capability: row.capability, appUrl: row.app_url, appName: row.app_name, source: 'db', updatedAt: row.updated_at,
    }));
    // Surface env-var-only initiatives config if not in DB
    if (!result.find(a => a.capability === 'initiatives')) {
      const envUrl = process.env.INITIATIVES_APP_URL;
      result.push({ capability: 'initiatives', appUrl: envUrl ?? null, appName: null, source: envUrl ? 'env' : null });
    }
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
        // Store every capability the app advertises — one row per capability, same URL+key
        const appCapabilities = Array.isArray(info.capabilities) ? info.capabilities : [];
        const capsToStore = Array.from(new Set([capability, ...appCapabilities]));
        for (const cap of capsToStore) {
          await pool.query(
            `INSERT INTO hub_app_configs (capability, app_url, app_key, app_name, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (capability) DO UPDATE
             SET app_url = EXCLUDED.app_url, app_key = EXCLUDED.app_key, app_name = EXCLUDED.app_name, updated_at = NOW()`,
            [cap, appUrl, appKey, appName]
          );
          APP_PROVIDERS[cap] = { url: appUrl, key: appKey };
        }
        return res.json({ capability, appUrl, appName, capabilities: capsToStore, installed: true });
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

    // (capability rows and APP_PROVIDERS already handled inside the info-probe block above)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/apps/:capability — uninstall an app (admin only)
// Removes all capabilities sharing the same app URL (one disconnect = full disconnect)
app.delete('/api/admin/apps/:capability', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { capability } = req.params;
  try {
    await ensureAppConfigTable();
    const existing = await pool.query(`SELECT app_url FROM hub_app_configs WHERE capability = $1`, [capability]);
    if (existing.rows.length) {
      const sameUrl = existing.rows[0].app_url;
      const deleted = await pool.query(`DELETE FROM hub_app_configs WHERE app_url = $1 RETURNING capability`, [sameUrl]);
      for (const row of deleted.rows) APP_PROVIDERS[row.capability] = { url: null, key: null };
    } else {
      APP_PROVIDERS[capability] = { url: null, key: null };
    }
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
  spaces: {
    url: process.env.SPACES_APP_URL,
    key: process.env.SPACES_APP_KEY,
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

async function getSpacesProvider() {
  return getProvider('societies');
}

// Society Plus society IDs are cuid format: 'c' + 20+ lowercase alphanumeric chars
function isSPSlug(slug) {
  return /^c[a-z0-9]{20,}$/.test(slug);
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

// GET /api/spaces/app-info  — metadata about the societies/spaces app
app.get('/api/spaces/app-info', async (req, res) => {
  const p = await getProvider('societies') || await getProvider('spaces');
  if (!p) return res.json(null);
  try {
    const { status, data } = await proxyToApp(p, '/info');
    if (data && !data.websiteUrl) {
      try { data.websiteUrl = new URL(p.url).origin; } catch {}
    }
    res.status(status).json(data);
  } catch {
    res.json(null);
  }
});

// GET /api/initiatives/app-info  — metadata about the installed initiatives app
app.get('/api/initiatives/app-info', async (req, res) => {
  const p = await getProvider('initiatives');
  if (!p) return res.json(null); // no app configured — hub-agnostic mode
  try {
    const { status, data } = await proxyToApp(p, '/info');
    if (data && !data.websiteUrl) {
      try { data.websiteUrl = new URL(p.url).origin; } catch {}
    }
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

// ── Spaces ────────────────────────────────────────────────

// helpers
function spaceRole(members, userId) {
  const m = members.find(r => r.user_id === userId);
  return m ? m.role : null;
}
function canManageSpace(role) {
  return role === 'owner' || role === 'admin';
}

// POST /api/spaces — create a space (any hub member)
app.post('/api/spaces', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp) {
    try {
      const { status, data } = await proxyToApp(sp, '/societies', 'POST', req.body, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  const { name, slug, description, visibility = 'public' } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
  if (!['public', 'private', 'invite-only'].includes(visibility))
    return res.status(400).json({ error: 'invalid visibility' });
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  try {
    const { rows } = await pool.query(
      `INSERT INTO hub_spaces (slug, name, description, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [cleanSlug, name, description || null, visibility, req.user.id]
    );
    const space = rows[0];
    // creator becomes owner
    await pool.query(
      `INSERT INTO hub_space_members (space_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')`,
      [space.id, req.user.id]
    );
    // Return full space with caller's role/status/member_count so frontend has correct state immediately
    const { rows: full } = await pool.query(`
      SELECT s.id, s.slug, s.name, s.description, s.visibility, s.created_by, s.created_at, s.updated_at,
             s.banner_mode, s.banner_color, s.banner_gradient_from, s.banner_gradient_to, s.banner_image_file_name,
        COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.status = 'active') AS member_count,
        me.role   AS my_role,
        me.status AS my_status
      FROM hub_spaces s
      LEFT JOIN hub_space_members sm ON sm.space_id = s.id
      LEFT JOIN hub_space_members me ON me.space_id = s.id AND me.user_id = $1
      WHERE s.id = $2
      GROUP BY s.id, me.role, me.status
    `, [req.user.id, space.id]);
    res.status(201).json(full[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A space with that slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces — browse all spaces on this hub
app.get('/api/spaces', authenticate, async (req, res) => {
  try {
    const localQuery = pool.query(`
      SELECT s.id, s.slug, s.name, s.description, s.visibility, s.created_by, s.created_at, s.updated_at,
             s.banner_mode, s.banner_color, s.banner_gradient_from, s.banner_gradient_to, s.banner_image_file_name,
             s.web_public,
        COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.status = 'active') AS member_count,
        sm2.role  AS my_role,
        sm2.status AS my_status
      FROM hub_spaces s
      LEFT JOIN hub_space_members sm  ON sm.space_id = s.id
      LEFT JOIN hub_space_members sm2 ON sm2.space_id = s.id AND sm2.user_id = $1
      GROUP BY s.id, sm2.role, sm2.status
      ORDER BY s.created_at DESC
    `, [req.user.id]);

    const sp = await getSpacesProvider();
    const spQuery = sp
      ? proxyToApp(sp, '/societies', 'GET', undefined, req.user.username).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] });

    const [localResult, spResult] = await Promise.all([localQuery, spQuery]);
    const spRows = Array.isArray(spResult.data) ? spResult.data : [];
    res.json([...spRows, ...localResult.rows]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces/mine — spaces the caller is an active member of
app.get('/api/spaces/mine', authenticate, async (req, res) => {
  try {
    const localQuery = pool.query(`
      SELECT s.id, s.slug, s.name, s.description, s.visibility, s.created_by, s.created_at, s.updated_at,
             s.banner_mode, s.banner_color, s.banner_gradient_from, s.banner_gradient_to, s.banner_image_file_name,
             s.web_public,
        COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.status = 'active') AS member_count,
        me.role   AS my_role,
        me.status AS my_status
      FROM hub_spaces s
      JOIN hub_space_members me ON me.space_id = s.id AND me.user_id = $1 AND me.status = 'active'
      LEFT JOIN hub_space_members sm ON sm.space_id = s.id
      GROUP BY s.id, me.role, me.status
      ORDER BY s.name
    `, [req.user.id]);

    const sp = await getSpacesProvider();
    const spQuery = sp
      ? proxyToApp(sp, '/societies/mine', 'GET', undefined, req.user.username).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] });

    const [localResult, spResult] = await Promise.all([localQuery, spQuery]);
    const spRows = Array.isArray(spResult.data) ? spResult.data : [];
    res.json([...spRows, ...localResult.rows]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces/:slug — space detail
app.get('/api/spaces/:slug', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}`, 'GET', undefined, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.slug, s.name, s.description, s.visibility, s.created_by, s.created_at, s.updated_at,
             s.banner_mode, s.banner_color, s.banner_gradient_from, s.banner_gradient_to, s.banner_image_file_name,
             s.web_public,
        COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.status = 'active') AS member_count,
        me.role   AS my_role,
        me.status AS my_status
      FROM hub_spaces s
      LEFT JOIN hub_space_members sm ON sm.space_id = s.id
      LEFT JOIN hub_space_members me ON me.space_id = s.id AND me.user_id = $1
      WHERE s.slug = $2
      GROUP BY s.id, me.role, me.status
    `, [req.user.id, req.params.slug]);
    if (!rows[0]) return res.status(404).json({ error: 'Space not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/spaces/:slug — update space settings (owner/admin)
app.patch('/api/spaces/:slug', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}`, 'PATCH', req.body, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT * FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const space = spaceRows[0];
    const { rows: memRows } = await pool.query(
      `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2 AND status = 'active'`,
      [space.id, req.user.id]
    );
    if (!memRows[0] || !canManageSpace(memRows[0].role))
      return res.status(403).json({ error: 'Only space admins can edit settings' });

    const { name, description, visibility, banner_mode, banner_color, banner_gradient_from, banner_gradient_to, web_public } = req.body;
    if (visibility && !['public', 'private', 'invite-only'].includes(visibility))
      return res.status(400).json({ error: 'invalid visibility' });

    const { rows } = await pool.query(`
      UPDATE hub_spaces SET
        name                 = COALESCE($1, name),
        description          = COALESCE($2, description),
        visibility           = COALESCE($3, visibility),
        banner_mode          = COALESCE($4, banner_mode),
        banner_color         = COALESCE($5, banner_color),
        banner_gradient_from = COALESCE($6, banner_gradient_from),
        banner_gradient_to   = COALESCE($7, banner_gradient_to),
        web_public           = COALESCE($9, web_public),
        updated_at           = NOW()
      WHERE id = $8 RETURNING *
    `, [name || null, description !== undefined ? description : null, visibility || null,
        banner_mode || null, banner_color || null, banner_gradient_from || null, banner_gradient_to || null,
        space.id, web_public !== undefined ? web_public : null]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/spaces/:slug — delete space (owner only)
app.delete('/api/spaces/:slug', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}`, 'DELETE', undefined, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const spaceId = spaceRows[0].id;
    const { rows: memRows } = await pool.query(
      `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2 AND status = 'active'`,
      [spaceId, req.user.id]
    );
    if (memRows[0]?.role !== 'owner' && !req.user.is_admin)
      return res.status(403).json({ error: 'Only the space owner can delete it' });
    // Null out space_id on posts (keep posts, just detach from space)
    await pool.query(`UPDATE hub_posts SET space_id = NULL WHERE space_id = $1`, [spaceId]);
    await pool.query(`DELETE FROM hub_spaces WHERE id = $1`, [spaceId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spaces/:slug/join — join (public: auto-active; private: pending)
app.post('/api/spaces/:slug/join', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/join`, 'POST', {}, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT * FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const space = spaceRows[0];
    if (space.visibility === 'invite-only')
      return res.status(403).json({ error: 'This space is invite-only' });

    const status = space.visibility === 'public' ? 'active' : 'pending';
    await pool.query(`
      INSERT INTO hub_space_members (space_id, user_id, role, status)
      VALUES ($1, $2, 'member', $3)
      ON CONFLICT (space_id, user_id) DO UPDATE SET status = EXCLUDED.status
    `, [space.id, req.user.id, status]);
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spaces/:slug/leave — leave a space
app.post('/api/spaces/:slug/leave', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/leave`, 'POST', {}, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rows: memRows } = await pool.query(
      `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2`,
      [spaceRows[0].id, req.user.id]
    );
    if (memRows[0]?.role === 'owner')
      return res.status(400).json({ error: 'Transfer ownership before leaving' });
    await pool.query(`DELETE FROM hub_space_members WHERE space_id = $1 AND user_id = $2`, [spaceRows[0].id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces/:slug/members — list members (active + pending)
app.get('/api/spaces/:slug/members', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/members`, 'GET', undefined, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rows } = await pool.query(`
      SELECT u.id AS user_id, u.username, u.display_name, u.avatar_url, u.profile_headline,
             sm.role, sm.status, sm.joined_at
      FROM hub_space_members sm
      JOIN hub_users u ON u.id = sm.user_id
      WHERE sm.space_id = $1
      ORDER BY CASE sm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, u.username
    `, [spaceRows[0].id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/spaces/:slug/members/:userId — approve pending / change role
app.patch('/api/spaces/:slug/members/:userId', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/members/${req.params.userId}`, 'PATCH', req.body, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const spaceId = spaceRows[0].id;
    const { rows: actorRows } = await pool.query(
      `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2 AND status = 'active'`,
      [spaceId, req.user.id]
    );
    if (!actorRows[0] || !canManageSpace(actorRows[0].role))
      return res.status(403).json({ error: 'Only space admins can manage members' });

    const { role, status } = req.body;
    const updates = [];
    const vals = [spaceId, req.params.userId];
    if (role)   { updates.push(`role = $${vals.length + 1}`);   vals.push(role); }
    if (status) { updates.push(`status = $${vals.length + 1}`); vals.push(status); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    await pool.query(
      `UPDATE hub_space_members SET ${updates.join(', ')} WHERE space_id = $1 AND user_id = $2`,
      vals
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/spaces/:slug/members/:userId — remove member (admin) or self-kick
app.delete('/api/spaces/:slug/members/:userId', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/members/${req.params.userId}`, 'DELETE', undefined, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const spaceId = spaceRows[0].id;
    const isSelf = req.params.userId === req.user.id;
    if (!isSelf) {
      const { rows: actorRows } = await pool.query(
        `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2 AND status = 'active'`,
        [spaceId, req.user.id]
      );
      if (!actorRows[0] || !canManageSpace(actorRows[0].role))
        return res.status(403).json({ error: 'Only space admins can remove members' });
    }
    await pool.query(`DELETE FROM hub_space_members WHERE space_id = $1 AND user_id = $2`, [spaceId, req.params.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spaces/:slug/invite — invite a hub member (admin sends notification)
app.post('/api/spaces/:slug/invite', authenticate, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const { rows: spaceRows } = await pool.query(`SELECT * FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const space = spaceRows[0];
    const { rows: actorRows } = await pool.query(
      `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2 AND status = 'active'`,
      [space.id, req.user.id]
    );
    if (!actorRows[0] || !canManageSpace(actorRows[0].role))
      return res.status(403).json({ error: 'Only space admins can invite members' });

    await pool.query(`
      INSERT INTO hub_space_members (space_id, user_id, role, status)
      VALUES ($1, $2, 'member', 'invited')
      ON CONFLICT (space_id, user_id) DO NOTHING
    `, [space.id, user_id]);
    // Send notification to invited user
    await pool.query(`
      INSERT INTO hub_notifications (user_id, type, actor_id, ref_id)
      VALUES ($1, 'space_invite', $2, $3)
    `, [user_id, req.user.id, space.slug]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spaces/:slug/invite/accept — accept a space invite
app.post('/api/spaces/:slug/invite/accept', authenticate, async (req, res) => {
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rowCount } = await pool.query(`
      UPDATE hub_space_members SET status = 'active'
      WHERE space_id = $1 AND user_id = $2 AND status = 'invited'
    `, [spaceRows[0].id, req.user.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'No pending invite found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces/:slug/posts — posts scoped to this space
app.get('/api/spaces/:slug/posts', authenticate, async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/posts`, 'GET', undefined, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rows: memRows } = await pool.query(
      `SELECT status FROM hub_space_members WHERE space_id = $1 AND user_id = $2`,
      [spaceRows[0].id, req.user.id]
    );
    if (!memRows[0] || memRows[0].status !== 'active')
      return res.status(403).json({ error: 'Join this space to view posts' });

    const { rows } = await pool.query(`
      SELECT p.*, u.username AS author_username,
             hf.file_name AS media_file_name,
             (SELECT COUNT(*) FROM hub_post_replies r WHERE r.post_id = p.id) AS reply_count
      FROM hub_posts p
      LEFT JOIN hub_users u ON u.id = p.author_id
      LEFT JOIN hub_files hf ON hf.id = p.media_file_id
      WHERE p.space_id = $1
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [spaceRows[0].id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spaces/:slug/posts — create a post in this space (supports media upload)
app.post('/api/spaces/:slug/posts', authenticate, upload.single('media'), async (req, res) => {
  const sp = await getSpacesProvider();
  if (sp && isSPSlug(req.params.slug)) {
    try {
      const { status, data } = await proxyToApp(sp, `/societies/${req.params.slug}/posts`, 'POST', req.body, req.user.username);
      return res.status(status).json(data);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  const { title, body, category = 'DISCUSSION' } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const spaceId = spaceRows[0].id;
    const { rows: memRows } = await pool.query(
      `SELECT status FROM hub_space_members WHERE space_id = $1 AND user_id = $2`,
      [spaceId, req.user.id]
    );
    if (!memRows[0] || memRows[0].status !== 'active')
      return res.status(403).json({ error: 'Join this space to post' });

    let mediaFileId = null;
    if (req.file) {
      const fileKey = `spaces/${spaceId}/${req.user.id}/${req.file.originalname}`;
      if (minioClient) {
        await minioClient.putObject(STORAGE_BUCKET, fileKey, req.file.buffer, req.file.size, { 'Content-Type': req.file.mimetype });
      }
      const fr = await pool.query(
        `INSERT INTO hub_files (file_name, file_key, mime_type, size_bytes, owner_id, is_public, space_id)
         VALUES ($1, $2, $3, $4, $5, false, $6)
         ON CONFLICT (file_key) DO UPDATE SET uploaded_at = NOW()
         RETURNING id`,
        [req.file.originalname, fileKey, req.file.mimetype, req.file.size, req.user.id, spaceId]
      );
      mediaFileId = fr.rows[0].id;
    }

    const { rows } = await pool.query(`
      INSERT INTO hub_posts (category, title, body, author_id, space_id, media_file_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [category, title.trim(), body?.trim() || '', req.user.id, spaceId, mediaFileId]);
    res.status(201).json({
      ...rows[0],
      author_username: req.user.username,
      media_file_name: req.file?.originalname || null,
      reply_count: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spaces/:slug/files — files attached to this space's posts
app.get('/api/spaces/:slug/files', authenticate, async (req, res) => {
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rows: memRows } = await pool.query(
      `SELECT status FROM hub_space_members WHERE space_id = $1 AND user_id = $2`,
      [spaceRows[0].id, req.user.id]
    );
    if (!memRows[0] || memRows[0].status !== 'active')
      return res.status(403).json({ error: 'Join this space to view files' });

    const { rows } = await pool.query(`
      SELECT f.id, f.file_name, f.file_key, f.mime_type, f.size_bytes, f.uploaded_at,
             u.username AS uploaded_by, p.id AS post_id, p.title AS post_title
      FROM hub_files f
      LEFT JOIN hub_users u ON u.id = f.owner_id
      LEFT JOIN hub_posts p ON p.media_file_id = f.id
      WHERE f.space_id = $1
      ORDER BY f.uploaded_at DESC
    `, [spaceRows[0].id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spaces/:slug/banner — upload banner image (owner/admin)
app.post('/api/spaces/:slug/banner', authenticate, uploadBg.single('banner'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  try {
    const { rows: spaceRows } = await pool.query(`SELECT id FROM hub_spaces WHERE slug = $1`, [req.params.slug]);
    if (!spaceRows[0]) return res.status(404).json({ error: 'Space not found' });
    const { rows: memRows } = await pool.query(
      `SELECT role FROM hub_space_members WHERE space_id = $1 AND user_id = $2 AND status = 'active'`,
      [spaceRows[0].id, req.user.id]
    );
    if (!memRows[0] || !canManageSpace(memRows[0].role))
      return res.status(403).json({ error: 'Only space admins can change the banner' });

    const fileKey = `space-banners/${spaceRows[0].id}/${req.file.originalname}`;
    if (minioClient) {
      await minioClient.putObject(STORAGE_BUCKET, fileKey, req.file.buffer, req.file.size, { 'Content-Type': req.file.mimetype });
    }
    const fileName = req.file.originalname;
    await pool.query(
      `UPDATE hub_spaces SET banner_mode = 'image', banner_image_file_name = $1, updated_at = NOW() WHERE id = $2`,
      [fileName, spaceRows[0].id]
    );
    res.json({ file_name: fileName, file_key: fileKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/posts/:postId/share-to-feed — share a space post into the hub main feed
app.patch('/api/posts/:postId/share-to-feed', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM hub_posts WHERE id = $1`, [req.params.postId]);
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    const post = rows[0];
    if (!post.space_id) return res.status(400).json({ error: 'Post is not in a space' });
    if (post.author_id !== req.user.id && !isMod(req.user))
      return res.status(403).json({ error: 'Only the post author can share it' });
    await pool.query(`UPDATE hub_posts SET shared_to_feed = TRUE WHERE id = $1`, [post.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI / Assistant ────────────────────────────────────────

async function isOllamaReady() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

// ── RAG helpers ───────────────────────────────────────────

const EMBED_MODEL = 'nomic-embed-text';

async function isEmbedModelAvailable() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const { models } = await r.json();
    return (models || []).some(m => m.name === EMBED_MODEL || m.name.startsWith(EMBED_MODEL));
  } catch { return false; }
}

async function getEmbedding(text) {
  const r = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 2048) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error('Embedding request failed');
  const { embedding } = await r.json();
  return embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedPost(postId, title, body, category) {
  const text = `[${category || 'general'}] ${title || ''}: ${(body || '').slice(0, 1500)}`;
  const embedding = await getEmbedding(text);
  await pool.query(
    `INSERT INTO hub_post_embeddings (post_id, embedding)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (post_id) DO UPDATE SET embedding = $2::jsonb, embedded_at = NOW()`,
    [postId, JSON.stringify(embedding)]
  );
}

async function retrieveRelevantPosts(query, topK = 6) {
  const qEmb = await getEmbedding(query);
  const { rows } = await pool.query(`
    SELECT p.id, p.title, p.body, p.category, p.created_at, e.embedding
    FROM hub_posts p
    JOIN hub_post_embeddings e ON e.post_id = p.id
  `);
  if (rows.length === 0) return [];
  return rows
    .map(row => ({ ...row, score: cosineSimilarity(qEmb, JSON.parse(row.embedding)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(p => p.score > 0.25);
}

// Index any posts that don't yet have embeddings (non-blocking, runs in background)
async function indexUnembeddedPosts() {
  try {
    if (!(await isEmbedModelAvailable())) return;
    const { rows } = await pool.query(`
      SELECT p.id, p.title, p.body, p.category
      FROM hub_posts p
      LEFT JOIN hub_post_embeddings e ON e.post_id = p.id
      WHERE e.post_id IS NULL
      LIMIT 100
    `);
    for (const row of rows) {
      try { await embedPost(row.id, row.title, row.body, row.category); }
      catch { /* skip individual failures silently */ }
    }
    if (rows.length > 0) console.log(`[rag] indexed ${rows.length} post(s)`);
  } catch (err) {
    console.warn('[rag] background index failed:', err.message);
  }
}

async function getAiConfig() {
  try {
    const r = await pool.query(
      `SELECT key, value FROM hub_config WHERE key IN ('ai_enabled', 'ai_model')`
    );
    const cfg = Object.fromEntries(r.rows.map(row => [row.key, row.value]));
    let model = cfg.ai_model || '';
    // If no model configured, auto-pick the first available from Ollama
    if (!model) {
      try {
        const tr = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (tr.ok) {
          const td = await tr.json();
          model = td.models?.find(m => !m.name.includes('embed'))?.name || 'llama3.2:1b';
        }
      } catch { model = 'llama3.2:1b'; }
    }
    return { enabled: cfg.ai_enabled === 'true', model };
  } catch {
    return { enabled: false, model: 'llama3.2:1b' };
  }
}

async function buildHubContext(query = '') {
  try {
    const [cfgResult, membersResult] = await Promise.all([
      pool.query(`SELECT key, value FROM hub_config WHERE key IN ('hub_name','hub_location','hub_description')`),
      pool.query(`SELECT COUNT(*) AS cnt FROM hub_users`),
    ]);
    const cfg = Object.fromEntries(cfgResult.rows.map(r => [r.key, r.value]));
    const name = cfg.hub_name || process.env.HUB_NAME || 'this hub';
    const location = cfg.hub_location || process.env.HUB_LOCATION || '';
    const description = cfg.hub_description || process.env.HUB_DESCRIPTION || '';
    const memberCount = parseInt(membersResult.rows[0]?.cnt || '0', 10);

    let postLines = '';
    let usingRag = false;

    // Try RAG first when a query is available and embedding model is ready
    if (query && await isEmbedModelAvailable()) {
      try {
        const relevant = await retrieveRelevantPosts(query);
        if (relevant.length > 0) {
          usingRag = true;
          postLines = relevant.map(p => {
            const preview = (p.body || '').slice(0, 200).replace(/\n+/g, ' ');
            const ts = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `  [${ts}] [${p.category || 'general'}] ${p.title || '(untitled)'}: ${preview}`;
          }).join('\n');
        }
      } catch { /* fall through to recency */ }
    }

    // Fallback: most recent posts
    if (!postLines) {
      const { rows } = await pool.query(
        `SELECT title, body, category, created_at FROM hub_posts ORDER BY created_at DESC LIMIT 15`
      );
      postLines = rows.map(p => {
        const preview = (p.body || '').slice(0, 120).replace(/\n+/g, ' ');
        const ts = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `  [${ts}] [${p.category || 'general'}] ${p.title || '(untitled)'}: ${preview}`;
      }).join('\n');
    }

    return [
      `You are the community AI assistant for "${name}"${location ? `, a local hub in ${location}` : ''}.`,
      description ? `About this hub: ${description}` : '',
      `Members: ${memberCount}`,
      postLines
        ? `\n${usingRag ? 'Relevant' : 'Recent'} community posts:\n${postLines}`
        : '',
      '\nBe helpful and concise. When referencing hub posts, cite them naturally. If asked about something specific to this community you have no context for, say so. Only invoke tools when the member explicitly requests an action — answer general questions conversationally without tools. When using create_post, always write the complete post content yourself based on what the member described before calling the tool.',
    ].filter(Boolean).join('\n');
  } catch {
    return 'You are a helpful community AI assistant.';
  }
}

// ── AI Conversations (per-user, cross-origin history) ─────

app.get('/api/ai/conversations', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.title, c.updated_at,
             COUNT(m.id)::int AS message_count
      FROM hub_ai_conversations c
      LEFT JOIN hub_ai_messages m ON m.conversation_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT 200
    `, [req.user.id]);
    res.json({ conversations: rows });
  } catch { res.status(500).json({ error: 'Failed to load conversations' }); }
});

app.post('/api/ai/conversations', authenticate, async (req, res) => {
  try {
    const { title } = req.body;
    const { rows: [row] } = await pool.query(`
      INSERT INTO hub_ai_conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING id, title, created_at, updated_at
    `, [req.user.id, (title || 'New conversation').slice(0, 200)]);
    res.json(row);
  } catch { res.status(500).json({ error: 'Failed to create conversation' }); }
});

app.get('/api/ai/conversations/:id', authenticate, async (req, res) => {
  try {
    const { rows: [convo] } = await pool.query(
      `SELECT id, title, created_at, updated_at FROM hub_ai_conversations WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!convo) return res.status(404).json({ error: 'Not found' });
    const { rows: messages } = await pool.query(
      `SELECT role, content FROM hub_ai_messages WHERE conversation_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    res.json({ ...convo, messages });
  } catch { res.status(500).json({ error: 'Failed to load conversation' }); }
});

app.patch('/api/ai/conversations/:id', authenticate, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    await pool.query(
      `UPDATE hub_ai_conversations SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [title.slice(0, 200), req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Failed to update conversation' }); }
});

app.delete('/api/ai/conversations/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM hub_ai_conversations WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Failed to delete conversation' }); }
});

app.post('/api/ai/conversations/:id/messages', authenticate, async (req, res) => {
  try {
    const { role, content } = req.body;
    if (!role || !['user', 'assistant'].includes(role)) {
      return res.status(400).json({ error: 'role must be user or assistant' });
    }
    const { rows: [convo] } = await pool.query(
      `SELECT id FROM hub_ai_conversations WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!convo) return res.status(404).json({ error: 'Not found' });
    await pool.query(
      `INSERT INTO hub_ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
      [req.params.id, role, content ?? '']
    );
    await pool.query(
      `UPDATE hub_ai_conversations SET updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Failed to save message' }); }
});

// GET /api/ai/status
app.get('/api/ai/status', authenticate, async (_req, res) => {
  try {
    const [cfg, ready] = await Promise.all([getAiConfig(), isOllamaReady()]);
    res.json({ enabled: cfg.enabled, model: cfg.model, ollamaReady: ready });
  } catch {
    res.status(500).json({ error: 'Failed to get AI status' });
  }
});

// ── Tool definitions ──────────────────────────────────────

const HUB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_post',
      description: 'Draft and publish a post to the hub feed. ONLY use when the member explicitly asks to post or publish something. You MUST write the full post content yourself in the body field based on what the member described — do not leave body empty or ask the member to fill it in.',
      parameters: {
        type: 'object',
        properties: {
          body:     { type: 'string', description: 'The COMPLETE written post content you drafted — must be a full, ready-to-publish post, not a placeholder' },
          category: { type: 'string', enum: ['DISCUSSION','ANNOUNCEMENT','PROJECT','REQUEST'], description: 'Post category — default DISCUSSION' },
        },
        required: ['body', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_poll',
      description: 'Create a poll for members to vote on. ONLY use when explicitly asked to create or make a poll (e.g. "create a poll about X", "make a vote on Y").',
      parameters: {
        type: 'object',
        properties: {
          question:        { type: 'string', description: 'The poll question' },
          options:         { type: 'array', items: { type: 'string' }, description: '2–6 answer options' },
          closes_in_hours: { type: 'number', description: 'Hours until poll closes (default 72)' },
        },
        required: ['question', 'options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_hub_posts',
      description: 'Search hub posts by topic. ONLY use when explicitly asked to find, search, or look up posts (e.g. "find posts about X", "search for discussions on Y"). Do NOT use for general questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search topic or keywords' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_info',
      description: 'Look up a specific hub member by their exact username. ONLY use when asked about a named member (e.g. "who is @john", "tell me about member smith"). Do NOT use for general questions about the hub.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'The member username to look up' },
        },
        required: ['username'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_thread',
      description: 'Fetch and summarize replies on a specific post. ONLY use when explicitly asked to summarize a thread or discussion and a post ID is available.',
      parameters: {
        type: 'object',
        properties: {
          post_id: { type: 'string', description: 'UUID of the post to summarize' },
        },
        required: ['post_id'],
      },
    },
  },
];

const WRITE_TOOLS = new Set(['create_post', 'create_poll']);

async function executeReadTool(toolName, args) {
  switch (toolName) {
    case 'search_hub_posts': {
      if (await isEmbedModelAvailable()) {
        const results = await retrieveRelevantPosts(args.query, 8);
        if (!results.length) return 'No relevant posts found.';
        return results.map(p => `[${p.category}] "${p.title}": ${(p.body||'').slice(0,150)}`).join('\n');
      }
      const { rows } = await pool.query(
        `SELECT title, body, category FROM hub_posts WHERE title ILIKE $1 OR body ILIKE $1 LIMIT 8`,
        [`%${args.query}%`]
      );
      return rows.length
        ? rows.map(p => `[${p.category}] "${p.title}": ${(p.body||'').slice(0,150)}`).join('\n')
        : 'No posts found.';
    }
    case 'get_member_info': {
      const { rows } = await pool.query(
        `SELECT u.username, u.is_admin, u.created_at,
                (SELECT COUNT(*) FROM hub_posts WHERE author_id = u.id)::int AS post_count
         FROM hub_users u WHERE username ILIKE $1 LIMIT 1`,
        [args.username]
      );
      if (!rows[0]) return `No member found with username "${args.username}".`;
      const m = rows[0];
      return `Username: ${m.username} | Role: ${m.is_admin ? 'Admin' : 'Member'} | Posts: ${m.post_count} | Joined: ${new Date(m.created_at).toLocaleDateString()}`;
    }
    case 'summarize_thread': {
      const [post, replies] = await Promise.all([
        pool.query(`SELECT title, body FROM hub_posts WHERE id = $1`, [args.post_id]),
        pool.query(`SELECT u.username, r.body FROM hub_post_replies r JOIN hub_users u ON u.id = r.author_id WHERE r.post_id = $1 ORDER BY r.created_at`, [args.post_id]),
      ]);
      if (!post.rows[0]) return 'Post not found.';
      const replyText = replies.rows.map(r => `${r.username}: ${r.body}`).join('\n');
      return `Post: "${post.rows[0].title}"\n${post.rows[0].body}\n\nReplies (${replies.rows.length}):\n${replyText || 'No replies yet.'}`;
    }
    default: return 'Unknown tool.';
  }
}

function cleanModelText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\\39;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\\u0027/g, "'")
    .replace(/\\'/g, "'");
}

function generateActionPreview(toolName, args) {
  switch (toolName) {
    case 'create_post':
      return {
        label: 'Post to feed',
        fields: [
          { key: 'Category', value: (args.category||'DISCUSSION').charAt(0) + (args.category||'DISCUSSION').slice(1).toLowerCase() },
          { key: 'Content',  value: args.body || '' },
        ],
      };
    case 'create_poll':
      return {
        label: 'Create poll',
        fields: [
          { key: 'Question', value: args.question || '' },
          { key: 'Options',  value: (args.options||[]).map((o, i) => `${i+1}. ${o}`).join('\n') },
          { key: 'Closes in', value: `${args.closes_in_hours || 72} hours` },
        ],
      };
    default:
      return { label: toolName, fields: [] };
  }
}

// POST /api/ai/chat — tool-aware, confirms write actions before executing
app.post('/api/ai/chat', authenticate, aiLimiter, async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const cfg = await getAiConfig();
  if (!cfg.enabled) return res.status(403).json({ error: 'AI assistant is not enabled on this hub' });
  if (!(await isOllamaReady())) return res.status(503).json({ error: 'AI model is not available yet.' });

  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const systemContext = await buildHubContext(lastUserMsg);
  const ollamaMessages = [
    { role: 'system', content: systemContext },
    ...messages.slice(-20).map(m => ({ role: m.role, content: String(m.content) })),
  ];

  try {
    // Only include tools when the message clearly signals an action intent.
    // For general questions, skip tools entirely and stream directly — faster and more reliable.
    // Require explicit action phrasing — vague mentions of "post" in conversation don't qualify
    const ACTION_SIGNALS = [
      'create the post', 'create a post', 'write the post', 'write a post', 'make the post', 'make a post',
      'post this', 'post it', 'publish this', 'publish it', 'share this to the feed', 'post for me', 'post on my behalf',
      'create the poll', 'create a poll', 'make the poll', 'make a poll', 'start a poll',
      'find posts about', 'search for posts', 'search posts', 'look up posts about',
      'look up member', 'look up the member', 'find member', 'who is @',
      'summarize the thread', 'summarize the replies', 'summarize this post',
    ];
    const msgLower = lastUserMsg.toLowerCase();
    const mightNeedTools = ACTION_SIGNALS.some(sig => msgLower.includes(sig));

    if (!mightNeedTools) {
      // Conversational query — stream directly, no tools overhead
      const streamRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages: ollamaMessages, stream: true }),
        signal: AbortSignal.timeout(120000),
      });
      if (!streamRes.ok) {
        const err = await streamRes.text();
        return res.status(502).json({ error: `Model error: ${err.slice(0, 200)}` });
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Accel-Buffering', 'no');
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) res.write(chunk.message.content);
            if (chunk.done) { res.end(); return; }
          } catch { /* malformed line */ }
        }
      }
      return res.end();
    }

    // Action-intent path — non-streaming call with tools
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages: ollamaMessages, tools: HUB_TOOLS, stream: false }),
      signal: AbortSignal.timeout(120000),
    });

    if (!ollamaRes.ok) {
      const err = await ollamaRes.text();
      return res.status(502).json({ error: `Model error: ${err.slice(0, 200)}` });
    }

    const response = await ollamaRes.json();
    const message = response.message ?? {};
    let toolCalls = message.tool_calls ?? [];

    // Some models output tool calls as JSON text in content instead of structured tool_calls
    if (toolCalls.length === 0 && message.content) {
      const trimmed = message.content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[{')) {
        try {
          const arr = trimmed.startsWith('[') ? JSON.parse(trimmed) : [JSON.parse(trimmed)];
          const call = arr[0];
          if (call?.name && HUB_TOOLS.some(t => t.function.name === call.name)) {
            toolCalls = [{ function: { name: call.name, arguments: call.parameters || call.arguments || {} } }];
          }
        } catch { /* not a tool call, treat as regular text */ }
      }
    }

    if (toolCalls.length > 0) {
      const call = toolCalls[0];
      const toolName = call.function?.name;
      const rawArgs = call.function?.arguments;
      const toolArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs ?? {});

      if (WRITE_TOOLS.has(toolName)) {
        // If the model called create_post with no body, generate the content server-side
        if (toolName === 'create_post' && !toolArgs.body?.trim()) {
          try {
            const genRes = await fetch(`${OLLAMA_URL}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: cfg.model,
                messages: [
                  ...ollamaMessages,
                  { role: 'user', content: 'Based on the conversation above, write the complete post text exactly as it should appear in the hub feed. Write naturally and directly — no placeholders like [Name] or [Date], no preamble, no explanation, just the post.' },
                ],
                stream: false,
              }),
              signal: AbortSignal.timeout(60000),
            });
            if (genRes.ok) {
              const genData = await genRes.json();
              let body = cleanModelText(genData.message?.content?.trim() || '');
              if ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'"))) {
                body = body.slice(1, -1).trim();
              }
              toolArgs.body = body;
            }
          } catch { /* leave body empty, user will see it */ }
        }
        // Clean and strip wrapping quotes from body
        if (typeof toolArgs.body === 'string') {
          let b = cleanModelText(toolArgs.body).trim();
          if ((b.startsWith('"') && b.endsWith('"')) || (b.startsWith("'") && b.endsWith("'"))) {
            b = b.slice(1, -1).trim();
          }
          toolArgs.body = b;
        }
        // Ensure category is valid
        const validCats = ['DISCUSSION','ANNOUNCEMENT','PROJECT','REQUEST'];
        if (!validCats.includes(toolArgs.category)) toolArgs.category = 'DISCUSSION';

        return res.json({ type: 'action_required', tool: toolName, args: toolArgs, preview: generateActionPreview(toolName, toolArgs) });
      }

      // Read-only tool — execute silently, fold result back, return final response
      const toolResult = await executeReadTool(toolName, toolArgs);
      const messagesWithResult = [
        ...ollamaMessages,
        { role: 'assistant', content: message.content || '', tool_calls: toolCalls },
        { role: 'tool', content: toolResult },
      ];
      const finalRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages: messagesWithResult, stream: false }),
        signal: AbortSignal.timeout(120000),
      });
      const final = finalRes.ok ? await finalRes.json() : null;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.write(final?.message?.content || toolResult);
      return res.end();
    }

    // Guard: if the model leaked tool schema or metadata as text, retry without tools
    const content = message.content || '';
    const looksLikeToolLeak = content.includes('{function ') ||
      (content.includes('"type": "string"') && content.includes('"description"')) ||
      (content.trim().startsWith('{') && content.includes('parameters'));

    if (looksLikeToolLeak) {
      try {
        const retryRes = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: cfg.model, messages: ollamaMessages, stream: false }),
          signal: AbortSignal.timeout(120000),
        });
        const retryData = retryRes.ok ? await retryRes.json() : null;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.write(retryData?.message?.content || "I'm not sure what you'd like to do next — could you give me more details?");
        return res.end();
      } catch { /* fall through to original content */ }
    }

    // Regular response — send as text
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.write(content);
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'AI request failed' });
    else res.end();
  }
});

// POST /api/ai/action — execute a user-confirmed write action
app.post('/api/ai/action', authenticate, async (req, res) => {
  const { tool, args } = req.body;
  if (!tool || !args) return res.status(400).json({ error: 'tool and args required' });
  try {
    switch (tool) {
      case 'create_post': {
        const body = (args.body || '').trim();
        const category = (['DISCUSSION','ANNOUNCEMENT','PROJECT','REQUEST'].includes(args.category) ? args.category : 'DISCUSSION');
        if (!body) return res.status(400).json({ error: 'Post body is required' });
        const title = body.split('\n')[0].slice(0, 100) || 'Untitled';
        const { rows: [post] } = await pool.query(
          `INSERT INTO hub_posts (category, title, body, author_id) VALUES ($1,$2,$3,$4) RETURNING id, title`,
          [category, title, body, req.user.id]
        );
        embedPost(post.id, title, body, category).catch(() => {});
        return res.json({ ok: true, result: `Done — published to the feed as a ${category.charAt(0) + category.slice(1).toLowerCase()}:\n\n"${body}"` });
      }
      case 'create_poll': {
        const { question, options, closes_in_hours = 72 } = args;
        if (!question || !Array.isArray(options) || options.length < 2) {
          return res.status(400).json({ error: 'Question and at least 2 options required' });
        }
        const closesAt = new Date(Date.now() + Number(closes_in_hours) * 3_600_000);
        await pool.query(
          `INSERT INTO hub_polls (question, options, created_by, closes_at) VALUES ($1,$2::jsonb,$3,$4)`,
          [question, JSON.stringify(options.slice(0, 6)), req.user.id, closesAt]
        );
        return res.json({ ok: true, result: `Done — poll created: "${question}" with ${options.length} options. Members can vote in the Polls screen.` });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${tool}` });
    }
  } catch (err) {
    console.error('[ai-action]', err.message);
    res.status(500).json({ error: 'Action failed' });
  }
});

// GET /api/ai/models — list installed Ollama models (admin)
app.get('/api/ai/models', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const ready = await isOllamaReady();
  if (!ready) return res.json({ models: [] });
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    // Exclude embedding-only models from the chat model list
    const chatModels = (data.models || []).map(m => m.name).filter(n => !n.includes('embed'));
    res.json({ models: chatModels });
  } catch {
    res.json({ models: [] });
  }
});

// POST /api/ai/model/pull — pull a model from Ollama library (admin, streams progress)
app.post('/api/ai/model/pull', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { model } = req.body;
  if (!model || typeof model !== 'string') return res.status(400).json({ error: 'model name required' });
  const ready = await isOllamaReady();
  if (!ready) return res.status(503).json({ error: 'Ollama not available' });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
      signal: AbortSignal.timeout(600000),
    });
    const reader = pullRes.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Pull failed' });
    else res.end();
  }
});

// GET /api/ai/index/status — embedding coverage stats (admin)
app.get('/api/ai/index/status', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    const [total, indexed, embedReady] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS cnt FROM hub_posts`),
      pool.query(`SELECT COUNT(*) AS cnt FROM hub_post_embeddings`),
      isEmbedModelAvailable(),
    ]);
    res.json({
      total:      parseInt(total.rows[0]?.cnt || '0', 10),
      indexed:    parseInt(indexed.rows[0]?.cnt || '0', 10),
      embedModel: EMBED_MODEL,
      embedReady,
    });
  } catch {
    res.status(500).json({ error: 'Failed to get index status' });
  }
});

// POST /api/ai/index — trigger background re-index of all posts (admin)
app.post('/api/ai/index', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  if (!(await isEmbedModelAvailable())) {
    return res.status(503).json({ error: `Embedding model (${EMBED_MODEL}) not installed` });
  }
  res.json({ ok: true, message: 'Indexing started in background' });
  // Re-index everything (overwrite existing embeddings too)
  pool.query(`SELECT id, title, body, category FROM hub_posts`)
    .then(({ rows }) => {
      (async () => {
        let count = 0;
        for (const row of rows) {
          try { await embedPost(row.id, row.title, row.body, row.category); count++; }
          catch { /* skip */ }
        }
        console.log(`[rag] full re-index complete: ${count}/${rows.length} posts`);
      })();
    })
    .catch(() => {});
});

// PATCH /api/ai/config — enable/disable AI, set active model (admin)
app.patch('/api/ai/config', authenticate, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  const { enabled, model } = req.body;
  const updates = {};
  if (typeof enabled === 'boolean') updates.ai_enabled = String(enabled);
  if (model && typeof model === 'string') updates.ai_model = model;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'enabled or model required' });
  try {
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO hub_config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to update AI config' });
  }
});

// ── Serve portal (bundled into image at build time) ───────
// When the dist/ folder exists, the hub serves its own UI at /.
// API routes defined above always take precedence.
// The SPA fallback returns index.html for any unmatched GET so
// React Router handles client-side navigation (e.g. /feed, /atlas).
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  // Dynamic manifest — injects hub name so the installed PWA icon is distinguishable from Vercel
  app.get('/manifest.webmanifest', async (_req, res) => {
    try {
      const manifestPath = path.join(distPath, 'manifest.webmanifest');
      if (!fs.existsSync(manifestPath)) return res.status(404).end();
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      let hubName = process.env.HUB_NAME || 'CitiNet Hub';
      try {
        const result = await pool.query(`SELECT value FROM hub_config WHERE key = 'hub_name' LIMIT 1`);
        if (result.rows[0]?.value) hubName = result.rows[0].value;
      } catch { /* use env fallback */ }

      const hubSlug = process.env.HUB_SLUG || hubName.toLowerCase().replace(/\s+/g, '-');

      manifest.name = `${hubName} — CitiNet`;
      manifest.short_name = hubName;
      manifest.start_url = `/?hub=${encodeURIComponent(hubSlug)}`;

      res.setHeader('Content-Type', 'application/manifest+json');
      res.json(manifest);
    } catch {
      res.status(404).end();
    }
  });

  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── Capability backfill ───────────────────────────────────
// Runs non-blocking on startup. For each distinct app URL already in
// hub_app_configs, probe /api/hub-app/info and insert any capability rows
// the app advertises that aren't yet stored. Handles hubs that connected an
// app before multi-capability storage was introduced.
async function backfillAppCapabilities() {
  try {
    await ensureAppConfigTable();
    const distinct = await pool.query(
      `SELECT DISTINCT ON (app_url) app_url, app_key, app_name FROM hub_app_configs WHERE app_url IS NOT NULL`
    );
    for (const row of distinct.rows) {
      try {
        const infoRes = await fetch(`${row.app_url}/api/hub-app/info`, {
          headers: { 'x-hub-api-key': row.app_key },
          signal: AbortSignal.timeout(8000),
        });
        if (!infoRes.ok) continue;
        const info = await infoRes.json();
        const caps = Array.isArray(info.capabilities) ? info.capabilities : [];
        for (const cap of caps) {
          await pool.query(
            `INSERT INTO hub_app_configs (capability, app_url, app_key, app_name, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (capability) DO NOTHING`,
            [cap, row.app_url, row.app_key, row.app_name]
          );
          if (!APP_PROVIDERS[cap]?.url) {
            APP_PROVIDERS[cap] = { url: row.app_url, key: row.app_key };
          }
        }
        console.log(`[hub-app] capabilities for ${row.app_url}: ${caps.join(', ')}`);
      } catch (err) {
        console.warn(`[hub-app] probe failed for ${row.app_url}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[hub-app] capability backfill failed:', err.message);
  }
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

  // Non-blocking — discovers missing capabilities from already-connected apps
  backfillAppCapabilities().catch(() => {});

  // Non-blocking — embed any posts that don't yet have RAG vectors
  setTimeout(() => indexUnembeddedPosts().catch(() => {}), 5000);

  // Purge expired sessions every 6 hours
  setInterval(() => {
    pool.query('DELETE FROM hub_sessions WHERE expires_at < NOW()').catch(() => {});
  }, 6 * 60 * 60 * 1000);

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
