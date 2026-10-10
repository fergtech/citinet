/**
 * External feeds ("Outside") — public content from the wider web, pulled in by
 * the hub itself and shown to members as snippet cards that link out to the
 * original source.
 *
 * Off by default (opt-in): the hub admin turns on automatic local news (outside_auto) and each
 * member switches Outside on for themselves (external_enabled). Admin-added sources are an
 * explicit admin choice and always apply once a member has opted in.
 *
 * Design (see the conversation that produced this):
 *   - The HUB fetches, never a member's browser and never Vercel. Sources are a
 *     hub-admin-curated list (RSS/Atom, Mastodon hashtags, Bluesky feeds).
 *   - Fetched items land in ONE shared cache table. It holds public content
 *     only — nothing in it knows who the members are.
 *   - Personalisation happens at read time from settings the member set on
 *     purpose (hub_user_preferences: external_enabled / external_topics /
 *     external_muted_sources) falling back to their profile tags. No behavioural
 *     tracking.
 *   - Only title + a short plain-text excerpt + URL are stored (never full
 *     article bodies, never images — keeps us on the right side of republishing
 *     and avoids leaking members' IPs to publishers via hot-linked images).
 *
 * Every outbound request goes through safeFetch(), which resolves DNS itself,
 * refuses private/loopback/link-local/tailnet addresses (a hub lives on a home
 * LAN next to Postgres, MinIO and the router), pins the validated address for
 * the connection (no DNS-rebinding window) and re-validates on every redirect.
 *
 *   GET    /api/external/items                member feed (personalised)
 *   GET    /api/external/sources              member: enabled sources (for muting)
 *   GET    /api/admin/external-sources        admin: list + health
 *   POST   /api/admin/external-sources        admin: add (test-fetches first)
 *   PATCH  /api/admin/external-sources/:id    admin: label / topics / enabled
 *   DELETE /api/admin/external-sources/:id    admin
 *   POST   /api/admin/external-sources/:id/refresh   admin: fetch now
 */

const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const { encrypt, decrypt } = require('./opsSettings');

// No "+https://..." contact URL in the UA: www.npr.org's CDN tarpits any UA containing one
// (verified: identical request without the URL answers in 0.1s, with it never answers).
const USER_AGENT = 'CitinetHub/1.0 (feed reader)';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const MAX_SOURCES = 50;
const MAX_ITEMS_PER_SOURCE = 200;
const ITEM_MAX_AGE_DAYS = 30;
const BASE_REFRESH_MINUTES = 30;
const MAX_BACKOFF_MULTIPLIER = 16;
const EXCERPT_CHARS = 320;
const TITLE_CHARS = 200;
const ALLOWED_PORTS = new Set([80, 443]);
const KINDS = ['rss', 'mastodon_tag', 'bluesky_feed', 'google_news', 'reddit_search', 'bluesky_search', 'lemmy_search', 'threads_search'];
const THREADS_ROOT = 'https://graph.threads.net';
const THREADS_REFRESH_BEFORE_MS = 14 * 864e5;
const MAX_AUTO_SOURCES = 40;
// Local-AI relevance (nomic-embed-text). Calibrated on hub1's real model: a bare topic word vs a
// headline separates clear cases at ~0.51 (about 0.9 precision / 0.8 recall on a small labelled set);
// LLM-expanded topic descriptions did not beat it. Embedding similarity could NOT separate duplicate
// stories from templated look-alike headlines, so it is used for relevance only, never de-duplication.
const EMBED_MODEL = 'nomic-embed-text';
const SEM_THRESHOLD = 0.52;
const EMBED_PER_REFRESH = 60;
const EMBED_PER_TICK = 40;
const VEC_CACHE_MAX = 4000;
const MAX_AUTO_TOPICS = 8;
// Reddit throttles unauthenticated clients hard (429 after a few quick calls), so space its fetches out.
const SLOW_KINDS = new Set(['reddit_search']);

// ── SSRF guard ─────────────────────────────────────────────────────────────

const blocked = new net.BlockList();
for (const [addr, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT -- includes Tailscale, i.e. this hub's own tailnet
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local + cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]) blocked.addSubnet(addr, bits, 'ipv4');
for (const [addr, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['2001:db8::', 32], // documentation
  ['100::', 64], // discard
]) blocked.addSubnet(addr, bits, 'ipv6');

/** True when an address is one we must never connect to. Unparseable => blocked. */
function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) / NAT64 (64:ff9b::/96): judge the embedded v4.
    const m = address.toLowerCase().match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isBlockedAddress(m[1]);
    const hex = address.toLowerCase().match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
  }
  return blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

function httpError(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * GET a public URL. Returns { status, headers, body: Buffer, finalUrl }.
 * `allowPrivate` exists only so tests can point it at a loopback fixture
 * server; the production wiring never sets it.
 */
async function safeFetch(urlStr, opts = {}) {
  const {
    accept = '*/*',
    maxBytes = MAX_BODY_BYTES,
    timeoutMs = FETCH_TIMEOUT_MS,
    allowPrivate = false,
  } = opts;
  let current = urlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u;
    try {
      u = new URL(current);
    } catch {
      throw httpError('Invalid URL', 'EBADURL');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:')
      throw httpError('Only http/https URLs are supported', 'EBADURL');
    if (u.username || u.password) throw httpError('URLs with credentials are not allowed', 'EBADURL');
    const port = u.port ? parseInt(u.port, 10) : u.protocol === 'https:' ? 443 : 80;
    if (!allowPrivate && !ALLOWED_PORTS.has(port))
      throw httpError('Only ports 80 and 443 are allowed', 'EBADURL');

    // Resolve ourselves so the address we validate is the address we connect to.
    const host = u.hostname.replace(/^\[|\]$/g, '');
    let addr;
    if (net.isIP(host)) {
      addr = { address: host, family: net.isIP(host) };
    } else {
      const found = await dns.promises.lookup(host, { all: true });
      if (!found.length) throw httpError('Host did not resolve', 'EDNS');
      addr = found[0];
      if (!allowPrivate && found.some((f) => isBlockedAddress(f.address)))
        throw httpError('Host resolves to a non-public address', 'EBLOCKED');
    }
    if (!allowPrivate && isBlockedAddress(addr.address))
      throw httpError('Host is a non-public address', 'EBLOCKED');

    const res = await new Promise((resolve, reject) => {
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: host,
          port,
          path: u.pathname + u.search,
          method: 'GET',
          servername: net.isIP(host) ? undefined : host,
          headers: {
            Host: u.host,
            'User-Agent': USER_AGENT,
            Accept: accept,
            'Accept-Encoding': 'gzip, deflate, br',
          },
          timeout: timeoutMs,
          // Pin the connection to the address we just validated.
          lookup: (_h, o, cb) =>
            o && o.all
              ? cb(null, [{ address: addr.address, family: addr.family }])
              : cb(null, addr.address, addr.family),
        },
        (r) => resolve(r),
      );
      req.on('timeout', () => req.destroy(httpError('Request timed out', 'ETIMEOUT')));
      req.on('error', reject);
      req.end();
    });

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (hop === MAX_REDIRECTS) throw httpError('Too many redirects', 'EREDIRECT');
      current = new URL(res.headers.location, current).toString();
      continue;
    }

    const enc = String(res.headers['content-encoding'] || '').toLowerCase();
    let stream = res;
    if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
    else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
    else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      stream.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          res.destroy();
          reject(httpError('Response too large', 'ETOOBIG'));
          return;
        }
        chunks.push(c);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      res.on('error', reject);
    });
    return { status: res.statusCode, headers: res.headers, body, finalUrl: current };
  }
  throw httpError('Too many redirects', 'EREDIRECT');
}

