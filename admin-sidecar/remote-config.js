/**
 * Settings the hub owner manages in Hub Management (stored encrypted in the hub's
 * own database), pulled by the sidecar from citinet-api so changing them needs no
 * .env edit and no container restart. The HEALTHCHECK_PING_URL env var still works
 * as a fallback for hubs set up before that screen existed.
 */

const API_URL = process.env.API_URL || 'http://citinet-api:9090';
const ADMIN_SIDECAR_TOKEN = process.env.ADMIN_SIDECAR_TOKEN || '';
const REFRESH_MS = 5 * 60_000;

let uiPingUrl = '';

async function refresh() {
  try {
    const res = await fetch(`${API_URL}/api/internal/stack-config`, {
      headers: { 'x-admin-token': ADMIN_SIDECAR_TOKEN },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return; // older API without the route, or API down — keep what we have
    const data = await res.json();
    if (typeof data.pingUrl === 'string') uiPingUrl = data.pingUrl;
  } catch {
    // API unreachable — keep the last known value
  }
}

/** UI-saved URL wins; the env var is the fallback. */
function getPingUrl() {
  return uiPingUrl || process.env.HEALTHCHECK_PING_URL || '';
}

function pingSource() {
  return uiPingUrl ? 'ui' : process.env.HEALTHCHECK_PING_URL ? 'env' : 'none';
}

function start() {
  setTimeout(() => {
    refresh();
    setInterval(refresh, REFRESH_MS);
  }, 20_000);
}

module.exports = { start, refresh, getPingUrl, pingSource };
