/**
 * Citinet Cert Broker — Vercel Serverless Function
 *
 * GET  /api/cert-broker?slug=X             → { available: boolean }
 * POST /api/cert-broker  { op: 'claim', slug }
 *   → claims a hub slug, returns a one-time secret the hub keeps forever
 *     (HUB_CERT_SECRET in its .env — never re-shown, never stored in
 *     plaintext here, only its hash is persisted)
 * POST /api/cert-broker  { op: 'issue', slug, secret, lanIp }
 *   → verifies the secret against the claimed slug, obtains a real
 *     Let's Encrypt certificate for `${slug}.hub.citinet.cloud` via
 *     Cloudflare DNS-01, upserts a public A record pointing that hostname
 *     at the hub's own LAN IP (so anyone on that LAN with normal internet
 *     access resolves straight to it — private IPs aren't routable from
 *     outside that LAN, so this never leaks reachability beyond it), and
 *     returns { cert, key } (PEM). Never persisted here — stateless
 *     regarding certificate material by design.
 *
 * POST /api/cert-broker  { op: 'sync-app', slug, secret, app, origin }
 *   → claims (or refreshes) the public address `${app}.citinet.io` for one of
 *     this hub's hosted apps (see api/hubApps.js) and publishes
 *     app → hub origin to the edge Worker's KV namespace (edge/apps-worker).
 *     App names are globally unique, first come first served; the same hub
 *     re-syncing its own app just refreshes the origin.
 * POST /api/cert-broker  { op: 'release-app', slug, secret, app }
 *   → frees the name and removes it from the edge.
 *
 * Reuses the exact same "GitHub repo file as datastore" pattern as
 * api/registry.js, against a new cert-claims.json file in the same repo.
 * Reuses the existing REGISTRY_GITHUB_TOKEN (already configured for
 * registry.js) for that. Needs one NEW secret of its own: CF_API_TOKEN, a
 * Cloudflare API token scoped to DNS-edit on the citinet.cloud zone only —
 * a dedicated service credential, never a hub's own, never the operator's
 * personal Cloudflare login.
 */

import acme from 'acme-client';
import crypto from 'node:crypto';

const CLAIMS_OWNER = 'fergtech';
const CLAIMS_REPO  = 'citinet-registry';
const CLAIMS_FILE  = 'cert-claims.json';
const AUDIT_FILE   = 'cert-broker-audit.jsonl';

const APP_CLAIMS_FILE = 'app-claims.json';
const APPS_DOMAIN     = 'citinet.io';
const MAX_APPS_PER_HUB = 10;
const APP_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
// Names that would collide with real subdomains (mail, www, ...) or read as official.
const RESERVED_APP_NAMES = new Set([
  'www', 'api', 'admin', 'app', 'apps', 'hub', 'hubs', 'cdn', 'static', 'assets', 'status', 'help',
  'support', 'login', 'signup', 'citinet', 'official', 'blog', 'docs', 'info', 'dashboard', 'portal',
  'mail', 'send', 'smtp', 'email', 'resend', 'mx', 'ns', 'ns1', 'ns2', 'ftp', 'imap', 'pop', 'dev', 'test',
]);

const CERT_ZONE   = 'citinet.cloud';
const CERT_SUFFIX = 'hub.citinet.cloud';

// ── GitHub-repo-as-datastore (mirrors api/registry.js exactly) ──────────

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.REGISTRY_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'citinet-cert-broker',
  };
}

async function getJsonFile(filename, fallback) {
  const res = await fetch(
    `https://api.github.com/repos/${CLAIMS_OWNER}/${CLAIMS_REPO}/contents/${filename}`,
    { headers: githubHeaders() },
  );
  if (res.status === 404) return { content: fallback, sha: null };
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  return { content, sha: data.sha };
}

async function writeJsonFile(filename, content, sha, message) {
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
  const res = await fetch(
    `https://api.github.com/repos/${CLAIMS_OWNER}/${CLAIMS_REPO}/contents/${filename}`,
    {
      method: 'PUT',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: encoded, ...(sha ? { sha } : {}) }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write error: ${res.status} — ${err}`);
  }
}

/** Appends one line to a persisted audit log file (claims + failed verifications only — see plan). */
async function appendAudit(entry) {
  try {
    const { content, sha } = await getJsonFile(AUDIT_FILE, []);
    const lines = Array.isArray(content) ? content : [];
    lines.push({ ts: new Date().toISOString(), ...entry });
    await writeJsonFile(AUDIT_FILE, lines, sha, `audit: ${entry.action} ${entry.slug}`);
  } catch (err) {
    // Audit persistence is best-effort — never block the actual operation on it.
    console.error('[cert-broker] audit append failed', err.message);
  }
}

function log(action, slug, result, req) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    action, slug, result,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
  }));
}

// ── Cloudflare API (raw REST, no SDK — same style as tonight's manual proof) ──

function cfHeaders() {
  return {
    Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function getZoneId() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${CERT_ZONE}`, {
    headers: cfHeaders(),
  });
  const data = await res.json();
  const zone = data.result?.[0];
  if (!zone) throw new Error(`Cloudflare zone not found: ${CERT_ZONE}`);
  return zone.id;
}

