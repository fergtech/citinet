/**
 * Email — generic SMTP via nodemailer. Used as a utility (notifications, admin
 * alerts), never as infrastructure: no mail server runs on a hub. The hub owner
 * points it at any SMTP relay they already have (Gmail app password, Brevo,
 * Resend, Mailgun, SES, a corporate relay, ...).
 *
 * Where the settings come from, in order:
 *   1. Hub Management → System → Email (stored encrypted in the hub's own DB;
 *      applied immediately, no restart) — see api/opsSettings.js, which registers
 *      the loader below.
 *   2. Environment variables, for hubs configured before that screen existed:
 *        SMTP_HOST (required), SMTP_PORT (587), SMTP_SECURE ('true' for 465),
 *        SMTP_USER, SMTP_PASS, SMTP_FROM (defaults to SMTP_USER)
 *   With neither, sendEmail() is a silent no-op, so hubs without email are unaffected.
 */

const nodemailer = require('nodemailer');

let loader = null; // async () => config | null  (DB-stored settings)
let cache = { at: 0, cfg: null };
let transport = null;
let transportKey = '';
const CACHE_MS = 30_000;

function setConfigLoader(fn) {
  loader = fn;
  cache = { at: 0, cfg: null };
}

/** Drop the cached settings so a save takes effect on the very next send. */
function invalidateConfig() {
  cache = { at: 0, cfg: null };
}

function envConfig() {
  if (!process.env.SMTP_HOST) return null;
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    source: 'env',
  };
}

/** The effective config right now, or null if email isn't set up. */
async function resolveConfig() {
  if (loader) {
    if (Date.now() - cache.at > CACHE_MS) {
      try {
        cache = { at: Date.now(), cfg: await loader() };
      } catch (err) {
        // DB briefly unavailable — keep serving the last known config.
        console.error('Email settings load failed:', err.message);
        cache = { at: Date.now(), cfg: cache.cfg };
      }
    }
    if (cache.cfg) return { ...cache.cfg, source: 'ui' };
  }
  return envConfig();
}

function buildTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

async function getTransporter() {
  const cfg = await resolveConfig();
  if (!cfg) return null;
  const key = JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass]);
  if (!transport || key !== transportKey) {
    transport = buildTransport(cfg);
    transportKey = key;
  }
  return { t: transport, cfg };
}

/** Turn a nodemailer/SMTP error into something a hub owner can act on. */
function explainError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || err || '');
  const response = String(err?.response || '');
  if (code === 'EAUTH' || /535|authentication/i.test(msg + response)) {
    return 'The provider rejected the username or password. For Gmail, use an App Password (not your normal password); for Brevo/Resend/Mailgun, use the SMTP key they generate.';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'].includes(code) || /ENOTFOUND|ECONNREFUSED|timed? ?out/i.test(msg)) {
    return 'Could not reach the mail server. Check the host and port, and that the Security setting matches (587 uses STARTTLS, 465 uses SSL/TLS). Some home networks block outbound port 25.';
  }
  if (/wrong version number|ssl|tls|certificate/i.test(msg)) {
    return 'The secure connection failed. Try the other Security option: port 465 needs SSL/TLS, port 587 needs STARTTLS.';
  }
  if (code === 'EENVELOPE' || /sender|from address|not (?:authorized|verified)|550|553/i.test(msg + response)) {
    return 'The provider rejected the From address. Use an address (or domain) you have verified with them.';
  }
  return `Sending failed: ${msg.slice(0, 200)}`;
}

// Reserved/test domains (RFC 2606, e.g. seeded demo accounts at x@local.test) can
// never receive mail. Sending to them only produces hard bounces, which damage the
// sending domain's reputation, so they are skipped. Same pattern is used in SQL
// (Postgres ~*) to keep such rows out of the notification digest.
const RESERVED_EMAIL_PATTERN = '@([^@]+\\.)?(test|example|invalid|localhost)$|@example\\.(com|net|org)$';
const RESERVED_EMAIL_RE = new RegExp(RESERVED_EMAIL_PATTERN, 'i');
const isReservedEmail = (addr) => RESERVED_EMAIL_RE.test(String(addr || '').trim());

/** Fire-and-forget safe — never throws. No-ops silently if email isn't set up,
 *  `to` is empty, or `to` is a reserved test domain (returns { sent:false, skipped:true }),
 *  so hubs that haven't configured it are unaffected. */
async function sendEmail({ to, subject, text, html }) {
  if (isReservedEmail(to)) return { sent: false, skipped: true };
  const got = await getTransporter();
  if (!got || !to) return { sent: false };
  try {
    await got.t.sendMail({ from: got.cfg.from || got.cfg.user, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false, error: explainError(err) };
  }
}

/** Send using explicit settings (not saved yet), reporting exactly what failed —
 *  used by the "Send test email" button so a bad password is caught before saving. */
async function sendTestEmail(cfg, to, hubName) {
  const t = buildTransport(cfg);
  try {
    await t.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject: `[${hubName}] Test email — email alerts are working`,
      text: `This is a test message from ${hubName}.\n\nIf you can read this, your hub can email you about outages, failed backups and other problems.`,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: explainError(err) };
  } finally {
    t.close();
  }
}

module.exports = { sendEmail, sendTestEmail, setConfigLoader, invalidateConfig, resolveConfig, explainError, isReservedEmail, RESERVED_EMAIL_PATTERN };
