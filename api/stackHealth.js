/**
 * Stack health — API half of the ops baseline.
 *
 *  - POST /api/internal/stack-alert   (sidecar only, shared-secret) — the
 *    sidecar reports problems it finds (service down, backups stale, restore
 *    test failed). Stored in hub_stack_alerts; NEW critical ones are emailed to
 *    the hub's admins (if the operator configured SMTP — a silent no-op if not).
 *  - GET  /api/admin/stack/alerts     (admin) — open alerts + recent history.
 *  - GET  /api/admin/stack/health     (admin) — the sidecar's self-healing and
 *    backup-verification state, proxied.
 *  - POST /api/admin/stack/drill      (admin) — run the restore test now.
 *
 * A hub that is completely down can't send an alert — that blind spot is
 * covered by the sidecar's optional external heartbeat (HEALTHCHECK_PING_URL),
 * not by anything here.
 */

const crypto = require('crypto');
const { sendEmail, resolveConfig } = require('./mailer');

// An open alert the sidecar stops refreshing is stale (the condition cleared
// while it was down, or it was removed) — never shown, never blocks a new alert.
const STALE_AFTER_MINUTES = 120;

let tableReady = null;
/** Lazy + retrying (not run at import time): the DB may not be accepting
 *  connections yet during a full-host reboot — same race as the registry
 *  heartbeat's 2026-08-10 incident. */
