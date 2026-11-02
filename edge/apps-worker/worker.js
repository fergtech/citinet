/**
 * Citinet apps edge — serves `<app>.citinet.io` for apps hosted on member hubs.
 *
 * Visitor → this Worker → the owning hub's public address → /apps/<app>/... on that hub.
 * The Worker holds no app data and no user data. It only knows "app name → hub origin",
 * which the cert broker (api/cert-broker.js, ops sync-app/release-app) writes into the
 * APPS KV namespace when a hub admin publishes an app. The hub stays the source of truth.
 *
 * Why a proxy and not a redirect: each app gets its own origin (`jobs.citinet.io`), which is
 * what keeps a hosted app away from the hub UI's localStorage, and the app's root-absolute
 * asset paths (/assets/...) work because it is served from the root of its own host.
 *
 * Hub offline? Static files are cached at the edge, so the last good copy keeps loading.
 */

const NO_ORIGIN_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);
// Names that must never be proxied: real subdomains of this zone (mail, www, ...). Their DNS
// records are normally unproxied and never reach the Worker; this is the safety net if one is.
const RESERVED = new Set(['www', 'send', 'mail', 'smtp', 'email', 'resend', 'mx', 'ns', 'ns1', 'ns2', 'api', 'admin']);

const html = (status, title, body) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><style>body{font:16px system-ui;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1e293b}` +
      `h1{font-size:1.25rem}p{color:#64748b;line-height:1.5}</style><h1>${title}</h1><p>${body}</p>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

/** `jobs.citinet.io` → `jobs`; anything with more or fewer labels than <name>.<zone> → null. */
export function appFromHost(host, zone) {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (!h.endsWith(`.${zone}`)) return null;
  const name = h.slice(0, -(zone.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(name) ? name : null;
}

/** Copy the origin's response, dropping anything that must not cross onto this origin. */
function clean(resp) {
  const headers = new Headers(resp.headers);
  headers.delete('Set-Cookie');
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Headers');
  headers.delete('Access-Control-Allow-Methods');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const zone = env.APPS_DOMAIN || 'citinet.io';
    const url = new URL(request.url);
    const app = appFromHost(url.hostname, zone);
    if (!app || RESERVED.has(app)) return fetch(request); // not one of ours — behave as if the Worker weren't here

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return html(405, 'Not allowed', 'Hosted apps are static — they only answer page loads.');
    }

    const record = await env.APPS.get(`app:${app}`, 'json');
    if (!record?.origin) {
      return html(404, 'No app here', `Nothing is published at <b>${app}.${zone}</b> yet.`);
    }

    const cache = caches.default;
    const isAsset = url.pathname.startsWith('/assets/');
    // Content-hashed bundles never change — skip the hub entirely when we already have one.
    if (isAsset) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }

    const target = new URL(`/apps/${app}${url.pathname}${url.search}`, record.origin);
    const headers = new Headers();
    for (const h of ['accept', 'accept-encoding', 'accept-language', 'if-none-match', 'range', 'user-agent']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }

    let resp = null;
    try {
      resp = await fetch(target, { method: request.method, headers, redirect: 'manual' });
    } catch {
      resp = null;
    }

    // Hub unreachable (offline, tunnel down): fall back to the last good copy of this URL.
    if (!resp || NO_ORIGIN_STATUS.has(resp.status)) {
      const stale = await cache.match(request);
      if (stale) return stale;
      return html(
        503,
        'This app is resting',
        `The hub that hosts <b>${app}.${zone}</b> is offline right now. Try again in a little while.`,
      );
    }

    // The hub redirects /apps/<app> → /apps/<app>/ — that never concerns a visitor on their own host.
    if (resp.status >= 300 && resp.status < 400) return html(404, 'Not found', 'That page does not exist.');

    const out = clean(resp);
    if (request.method === 'GET' && resp.status === 200) {
      const copy = out.clone();
      // Cache API ignores `no-cache`, so HTML is stored too — used only as the offline fallback above.
      ctx.waitUntil(cache.put(request, copy));
    }
    return out;
  },
};
