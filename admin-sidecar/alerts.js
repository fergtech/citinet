/**
 * Alert reporter — tells citinet-api about problems this sidecar finds, so the
 * hub can show them in Hub Management → System and email the admin(s).
 *
 * raise(key, …) is safe to call on every check: it only talks to the API when
 * the problem is new, or as a keep-alive every KEEPALIVE_MS (the API treats an
 * open alert that stops being refreshed as stale and drops it, so a condition
 * that clears while this sidecar is down never sticks forever). clear(key)
 * reports recovery once.
 */

const API_URL = process.env.API_URL || 'http://citinet-api:9090';
const ADMIN_SIDECAR_TOKEN = process.env.ADMIN_SIDECAR_TOKEN || '';
const KEEPALIVE_MS = 30 * 60 * 1000;

const open = new Map(); // key -> last time we told the API about it

async function post(body) {
  try {
    const res = await fetch(`${API_URL}/api/internal/stack-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_SIDECAR_TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false; // API may be the thing that's down — retried on the next cycle
  }
}

/** severity: 'critical' (also emailed) | 'warning' */
async function raise(key, { severity, title, detail }) {
  const last = open.get(key);
  if (last && Date.now() - last < KEEPALIVE_MS) return;
  if (await post({ key, severity, title, detail, resolved: false })) open.set(key, Date.now());
}

async function clear(key) {
  if (!open.has(key)) return;
  if (await post({ key, resolved: true })) open.delete(key);
}

function openKeys() {
  return [...open.keys()];
}

module.exports = { raise, clear, openKeys };
