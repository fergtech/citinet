/**
 * Citinet share-link social card generator — Vercel Serverless Function (Node runtime)
 *
 * share-og.js patches the note/space/vendor/profile's title+description into
 * the page's og:title/og:description so link previews stop showing the
 * generic homepage. But notes (and vendors/spaces/profiles without an
 * uploaded banner/logo/avatar) still have no og:image of their own, which is
 * what actually catches the eye in a Facebook/Discord/iMessage preview card.
 *
 * This renders a branded 1200x630 image on demand — title, excerpt, and
 * "Shared from {hub}" — using @vercel/og (satori + resvg-wasm, pure
 * JS/WASM, no native binary). share-og.js points og:image at this endpoint
 * whenever the shared item has no real photo of its own. Rendered fresh per
 * request but cached at the edge (Cache-Control below), so repeat crawler
 * hits (Facebook re-fetches a few times, Discord/Slack once) don't re-hit
 * the hub each time.
 */

import React from 'react';
// Imported dynamically inside the handler's try/catch, not at module scope —
// @vercel/og loads resvg.wasm/yoga.wasm/a font file off disk at import time
// (see vercel.json's includeFiles for this function), so any bundling gap in
// the deployed function must fail into the DEFAULT_IMAGE redirect below
// rather than crashing the whole function before a request is even handled.

const REGISTRY_JSON_URL = 'https://raw.githubusercontent.com/fergtech/citinet-registry/main/registry.json';
const FETCH_TIMEOUT_MS = 3500;
const DEFAULT_IMAGE = 'https://citinet.cloud/icons/og-image.png';
const CATEGORY_LABEL = {
  DISCUSSION: 'Discussion', ANNOUNCEMENT: 'Announcement', PROJECT: 'Project',
  REQUEST: 'Request', EVENT: 'Event', POLL: 'Poll',
};

function truncate(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Same SSRF guard as share-og.js — ?src= is user-supplied. */
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
  try {
    const r = await fetchWithTimeout(REGISTRY_JSON_URL);
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
  if (srcParam && isSafeHubBase(srcParam)) base = srcParam.replace(/\/$/, '');
  return { base, hubName };
}

async function loadCardText(type, id, base, hubName) {
  const fallback = { kicker: 'citinet', title: 'citinet', description: `Shared from ${hubName}` };
  if (!base) return fallback;
  try {
    if (type === 'note') {
      const r = await fetchWithTimeout(`${base}/api/public/notes/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const note = await r.json();
      return { kicker: 'Note', title: truncate(note.title || 'Untitled note', 90), description: truncate(note.web_body_plain, 150) };
    }
    if (type === 'space') {
      const r = await fetchWithTimeout(`${base}/api/public/spaces/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const { space } = await r.json();
      if (!space) return fallback;
      return { kicker: 'Space', title: truncate(space.name || 'A space', 90), description: truncate(space.description, 150) };
    }
    if (type === 'vendor') {
      const r = await fetchWithTimeout(`${base}/api/public/vendors/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const { vendor } = await r.json();
      if (!vendor) return fallback;
      return { kicker: vendor.category || 'Vendor', title: truncate(vendor.name || 'A vendor', 90), description: truncate(vendor.description, 150) };
    }
    if (type === 'profile') {
      const r = await fetchWithTimeout(`${base}/api/public/profile/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const profile = await r.json();
      return { kicker: 'Profile', title: truncate(profile.display_name || profile.username || id, 90), description: truncate(profile.bio || profile.profile_headline, 150) };
    }
    if (type === 'post') {
      const r = await fetchWithTimeout(`${base}/api/public/posts/${encodeURIComponent(id)}`);
      if (!r.ok) return fallback;
      const post = await r.json();
      const kicker = CATEGORY_LABEL[post.category] || 'Post';
      const title = truncate(post.title || post.body || `${kicker} from ${hubName}`, 90);
      const description = post.category === 'POLL' && post.poll
        ? `${post.poll.options.length} options · ${post.poll.total_votes} vote${post.poll.total_votes === 1 ? '' : 's'}`
        : truncate(post.body, 150);
      return { kicker, title, description };
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function CardElement({ kicker, title, description, hubName }) {
  return React.createElement(
    'div',
    {
      style: {
        height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
        backgroundColor: '#18181b', padding: '64px', position: 'relative',
        fontFamily: 'sans-serif',
      },
    },
    React.createElement('div', {
      style: { position: 'absolute', top: 0, left: 0, right: 0, height: '10px', backgroundColor: '#2563eb', display: 'flex' },
    }),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      React.createElement('span', { style: { fontSize: 30, fontWeight: 800, color: '#ffffff' } }, 'citinet'),
      React.createElement('span', { style: { fontSize: 18, color: '#71717a' } }, kicker),
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', fontSize: 58, fontWeight: 800, lineHeight: 1.2, color: '#ffffff', marginTop: '36px' } },
      title,
    ),
    description
      ? React.createElement(
          'div',
          { style: { display: 'flex', fontSize: 28, color: '#a1a1aa', marginTop: '24px', lineHeight: 1.4 } },
          description,
        )
      : null,
    React.createElement(
      'div',
      { style: { display: 'flex', marginTop: 'auto', fontSize: 22, color: '#71717a' } },
      `Shared from ${hubName}`,
    ),
  );
}

export default async function handler(req, res) {
  const { type, hubSlug, id, src } = req.query;

  if (!type || !hubSlug || !id || typeof hubSlug !== 'string' || typeof id !== 'string') {
    res.writeHead(302, { Location: DEFAULT_IMAGE });
    res.end();
    return;
  }

  try {
    const [{ base, hubName }, { unstable_createNodejsStream }] = await Promise.all([
      resolveHubBase(hubSlug, typeof src === 'string' ? src : null),
      import('@vercel/og'),
    ]);
    const { kicker, title, description } = await loadCardText(type, id, base, hubName);

    const stream = await unstable_createNodejsStream(
      React.createElement(CardElement, { kicker, title, description, hubName }),
      { width: 1200, height: 630 },
    );

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.statusCode = 200;
    stream.pipe(res);
  } catch (err) {
    console.error('[share-card] falling back to default image:', err.message);
    res.writeHead(302, { Location: DEFAULT_IMAGE });
    res.end();
  }
}