async function upsertDnsRecord(zoneId, { type, name, content, ttl }) {
  const listRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${type}&name=${name}`,
    { headers: cfHeaders() },
  );
  const listData = await listRes.json();
  const existing = listData.result?.[0];

  const body = JSON.stringify({ type, name, content, ttl: ttl ?? 1, proxied: false });
  if (existing) {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing.id}`, {
      method: 'PUT', headers: cfHeaders(), body,
    });
    return existing.id;
  }
  const createRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST', headers: cfHeaders(), body,
  });
  const createData = await createRes.json();
  return createData.result?.id;
}

async function deleteDnsRecord(zoneId, recordId) {
  if (!recordId) return;
  await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'DELETE', headers: cfHeaders(),
  }).catch(() => {}); // cleanup is best-effort
}

// ── Edge KV (app name → hub origin, read by edge/apps-worker) ────────────

function kvConfigured() {
  return !!((process.env.CF_KV_API_TOKEN || process.env.CF_API_TOKEN)
    && process.env.CF_ACCOUNT_ID && process.env.CF_KV_NAMESPACE_ID);
}

function kvUrl(app) {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}`
    + `/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(`app:${app}`)}`;
}

function kvHeaders(extra = {}) {
  return { Authorization: `Bearer ${process.env.CF_KV_API_TOKEN || process.env.CF_API_TOKEN}`, ...extra };
}

async function kvPut(app, value) {
  const res = await fetch(kvUrl(app), {
    method: 'PUT', headers: kvHeaders({ 'Content-Type': 'text/plain' }), body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Cloudflare KV write failed: ${res.status}`);
}

async function kvDelete(app) {
  const res = await fetch(kvUrl(app), { method: 'DELETE', headers: kvHeaders() });
  if (!res.ok && res.status !== 404) throw new Error(`Cloudflare KV delete failed: ${res.status}`);
}

/** A hub's origin as the edge should call it: https only, a real hostname, never our own domain. */
function normalizeOrigin(raw) {
  try {
    const u = new URL(String(raw));
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    if (host === APPS_DOMAIN || host.endsWith(`.${APPS_DOMAIN}`)) return null;
    return `https://${host}${u.port && u.port !== '443' ? `:${u.port}` : ''}`;
  } catch {
    return null;
  }
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

// ── ACME DNS-01 issuance ─────────────────────────────────────────────────

async function issueCertificate(hostname) {
  const accountKey = await acme.forge.createPrivateKey();
  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
  });

  const [certKey, csr] = await acme.forge.createCsr({ commonName: hostname });

  const zoneId = await getZoneId();
  let challengeRecordId = null;

  const cert = await client.auto({
    csr,
    email: 'admin@citinet.cloud',
    termsOfServiceAgreed: true,
    challengePriority: ['dns-01'],
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      challengeRecordId = await upsertDnsRecord(zoneId, {
        type: 'TXT',
        name: `_acme-challenge.${authz.identifier.value}`,
        content: `"${keyAuthorization}"`,
      });
      // DNS propagation delay before Let's Encrypt validates.
      await new Promise(r => setTimeout(r, 8000));
    },
    challengeRemoveFn: async () => {
      await deleteDnsRecord(zoneId, challengeRecordId);
    },
  });

  return { cert: cert.toString(), key: certKey.toString() };
}

// ── Handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.REGISTRY_GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Cert broker not configured (missing token)' });
  }

  // ── GET ?app= — app-name availability (hosted apps on citinet.io) ───
  if (req.method === 'GET' && req.query.app !== undefined) {
    const app = (req.query.app || '').toString().trim().toLowerCase();
    if (!APP_SLUG_RE.test(app) || RESERVED_APP_NAMES.has(app)) return res.status(200).json({ available: false });
    try {
      const { content: appClaims } = await getJsonFile(APP_CLAIMS_FILE, {});
      return res.status(200).json({ available: !appClaims[app] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET — slug availability check ───────────────────────────────────
  if (req.method === 'GET') {
    if (!process.env.CF_API_TOKEN) return res.status(500).json({ error: 'Cert broker not configured (missing token)' });
    const slug = (req.query.slug || '').toString().trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: 'slug query param is required' });
    try {
      const { content: claims } = await getJsonFile(CLAIMS_FILE, {});
      const available = !claims[slug];
      log('check', slug, available ? 'available' : 'taken', req);
      return res.status(200).json({ available });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { op, slug: rawSlug, secret, lanIp, app: rawApp, origin: rawOrigin } = req.body || {};
  const slug = (rawSlug || '').toString().trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  // ── sync-app / release-app — public names for a hub's hosted apps ────
  if (op === 'sync-app' || op === 'release-app') {
    const app = (rawApp || '').toString().trim().toLowerCase();
    if (!secret) return res.status(400).json({ error: 'secret is required' });
    if (!APP_SLUG_RE.test(app) || RESERVED_APP_NAMES.has(app)) {
      return res.status(400).json({ error: 'That app name is not allowed' });
    }
    if (!kvConfigured()) return res.status(503).json({ error: 'Public app addresses are not configured yet' });
    try {
      const { content: hubClaims } = await getJsonFile(CLAIMS_FILE, {});
      const hubClaim = hubClaims[slug];
      if (!hubClaim || hubClaim.secretHash !== hashSecret(secret)) {
        log(op, `${slug}/${app}`, 'forbidden', req);
        await appendAudit({ action: op, slug, result: 'forbidden-bad-secret' });
        return res.status(403).json({ error: 'invalid slug/secret' });
      }

      const { content: appClaims, sha } = await getJsonFile(APP_CLAIMS_FILE, {});
      const owned = appClaims[app];

      if (op === 'release-app') {
        if (!owned) return res.status(200).json({ ok: true });
        if (owned.hub !== slug) return res.status(403).json({ error: 'That name belongs to another hub' });
        delete appClaims[app];
        await writeJsonFile(APP_CLAIMS_FILE, appClaims, sha, `chore: release app ${app}`);
        await kvDelete(app);
        log(op, `${slug}/${app}`, 'ok', req);
        return res.status(200).json({ ok: true });
      }

      const origin = normalizeOrigin(rawOrigin);
      if (!origin) return res.status(400).json({ error: 'origin must be this hub\'s public https address' });
      if (owned && owned.hub !== slug) {
        log(op, `${slug}/${app}`, 'rejected-taken', req);
        return res.status(409).json({ error: 'That app name is already taken' });
      }
      if (!owned) {
        const mine = Object.values(appClaims).filter(c => c.hub === slug).length;
        if (mine >= MAX_APPS_PER_HUB) {
          return res.status(429).json({ error: `A hub can claim at most ${MAX_APPS_PER_HUB} public app names` });
        }
        appClaims[app] = { hub: slug, claimedAt: new Date().toISOString() };
        await writeJsonFile(APP_CLAIMS_FILE, appClaims, sha, `chore: claim app ${app} for ${slug}`);
        await appendAudit({ action: 'claim-app', slug: `${slug}/${app}`, result: 'ok' });
      }
      // Refreshes (same hub, new tunnel URL) only touch KV — no GitHub write.
      await kvPut(app, { hub: slug, origin });
      log(op, `${slug}/${app}`, 'ok', req);
      return res.status(200).json({ ok: true, url: `https://${app}.${APPS_DOMAIN}` });
    } catch (err) {
      log(op, `${slug}/${app}`, 'error', req);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── claim — reserve a slug, issue a one-time secret ─────────────────
  if (op === 'claim') {
    try {
      const { content: claims, sha } = await getJsonFile(CLAIMS_FILE, {});
      if (claims[slug]) {
        log('claim', slug, 'rejected-taken', req);
        return res.status(409).json({ error: 'slug already claimed' });
      }
      const newSecret = crypto.randomBytes(32).toString('hex');
      const secretHash = crypto.createHash('sha256').update(newSecret).digest('hex');
      claims[slug] = { secretHash, claimedAt: new Date().toISOString() };
      await writeJsonFile(CLAIMS_FILE, claims, sha, `chore: claim slug ${slug}`);
      log('claim', slug, 'ok', req);
      await appendAudit({ action: 'claim', slug, result: 'ok' });
      return res.status(200).json({ secret: newSecret });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── issue — verify ownership, get a real cert + refresh the A record ──
  if (op === 'issue') {
    if (!process.env.CF_API_TOKEN) return res.status(500).json({ error: 'Cert broker not configured (missing token)' });
    if (!secret || !lanIp) return res.status(400).json({ error: 'secret and lanIp are required' });
    try {
      const { content: claims } = await getJsonFile(CLAIMS_FILE, {});
      const claim = claims[slug];
      const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
      if (!claim || claim.secretHash !== secretHash) {
        log('issue', slug, 'forbidden', req);
        await appendAudit({ action: 'issue', slug, result: 'forbidden-bad-secret' });
        return res.status(403).json({ error: 'invalid slug/secret' });
      }

      const hostname = `${slug}.${CERT_SUFFIX}`;
      const { cert, key } = await issueCertificate(hostname);

      const zoneId = await getZoneId();
      await upsertDnsRecord(zoneId, { type: 'A', name: hostname, content: lanIp, ttl: 300 });

      log('issue', slug, 'ok', req);
      return res.status(200).json({ cert, key });
    } catch (err) {
      log('issue', slug, 'error', req);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'op must be "claim", "issue", "sync-app" or "release-app"' });
}
