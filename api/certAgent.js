/**
 * Automatic HTTPS cert agent — fetches this hub's certificate from the
 * central cert broker (api/cert-broker.js) and keeps it fresh.
 *
 * The hub never talks to Cloudflare, DNS, or holds any domain credentials --
 * only HUB_CERT_SECRET, a per-hub secret proving ownership of its own slug
 * (set once at creation time, see scriptGenerator.ts). Checked at startup
 * and once a day; only actually calls the broker when the cert is missing
 * or within RENEW_BEFORE_DAYS of expiry, so routine checks don't churn
 * Let's Encrypt's rate limits.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');

const CERT_DIR = '/app/caddy-data';
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const BROKER_URL = process.env.CERT_BROKER_URL || 'https://citinet.cloud/api/cert-broker';
const RENEW_BEFORE_DAYS = 30;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

/**
 * Caddy's Caddyfile points `tls` at fixed file paths that must exist the
 * moment Caddy starts -- but the real cert only exists once ensureCert()
 * completes a live ACME challenge, which can take up to a minute or two for
 * DNS propagation. Without something on disk first, Caddy (gated on this
 * container's healthcheck via depends_on) would start before any cert
 * exists and fail to load its site block. This writes a short-lived,
 * self-signed placeholder synchronously -- before the server ever reports
 * healthy -- purely so Caddy has valid files to load immediately; the real
 * cert overwrites it (and triggers a reload) moments later.
 */
function writePlaceholderCert(hostname) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_PATH, forge.pki.certificateToPem(cert), { mode: 0o600 });
  fs.writeFileSync(KEY_PATH, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
}

/** Days until the current cert expires, or -1 if there's no cert yet / it can't be read. */
function daysUntilExpiry() {
  if (!fs.existsSync(CERT_PATH)) return -1;
  try {
    const certPem = fs.readFileSync(CERT_PATH, 'utf8');
    const x509 = new crypto.X509Certificate(certPem);
    return (new Date(x509.validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  } catch {
    return -1;
  }
}

async function reloadCaddy(hostname) {
  const caddyfile = [
    '{',
    '    admin 0.0.0.0:2019',
    '}',
    '',
    hostname + ' {',
    '    tls /data/certs/cert.pem /data/certs/key.pem',
    '    reverse_proxy citinet-api:9090',
    '}',
    '',
  ].join('\n');
  try {
    await fetch('http://citinet-caddy:2019/load', {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
      body: caddyfile,
    });
    console.log('[certAgent] Caddy reloaded with the new certificate');
  } catch (err) {
    console.error('[certAgent] Caddy reload failed (it will pick up the new cert on its own next restart):', err.message);
  }
}

async function ensureCert() {
  const slug = process.env.HUB_SLUG;
  const secret = process.env.HUB_CERT_SECRET;
  const lanIp = process.env.LAN_IP;
  const hostname = process.env.HUB_HTTPS_HOSTNAME;

  if (!slug || !secret || !hostname) return; // not configured -- e.g. an older hub, or a dev override

  if (daysUntilExpiry() > RENEW_BEFORE_DAYS) return; // still valid, nothing to do

  if (!lanIp) {
    console.warn('[certAgent] LAN_IP not set yet -- will retry on the next check');
    return;
  }

  try {
    const res = await fetch(BROKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'issue', slug, secret, lanIp }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[certAgent] issue failed:', res.status, body.error || '');
      return;
    }
    const { cert, key } = await res.json();
    fs.mkdirSync(CERT_DIR, { recursive: true });
    fs.writeFileSync(CERT_PATH, cert, { mode: 0o600 });
    fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
    console.log(`[certAgent] certificate obtained for ${hostname}`);
    await reloadCaddy(hostname);
  } catch (err) {
    console.error('[certAgent] error:', err.message);
  }
}

/** Call once at server startup. Checks immediately, then once a day. */
function startCertAgent() {
  const hostname = process.env.HUB_HTTPS_HOSTNAME;
  if (hostname && !fs.existsSync(CERT_PATH)) {
    try {
      writePlaceholderCert(hostname);
      console.log('[certAgent] wrote a temporary placeholder certificate so Caddy can start immediately');
    } catch (err) {
      console.error('[certAgent] failed to write placeholder cert:', err.message);
    }
  }
  ensureCert().catch(err => console.error('[certAgent] startup check failed:', err.message));
  setInterval(() => {
    ensureCert().catch(err => console.error('[certAgent] periodic check failed:', err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startCertAgent };
