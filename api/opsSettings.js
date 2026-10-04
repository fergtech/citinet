/**
 * Hub operator settings that used to mean hand-editing .env — email (SMTP relay)
 * and the outage-monitoring ping URL — now configurable from Hub Management.
 *
 * Stored in this hub's own database (never sent anywhere), with secrets
 * encrypted at rest under a key derived from the hub's JWT_SECRET, so a copy of
 * the database alone (a backup, a dump) doesn't reveal the SMTP password or the
 * monitor's secret ping URL.
 *
 *   GET/PUT/DELETE /api/admin/ops/email        (+ POST /test)
 *   GET/PUT/DELETE /api/admin/ops/monitoring   (+ POST /test)
 *   GET            /api/internal/stack-config  (sidecar only) -> { pingUrl }
 */

const crypto = require('crypto');
const { sendTestEmail, setConfigLoader, invalidateConfig, resolveConfig } = require('./mailer');

// ── encryption at rest ─────────────────────────────────────────────────────

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'citinet-ops-settings', 'aes-256-gcm-v1', 32));
}

function encrypt(plain) {
  const key = secretKey();
  if (!key) throw new Error('This hub has no JWT_SECRET configured, so secrets cannot be stored safely.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

function decrypt(blob) {
  const key = secretKey();
  if (!key || !blob) return '';
  try {
    const [, iv, tag, ct] = blob.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch {
    return ''; // JWT_SECRET changed or blob damaged — treated as "not set"
  }
}

// ── storage ────────────────────────────────────────────────────────────────

let tableReady = null;
/** Lazy + retrying: the DB may not be accepting connections yet during a full-host reboot. */
function ensureTable(pool) {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS hub_ops_settings (
           key        TEXT PRIMARY KEY,
           value      TEXT NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`,
      )
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

async function getSetting(pool, key) {
  await ensureTable(pool);
  const { rows } = await pool.query(`SELECT value FROM hub_ops_settings WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}
async function putSetting(pool, key, value) {
  await ensureTable(pool);
  await pool.query(
    `INSERT INTO hub_ops_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value],
  );
}
async function deleteSetting(pool, key) {
  await ensureTable(pool);
  await pool.query(`DELETE FROM hub_ops_settings WHERE key = $1`, [key]);
}

async function loadSmtp(pool) {
  const raw = await getSetting(pool, 'smtp');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return { host: s.host, port: s.port, secure: !!s.secure, user: s.user || '', pass: decrypt(s.pass), from: s.from || s.user || '' };
  } catch {
    return null;
  }
}

// ── validation ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// Accepts "me@x.com" or "Hub Name <me@x.com>".
const FROM_RE = /^(?:[^<>@\r\n]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

function parseSmtpInput(body, existing) {
  const host = String(body.host || '').trim();
  const port = parseInt(body.port, 10);
  const user = String(body.user || '').trim();
  const from = String(body.from || '').trim();
  if (!host || !HOST_RE.test(host) || host.length > 253) return { error: 'Enter the mail server host (for example smtp.gmail.com).' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'Enter a valid port (usually 587 or 465).' };
  if (!from || !FROM_RE.test(from) || from.length > 254) return { error: 'Enter the From address emails should come from (for example alerts@yourdomain.org).' };
  // Blank password on save = keep the stored one (the form never receives it back).
  const pass = body.pass ? String(body.pass) : (existing?.pass ?? '');
  if (user && !pass) return { error: 'Enter the password / SMTP key for this username.' };
  return { cfg: { host, port, secure: body.secure === true || body.secure === 'true', user, pass, from } };
}

function validatePingUrl(raw) {
  const url = String(raw || '').trim();
  if (!url || url.length > 500) return { error: 'Paste the full ping URL from your monitoring service.' };
  let u;
  try { u = new URL(url); } catch { return { error: 'That does not look like a web address.' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { error: 'The ping URL must start with http:// or https://.' };
  return { url };
}

/** Show enough to recognise the URL without exposing the secret token in it. */
function maskUrl(url) {
  try {
    const u = new URL(url);
    const tail = u.pathname.length > 6 ? `…${u.pathname.slice(-4)}` : u.pathname;
    return `${u.protocol}//${u.host}${tail}`;
  } catch {
    return '';
  }
}

function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── routes ─────────────────────────────────────────────────────────────────

function createOpsSettings({ pool, authenticate, express, sidecarToken }) {
  setConfigLoader(() => loadSmtp(pool));

  const admin = express.Router();
  const internal = express.Router();
  const requireAdmin = (req, res, next) =>
    req.user?.is_admin ? next() : res.status(403).json({ error: 'Admin access required' });

  const lastTest = new Map(); // `${kind}:${userId}` -> ts, so a stuck button can't hammer a provider
  const throttled = (kind, userId) => {
    const k = `${kind}:${userId}`;
    const now = Date.now();
    if (now - (lastTest.get(k) || 0) < 5000) return true;
    lastTest.set(k, now);
    return false;
  };

  // ---- email
  admin.get('/email', authenticate, requireAdmin, async (_req, res) => {
    try {
      const cfg = await resolveConfig();
      res.json({
        configured: !!cfg,
        source: cfg?.source ?? 'none',
        host: cfg?.host ?? '',
        port: cfg?.port ?? 587,
        secure: !!cfg?.secure,
        user: cfg?.user ?? '',
        from: cfg?.from ?? '',
        hasPassword: !!cfg?.pass,
        canStoreSecrets: !!secretKey(),
      });
    } catch (err) {
      console.error('get email settings:', err.message);
      res.status(500).json({ error: 'Failed to load email settings' });
    }
  });

  admin.put('/email', authenticate, requireAdmin, async (req, res) => {
    try {
      const existing = await loadSmtp(pool);
      const parsed = parseSmtpInput(req.body || {}, existing);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const { cfg } = parsed;
      await putSetting(pool, 'smtp', JSON.stringify({ ...cfg, pass: cfg.pass ? encrypt(cfg.pass) : '' }));
      invalidateConfig();
      res.json({ ok: true });
    } catch (err) {
      console.error('save email settings:', err.message);
      res.status(500).json({ error: err.message.includes('JWT_SECRET') ? err.message : 'Failed to save email settings' });
    }
  });

  admin.delete('/email', authenticate, requireAdmin, async (_req, res) => {
    try {
      await deleteSetting(pool, 'smtp');
      invalidateConfig();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove email settings' });
    }
  });

  // Tests the settings in the request body (or the saved ones, if the form was left
  // untouched) WITHOUT saving them, so a typo is caught before it replaces a working setup.
  admin.post('/email/test', authenticate, requireAdmin, async (req, res) => {
    if (throttled('email', req.user.id)) return res.status(429).json({ error: 'Wait a few seconds between tests.' });
    try {
      const existing = (await loadSmtp(pool)) || (await resolveConfig());
      const parsed = parseSmtpInput(req.body || {}, existing);
      if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });

      let to = String(req.body?.to || '').trim();
      if (!to) {
        const me = await pool.query(`SELECT email FROM hub_users WHERE id = $1`, [req.user.id]);
        to = me.rows[0]?.email || '';
      }
      if (!EMAIL_RE.test(to)) {
        return res.status(400).json({ ok: false, error: 'Enter the email address to send the test to (your account has no email on file).' });
      }
      const result = await sendTestEmail(parsed.cfg, to, process.env.HUB_NAME || 'your hub');
      res.status(result.ok ? 200 : 200).json({ ...result, to });
    } catch (err) {
      console.error('test email:', err.message);
      res.status(500).json({ ok: false, error: 'Could not run the test' });
    }
  });

  // ---- monitoring (outage heartbeat)
  admin.get('/monitoring', authenticate, requireAdmin, async (_req, res) => {
    try {
      const enc = await getSetting(pool, 'ping_url');
      const url = enc ? decrypt(enc) : '';
      res.json({ configured: !!url, pingUrlMasked: url ? maskUrl(url) : '', canStoreSecrets: !!secretKey() });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load monitoring settings' });
    }
  });

  admin.put('/monitoring', authenticate, requireAdmin, async (req, res) => {
    const v = validatePingUrl(req.body?.pingUrl);
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      await putSetting(pool, 'ping_url', encrypt(v.url));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message.includes('JWT_SECRET') ? err.message : 'Failed to save' });
    }
  });

  admin.delete('/monitoring', authenticate, requireAdmin, async (_req, res) => {
    try {
      await deleteSetting(pool, 'ping_url');
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to remove' });
    }
  });

  // Pings the URL once from the hub. Only the HTTP status is returned (never the
  // response body), so this can't be used to read from a service on the hub's network.
  admin.post('/monitoring/test', authenticate, requireAdmin, async (req, res) => {
    if (throttled('ping', req.user.id)) return res.status(429).json({ error: 'Wait a few seconds between tests.' });
    let url = '';
    if (req.body?.pingUrl) {
      const v = validatePingUrl(req.body.pingUrl);
      if (v.error) return res.status(400).json({ ok: false, error: v.error });
      url = v.url;
    } else {
      url = decrypt((await getSetting(pool, 'ping_url')) || '');
      if (!url) return res.status(400).json({ ok: false, error: 'No ping URL saved yet.' });
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
      if (r.status >= 200 && r.status < 400) return res.json({ ok: true, status: r.status });
      res.json({ ok: false, status: r.status, error: `The monitoring service answered ${r.status}. Check you pasted the full ping URL.` });
    } catch {
      res.json({ ok: false, error: 'Could not reach that address from this hub. Check the URL, and that this machine can reach it.' });
    }
  });

  // ---- sidecar pull (shared-secret; same trust boundary as the alert POST)
  internal.get('/stack-config', (req, res) => {
    if (!tokenMatches(req.headers['x-admin-token'], sidecarToken)) return res.status(403).json({ error: 'forbidden' });
    getSetting(pool, 'ping_url')
      .then((enc) => res.json({ pingUrl: enc ? decrypt(enc) : '' }))
      .catch(() => res.status(500).json({ error: 'unavailable' }));
  });

  return { admin, internal };
}

module.exports = { createOpsSettings, encrypt, decrypt, parseSmtpInput, validatePingUrl, maskUrl };