function ensureTable(pool) {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS hub_stack_alerts (
           id           SERIAL      PRIMARY KEY,
           key          TEXT        NOT NULL,
           severity     TEXT        NOT NULL,
           title        TEXT        NOT NULL,
           detail       TEXT,
           created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           resolved_at  TIMESTAMPTZ
         )`,
      )
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS hub_stack_alerts_key_idx ON hub_stack_alerts (key, resolved_at)`))
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function emailAdmins(pool, { title, detail, severity }) {
  try {
    const { rows } = await pool.query(
      `SELECT email FROM hub_users WHERE is_admin = true AND email IS NOT NULL AND email <> '' AND status = 'approved'`,
    );
    const hubName = process.env.HUB_NAME || 'your hub';
    const url = (process.env.TUNNEL_URL || '').replace(/\/$/, '');
    const prefix = severity === 'critical' ? 'Action needed' : 'Heads up';
    for (const { email } of rows) {
      await sendEmail({
        to: email,
        subject: `[${hubName}] ${prefix}: ${title}`,
        text: `${title}\n\n${detail || ''}\n\n${url ? `Open Hub Management → System: ${url}` : ''}`.trim(),
        html: `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(detail || '')}</p>${url ? `<p><a href="${escapeHtml(url)}">Open ${escapeHtml(hubName)} → Hub Management → System</a></p>` : ''}`,
      });
    }
  } catch (err) {
    console.error('Stack alert email failed:', err.message);
  }
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function createStackHealth({ pool, authenticate, express, sidecarUrl, sidecarToken, announceRestart }) {
  const internal = express.Router();
  const admin = express.Router();

  internal.post('/stack-alert', express.json({ limit: '16kb' }), async (req, res) => {
    if (!tokenMatches(req.headers['x-admin-token'], sidecarToken)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { key, severity, title, detail, resolved } = req.body || {};
    if (typeof key !== 'string' || !key || key.length > 120) return res.status(400).json({ error: 'key required' });

    try {
      await ensureTable(pool);

      if (resolved) {
        await pool.query(`UPDATE hub_stack_alerts SET resolved_at = NOW() WHERE key = $1 AND resolved_at IS NULL`, [key]);
        return res.json({ ok: true });
      }
      if (!['critical', 'warning'].includes(severity) || typeof title !== 'string' || !title) {
        return res.status(400).json({ error: 'severity (critical|warning) and title required' });
      }

      const open = await pool.query(
        `SELECT id FROM hub_stack_alerts
         WHERE key = $1 AND resolved_at IS NULL AND last_seen_at > NOW() - make_interval(mins => $2)
         ORDER BY id DESC LIMIT 1`,
        [key, STALE_AFTER_MINUTES],
      );
      if (open.rows[0]) {
        // Same ongoing problem — keep-alive only, never re-notify.
        await pool.query(`UPDATE hub_stack_alerts SET last_seen_at = NOW(), detail = $2, title = $3 WHERE id = $1`, [
          open.rows[0].id, String(detail || '').slice(0, 2000), title.slice(0, 300),
        ]);
        return res.json({ ok: true, new: false });
      }

      // Close out any stale row for this key so history stays tidy, then open a new one.
      await pool.query(`UPDATE hub_stack_alerts SET resolved_at = last_seen_at WHERE key = $1 AND resolved_at IS NULL`, [key]);
      await pool.query(
        `INSERT INTO hub_stack_alerts (key, severity, title, detail) VALUES ($1, $2, $3, $4)`,
        [key, severity, title.slice(0, 300), String(detail || '').slice(0, 2000)],
      );
      if (severity === 'critical') emailAdmins(pool, { title, detail, severity }); // fire-and-forget
      return res.json({ ok: true, new: true });
    } catch (err) {
      console.error('stack-alert error:', err.message);
      return res.status(500).json({ error: 'failed to record alert' });
    }
  });

  admin.get('/alerts', authenticate, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    try {
      await ensureTable(pool);
      const { rows } = await pool.query(
        `SELECT id, key, severity, title, detail, created_at, last_seen_at, resolved_at,
                (resolved_at IS NULL AND last_seen_at > NOW() - make_interval(mins => $1)) AS open
         FROM hub_stack_alerts
         WHERE created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC LIMIT 100`,
        [STALE_AFTER_MINUTES],
      );
      res.json({ alerts: rows, emailConfigured: !!(await resolveConfig()) });
    } catch (err) {
      console.error('list stack alerts error:', err.message);
      res.status(500).json({ error: 'Failed to load alerts' });
    }
  });

  const proxy = (method, path) => async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    if (!sidecarToken) return res.json({ available: false });
    try {
      const r = await fetch(`${sidecarUrl}${path}`, {
        method,
        headers: { 'x-admin-token': sidecarToken },
        signal: AbortSignal.timeout(15_000),
      });
      const data = await r.json().catch(() => ({}));
      // An older sidecar image without these routes answers 404 — report that as
      // "not available" rather than an error, same as a missing sidecar.
      if (r.status === 404) return res.json({ available: false, outdated: true });
      res.status(r.status).json({ available: r.ok, ...data });
    } catch {
      res.json({ available: false });
    }
  };
  admin.get('/health', authenticate, proxy('GET', '/health'));
  admin.post('/drill', authenticate, proxy('POST', '/drill'));

  // Update watchdog (see admin-sidecar/updater.js): what's published vs. running.
  admin.get('/updates', authenticate, proxy('GET', '/updates'));
  admin.post('/updates/check', authenticate, proxy('POST', '/updates/check'));
  // Apply one service's update. Always an explicit admin action. Announces the
  // restart to the public registry first so the join list says "restarting".
  admin.post('/update/:service', authenticate, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    if (!sidecarToken) return res.status(503).json({ error: 'Stack admin sidecar is not configured for this hub' });
    try {
      if (typeof announceRestart === 'function') {
        await Promise.race([announceRestart(), new Promise((r) => setTimeout(r, 5000))]);
      }
      const r = await fetch(`${sidecarUrl}/update/${encodeURIComponent(req.params.service)}`, {
        method: 'POST',
        headers: { 'x-admin-token': sidecarToken },
        signal: AbortSignal.timeout(15_000),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 404 && !data.error) return res.status(501).json({ error: 'The admin sidecar on this hub predates updates — update it from the host first.' });
      res.status(r.status).json(data);
    } catch {
      res.status(502).json({ error: 'Could not reach the stack admin sidecar' });
    }
  });

  return { internal, admin };
}

module.exports = { createStackHealth };
