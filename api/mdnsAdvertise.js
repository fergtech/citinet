/**
 * Advertises this hub on the local network via mDNS/DNS-SD (Bonjour-style)
 * as `_citinet._tcp`, so the mobile app can find a nearby hub with zero
 * typing instead of only through the online registry + its tunnel_url
 * (which always routes over the internet, even when the phone is standing
 * next to the hub on the same LAN).
 *
 * This is a standalone entrypoint, not something server.js requires --
 * `citinet-api` itself sits on a Docker bridge network (docker-compose.yml),
 * which doesn't forward UDP multicast to the physical LAN. This file runs
 * as its own sidecar container (`citinet-mdns` in docker-compose.yml) with
 * network_mode: host instead, reusing citinet-api's image but overriding
 * the command -- kept fully separate so a host where multicast/host
 * networking isn't available (varies by Docker Desktop version on
 * Windows/Mac) only loses LAN discovery, never touches the main API.
 *
 * Prefers live hub name/slug from GET /api/info (which itself prefers the
 * DB-stored hub_config over the env-var fallback -- see server.js) so a
 * hub renamed via the admin portal doesn't need this container restarted
 * to pick it up. Falls back to the raw HUB_NAME/HUB_SLUG env vars if the
 * main API isn't reachable yet (container startup ordering) or errors,
 * since advertising with a possibly-stale name is still better than not
 * advertising at all -- the whole point here is LAN discoverability, not
 * strict identity accuracy.
 */

const { Bonjour } = require('bonjour-service');

const PORT = parseInt(process.env.PORT || '9090', 10);
const SERVICE_TYPE = 'citinet';

const STARTUP_DELAY_MS = 10 * 1000; // let citinet-api finish booting first
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min -- picks up a renamed hub without a restart

// Without an explicit interface, multicast-dns (which bonjour-service wraps
// directly) binds using the OS's default route -- on a host that's also
// running a VPN client (Tailscale, NordVPN/NordLynx, etc.) with a lower
// interface metric than the physical LAN adapter, that's the VPN, not the
// LAN. The advertisement then only reaches processes on the same host
// (loopback-visible), never an actual phone on the WiFi -- silently, no
// error anywhere. LAN_IP is the same env var already used elsewhere here
// for the hub's real address (see server.js's getLanIp), so this pins the
// multicast socket to the same interface that address lives on.
const bonjour = new Bonjour(process.env.LAN_IP ? { interface: process.env.LAN_IP } : undefined);
let currentService = null;
let lastSlug = null;
let lastName = null;

/** Live hub identity via loopback call to this hub's own /api/info, falling back to env vars. */
async function resolveHubIdentity() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/info`);
    if (res.ok) {
      const info = await res.json();
      if (info.hub_slug && info.hub_name) {
        return { slug: info.hub_slug, name: info.hub_name };
      }
    }
  } catch {
    /* citinet-api not reachable yet -- fall back below */
  }
  const fallbackName = process.env.HUB_NAME || 'Citinet Hub';
  return {
    slug: process.env.HUB_SLUG || fallbackName.toLowerCase().replace(/\s+/g, '-'),
    name: fallbackName,
  };
}

async function publishOrRefresh() {
  const { slug, name } = await resolveHubIdentity();
  if (currentService && slug === lastSlug && name === lastName) return; // nothing changed

  if (currentService) {
    bonjour.unpublishAll(() => {});
    currentService = null;
  }

  currentService = bonjour.publish({
    name: `Citinet — ${name}`,
    type: SERVICE_TYPE,
    protocol: 'tcp',
    port: PORT,
    txt: { slug, name },
  });
  lastSlug = slug;
  lastName = name;
  console.log(`[mdns-advertise] publishing _${SERVICE_TYPE}._tcp on port ${PORT} (slug=${slug}, name=${name})`);
}

function startMdnsAdvertise() {
  setTimeout(() => {
    publishOrRefresh().catch((err) => console.error('[mdns-advertise] startup publish failed:', err.message));
  }, STARTUP_DELAY_MS);
  setInterval(() => {
    publishOrRefresh().catch((err) => console.error('[mdns-advertise] refresh failed:', err.message));
  }, REFRESH_INTERVAL_MS);
}

process.on('SIGTERM', () => {
  bonjour.unpublishAll(() => bonjour.destroy());
  process.exit(0);
});

module.exports = { startMdnsAdvertise };

// Runs as its own container command (`node mdnsAdvertise.js`), not required
// by server.js -- so it needs to actually start itself, unlike
// registryHeartbeat.js's startRegistryHeartbeat() which server.js calls.
startMdnsAdvertise();
