/**
 * Citinet share-link Open Graph shim — Vercel Serverless Function
 *
 * citinet-web is a client-rendered SPA (Vite), so link crawlers (Facebook,
 * Discord, Slack, iMessage, etc.) only ever see the generic homepage <head>
 * baked into dist/index.html — they don't execute JS, so they never see the
 * note/space/vendor/profile the visitor actually shared.
 *
 * vercel.json rewrites the public share routes (/share-note, /share-space,
 * /v, /u, /share) to this function *before* the catch-all SPA rewrite. It
 * fetches the shared item's public data from the hub itself, patches the
 * <title>/og:*/twitter:* tags in the real built index.html, and returns
 * that — so crawlers get content-specific previews and human visitors get
 * the exact same SPA (same script tags) that boots and takes over normally.
 *
 * Any failure (hub offline, item not public, registry unreachable) falls
 * back to serving the unmodified index.html — the SPA's own client-side
 * error states already handle that case.
 */

const DEFAULT_IMAGE = 'https://citinet.cloud/icons/og-image.png';
const REGISTRY_JSON_URL = 'https://raw.githubusercontent.com/fergtech/citinet-registry/main/registry.json';
const FETCH_TIMEOUT_MS = 3500;

const SHARE_PATH_BY_TYPE = {
  note: (hubSlug, id) => `/share-note/${hubSlug}/${id}`,
  space: (hubSlug, id) => `/share-space/${hubSlug}/${id}`,
  vendor: (hubSlug, id) => `/v/${hubSlug}/${id}`,
  profile: (hubSlug, id) => `/u/${hubSlug}/${id}`,
  file: (hubSlug, id) => `/share/${hubSlug}/${id}`,
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function truncate(text, max = 200) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Basic SSRF guard — the hub base URL is partly user-supplied (?src=), so
 *  only allow https and reject obvious loopback/private/link-local hosts. */
function isSafeHubBase(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (host === '::1' || host === '[::1]') return false;
    return true;
  } catch {
    return false;
  }
}

async function resolveHubBase(hubSlug, srcParam) {
  let base = null;
  let hubName = hubSlug;

  // The registry gives us the friendly hub name either way, and is also the
  // fallback source of truth for the base URL when ?src= is absent/invalid.
  try {
    const r = await fetchWithTimeout(REGISTRY_JSON_URL, FETCH_TIMEOUT_MS);
    if (r.ok) {
      const data = await r.json();
      const hub = (data.hubs || []).find(h => h.slug === hubSlug);
      if (hub) {
        hubName = hub.name || hubSlug;
        if (!base && hub.tunnel_url && isSafeHubBase(hub.tunnel_url)) {
          base = hub.tunnel_url.replace(/\/$/, '');
        }
      }
    }
  } catch { /* registry unreachable — fall through */ }

  if (srcParam && isSafeHubBase(srcParam)) {
    base = srcParam.replace(/\/$/, '');
  }

  return { base, hubName };
}

/** Builds the URL for the generated branded card (share-card.js) — used
 *  whenever the shared item has no real photo of its own (always true for
 *  notes; a fallback for space/vendor/profile). */
function generatedCardUrl(origin, type, hubSlug, id, src) {
  const params = new URLSearchParams({ type, hubSlug, id });
  if (src) params.set('src', src);
  return `${origin}/api/share-card?${params.toString()}`;
}