// ── text helpers ───────────────────────────────────────────────────────────

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      } catch {
        return m;
      }
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML (or plain text) -> collapsed plain text. Never returns markup. */
function toPlainText(input) {
  if (input == null) return '';
  let s = String(input);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  // A second pass catches double-escaped markup (&lt;p&gt;) common in feeds.
  if (/<[a-z/][^>]*>/i.test(s)) s = s.replace(/<[^>]*>/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function truncate(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

function safeHttpUrl(v, base) {
  if (!v) return null;
  try {
    const u = new URL(String(v).trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(typeof v === 'object' ? v['#text'] ?? '' : v);
  if (isNaN(d.getTime())) return null;
  // Clamp future-dated items so a broken feed can't pin itself to the top.
  return d.getTime() > Date.now() + 5 * 60_000 ? new Date() : d;
}

function normaliseTopics(input) {
  const arr = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const out = [];
  for (const t of arr) {
    const v = String(t).trim().toLowerCase().replace(/^#/, '').slice(0, 40);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

// ── parsers: each returns [{guid,title,excerpt,url,author,published_at}] ───

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: true,
});

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x) => {
  if (x == null) return '';
  if (typeof x === 'object') return txt(x['#text'] ?? '');
  return String(x);
};

function parseFeedXml(buf, feedUrl) {
  let doc;
  try {
    doc = xml.parse(buf.toString('utf8'));
  } catch {
    throw httpError('Not a valid RSS/Atom feed', 'EPARSE');
  }
  let entries;
  let kind;
  if (doc?.rss?.channel) {
    entries = arr(doc.rss.channel.item);
    kind = 'rss';
  } else if (doc?.feed) {
    entries = arr(doc.feed.entry);
    kind = 'atom';
  } else if (doc?.['rdf:RDF']) {
    entries = arr(doc['rdf:RDF'].item);
    kind = 'rss';
  } else {
    throw httpError('Not an RSS or Atom feed', 'EPARSE');
  }

  const items = [];
  for (const e of entries) {
    let link;
    if (kind === 'atom') {
      const links = arr(e.link);
      const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') || links[0];
      link = alt ? alt['@_href'] : null;
    } else {
      link = txt(e.link) || (e.guid && /^https?:/i.test(txt(e.guid)) ? txt(e.guid) : '');
    }
    const url = safeHttpUrl(link, feedUrl);
    if (!url) continue;
    const title = truncate(toPlainText(txt(e.title)), TITLE_CHARS);
    const excerpt = truncate(
      toPlainText(txt(e.description) || txt(e.summary) || txt(e['content:encoded']) || txt(e.content)),
      EXCERPT_CHARS,
    );
    if (!title && !excerpt) continue;
    const author = truncate(
      toPlainText(txt(e.author?.name ?? e.author) || txt(e['dc:creator'])),
      120,
    );
    items.push({
      guid: truncate(txt(e.guid) || txt(e.id) || url, 500),
      title: title || truncate(excerpt, 90),
      excerpt: excerpt === title ? '' : excerpt,
      url,
      author: author || null,
      publisher: truncate(toPlainText(txt(e.source)), 120) || null,
      category: (arr(e.category)[0] || {})['@_label'] || null,
      published_at: parseDate(txt(e.pubDate) || txt(e.published) || txt(e.updated) || txt(e['dc:date'])),
    });
  }
  return items;
}

/**
 * Google News search RSS: titles are "Headline - Publisher", the description is just that
 * headline again wrapped in a link, and <source> names the publisher. Reshape so the card
 * shows the clean headline with the publisher as the byline and no duplicated excerpt.
 */
function parseGoogleNews(buf, feedUrl) {
  return parseFeedXml(buf, feedUrl).map((it) => {
    let title = it.title;
    const pub = it.publisher;
    if (pub && title.endsWith(` - ${pub}`)) title = title.slice(0, -(pub.length + 3)).trimEnd();
    return { ...it, title, excerpt: '', author: pub || it.author };
  });
}

/**
 * Reddit search Atom: author is "/u/name", the subreddit rides in <category label="r/x">, and the
 * body ends with a "submitted by ... [link] [comments]" footer we don't want in an excerpt.
 */
function parseRedditSearch(buf, feedUrl) {
  return parseFeedXml(buf, feedUrl).map((it) => {
    const body = it.excerpt.replace(/\s*submitted by\s+\/?u\/\S+.*$/i, '').trim();
    const sub = it.category ? String(it.category).replace(/^\s+/, '') : '';
    const user = it.author ? String(it.author).replace(/^\/?u\//, 'u/') : '';
    return { ...it, excerpt: body === it.title ? '' : body, author: [sub, user].filter(Boolean).join(' · ') || null };
  }).filter((it) => !looksLikeTagSpam(`${it.title} ${it.excerpt}`));
}

/** Bluesky keyword search: { posts: [post] } (unlike feeds, which wrap each post in { post }). */
function parseBlueskySearch(buf) {
  let data;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    throw httpError('Not valid JSON from Bluesky', 'EPARSE');
  }
  const wrapped = Buffer.from(
    JSON.stringify({ feed: arr(data && data.posts).filter((p) => !(p.record && p.record.reply)).map((post) => ({ post })) }),
  );
  // Very short posts ("lol", a bare link) are noise in a news-style card.
  return parseBlueskyFeed(wrapped).filter((it) => it.title.length >= 25 && !looksLikeTagSpam(`${it.title} ${it.excerpt}`));
}

/**
 * Threads keyword/tag search: { data: [{ id, text, permalink, timestamp, username, is_reply, ... }] }.
 * Replies and very short posts are noise in a news-style card; the card links to the post itself.
 */
function parseThreadsSearch(buf) {
  let data;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    throw httpError('Not valid JSON from Threads', 'EPARSE');
  }
  const items = [];
  for (const p of arr(data && data.data)) {
    if (!p || !p.id || p.is_reply || !p.username) continue;
    const text = toPlainText(p.text);
    const url = safeHttpUrl(p.permalink);
    if (!url || text.length < 25 || looksLikeTagSpam(text)) continue;
    items.push({
      guid: String(p.id),
      title: truncate(text, 110),
      excerpt: text.length > 110 ? truncate(text, EXCERPT_CHARS) : '',
      url,
      author: truncate(`@${p.username}`, 120),
      published_at: parseDate(p.timestamp),
    });
  }
  return items;
}

/** Map a Threads Graph API error response to a message safe to show an admin (never echoes the token). */
function threadsError(res) {
  let e = null;
  try {
    e = JSON.parse(res.body.toString('utf8')).error;
  } catch { /* not JSON */ }
  const code = e && e.code;
  const err = (msg, auth = false) => {
    const x = httpError(msg, 'EHTTP');
    x.threadsAuth = auth;
    return x;
  };
  if (res.status === 401 || code === 190)
    return err('Threads access expired or was revoked. Reconnect your Threads account.', true);
  if (code === 10 || code === 200 || code === 3)
    return err('The Threads app is missing the threads_keyword_search permission (App Review).');
  if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429)
    return err('Threads rate limit reached; will retry later.');
  return err(`Threads returned HTTP ${res.status}${e && e.message ? `: ${String(e.message).slice(0, 140)}` : ''}`);
}

/** Lemmy post search. Card URL is the discussion on the instance; NSFW posts/communities are dropped. */
function parseLemmySearch(buf, instance) {
  let data;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    throw httpError('Not valid JSON from Lemmy instance', 'EPARSE');
  }
  const items = [];
  for (const row of arr(data && data.posts)) {
    const post = row.post;
    if (!post || post.nsfw || post.removed || post.deleted || (row.community && row.community.nsfw)) continue;
    const title = truncate(toPlainText(post.name), TITLE_CHARS);
    if (!title) continue;
    const body = toPlainText(post.body);
    const community = row.community ? row.community.title || row.community.name : '';
    items.push({
      guid: String(post.ap_id || `${instance}/post/${post.id}`),
      title,
      excerpt: truncate(body, EXCERPT_CHARS),
      url: `https://${instance}/post/${post.id}`,
      author: truncate([community, row.creator && row.creator.name].filter(Boolean).join(' · '), 120) || null,
      published_at: parseDate(post.published),
    });
  }
  return items;
}

const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Social search engines match loosely ("gardening" finds "Olive Garden", bodies that merely link
 * the word, SEO bots). Require the topic as a WHOLE WORD in the title or excerpt.
 */
function applyMustWord(items, words) {
  const w = (words || []).map((x) => String(x).trim()).filter(Boolean);
  if (!w.length) return items;
  const res = w.map((x) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(x)}(?![\\p{L}\\p{N}])`, 'iu'));
  return items.filter((it) => {
    const hay = `${it.title} ${it.excerpt}`;
    return res.some((re) => re.test(hay));
  });
}

/** Hashtag-stuffed posts are almost always SEO/ad bots, not people. */
const looksLikeTagSpam = (text) => (String(text).match(/#[\p{L}\p{N}_]/gu) || []).length >= 4;

/** Keep only items whose title/excerpt mention at least one of `terms` (case-insensitive). No terms => keep all. */
function applyMustMention(items, terms) {
  const t = (terms || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  if (!t.length) return items;
  return items.filter((it) => {
    const hay = `${it.title} ${it.excerpt}`.toLowerCase();
    return t.some((x) => hay.includes(x));
  });
}

function googleNewsUrl(q, cc) {
  const c = (cc || 'us').toUpperCase();
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-${c}&gl=${c}&ceid=${c}:en`;
}

function parseMastodonTag(buf) {
  let list;
  try {
    list = JSON.parse(buf.toString('utf8'));
  } catch {
    throw httpError('Not valid JSON from Mastodon instance', 'EPARSE');
  }
  if (!Array.isArray(list)) throw httpError('Unexpected Mastodon response', 'EPARSE');
  const items = [];
  for (const s of list) {
    if (s.sensitive || s.spoiler_text || s.visibility !== 'public') continue;
    const url = safeHttpUrl(s.url || s.uri);
    const text = toPlainText(s.content);
    if (!url || !text) continue;
    items.push({
      guid: truncate(String(s.uri || s.url), 500),
      title: truncate(text, 110),
      excerpt: text.length > 110 ? truncate(text, EXCERPT_CHARS) : '',
      url,
      author: truncate(toPlainText(s.account?.display_name) || s.account?.acct || '', 120) || null,
      published_at: parseDate(s.created_at),
    });
  }
  return items;
}

function parseBlueskyFeed(buf) {
  let data;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    throw httpError('Not valid JSON from Bluesky', 'EPARSE');
  }
  const items = [];
  for (const entry of arr(data?.feed)) {
    const p = entry?.post;
    if (!p?.uri || !p?.author?.handle) continue;
    // Reposts of someone else's post and replies aren't "news" -- skip them.
    if (entry.reason || entry.reply) continue;
    if (arr(p.labels).length) continue; // moderation-labelled (adult/graphic etc.)
    const text = toPlainText(p.record?.text);
    if (!text) continue;
    const rkey = String(p.uri).split('/').pop();
    items.push({
      guid: String(p.uri),
      title: truncate(text, 110),
      excerpt: text.length > 110 ? truncate(text, EXCERPT_CHARS) : '',
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      author: truncate(toPlainText(p.author.displayName) || p.author.handle, 120),
      published_at: parseDate(p.record?.createdAt || p.indexedAt),
    });
  }
  return items;
}

// ── source config -> request + parser ──────────────────────────────────────

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const TAG_RE = /^[\p{L}\p{N}_]{1,60}$/u;
const BSKY_ACTOR_RE = /^(?:did:plc:[a-z0-9]{10,40}|(?:[a-z0-9-]+\.)+[a-z]{2,})$/i;
const BSKY_FEED_RE = /^at:\/\/(?:did:plc:[a-z0-9]+)\/app\.bsky\.feed\.generator\/[A-Za-z0-9._~-]{1,100}$/;

/** Validate user-supplied source input. Returns { config, label } or throws a 400-style Error. */
function validateSourceInput(kind, raw) {
  if (!KINDS.includes(kind)) throw httpError(`kind must be one of: ${KINDS.join(', ')}`, 'EINPUT');
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = validateKindConfig(kind, c);
  const mm = normaliseMustMention(c.must_mention);
  if (mm.length) out.config.must_mention = mm;
  const mw = normaliseMustMention(c.must_word);
  if (mw.length) out.config.must_word = mw;
  return out;
}

function normaliseMustMention(input) {
  const arr0 = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  return [...new Set(arr0.map((t) => String(t).trim().slice(0, 60)).filter(Boolean))].slice(0, 5);
}

function validateKindConfig(kind, c) {
  if (kind === 'threads_search') {
    const mode = String(c.mode || 'KEYWORD').toUpperCase();
    const type = String(c.type || 'TOP').toUpperCase();
    if (!['KEYWORD', 'TAG'].includes(mode)) throw httpError('mode must be KEYWORD or TAG', 'EINPUT');
    if (!['TOP', 'RECENT'].includes(type)) throw httpError('type must be TOP or RECENT', 'EINPUT');
    let q = String(c.q || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (mode === 'TAG') q = q.replace(/^#+/, '');
    if (q.length < 2) throw httpError('A search term is required', 'EINPUT');
    return { config: { q, mode, type }, label: `${mode === 'TAG' ? '#' : ''}${q} · Threads` };
  }
  if (kind === 'reddit_search' || kind === 'bluesky_search' || kind === 'lemmy_search') {
    const q = String(c.q || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (q.length < 2) throw httpError('A search query is required', 'EINPUT');
    if (kind === 'lemmy_search') {
      const instance = String(c.instance || 'lemmy.world').trim().toLowerCase();
      if (!HOST_RE.test(instance)) throw httpError('instance must be a hostname like lemmy.world', 'EINPUT');
      return { config: { q, instance }, label: `${q} on ${instance}` };
    }
    return { config: { q }, label: `${q} · ${kind === 'reddit_search' ? 'Reddit' : 'Bluesky'}` };
  }
  if (kind === 'google_news') {
    const q = String(c.q || '').trim().slice(0, 200);
    if (q.length < 2) throw httpError('A search query is required', 'EINPUT');
    return { config: { q, cc: /^[a-z]{2}$/i.test(c.cc || '') ? String(c.cc).toLowerCase() : 'us' }, label: `News: ${q.replace(/ when:\w+$/i, '')}` };
  }
  if (kind === 'rss') {
    const url = safeHttpUrl(c.url);
    if (!url) throw httpError('A valid http(s) feed URL is required', 'EINPUT');
    return { config: { url }, label: new URL(url).hostname };
  }
  if (kind === 'mastodon_tag') {
    const instance = String(c.instance || '').trim().toLowerCase();
    const tag = String(c.tag || '').trim().replace(/^#/, '');
    if (!HOST_RE.test(instance)) throw httpError('instance must be a hostname like mastodon.social', 'EINPUT');
    if (!TAG_RE.test(tag)) throw httpError('tag must be a single hashtag word', 'EINPUT');
    return { config: { instance, tag: tag.toLowerCase() }, label: `#${tag} on ${instance}` };
  }
  // bluesky_feed: either a custom feed at-uri, or one account's posts
  const feed = c.feed ? String(c.feed).trim() : '';
  const actor = c.actor ? String(c.actor).trim().replace(/^@/, '') : '';
  if (feed) {
    if (!BSKY_FEED_RE.test(feed)) throw httpError('feed must be an at:// feed generator URI', 'EINPUT');
    return { config: { feed }, label: 'Bluesky feed' };
  }
  if (actor) {
    if (!BSKY_ACTOR_RE.test(actor)) throw httpError('actor must be a Bluesky handle or did:plc id', 'EINPUT');
    return { config: { actor }, label: `@${actor} on Bluesky` };
  }
  throw httpError('Provide either feed (at:// URI) or actor (handle)', 'EINPUT');
}

async function fetchSourceItems(kind, config, fetchOpts = {}, ctx = {}) {
  const items = applyMustMention(await fetchRaw(kind, config, fetchOpts, ctx), config.must_mention);
  if (ctx.keepWordMisses && config.must_word && config.must_word.length) {
    // The caller (local AI on) may rescue word-misses that are semantically on-topic.
    const ok = new Set(applyMustWord(items, config.must_word));
    return items.map((it) => ({ ...it, _wordMiss: !ok.has(it) }));
  }
  return applyMustWord(items, config.must_word);
}

async function fetchRaw(kind, config, fetchOpts = {}, ctx = {}) {
  if (kind === 'threads_search') {
    const token = ctx.threadsToken ? await ctx.threadsToken() : null;
    if (!token) throw httpError('Connect a Threads account first (Hub Management → Outside).', 'EHTTP');
    const since = Math.floor((Date.now() - 7 * 864e5) / 1000);
    const url =
      `${ctx.threadsRoot || THREADS_ROOT}/v1.0/keyword_search?q=${encodeURIComponent(config.q)}` +
      `&search_type=${config.type === 'RECENT' ? 'RECENT' : 'TOP'}&search_mode=${config.mode === 'TAG' ? 'TAG' : 'KEYWORD'}` +
      `&fields=id,text,media_type,permalink,timestamp,username,is_reply,has_replies,is_quote_post&since=${since}&limit=50` +
      `&access_token=${encodeURIComponent(token)}`;
    const r = await safeFetch(url, { ...fetchOpts, accept: 'application/json' });
    if (r.status !== 200) throw threadsError(r);
    return parseThreadsSearch(r.body);
  }
  if (kind === 'reddit_search') {
    const r = await safeFetch(
      `https://www.reddit.com/search.rss?q=${encodeURIComponent(config.q)}&sort=top&t=week&include_over_18=off&limit=30`,
      { ...fetchOpts, accept: 'application/atom+xml, application/xml;q=0.9, */*;q=0.5' },
    );
    if (r.status !== 200) throw httpError(r.status === 429 ? 'Rate limited by Reddit; will retry later' : `Reddit returned HTTP ${r.status}`, 'EHTTP');
    return parseRedditSearch(r.body, r.finalUrl);
  }
  if (kind === 'bluesky_search') {
    // api.bsky.app serves keyword search without a login; the public.api.bsky.app host refuses it (403).
    const r = await safeFetch(
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(config.q)}&sort=top&since=${encodeURIComponent(new Date(Date.now() - 7 * 864e5).toISOString())}&lang=en&limit=40`,
      { ...fetchOpts, accept: 'application/json' },
    );
    if (r.status !== 200) throw httpError(`Bluesky returned HTTP ${r.status}`, 'EHTTP');
    return parseBlueskySearch(r.body);
  }
  if (kind === 'lemmy_search') {
    const r = await safeFetch(
      `https://${config.instance}/api/v3/search?q=${encodeURIComponent(config.q)}&type_=Posts&sort=New&limit=30`,
      { ...fetchOpts, accept: 'application/json' },
    );
    if (r.status !== 200) throw httpError(`Lemmy returned HTTP ${r.status}`, 'EHTTP');
    return parseLemmySearch(r.body, config.instance);
  }
  if (kind === 'google_news') {
    const r = await safeFetch(googleNewsUrl(config.q, config.cc), {
      ...fetchOpts,
      accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5',
    });
    if (r.status !== 200) throw httpError(`News search returned HTTP ${r.status}`, 'EHTTP');
    return parseGoogleNews(r.body, r.finalUrl);
  }
  if (kind === 'rss') {
    const r = await safeFetch(config.url, {
      ...fetchOpts,
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    });
    if (r.status !== 200) throw httpError(`Feed returned HTTP ${r.status}`, 'EHTTP');
    return parseFeedXml(r.body, r.finalUrl);
  }
  if (kind === 'mastodon_tag') {
    const r = await safeFetch(
      `https://${config.instance}/api/v1/timelines/tag/${encodeURIComponent(config.tag)}?limit=30`,
      { ...fetchOpts, accept: 'application/json' },
    );
    if (r.status !== 200) throw httpError(`Instance returned HTTP ${r.status}`, 'EHTTP');
    return parseMastodonTag(r.body);
  }
  // Bluesky's public AppView serves feeds and author feeds without login.
  // (Its keyword search endpoint is not public -- returns 403 -- so it is not offered.)
  const api = 'https://public.api.bsky.app/xrpc/';
  const url = config.feed
    ? `${api}app.bsky.feed.getFeed?feed=${encodeURIComponent(config.feed)}&limit=30`
    : `${api}app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(config.actor)}&limit=30&filter=posts_no_replies`;
  const r = await safeFetch(url, { ...fetchOpts, accept: 'application/json' });
  if (r.status !== 200) throw httpError(`Bluesky returned HTTP ${r.status}`, 'EHTTP');
  return parseBlueskyFeed(r.body);
}

/** Friendly one-liner for the admin UI; never leaks internals. */
function describeError(err) {
  switch (err.code) {
    case 'EBLOCKED': return 'That address points at a private network and is not allowed.';
    case 'EBADURL': return err.message;
    case 'EDNS':
    case 'ENOTFOUND': return 'Could not find that host.';
    case 'ETIMEOUT':
    case 'ECONNRESET':
    case 'ECONNREFUSED': return 'The source did not respond in time.';
    case 'ETOOBIG': return 'The response was larger than allowed.';
    case 'EREDIRECT': return 'Too many redirects.';
    case 'EPARSE':
    case 'EHTTP': return err.message;
    default: return 'Could not fetch this source.';
  }
}

// ── relevance (read-time, from explicit member settings only) ──────────────

function titleTokens(t) {
  return new Set(String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function topicHits(item, topics) {
  if (!topics.length) return 0;
  const hay = `${item.title} ${item.excerpt}`.toLowerCase();
  const itemTopics = item.topics || [];
  let hits = 0;
  for (const t of topics) {
    if (itemTopics.includes(t)) hits += 2; // admin-tagged source/topic
    else if (hay.includes(t)) hits += 1; // mentioned in the text
  }
  return hits;
}

/**
 * Pure selection: candidates = recent cached items from enabled, un-muted
 * sources. A source with topics tagged is "niche": its items show only when
 * they match one of the member's topics. A source with no topics is "general"
 * and always eligible. Matches sort first, then recency. When the member has no
 * topics at all, everything eligible is simply the latest.
 */
function selectItems(candidates, { topics, mutedSources, limit, offset, placeTerms = [], semantic = null }) {
  const places = placeTerms.map((x) => String(x).toLowerCase()).filter(Boolean);
  const muted = new Set(mutedSources);
  const scored = [];
  for (const it of candidates) {
    if (muted.has(it.source_id)) continue;
    let hits = topicHits(it, topics);
    // Local AI: an item the keywords missed still counts when it is semantically about a member topic.
    const sem = semantic && topics.length ? semantic.score(it) : null;
    if (sem != null && sem >= semantic.threshold) hits += 1;
    const niche = (it.source_topics || []).length > 0;
    if (niche && topics.length && hits === 0) continue;
    const local = places.length > 0 && places.some((pl) => `${it.title} ${it.excerpt}`.toLowerCase().includes(pl));
    scored.push({ it, hits, local, sem: sem == null ? 0 : sem });
  }
  scored.sort(
    (a, b) =>
      (b.hits > 0) - (a.hits > 0) ||
      b.hits - a.hits ||
      (b.local - a.local) ||
      (b.sem - a.sem) ||
      new Date(b.it.published_at || b.it.fetched_at) - new Date(a.it.published_at || a.it.fetched_at),
  );
  // The same story arrives from several queries/outlets: drop near-duplicate headlines
  // (Jaccard similarity of word sets >= 0.75), keeping the better-ranked copy.
  const kept = [];
  const keptTokens = [];
  for (const entry of scored) {
    const tok = titleTokens(entry.it.title);
    if (keptTokens.some((k) => jaccard(k, tok) >= 0.75)) continue;
    kept.push(entry);
    keptTokens.push(tok);
  }
  scored.length = 0;
  scored.push(...kept);

  // Don't let one chatty source fill the page: at most ~40% from any one source.
  const perSourceCap = Math.max(3, Math.ceil(limit * 0.4));
  const counts = new Map();
  const out = [];
  let skipped = 0;
  for (const { it } of scored) {
    const n = counts.get(it.source_id) || 0;
    if (n >= perSourceCap) continue;
    counts.set(it.source_id, n + 1);
    if (skipped < offset) { skipped++; continue; }
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

// ── hub place -> automatic local-news queries ──────────────────────────────

/** "Harford County" -> "Harford" (the form articles actually use). */
const countyBase = (c) => String(c || '').replace(/\s+(County|Parish|Borough|Census Area)$/i, '').trim();

/** Best-effort place from the hub's saved display label ("Aberdeen, Maryland" / "Hood, Aberdeen, Maryland"). */
function placeFromLabel(label) {
  const parts = String(label || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { city: parts[0], county: '', state: '', cc: 'us', label: parts[0] };
  return { city: parts[parts.length - 2], county: '', state: parts[parts.length - 1], cc: 'us', label: parts.join(', ') };
}

/** Nominatim reverse-geocode result -> place. Town/county/state names are standardized by OpenStreetMap. */
function placeFromNominatim(j, label) {
  const a = j && j.address;
  if (!a) return null;
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb;
  if (!city) return null;
  return {
    city,
    county: a.county || '',
    state: a.state || '',
    cc: String(a.country_code || 'us').toLowerCase(),
    label: label || [city, a.state].filter(Boolean).join(', '),
  };
}

/**
 * Pure: the Google News queries a hub should run, from its place and (optionally) its members'
 * topics. The state is unquoted and the city quoted, because outlets write "Aberdeen, Md." as
 * often as "Aberdeen, Maryland" and a quoted "City, State" phrase would miss most of them. Items
 * must then still mention the town or county in the headline (must_mention), which is what keeps
 * out Aberdeen-Scotland and generic regional noise.
 */
function buildAutoQueries(place, topics = [], opts = {}) {
  if (!place || !place.city) return [];
  const clean = (x) => String(x).replace(/["']/g, '').trim();
  const city = clean(place.city);
  const state = clean(place.state);
  const county = clean(countyBase(place.county));
  const where = `"${city}"${state ? ` ${state}` : ''}`;
  const must = [city, ...(county ? [county] : [])];
  const out = [{ kind: 'google_news', q: `${where} when:7d`, label: `Local news: ${city}`, topics: [], must_mention: [city] }];
  if (county && county.toLowerCase() !== city.toLowerCase())
    out.push({ kind: 'google_news', q: `"${county}"${state ? ` ${state}` : ''} when:7d`, label: `Local news: ${county} County`, topics: [], must_mention: [county] });
  for (const t of topics.slice(0, MAX_AUTO_TOPICS)) {
    const topic = clean(t);
    if (!topic) continue;
    const phrase = /\s/.test(topic) ? `"${topic}"` : topic;
    const tag = [topic.toLowerCase()];
    // Local press on the topic (strict: must name the town/county)...
    out.push({ kind: 'google_news', q: `${where} ${topic} when:7d`, label: `${city} · ${topic}`, topics: tag, must_mention: must });
    // ...and what people are saying about the topic on social networks (not place-bound: a niche
    // interest in a small town would otherwise find nothing). Niche-tagged, so only members with
    // the topic see them; items that name the hub's place are ranked first at read time.
    out.push({ kind: 'reddit_search', q: phrase, label: `${topic} · Reddit`, topics: tag, must_mention: [], must_word: [topic] });
    out.push({ kind: 'bluesky_search', q: phrase, label: `${topic} · Bluesky`, topics: tag, must_mention: [], must_word: [topic] });
    // Threads topic tag (needs a connected Threads account). Tags live in post metadata, not the text,
    // so no whole-word filter here.
    if (opts.threads) out.push({ kind: 'threads_search', q: topic, mode: 'TAG', type: 'TOP', label: `${topic} · Threads`, topics: tag, must_mention: [] });
  }
  if (opts.threads) out.splice(2, 0, { kind: 'threads_search', q: `${city}${state ? ` ${state}` : ''}`, mode: 'KEYWORD', type: 'RECENT', label: `Threads: ${city}`, topics: [], must_mention: [city] });
  return out.slice(0, MAX_AUTO_SOURCES);
}

// ── module factory ─────────────────────────────────────────────────────────

function createExternalFeeds({ pool, authenticate, express, fetchOpts = {}, threadsRoot = THREADS_ROOT, ollamaUrl = 'http://citinet-ollama:11434', embed: embedOverride = null }) {
  const member = express.Router();
  const admin = express.Router();

  async function ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_external_sources (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kind                 VARCHAR(30)  NOT NULL,
        label                VARCHAR(200) NOT NULL,
        config               JSONB        NOT NULL,
        topics               TEXT[]       NOT NULL DEFAULT '{}',
        enabled              BOOLEAN      NOT NULL DEFAULT TRUE,
        created_by           UUID         REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_fetched_at      TIMESTAMPTZ,
        last_ok_at           TIMESTAMPTZ,
        last_error           TEXT,
        consecutive_failures INT          NOT NULL DEFAULT 0
      )`);
    await pool.query(`ALTER TABLE hub_external_sources ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_external_items (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id    UUID         NOT NULL REFERENCES hub_external_sources(id) ON DELETE CASCADE,
        guid         VARCHAR(500) NOT NULL,
        title        VARCHAR(300) NOT NULL,
        excerpt      TEXT         NOT NULL DEFAULT '',
        url          TEXT         NOT NULL,
        author       VARCHAR(200),
        published_at TIMESTAMPTZ,
        fetched_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (source_id, guid)
      )`);
    await pool.query(`ALTER TABLE hub_external_items ADD COLUMN IF NOT EXISTS embedding REAL[]`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_hub_external_items_recent ON hub_external_items (published_at DESC NULLS LAST)`,
    );
  }

  /** Fetch one source and merge into the cache. Never throws; records health. */
  async function refreshSource(row) {
    try {
      const ai = await aiStatus();
      let items = (await fetchSourceItems(row.kind, row.config, fetchOpts, { ...threadsCtx, keepWordMisses: ai.ready })).slice(0, 60);
      if (ai.ready) items = await semanticPass(row, items); // word-misses only exist when AI is on
      for (const it of items) {
        await pool.query(
          `INSERT INTO hub_external_items (source_id, guid, title, excerpt, url, author, published_at, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::real[])
           ON CONFLICT (source_id, guid) DO UPDATE
             SET title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, url = EXCLUDED.url,
                 author = EXCLUDED.author, published_at = COALESCE(EXCLUDED.published_at, hub_external_items.published_at),
                 embedding = COALESCE(EXCLUDED.embedding, hub_external_items.embedding),
                 fetched_at = NOW()`,
          [row.id, it.guid, it.title, it.excerpt, it.url, it.author, it.published_at, it.embedding || null],
        );
      }
      await pool.query(
        `DELETE FROM hub_external_items WHERE source_id = $1 AND id NOT IN (
           SELECT id FROM hub_external_items WHERE source_id = $1
           ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT $2)`,
        [row.id, MAX_ITEMS_PER_SOURCE],
      );
      await pool.query(
        `UPDATE hub_external_sources
            SET last_fetched_at = NOW(), last_ok_at = NOW(), last_error = NULL, consecutive_failures = 0
          WHERE id = $1`,
        [row.id],
      );
      if (row.kind === 'threads_search') await writeThreadsMeta({ last_ok_at: new Date().toISOString(), last_error: null }).catch(() => {});
      return { ok: true, count: items.length };
    } catch (err) {
      const msg = describeError(err);
      if (row.kind === 'threads_search' && err.threadsAuth) await writeThreadsMeta({ last_error: msg }).catch(() => {});
      await pool
        .query(
          `UPDATE hub_external_sources
              SET last_fetched_at = NOW(), last_error = $2, consecutive_failures = consecutive_failures + 1
            WHERE id = $1`,
          [row.id, msg],
        )
        .catch(() => {});
      return { ok: false, error: msg };
    }
  }

  // ── automatic local-news sources ───────────────────────────────────────────
  const CFG_KEYS = ['hub_location', 'hub_lat', 'hub_lng', 'outside_auto', 'outside_member_topics', 'outside_place_cache'];

  async function readCfg() {
    const { rows } = await pool.query(`SELECT key, value FROM hub_config WHERE key = ANY($1)`, [CFG_KEYS]);
    const cfg = {};
    for (const r of rows) cfg[r.key] = r.value;
    return cfg;
  }
  const writeCfg = (key, value) =>
    pool.query(
      `INSERT INTO hub_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );

  /** Hub place: reverse-geocode its saved coordinates once (cached per coordinate), else parse its label. */
  async function resolvePlace(cfg) {
    const label = cfg.hub_location || process.env.HUB_LOCATION || '';
    const lat = parseFloat(cfg.hub_lat ?? process.env.HUB_LAT);
    const lng = parseFloat(cfg.hub_lng ?? process.env.HUB_LNG);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      try {
        const cached = cfg.outside_place_cache ? JSON.parse(cfg.outside_place_cache) : null;
        if (cached && cached.key === key && cached.place) return { ...cached.place, label: label || cached.place.label };
      } catch { /* bad cache -> refetch */ }
      try {
        const r = await safeFetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`,
          { ...fetchOpts, accept: 'application/json' },
        );
        if (r.status === 200) {
          const place = placeFromNominatim(JSON.parse(r.body.toString('utf8')), label);
          if (place) {
            await writeCfg('outside_place_cache', JSON.stringify({ key, place }));
            return place;
          }
        }
      } catch (err) {
        console.warn('[external-feeds] place lookup failed, using hub label:', describeError(err));
      }
    }
    return placeFromLabel(label);
  }

  /** Distinct topics of members who have Outside on, most-shared first. */
  async function memberTopics() {
    const { rows } = await pool.query(`
      SELECT t AS topic, COUNT(*) AS c FROM (
        SELECT lower(btrim(x)) AS t
          FROM hub_users u
          LEFT JOIN hub_user_preferences pe ON pe.user_id = u.id AND pe.key = 'external_enabled'
          LEFT JOIN hub_user_preferences pt ON pt.user_id = u.id AND pt.key = 'external_topics'
          CROSS JOIN LATERAL unnest(
            CASE WHEN COALESCE(pt.value, '') <> '' THEN string_to_array(pt.value, ',') ELSE COALESCE(u.tags, '{}') END
          ) AS x
         WHERE u.status = 'approved' AND pe.value = 'true'
      ) s
      WHERE t <> '' AND length(t) <= 40
      GROUP BY t ORDER BY c DESC, t LIMIT $1`, [MAX_AUTO_TOPICS]);
    return rows.map((r) => r.topic);
  }

  async function getSettings() {
    const cfg = await readCfg();
    const auto = cfg.outside_auto === 'true'; // opt-in: nothing is fetched on a hub's behalf until its admin turns this on
    const useMemberTopics = cfg.outside_member_topics !== 'false';
    const place = await resolvePlace(cfg);
    const threads = !!(await readThreadsMeta()) && !!(await readThreadsToken());
    const queries = auto ? buildAutoQueries(place, useMemberTopics ? await memberTopics() : [], { threads }) : [];
    const ai = await aiStatus();
    const counts = (await pool.query(`SELECT COUNT(*) AS total, COUNT(embedding) AS embedded FROM hub_external_items`)).rows[0];
    return { auto, use_member_topics: useMemberTopics, place, queries, threads_connected: threads, ai: { available: ai.available, enabled: ai.enabled, active: ai.ready, embedded: Number(counts.embedded), total: Number(counts.total) } };
  }

  /** Make the auto-managed sources match what the hub's place + settings call for. */
  async function syncAutoSources() {
    const { auto, place, queries } = await getSettings();
    const { rows: existing } = await pool.query(`SELECT id, kind, config FROM hub_external_sources WHERE auto`);
    const keyOf = (kind, q) => `${kind}|${q}`;
    const want = new Set(queries.map((q) => keyOf(q.kind, q.q)));
    const have = new Set();
    for (const row of existing) {
      const k = keyOf(row.kind, row.config && row.config.q);
      if (auto && want.has(k) && !have.has(k)) have.add(k);
      else await pool.query(`DELETE FROM hub_external_sources WHERE id = $1`, [row.id]);
    }
    if (!auto) return;
    for (const q of queries) {
      if (have.has(keyOf(q.kind, q.q))) continue;
      const config = { q: q.q };
      if (q.kind === 'google_news') config.cc = (place && place.cc) || 'us';
      if (q.must_mention && q.must_mention.length) config.must_mention = q.must_mention;
      if (q.must_word && q.must_word.length) config.must_word = q.must_word;
      if (q.mode) config.mode = q.mode;
      if (q.type) config.type = q.type;
      await pool.query(
        `INSERT INTO hub_external_sources (kind, label, config, topics, auto)
         VALUES ($1, $2, $3::jsonb, $4, TRUE)`,
        [q.kind, q.label, JSON.stringify(config), q.topics],
      );
    }
  }

  // ── local AI relevance (optional; every path falls back to keyword logic) ──
  const norm = (v) => {
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return v.map((x) => x / n);
  };
  const dotv = (a, b) => {
    let s2 = 0;
    for (let i = 0; i < a.length; i++) s2 += a[i] * b[i];
    return s2;
  };
  async function ollamaEmbed(text) {
    const r = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 1000) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`embedding HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j.embedding) || !j.embedding.length) throw new Error('empty embedding');
    return norm(j.embedding);
  }
  const embedFn = embedOverride || ollamaEmbed;
  const embedDoc = (it) => embedFn(`search_document: ${it.title}${it.excerpt ? `. ${it.excerpt}` : ''}`);
  const topicVecs = new Map();
  async function embedTopic(topic) {
    const key = String(topic).toLowerCase();
    if (!topicVecs.has(key)) topicVecs.set(key, await embedFn(`search_query: ${key}`));
    return topicVecs.get(key);
  }

  let modelCheck = { at: 0, ok: false };
  /** AI is used only when the hub admin turned hub AI on, Outside AI isn't switched off, and the embedding model is installed. */
  async function aiStatus() {
    try {
      const { rows } = await pool.query(`SELECT key, value FROM hub_config WHERE key IN ('ai_enabled', 'outside_ai')`);
      const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      const hubAi = cfg.ai_enabled === 'true';
      const enabled = cfg.outside_ai !== 'false';
      if (!hubAi) return { ready: false, available: false, enabled };
      if (!embedOverride && Date.now() - modelCheck.at > 60_000) {
        try {
          const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
          const j = r.ok ? await r.json() : { models: [] };
          modelCheck = { at: Date.now(), ok: (j.models || []).some((m) => m.name === EMBED_MODEL || m.name.startsWith(`${EMBED_MODEL}:`)) };
        } catch {
          modelCheck = { at: Date.now(), ok: false };
        }
      }
      const available = embedOverride ? true : modelCheck.ok;
      return { ready: available && enabled, available, enabled };
    } catch {
      return { ready: false, available: false, enabled: true };
    }
  }

  /**
   * Ingest step for a source whose items must contain a topic word. With AI on, an item that fails
   * the word test is still kept if it is semantically about the topic (union: recall goes up, the
   * threshold keeps precision). New items are embedded here once and stored, so reading is cheap.
   */
  async function semanticPass(row, items) {
    const guids = items.map((i) => i.guid);
    const { rows: have } = await pool.query(
      `SELECT guid, embedding FROM hub_external_items WHERE source_id = $1 AND guid = ANY($2)`, [row.id, guids]);
    const existing = new Map(have.map((r) => [r.guid, r.embedding]));
    const topic = (row.topics && row.topics[0]) || (row.config.must_word && row.config.must_word[0]) || null;
    let tv = null;
    if (topic && items.some((i) => i._wordMiss)) {
      try { tv = await embedTopic(topic); } catch { tv = null; }
    }
    let budget = EMBED_PER_REFRESH;
    const out = [];
    for (const it of items) {
      let vec = existing.get(it.guid) || null;
      if (!vec && budget > 0) {
        budget--;
        try { vec = await embedDoc(it); } catch { vec = null; }
      }
      if (it._wordMiss) {
        if (!vec || !tv || dotv(tv, vec) < SEM_THRESHOLD) continue; // not on-topic by keyword OR meaning
      }
      const { _wordMiss, ...clean } = it;
      out.push({ ...clean, embedding: vec });
    }
    return out;
  }

  /** Backfill: embed cached items that still have no vector (older rows, budget overflow). */
  async function embedPending() {
    const st = await aiStatus();
    if (!st.ready) return;
    const { rows } = await pool.query(
      `SELECT id, title, excerpt FROM hub_external_items WHERE embedding IS NULL ORDER BY fetched_at DESC LIMIT $1`, [EMBED_PER_TICK]);
    const deadline = Date.now() + 40_000;
    for (const r of rows) {
      if (Date.now() > deadline) break;
      try {
        const v = await embedDoc(r);
        await pool.query(`UPDATE hub_external_items SET embedding = $2::real[] WHERE id = $1`, [r.id, v]);
      } catch { break; /* Ollama busy or down: try again next tick */ }
    }
  }

  const vecCache = new Map();
  /** Read-time scorer: max cosine between an item and the member's topics. */
  async function buildSemantic(rows, topics) {
    const st = await aiStatus();
    if (!st.ready || !topics.length) return null;
    const tvs = [];
    for (const t of topics.slice(0, 10)) {
      try { tvs.push(await embedTopic(t)); } catch { /* skip this topic */ }
    }
    if (!tvs.length) return null;
    const need = rows.map((r) => r.id).filter((id) => !vecCache.has(id));
    if (need.length) {
      if (vecCache.size + need.length > VEC_CACHE_MAX) vecCache.clear();
      const { rows: vs } = await pool.query(`SELECT id, embedding FROM hub_external_items WHERE id = ANY($1) AND embedding IS NOT NULL`, [need]);
      for (const v of vs) vecCache.set(v.id, v.embedding);
    }
    return {
      threshold: SEM_THRESHOLD,
      score: (it) => {
        const v = vecCache.get(it.id);
        if (!v) return null;
        let best = -1;
        for (const tv of tvs) { const d = dotv(tv, v); if (d > best) best = d; }
        return best;
      },
    };
  }

  // ── Threads account (one admin-connected account the whole hub searches through) ──
  // The token is a secret: encrypted at rest (same scheme as the SMTP password), never sent to a
  // browser, never logged. Non-secret status lives in threads_meta.
  const readThreadsToken = async () => {
    const { rows } = await pool.query(`SELECT value FROM hub_config WHERE key = 'threads_token'`);
    return rows[0] ? decrypt(rows[0].value) || null : null;
  };
  const readThreadsMeta = async () => {
    const { rows } = await pool.query(`SELECT value FROM hub_config WHERE key = 'threads_meta'`);
    try { return rows[0] ? JSON.parse(rows[0].value) : null; } catch { return null; }
  };
  const writeThreadsMeta = async (patch) => {
    const cur = (await readThreadsMeta()) || {};
    await writeCfg('threads_meta', JSON.stringify({ ...cur, ...patch }));
  };
  const threadsCtx = { threadsRoot, threadsToken: readThreadsToken };

  async function threadsJson(path, token) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await safeFetch(`${threadsRoot}${path}${sep}access_token=${encodeURIComponent(token)}`, { ...fetchOpts, accept: 'application/json' });
    return { status: r.status, body: r.body, json: (() => { try { return JSON.parse(r.body.toString('utf8')); } catch { return null; } })() };
  }

  /** Extend a long-lived token's life. Needs no app secret. Returns { token, expires_at } or null. */
  async function refreshThreads(token) {
    const r = await threadsJson(`/refresh_access_token?grant_type=th_refresh_token`, token);
    if (r.status !== 200 || !r.json || !r.json.access_token) return null;
    return { token: r.json.access_token, expires_at: r.json.expires_in ? new Date(Date.now() + r.json.expires_in * 1000).toISOString() : null };
  }

  /** Does keyword search return OTHER people's posts? (true => the app has the approved permission.) */
  async function probeThreadsSearch(token, ownUsername) {
    try {
      const r = await threadsJson(`/v1.0/keyword_search?q=threads&search_type=RECENT&fields=id,username&limit=10`, token);
      if (r.status !== 200) return { public_search: false, probe_error: threadsError({ status: r.status, body: r.body }).message };
      const rows = (r.json && r.json.data) || [];
      if (!rows.length) return { public_search: null, probe_error: null };
      return { public_search: rows.some((x) => x.username && x.username !== ownUsername), probe_error: null };
    } catch (err) {
      return { public_search: null, probe_error: describeError(err) };
    }
  }

  async function threadsStatus() {
    const meta = await readThreadsMeta();
    const connected = !!meta && !!(await readThreadsToken());
    if (!connected) return { connected: false };
    return {
      connected: true,
      username: meta.username || null,
      user_id: meta.user_id || null,
      connected_at: meta.connected_at || null,
      expires_at: meta.expires_at || null,
      public_search: meta.public_search ?? null,
      probe_error: meta.probe_error || null,
      last_ok_at: meta.last_ok_at || null,
      last_error: meta.last_error || null,
    };
  }

  async function connectThreads(rawToken) {
    let token = String(rawToken || '').trim();
    if (token.length < 20 || /\s/.test(token)) throw httpError('That does not look like a Threads access token.', 'EINPUT');
    const me = await threadsJson(`/v1.0/me?fields=id,username`, token);
    if (me.status !== 200 || !me.json || !me.json.id) throw threadsError({ status: me.status, body: me.body });
    const refreshed = await refreshThreads(token).catch(() => null);
    let expires_at = null;
    if (refreshed) { token = refreshed.token; expires_at = refreshed.expires_at; }
    const probe = await probeThreadsSearch(token, me.json.username);
    await writeCfg('threads_token', encrypt(token));
    await writeCfg('threads_meta', JSON.stringify({
      user_id: me.json.id,
      username: me.json.username || null,
      connected_at: new Date().toISOString(),
      expires_at,
      last_ok_at: new Date().toISOString(),
      last_error: null,
      ...probe,
    }));
    return threadsStatus();
  }

  async function disconnectThreads() {
    await pool.query(`DELETE FROM hub_config WHERE key IN ('threads_token', 'threads_meta')`);
    await syncAutoSources(); // drops the auto Threads searches
  }

  /** Renew the token well before it lapses; flag the admin if Meta says it is dead. */
  async function maintainThreadsToken() {
    const meta = await readThreadsMeta();
    if (!meta || !meta.expires_at) return;
    if (new Date(meta.expires_at).getTime() - Date.now() > THREADS_REFRESH_BEFORE_MS) return;
    const token = await readThreadsToken();
    if (!token) return;
    const r = await refreshThreads(token).catch(() => null);
    if (r) {
      await writeCfg('threads_token', encrypt(r.token));
      await writeThreadsMeta({ expires_at: r.expires_at, last_error: null });
    } else if (new Date(meta.expires_at).getTime() < Date.now()) {
      await writeThreadsMeta({ last_error: 'Threads access expired. Reconnect your Threads account.' });
    }
  }

  let ticking = false;
  /** Refresh every enabled source that is due (with exponential backoff on failure). */
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      await maintainThreadsToken().catch((err) => console.warn('[external-feeds] threads token maintenance failed:', err.message));
      await syncAutoSources().catch((err) => console.warn('[external-feeds] auto-source sync failed:', err.message));
      const { rows } = await pool.query(
        `SELECT * FROM hub_external_sources
          WHERE enabled
            AND (last_fetched_at IS NULL
                 OR last_fetched_at < NOW() - make_interval(
                      mins => $1 * LEAST(POWER(2, consecutive_failures), $2)::int))`,
        [BASE_REFRESH_MINUTES, MAX_BACKOFF_MULTIPLIER],
      );
      for (const row of rows) {
        await refreshSource(row); // sequential on purpose: gentle on small hubs
        const gap = SLOW_KINDS.has(row.kind) ? 4000 + Math.random() * 2000 : 500 + Math.random() * 1500;
        await new Promise((r) => setTimeout(r, fetchOpts.noPacing ? 0 : gap));
      }
      await embedPending().catch((err) => console.warn('[external-feeds] embedding backfill failed:', err.message));
      await pool.query(
        `DELETE FROM hub_external_items WHERE COALESCE(published_at, fetched_at) < NOW() - make_interval(days => $1)`,
        [ITEM_MAX_AGE_DAYS],
      );
    } catch (err) {
      console.warn('[external-feeds] tick failed:', err.message);
    } finally {
      ticking = false;
    }
  }

  function start() {
    ensureTables()
      .then(() => {
        setTimeout(() => tick().catch(() => {}), 20_000);
        setInterval(() => tick().catch(() => {}), 5 * 60_000);
        console.log('[external-feeds] ready');
      })
      .catch((err) => console.warn('[external-feeds] table init failed:', err.message));
  }

  const requireAdmin = (req, res, next) =>
    req.user?.is_admin || req.user?.role === 'admin'
      ? next()
      : res.status(403).json({ error: 'Admin only' });

  const sourceView = (r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    config: r.config,
    topics: r.topics,
    enabled: r.enabled,
    auto: r.auto === true,
    created_at: r.created_at,
    last_fetched_at: r.last_fetched_at,
    last_ok_at: r.last_ok_at,
    last_error: r.last_error,
    item_count: r.item_count != null ? Number(r.item_count) : undefined,
  });

  // ── admin ────────────────────────────────────────────────────────────────
  admin.use(authenticate, requireAdmin);

  admin.get('/threads', async (_req, res) => {
    try {
      res.json(await threadsStatus());
    } catch {
      res.status(500).json({ error: 'Failed to load Threads status' });
    }
  });

  admin.put('/threads', async (req, res) => {
    try {
      const status = await connectThreads(req.body && req.body.token);
      await syncAutoSources().catch(() => {});
      tick().catch(() => {}); // fetch the new Threads searches now rather than in 5 minutes
      res.json(status);
    } catch (err) {
      if (err.code === 'EINPUT') return res.status(400).json({ error: err.message });
      if (err.code === 'EHTTP' || err.threadsAuth !== undefined) return res.status(422).json({ error: err.message });
      if (/JWT_SECRET/.test(err.message || '')) return res.status(400).json({ error: err.message });
      console.error('[external-feeds] threads connect failed:', describeError(err));
      res.status(422).json({ error: describeError(err) });
    }
  });

  admin.post('/threads/test', async (_req, res) => {
    try {
      const token = await readThreadsToken();
      const meta = await readThreadsMeta();
      if (!token || !meta) return res.status(400).json({ error: 'No Threads account is connected.' });
      const probe = await probeThreadsSearch(token, meta.username);
      await writeThreadsMeta(probe);
      res.json(await threadsStatus());
    } catch {
      res.status(500).json({ error: 'Test failed' });
    }
  });

  admin.delete('/threads', async (_req, res) => {
    try {
      await disconnectThreads();
      res.json({ connected: false });
    } catch {
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  });

  admin.get('/settings', async (_req, res) => {
    try {
      res.json(await getSettings());
    } catch (err) {
      console.error('[external-feeds] settings failed:', err.message);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  admin.put('/settings', async (req, res) => {
    try {
      for (const [field, key] of [['auto', 'outside_auto'], ['use_member_topics', 'outside_member_topics'], ['ai', 'outside_ai']]) {
        if (req.body && req.body[field] === undefined) continue;
        if (typeof (req.body || {})[field] !== 'boolean') return res.status(400).json({ error: `${field} must be a boolean` });
        await writeCfg(key, req.body[field] ? 'true' : 'false');
      }
      await syncAutoSources();
      res.json(await getSettings());
    } catch (err) {
      console.error('[external-feeds] settings update failed:', err.message);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  admin.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.*, (SELECT COUNT(*) FROM hub_external_items i WHERE i.source_id = s.id) AS item_count
           FROM hub_external_sources s ORDER BY s.created_at`,
      );
      res.json(rows.map(sourceView));
    } catch {
      res.status(500).json({ error: 'Failed to load sources' });
    }
  });

  admin.post('/', async (req, res) => {
    let parsed;
    try {
      parsed = validateSourceInput(req.body?.kind, req.body?.config);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    try {
      const count = await pool.query(`SELECT COUNT(*) AS c FROM hub_external_sources WHERE NOT auto`);
      if (Number(count.rows[0].c) >= MAX_SOURCES)
        return res.status(400).json({ error: `A hub can have at most ${MAX_SOURCES} external sources` });
      const label = String(req.body?.label || '').trim().slice(0, 200) || parsed.label;
      const topics = normaliseTopics(req.body?.topics);
      // Test-fetch BEFORE saving so a typo'd or hostile URL never becomes a source.
      let probe;
      try {
        probe = await fetchSourceItems(req.body.kind, parsed.config, fetchOpts, threadsCtx);
      } catch (err) {
        return res.status(422).json({ error: describeError(err) });
      }
      const dup = await pool.query(
        `SELECT 1 FROM hub_external_sources WHERE kind = $1 AND config = $2::jsonb`,
        [req.body.kind, JSON.stringify(parsed.config)],
      );
      if (dup.rows[0]) return res.status(409).json({ error: 'This source is already added' });
      const ins = await pool.query(
        `INSERT INTO hub_external_sources (kind, label, config, topics, created_by)
         VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
        [req.body.kind, label, JSON.stringify(parsed.config), topics, req.user.id],
      );
      const result = await refreshSource(ins.rows[0]);
      const row = (await pool.query(`SELECT * FROM hub_external_sources WHERE id = $1`, [ins.rows[0].id])).rows[0];
      res.status(201).json({ ...sourceView(row), item_count: result.ok ? result.count : 0, probe_count: probe.length });
    } catch (err) {
      console.error('[external-feeds] add failed:', err.message);
      res.status(500).json({ error: 'Failed to add source' });
    }
  });

  admin.patch('/:id', async (req, res) => {
    try {
      const sets = [];
      const vals = [];
      if (req.body?.label !== undefined) {
        const l = String(req.body.label).trim().slice(0, 200);
        if (!l) return res.status(400).json({ error: 'label cannot be empty' });
        vals.push(l); sets.push(`label = $${vals.length}`);
      }
      if (req.body?.topics !== undefined) {
        vals.push(normaliseTopics(req.body.topics)); sets.push(`topics = $${vals.length}`);
      }
      if (req.body?.enabled !== undefined) {
        if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
        vals.push(req.body.enabled); sets.push(`enabled = $${vals.length}`);
      }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(req.params.id);
      const r = await pool.query(
        `UPDATE hub_external_sources SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
        vals,
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Source not found' });
      res.json(sourceView(r.rows[0]));
    } catch (err) {
      if (err.code === '22P02') return res.status(404).json({ error: 'Source not found' });
      res.status(500).json({ error: 'Failed to update source' });
    }
  });

  admin.delete('/:id', async (req, res) => {
    try {
      const r = await pool.query(`DELETE FROM hub_external_sources WHERE id = $1 AND NOT auto`, [req.params.id]);
      if (!r.rowCount && (await pool.query(`SELECT 1 FROM hub_external_sources WHERE id = $1`, [req.params.id])).rows[0])
        return res.status(400).json({ error: 'Automatic local-news sources are managed by the hub. Turn automatic local news off to remove them.' });
      if (!r.rowCount) return res.status(404).json({ error: 'Source not found' });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === '22P02') return res.status(404).json({ error: 'Source not found' });
      res.status(500).json({ error: 'Failed to delete source' });
    }
  });

  admin.post('/:id/refresh', async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM hub_external_sources WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Source not found' });
      const result = await refreshSource(r.rows[0]);
      res.status(result.ok ? 200 : 502).json(result);
    } catch (err) {
      if (err.code === '22P02') return res.status(404).json({ error: 'Source not found' });
      res.status(500).json({ error: 'Failed to refresh source' });
    }
  });

  // ── member ───────────────────────────────────────────────────────────────

  async function memberSettings(userId) {
    const prefs = {};
    const pr = await pool.query(
      `SELECT key, value FROM hub_user_preferences
        WHERE user_id = $1 AND key IN ('external_enabled','external_topics','external_muted_sources')`,
      [userId],
    );
    for (const row of pr.rows) prefs[row.key] = row.value;
    const enabled = prefs.external_enabled === 'true'; // opt-in: a member sees Outside content only after switching it on
    let topics = prefs.external_topics !== undefined ? normaliseTopics(prefs.external_topics) : null;
    if (topics === null) {
      const u = await pool.query(`SELECT tags FROM hub_users WHERE id = $1`, [userId]);
      topics = normaliseTopics(u.rows[0]?.tags || []);
    }
    const mutedSources = String(prefs.external_muted_sources || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { enabled, topics, mutedSources };
  }

  member.get('/sources', authenticate, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, kind, label, topics FROM hub_external_sources WHERE enabled ORDER BY label`,
      );
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to load sources' });
    }
  });

  member.get('/items', authenticate, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const settings = await memberSettings(req.user.id);
      if (!settings.enabled) return res.json({ enabled: false, topics: settings.topics, items: [] });
      const { rows } = await pool.query(
        `SELECT i.id, i.source_id, i.title, i.excerpt, i.url, i.author, i.published_at, i.fetched_at,
                s.label AS source_label, s.kind AS source_kind, s.topics AS source_topics
           FROM hub_external_items i
           JOIN hub_external_sources s ON s.id = i.source_id AND s.enabled
          WHERE COALESCE(i.published_at, i.fetched_at) > NOW() - make_interval(days => $1)
          ORDER BY COALESCE(i.published_at, i.fetched_at) DESC
          LIMIT 600`,
        [ITEM_MAX_AGE_DAYS],
      );
      let placeTerms = [];
      try {
        const cfg = await readCfg();
        const cached = cfg.outside_place_cache ? JSON.parse(cfg.outside_place_cache) : null;
        const pl = (cached && cached.place) || placeFromLabel(cfg.hub_location || process.env.HUB_LOCATION || '');
        if (pl) placeTerms = [pl.city, countyBase(pl.county)].filter(Boolean);
      } catch { /* no place boost */ }
      const semantic = await buildSemantic(rows, settings.topics).catch(() => null);
      const picked = selectItems(
        rows.map((r) => ({ ...r, topics: r.source_topics })),
        { topics: settings.topics, mutedSources: settings.mutedSources, limit, offset, placeTerms, semantic },
      );
      res.json({
        enabled: true,
        topics: settings.topics,
        items: picked.map((r) => ({
          id: r.id,
          title: r.title,
          excerpt: r.excerpt,
          url: r.url,
          author: r.author,
          published_at: r.published_at,
          source: { id: r.source_id, label: r.source_label, kind: r.source_kind },
        })),
      });
    } catch (err) {
      console.error('[external-feeds] items failed:', err.message);
      res.status(500).json({ error: 'Failed to load external items' });
    }
  });

  return { member, admin, start, tick, refreshSource, ensureTables };
}

module.exports = {
  createExternalFeeds,
  // exported for tests
  safeFetch,
  isBlockedAddress,
  parseFeedXml,
  parseMastodonTag,
  parseBlueskyFeed,
  validateSourceInput,
  selectItems,
  buildAutoQueries,
  placeFromLabel,
  placeFromNominatim,
  parseGoogleNews,
  parseThreadsSearch,
  parseRedditSearch,
  parseBlueskySearch,
  parseLemmySearch,
  applyMustMention,
  applyMustWord,
  toPlainText,
  normaliseTopics,
};
