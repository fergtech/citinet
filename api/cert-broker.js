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

  if (!process.env.REGISTRY_GITHUB_TOKEN || !process.env.CF_API_TOKEN) {
    return res.status(500).json({ error: 'Cert broker not configured (missing token)' });
  }

  // ── GET — slug availability check ───────────────────────────────────
  if (req.method === 'GET') {
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

  const { op, slug: rawSlug, secret, lanIp } = req.body || {};
  const slug = (rawSlug || '').toString().trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: 'slug is required' });

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

  return res.status(400).json({ error: 'op must be "claim" or "issue"' });
}