async function loadMeta(type, hubSlug, id, base, hubName, origin, src) {
  const genericCard = generatedCardUrl(origin, type, hubSlug, id, src);
  const fallback = {
    title: 'citinet : Citizens\' Internet Project',
    description: `Shared from ${hubName} on citinet.`,
    image: DEFAULT_IMAGE,
    ogType: 'website',
  };
  if (!base) return fallback;

  try {
    if (type === 'note') {
      const r = await fetchWithTimeout(`${base}/api/public/notes/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const note = await r.json();
      return {
        title: note.title || 'Untitled note',
        description: truncate(note.web_body_plain) || `A note shared from ${hubName}.`,
        // Notes have no photo of their own — always use the generated card.
        image: genericCard,
        ogType: 'article',
      };
    }

    if (type === 'space') {
      const r = await fetchWithTimeout(`${base}/api/public/spaces/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const { space } = await r.json();
      if (!space) return fallback;
      const memberLine = space.member_count != null ? `${space.member_count} members · ` : '';
      return {
        title: space.name || 'A space',
        description: truncate(space.description) || `${memberLine}shared from ${hubName}.`,
        image: space.banner_mode === 'image' && space.banner_image_file_name
          ? `${base}/api/spaces/${encodeURIComponent(id)}/banner`
          : genericCard,
        ogType: 'website',
      };
    }

    if (type === 'vendor') {
      const r = await fetchWithTimeout(`${base}/api/public/vendors/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const { vendor } = await r.json();
      if (!vendor) return fallback;
      const imageFile = vendor.logo_file_name || vendor.banner_image_file_name;
      return {
        title: vendor.name || 'A vendor',
        description: truncate(vendor.description) || `${vendor.name} on ${hubName}.`,
        image: imageFile ? `${base}/api/public/files/${encodeURIComponent(imageFile)}` : genericCard,
        ogType: 'website',
      };
    }

    if (type === 'profile') {
      const r = await fetchWithTimeout(`${base}/api/public/profile/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const profile = await r.json();
      return {
        title: profile.display_name || profile.username || id,
        description: truncate(profile.bio || profile.profile_headline) || `${profile.username || id} on ${hubName}.`,
        image: profile.avatar_url ? `${base}/api/auth/avatar/${encodeURIComponent(profile.user_id)}` : genericCard,
        ogType: 'profile',
      };
    }

    if (type === 'file') {
      // Files are shared to view/download, not to catch a scroller's eye —
      // a generated title card isn't worth the extra render here; a real
      // image file (photos shared directly) still shows itself.
      const ext = (id.split('.').pop() || '').toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext);
      return {
        title: id,
        description: `Shared from ${hubName} on citinet.`,
        image: isImage ? `${base}/api/public/files/${encodeURIComponent(id)}` : DEFAULT_IMAGE,
        ogType: 'website',
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function replaceMetaContent(html, attr, value, newContent) {
  const tagRe = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*>`, 'i');
  return html.replace(tagRe, tag => tag.replace(/content=(["'])(?:(?!\1).)*\1/, `content="${newContent}"`));
}

export default async function handler(req, res) {
  const { type, hubSlug, id, src } = req.query;

  const pathBuilder = SHARE_PATH_BY_TYPE[type];
  if (!pathBuilder || !hubSlug || !id) {
    res.status(400).send('Invalid share link');
    return;
  }

  const host = req.headers.host || 'citinet.cloud';
  const origin = `https://${host}`;
  const sharePath = pathBuilder(hubSlug, id);
  const shareUrl = `${origin}${sharePath}${src ? `?src=${encodeURIComponent(src)}` : ''}`;

  try {
    const [{ base, hubName }, indexRes] = await Promise.all([
      resolveHubBase(hubSlug, typeof src === 'string' ? src : null),
      fetchWithTimeout(`${origin}/index.html`, FETCH_TIMEOUT_MS),
    ]);

    if (!indexRes.ok) throw new Error(`index.html fetch failed: ${indexRes.status}`);
    let html = await indexRes.text();

    const meta = await loadMeta(type, hubSlug, id, base, hubName, origin, typeof src === 'string' ? src : null);
    const title = escapeHtml(meta.title);
    const description = escapeHtml(meta.description);
    const image = escapeHtml(meta.image);
    const url = escapeHtml(shareUrl);

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`);
    html = replaceMetaContent(html, 'name', 'title', title);
    html = replaceMetaContent(html, 'name', 'description', description);
    html = replaceMetaContent(html, 'property', 'og:type', meta.ogType);
    html = replaceMetaContent(html, 'property', 'og:url', url);
    html = replaceMetaContent(html, 'property', 'og:title', title);
    html = replaceMetaContent(html, 'property', 'og:description', description);
    html = replaceMetaContent(html, 'property', 'og:image', image);
    html = replaceMetaContent(html, 'name', 'twitter:url', url);
    html = replaceMetaContent(html, 'name', 'twitter:title', title);
    html = replaceMetaContent(html, 'name', 'twitter:description', description);
    html = replaceMetaContent(html, 'name', 'twitter:image', image);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Short edge cache: crawlers hit this a handful of times right after a
    // share, then rarely again — no need to re-fetch the hub every time.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(html);
  } catch (err) {
    console.error('[share-og] falling back to default index.html:', err.message);
    try {
      const fallbackRes = await fetchWithTimeout(`${origin}/index.html`, FETCH_TIMEOUT_MS);
      const html = await fallbackRes.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(html);
    } catch {
      res.status(502).send('Could not load page');
    }
  }
}
