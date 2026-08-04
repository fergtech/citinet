/**
 * Periodically re-registers this hub in the public registry so its member
 * count and other details stay fresh, without depending on an admin happening
 * to touch their tunnel URL setting in the browser (previously the only thing
 * that triggered a registry update at all -- see registryService.registerHub's
 * call sites). Opt-in via REGISTRY_URL; hubs that leave it empty (the default,
 * per .env's "leave empty for local/private hubs") never call out anywhere.
 *
 * Reads this hub's own live info via a loopback call to /api/info rather than
 * re-querying the database directly, so there is exactly one source of truth
 * for what "this hub's current info" means.
 */

const { postJson } = require('./httpsPostJson');

const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function heartbeat() {
  const registryUrl = process.env.REGISTRY_URL;
  const tunnelUrl = process.env.TUNNEL_URL;
  const port = process.env.PORT || 9090;

  if (!registryUrl || !tunnelUrl) return; // not opted into the public registry

  try {
    const infoRes = await fetch(`http://127.0.0.1:${port}/api/info`);
    if (!infoRes.ok) return;
    const info = await infoRes.json();

    const res = await postJson(registryUrl, {
      id: info.hub_slug,
      name: info.hub_name,
      slug: info.hub_slug,
      location: info.hub_location,
      description: info.hub_description,
      tunnel_url: tunnelUrl,
      member_count: info.member_count,
      hub_icon_mode: info.hub_icon_mode,
      hub_icon_symbol: info.hub_icon_symbol,
      hub_icon_bg_mode: info.hub_icon_bg_mode,
      hub_icon_gradient_from: info.hub_icon_gradient_from,
      hub_icon_gradient_to: info.hub_icon_gradient_to,
      hub_icon_solid_color: info.hub_icon_solid_color,
      hub_icon_image_file_name: info.hub_icon_image_file_name,
    });
    if (!res.ok) {
      console.error('[registryHeartbeat] registration failed:', res.status, res.body.error || '');
      return;
    }
    console.log('[registryHeartbeat] registry entry refreshed, member_count:', info.member_count);
  } catch (err) {
    console.error('[registryHeartbeat] error:', err.message);
  }
}

/** Call once at server startup. Registers immediately, then every 6 hours. */
function startRegistryHeartbeat() {
  heartbeat().catch(err => console.error('[registryHeartbeat] startup call failed:', err.message));
  setInterval(() => {
    heartbeat().catch(err => console.error('[registryHeartbeat] periodic call failed:', err.message));
  }, HEARTBEAT_INTERVAL_MS);
}

module.exports = { startRegistryHeartbeat };
