/**
 * Knowledge Vault — portable offline reference content. A vault is just a folder (on any USB
 * stick, SSD, SD card or network share) holding a manifest.json plus the files it lists. The
 * `citinet vault import <path>` command (scripts/hub-tools) reads that folder on the host and
 * streams it here, because the API runs in a container that can't see removable drives.
 *
 * Deliberately NOT the Files library: vault content has its own tables and lives under the
 * `knowledge/` MinIO prefix, so it can never show up in (or leak through) hub-wide Files.
 *
 *   Admin  POST   /api/admin/knowledge/vaults                    { manifest }  -> { vaultId, sources }
 *          PUT    /api/admin/knowledge/vaults/:id/files?source=&path=   (raw body, one file)
 *          POST   /api/admin/knowledge/vaults/:id/finish
 *          GET    /api/admin/knowledge/vaults
 *          DELETE /api/admin/knowledge/vaults/:id
 *   Member GET    /api/knowledge/categories
 *          GET    /api/knowledge/sources?category=&q=
 *          GET    /api/knowledge/sources/:id                    detail + files + signed viewer URL
 *   Viewer GET    /api/knowledge/f/<grant>/<sourceId>/<path>    capability URL (no auth header —
 *                                                               iframes/PDF viewers can't send one)
 *          GET    /api/knowledge/k/<grant>/<sourceId>/<path>    Kiwix archive (.zim) pages, proxied from
 *                                                               the optional citinet-kiwix container;
 *                                                               <path>=__suggest?term= for title search
 *          GET    /api/knowledge/kiwix/status                   is the archive reader running?
 *
 * Security: imported HTML can run script, and this origin holds the session + E2E keys, so every
 * HTML response is served with `Content-Security-Policy: sandbox` (opaque origin, no storage
 * access). PDFs/EPUBs/images are inert and served as-is with nosniff.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const SOURCE_TYPES = ['pdf', 'epub', 'html', 'kiwix'];
// pmtiles is reserved for offline maps; the manifest may not use it yet.

// What may be imported. No executables/scripts-for-the-host; html sites need css/js/media.
const ALLOWED_EXT = new Set([
  'pdf', 'epub', 'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'xml', 'svg',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'woff', 'woff2', 'ttf', 'otf',
  'mp3', 'ogg', 'mp4', 'webm', 'zim',
]);
const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', ogg: 'audio/ogg', mp4: 'video/mp4',
  webm: 'video/webm', pdf: 'application/pdf', epub: 'application/epub+zip',
};
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const MAX_FILE_BYTES = Number(process.env.VAULT_MAX_FILE_BYTES) || 60 * 1024 * 1024 * 1024;
const MAX_SOURCES = 2000;
const GRANT_TTL_MS = 30 * 60 * 1000;
// The optional archive reader (docker-compose profile "kiwix"). Reached only through our proxy below.
const KIWIX_URL = process.env.KIWIX_URL || 'http://citinet-kiwix:8080';
const KIWIX_TIMEOUT_MS = 30 * 1000;

const extOf = (p) => path.posix.extname(p).slice(1).toLowerCase();
const mimeFor = (p) => MIME[extOf(p)] || 'application/octet-stream';
const isAdmin = (u) => !!u && (u.is_admin === true || u.role === 'admin');

/** Normalise a relative path to a safe POSIX path, or null if it escapes / is absolute. */
function safeRelPath(raw) {
  if (typeof raw !== 'string' || !raw || raw.includes('\0')) return null;
  const norm = path.posix.normalize(raw.replace(/\\/g, '/'));
  if (norm.startsWith('/') || norm === '..' || norm.startsWith('../') || norm === '.') return null;
  return norm;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Validate a manifest. Pure — used by the API and by the CLI's `vault create`/`vault check`.
 * Returns { ok, errors[], manifest } where manifest is the normalised copy.
 */
function validateManifest(input) {
  const errors = [];
  const m = input && typeof input === 'object' ? input : {};
  if (m.vaultVersion !== 1) errors.push('vaultVersion must be 1');
  const name = str(m.name, 120);
  if (!name) errors.push('name is required');

  const categories = [];
  const catIds = new Set();
  for (const c of Array.isArray(m.categories) ? m.categories : []) {
    const id = str(c?.id, 40).toLowerCase();
    const label = str(c?.label, 80);
    if (!SLUG_RE.test(id)) { errors.push(`category id "${c?.id}" must be lowercase letters/digits/dashes`); continue; }
    if (!label) { errors.push(`category "${id}" needs a label`); continue; }
    if (catIds.has(id)) { errors.push(`duplicate category "${id}"`); continue; }
    catIds.add(id);
    categories.push({ id, label });
  }
  if (!categories.length) errors.push('at least one category is required');

  const sources = [];
  const srcIds = new Set();
  const rawSources = Array.isArray(m.sources) ? m.sources : [];
  if (!rawSources.length) errors.push('at least one source is required');
  if (rawSources.length > MAX_SOURCES) errors.push(`too many sources (max ${MAX_SOURCES})`);
  for (const s of rawSources.slice(0, MAX_SOURCES)) {
    const id = str(s?.id, 60).toLowerCase();
    const label = id || '(missing id)';
    if (!SLUG_RE.test(id)) { errors.push(`source id "${s?.id}" must be lowercase letters/digits/dashes`); continue; }
    if (srcIds.has(id)) { errors.push(`duplicate source id "${id}"`); continue; }
    srcIds.add(id);
    const type = str(s.type, 10).toLowerCase();
    if (!SOURCE_TYPES.includes(type)) { errors.push(`${label}: type must be one of ${SOURCE_TYPES.join(', ')}`); continue; }
    const category = str(s.category, 40).toLowerCase();
    if (!catIds.has(category)) errors.push(`${label}: unknown category "${s.category}"`);
    const title = str(s.title, 200);
    if (!title) errors.push(`${label}: title is required`);
    // `path` is the file (pdf/epub/kiwix) or the folder (html). `entry` = page to open for html.
    const rel = safeRelPath(s.path);
    if (!rel) { errors.push(`${label}: path must be a relative path inside the vault`); continue; }
    if (type !== 'html' && extOf(rel) !== (type === 'kiwix' ? 'zim' : type)) {
      errors.push(`${label}: a ${type} source's path must end in .${type === 'kiwix' ? 'zim' : type}`);
    }
    let entry = null;
    if (type === 'html') {
      entry = safeRelPath(s.entry || 'index.html');
      if (!entry) errors.push(`${label}: entry must be a relative path`);
    }
    const sha = str(s.sha256, 64).toLowerCase();
    if (sha && !/^[0-9a-f]{64}$/.test(sha)) errors.push(`${label}: sha256 must be 64 hex characters`);
    sources.push({
      id, type, category, title, path: rel, entry,
      description: str(s.description, 600),
      license: str(s.license, 120),
      sha256: sha || null,
      tags: (Array.isArray(s.tags) ? s.tags : []).map((t) => str(t, 40)).filter(Boolean).slice(0, 20),
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest: { vaultVersion: 1, name, createdAt: str(m.createdAt, 40) || null, categories, sources },
  };
}

/**
 * Many Kiwix archives ("zimgit" libraries: medicine, water, post-disaster, food...) are small web apps
 * whose book list lives in a plain data file:  var DATABASE = [ {'_id':'00000','ti':'Title',...}, ... ];
 * The app itself needs browser storage that a sandboxed page can't have, but the DATA is simple, so we
 * read it and show the books natively (see ArchiveReader). This is a deliberately tiny, strict parser
 * for that JavaScript-literal subset (arrays, objects, strings, numbers, true/false/null) -- the file is
 * never executed. Returns null when the text isn't that format.
 */
function parseNautilusDatabase(src) {
  if (typeof src !== 'string' || src.length > 2 * 1024 * 1024) return null;
  const at = src.search(/\bDATABASE\s*=\s*\[/);
  if (at < 0) return null;
  let i = src.indexOf('[', at);
  let nodes = 0;
  const fail = () => { throw new Error('unsupported'); };
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); if (e < 0) fail(); i = e + 2; continue; }
      return;
    }
  };
  const str = () => {
    const q = src[i++]; let out = '';
    while (i < src.length && src[i] !== q) {
      let c = src[i++];
      if (c === '\\') {
        c = src[i++];
        if (c === 'n') c = '\n'; else if (c === 't') c = '\t'; else if (c === 'r') c = '\r';
        else if (c === 'u') { const h = src.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail(); c = String.fromCharCode(parseInt(h, 16)); i += 4; }
      }
      out += c;
      if (out.length > 20000) fail();
    }
    if (src[i] !== q) fail();
    i++; return out;
  };
  const value = (depth) => {
    if (depth > 6 || ++nodes > 60000) fail();
    ws();
    const c = src[i];
    if (c === '[') {
      i++; const arr = [];
      for (;;) { ws(); if (src[i] === ']') { i++; return arr; } arr.push(value(depth + 1)); ws(); if (src[i] === ',') i++; else if (src[i] !== ']') fail(); }
    }
    if (c === '{') {
      i++; const obj = {};
      for (;;) {
        ws(); if (src[i] === '}') { i++; return obj; }
        let key;
        if (src[i] === "'" || src[i] === '"') key = str();
        else { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 64)); if (!m) fail(); key = m[0]; i += key.length; }
        ws(); if (src[i++] !== ':') fail();
        const v = value(depth + 1);
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') obj[key] = v;
        ws(); if (src[i] === ',') i++; else if (src[i] !== '}') fail();
      }
    }
    if (c === "'" || c === '"') return str();
    const m = /^(-?\d+(?:\.\d+)?|true|false|null)/.exec(src.slice(i, i + 32));
    if (!m) fail();
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : Number(m[0]);
  };
  let raw;
  try { raw = value(0); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  const clean = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const books = [];
  for (const b of raw.slice(0, 5000)) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.fp)) continue;
    const files = b.fp.filter((f) => typeof f === 'string')
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f && !f.startsWith('/') && !f.split('/').includes('..') && !f.includes('\0'))
      .slice(0, 50);
    if (!files.length || !clean(b.ti, 300)) continue;
    books.push({
      id: clean(String(b._id ?? ''), 40) || String(books.length),
      title: clean(b.ti, 300), author: clean(b.aut, 300), description: clean(b.dsc ?? b.desc, 1200), files,
    });
  }
  return books;
}

/**
 * Added to the end of archive pages. The frame has an opaque origin, so the reader can't see where it
 * is; each page tells it, which is what lets the reader offer a Back button. history.state marks pages
 * already visited, so going back is distinguishable from following a link.
 */
const ARCHIVE_NAV_SCRIPT = `<script>(function(){
function report(){var s=history.state,fresh=!(s&&s.citinetPage);
if(fresh){s={citinetPage:Date.now().toString(36)+Math.random().toString(36).slice(2)};try{history.replaceState(s,'')}catch(e){}}
parent.postMessage({citinetPage:s.citinetPage,fresh:fresh},'*')}
report();addEventListener('hashchange',report);addEventListener('popstate',report)})();</script>`;

function createKnowledgeVault({ pool, authenticate, express, getMinio, bucket }) {
  // Capability links die on restart (fresh secret) — viewers just re-request one.
  const grantSecret = crypto.randomBytes(32);
  const zimDir = process.env.KNOWLEDGE_DIR ? path.join(process.env.KNOWLEDGE_DIR, 'zim') : null;
  const zimFile = (vaultId, sourceKey) => `${vaultId}-${sourceKey}.zim`;
  // kiwix-serve names each book after its file (minus .zim) in its URLs.
  const bookName = (vaultId, sourceKey) => `${vaultId}-${sourceKey}`;

  /**
   * Rewrites zim/library.xml from the database: every READY kiwix source, nothing half-imported.
   * kiwix-serve runs with --monitorLibrary, so it picks changes up on its own. Written to a temp
   * file then renamed so the reader never sees a half-written list.
   */
  async function writeLibrary() {
    if (!zimDir) return;
    const r = await pool.query(
      `SELECT s.id, s.vault_id, s.source_key FROM knowledge_sources s
         WHERE s.type = 'kiwix' AND s.status = 'ready' ORDER BY s.id`);
    const books = r.rows
      .filter((row) => fs.existsSync(path.join(zimDir, zimFile(row.vault_id, row.source_key))))
      .map((row) => `  <book id="${row.id}" path="/data/${zimFile(row.vault_id, row.source_key)}"/>`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<library version="20110515">\n${books.join('\n')}\n</library>\n`;
    await fs.promises.mkdir(zimDir, { recursive: true });
    const tmp = path.join(zimDir, `.library.${process.pid}.tmp`);
    await fs.promises.writeFile(tmp, xml);
    await fs.promises.rename(tmp, path.join(zimDir, 'library.xml'));
  }

  // Cached so opening many archive items doesn't hammer the reader with probes.
  let kiwixProbe = { at: 0, ok: false };
  function kiwixAvailable() {
    if (Date.now() - kiwixProbe.at < 5000) return Promise.resolve(kiwixProbe.ok);
    return new Promise((resolve) => {
      const done = (ok) => { kiwixProbe = { at: Date.now(), ok }; resolve(ok); };
      const req = http.get(new URL('/', KIWIX_URL), { timeout: 2000 }, (r) => { r.resume(); done(r.statusCode < 500); });
      req.on('timeout', () => { req.destroy(); done(false); });
      req.on('error', () => done(false));
    });
  }

  /** GET a small text resource from the reader. Rejects if the reader can't be reached. */
  function kiwixGetText(pathStr, maxBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const req = http.get(new URL(pathStr, KIWIX_URL), { timeout: KIWIX_TIMEOUT_MS }, (r) => {
        const chunks = []; let n = 0;
        r.on('data', (d) => { n += d.length; if (n > maxBytes) r.destroy(new Error('too large')); else chunks.push(d); });
        r.on('end', () => resolve({ status: r.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        r.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
  }

  const sign = (exp, sourceId) =>
    crypto.createHmac('sha256', grantSecret).update(`${exp}.${sourceId}`).digest('base64url');
  const makeGrant = (sourceId) => {
    const exp = Date.now() + GRANT_TTL_MS;
    return `${exp}-${sign(exp, sourceId)}`;
  };
  function grantOk(grant, sourceId) {
    const g = String(grant);
    const i = g.indexOf('-'); // the signature is base64url and may itself contain '-'
    const exp = g.slice(0, i);
    const sig = g.slice(i + 1);
    if (!/^\d+$/.test(exp || '') || Number(exp) < Date.now() || !sig) return false;
    const want = Buffer.from(sign(exp, sourceId));
    const got = Buffer.from(sig);
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  }

  const keyFor = (vaultId, sourceId, rel) => `knowledge/${vaultId}/${sourceId}/${rel}`;

  async function init() {
    // (library.xml is written at the end, once the tables exist)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_vaults (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        manifest    JSONB NOT NULL,
        manifest_hash TEXT,
        status      TEXT NOT NULL DEFAULT 'importing',
        size_bytes  BIGINT NOT NULL DEFAULT 0,
        imported_by UUID,
        imported_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query('ALTER TABLE knowledge_vaults ADD COLUMN IF NOT EXISTS manifest_hash TEXT');
    // Set only for vaults installed from the pack catalog (see knowledgePacks.js).
    await pool.query('ALTER TABLE knowledge_vaults ADD COLUMN IF NOT EXISTS pack_id TEXT');
    await pool.query('ALTER TABLE knowledge_vaults ADD COLUMN IF NOT EXISTS install_error TEXT');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_categories (
        slug  TEXT PRIMARY KEY,
        label TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vault_id    UUID NOT NULL REFERENCES knowledge_vaults(id) ON DELETE CASCADE,
        source_key  TEXT NOT NULL,
        category    TEXT NOT NULL,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        license     TEXT NOT NULL DEFAULT '',
        tags        TEXT[] NOT NULL DEFAULT '{}',
        path        TEXT NOT NULL,
        entry       TEXT,
        sha256      TEXT,
        size_bytes  BIGINT NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'pending',
        search_text TEXT NOT NULL DEFAULT '',
        UNIQUE (vault_id, source_key)
      )`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS knowledge_sources_fts
        ON knowledge_sources USING GIN (to_tsvector('english', search_text))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS knowledge_sources_cat ON knowledge_sources (category)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_files (
        source_id  UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        rel_path   TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        PRIMARY KEY (source_id, rel_path)
      )`);
    await writeLibrary().catch((e) => console.warn('[knowledge] could not write library.xml:', e.message));
  }

  // ── Admin: import ───────────────────────────────────────────────────────────

  const admin = express.Router();
  admin.use(authenticate, (req, res, next) =>
    isAdmin(req.user) ? next() : res.status(403).json({ error: 'Admin only' }));

  admin.post('/vaults', express.json({ limit: '4mb' }), async (req, res) => {
    const v = validateManifest(req.body?.manifest);
    if (!v.ok) return res.status(400).json({ error: 'Invalid manifest', details: v.errors });
    const m = v.manifest;
    const manifestHash = crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex');
    try {
      // Same manifest again = resume (importing) or nothing to do (ready), never a duplicate vault.
      const prev = await pool.query(
        `SELECT id, status FROM knowledge_vaults WHERE manifest_hash = $1 ORDER BY (status = 'importing') DESC, imported_at DESC LIMIT 1`,
        [manifestHash]);
      if (prev.rows[0]?.status === 'ready') {
        return res.status(409).json({ error: 'This vault is already imported', vaultId: prev.rows[0].id });
      }
      if (prev.rows[0]) {
        const vaultId = prev.rows[0].id;
        const srcs = await pool.query('SELECT source_key, type, path FROM knowledge_sources WHERE vault_id = $1', [vaultId]);
        const done = await pool.query(
          `SELECT s.source_key AS source, f.rel_path AS path, f.size_bytes::bigint AS size
             FROM knowledge_files f JOIN knowledge_sources s ON s.id = f.source_id WHERE s.vault_id = $1`, [vaultId]);
        return res.json({
          vaultId, resumed: true,
          sources: srcs.rows.map((r) => ({ key: r.source_key, type: r.type, path: r.path })),
          done: done.rows.map((r) => ({ source: r.source, path: r.path, size: Number(r.size) })),
        });
      }
    } catch (err) {
      console.warn('[knowledge] resume lookup failed:', err.message);
      return res.status(500).json({ error: 'Failed to start import' });
    }
    try {
      const { vaultId, sources } = await createVaultRecord(m, manifestHash, req.user.id);
      res.json({ vaultId, resumed: false, sources, done: [] });
    } catch (err) {
      console.warn('[knowledge] create vault failed:', err.message);
      res.status(500).json({ error: 'Failed to start import' });
    }
  });

  /** One file of one source, raw body. The CLI calls this once per file, so imports are resumable. */
  admin.put('/vaults/:id/files', async (req, res) => {
    const sourceKey = String(req.query.source || '');
    const rel = safeRelPath(String(req.query.path || ''));
    if (!rel) return res.status(400).json({ error: 'Invalid path' });
    if (!ALLOWED_EXT.has(extOf(rel))) return res.status(400).json({ error: `File type .${extOf(rel) || '(none)'} is not allowed` });
    const minio = getMinio();
    if (!minio) return res.status(503).json({ error: 'Storage not ready' });
    try {
      const sr = await pool.query(
        `SELECT s.id, s.type, s.path, s.sha256, v.status AS vstatus
           FROM knowledge_sources s JOIN knowledge_vaults v ON v.id = s.vault_id
          WHERE s.vault_id = $1 AND s.source_key = $2`, [req.params.id, sourceKey]);
      const src = sr.rows[0];
      if (!src) return res.status(404).json({ error: 'Unknown vault or source' });
      if (src.vstatus !== 'importing') return res.status(409).json({ error: 'Vault is not importing' });
      // The file must belong to the source it claims: the exact file, or inside the html folder.
      const within = src.type === 'html' ? rel === src.path || rel.startsWith(`${src.path}/`) : rel === src.path;
      if (!within) return res.status(400).json({ error: 'File is outside the source path' });

      const hash = crypto.createHash('sha256');
      let size = 0;
      const tap = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length;
          if (size > MAX_FILE_BYTES) return cb(Object.assign(new Error('File too large'), { status: 413 }));
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      req.on('aborted', () => tap.destroy(new Error('aborted')));
      req.pipe(tap);

      let cleanup = async () => {};
      if (src.type === 'kiwix') {
        // kiwix-serve reads .zim files straight off disk, so they bypass MinIO.
        if (!zimDir) { tap.destroy(); return res.status(501).json({ error: 'Kiwix packs need KNOWLEDGE_DIR mounted on the hub' }); }
        await fs.promises.mkdir(zimDir, { recursive: true });
        const dest = path.join(zimDir, `${req.params.id}-${sourceKey}.zim`);
        cleanup = () => fs.promises.unlink(dest).catch(() => {});
        await pipeline(tap, fs.createWriteStream(dest));
      } else {
        const key = keyFor(req.params.id, sourceKey, rel);
        cleanup = () => minio.removeObject(bucket, key).catch(() => {});
        await minio.putObject(bucket, key, tap, undefined, { 'Content-Type': mimeFor(rel) });
      }
      const digest = hash.digest('hex');
      // Single-file sources carry a checksum in the manifest — a corrupt/truncated copy fails loudly.
      if (src.sha256 && src.type !== 'html' && digest !== src.sha256) {
        await cleanup();
        return res.status(422).json({ error: 'Checksum mismatch — the file on the drive is damaged or was modified' });
      }
      await pool.query(
        `INSERT INTO knowledge_files (source_id, rel_path, size_bytes) VALUES ($1,$2,$3)
           ON CONFLICT (source_id, rel_path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes`,
        [src.id, rel, size]);
      res.json({ ok: true, size, sha256: digest });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Upload failed' });
    }
  });

  /** Mark the vault ready once every source has at least its entry file; totals sizes. */
  admin.post('/vaults/:id/finish', async (req, res) => {
    try {
      const sr = await pool.query(
        `SELECT s.id, s.source_key, s.type, s.path, s.entry,
                COALESCE((SELECT SUM(size_bytes) FROM knowledge_files f WHERE f.source_id = s.id), 0)::bigint AS bytes,
                EXISTS (SELECT 1 FROM knowledge_files f WHERE f.source_id = s.id
                         AND f.rel_path = CASE WHEN s.type = 'html' THEN s.path || '/' || s.entry ELSE s.path END) AS has_entry
           FROM knowledge_sources s WHERE s.vault_id = $1`, [req.params.id]);
      if (!sr.rows.length) return res.status(404).json({ error: 'Vault not found' });
      const missing = sr.rows.filter((r) => !r.has_entry).map((r) => r.source_key);
      if (missing.length) return res.status(409).json({ error: 'Some sources are incomplete', missing });
      let total = 0;
      for (const r of sr.rows) {
        total += Number(r.bytes);
        await pool.query(`UPDATE knowledge_sources SET size_bytes = $2, status = 'ready' WHERE id = $1`, [r.id, r.bytes]);
      }
      await pool.query(`UPDATE knowledge_vaults SET status = 'ready', size_bytes = $2 WHERE id = $1`, [req.params.id, total]);
      await writeLibrary().catch((e) => console.warn('[knowledge] could not write library.xml:', e.message));
      res.json({ ok: true, sources: sr.rows.length, totalBytes: total });
    } catch (err) {
      console.warn('[knowledge] finish failed:', err.message);
      res.status(500).json({ error: 'Failed to finish import' });
    }
  });

  admin.get('/vaults', async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT v.id, v.name, v.status, v.size_bytes, v.imported_at, v.pack_id, v.install_error,
                (SELECT COUNT(*) FROM knowledge_sources s WHERE s.vault_id = v.id)::int AS source_count
           FROM knowledge_vaults v ORDER BY v.imported_at DESC`);
      res.json({ vaults: r.rows });
    } catch {
      res.status(500).json({ error: 'Failed to list vaults' });
    }
  });

  /**
   * Inserts a vault + its categories + its (still 'pending') sources in one transaction. Shared by the
   * drive importer (POST /vaults) and the one-click pack installer, so both produce identical records.
   * `extra.packId` marks a vault as installed from the catalog.
   */
  async function createVaultRecord(m, manifestHash, userId, extra = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const vr = await client.query(
        `INSERT INTO knowledge_vaults (name, manifest, manifest_hash, imported_by, pack_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [m.name, m, manifestHash, userId, extra.packId || null],
      );
      const vaultId = vr.rows[0].id;
      for (const c of m.categories) {
        await client.query(
          `INSERT INTO knowledge_categories (slug, label) VALUES ($1,$2)
             ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label`, [c.id, c.label]);
      }
      const sources = [];
      for (const s of m.sources) {
        const searchText = [s.title, s.description, s.tags.join(' '), path.posix.basename(s.path)].join(' ');
        const r = await client.query(
          `INSERT INTO knowledge_sources
             (vault_id, source_key, category, type, title, description, license, tags, path, entry, sha256, search_text)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [vaultId, s.id, s.category, s.type, s.title, s.description, s.license, s.tags, s.path, s.entry, s.sha256, searchText],
        );
        sources.push({ id: r.rows[0].id, key: s.id, type: s.type, path: s.path });
      }
      await client.query('COMMIT');
      return { vaultId, sources };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Other modules (the pack installer) register here to stop their work when a vault is deleted.
  const deleteHooks = [];

  async function removeVaultData(id) {
    const minio = getMinio();
    if (minio) {
      const keys = [];
      await new Promise((resolve) => {
        const st = minio.listObjectsV2(bucket, `knowledge/${id}/`, true);
        st.on('data', (o) => o.name && keys.push(o.name));
        st.on('end', resolve);
        st.on('error', resolve);
      });
      for (let i = 0; i < keys.length; i += 500) await minio.removeObjects(bucket, keys.slice(i, i + 500)).catch(() => {});
    }
    if (zimDir) {
      const names = await fs.promises.readdir(zimDir).catch(() => []);
      await Promise.all(names.filter((n) => n.startsWith(`${id}-`)).map((n) => fs.promises.unlink(path.join(zimDir, n)).catch(() => {})));
    }
  }

  admin.delete('/vaults/:id', async (req, res) => {
    try {
      for (const hook of deleteHooks) await hook(req.params.id);
      const r = await pool.query(`DELETE FROM knowledge_vaults WHERE id = $1 RETURNING id`, [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Vault not found' });
      await removeVaultData(req.params.id);
      await writeLibrary().catch((e) => console.warn('[knowledge] could not write library.xml:', e.message));
      await pool.query(`DELETE FROM knowledge_categories c WHERE NOT EXISTS (SELECT 1 FROM knowledge_sources s WHERE s.category = c.slug)`);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete vault' });
    }
  });

  // ── Member: browse + search ─────────────────────────────────────────────────

  const member = express.Router();
  member.use(authenticate);

  member.get('/categories', async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT c.slug, c.label, COUNT(s.id)::int AS count
           FROM knowledge_categories c
           JOIN knowledge_sources s ON s.category = c.slug AND s.status = 'ready'
          GROUP BY c.slug, c.label ORDER BY c.label`);
      res.json({ categories: r.rows });
    } catch {
      res.status(500).json({ error: 'Failed to load categories' });
    }
  });

  member.get('/sources', async (req, res) => {
    const category = String(req.query.category || '').toLowerCase();
    const q = String(req.query.q || '').trim().slice(0, 200);
    try {
      const params = [];
      const where = [`s.status = 'ready'`];
      if (category) { params.push(category); where.push(`s.category = $${params.length}`); }
      let order = 's.title';
      if (q) {
        params.push(q);
        const n = params.length;
        where.push(`(to_tsvector('english', s.search_text) @@ websearch_to_tsquery('english', $${n}) OR s.title ILIKE '%' || $${n} || '%')`);
        order = `ts_rank(to_tsvector('english', s.search_text), websearch_to_tsquery('english', $${n})) DESC, s.title`;
      }
      const r = await pool.query(
        `SELECT s.id, s.category, s.type, s.title, s.description, s.license, s.tags, s.size_bytes
           FROM knowledge_sources s WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`, params);
      res.json({ sources: r.rows });
    } catch (err) {
      console.warn('[knowledge] search failed:', err.message);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  member.get('/sources/:id', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, category, type, title, description, license, tags, path, entry, size_bytes
           FROM knowledge_sources WHERE id = $1 AND status = 'ready'`, [req.params.id]);
      const s = r.rows[0];
      if (!s) return res.status(404).json({ error: 'Not found' });
      const open = s.type === 'html' ? `${s.path}/${s.entry}` : s.path;
      const base = `${req.baseUrl}/f/${makeGrant(s.id)}/${s.id}`;
      res.json({
        source: { id: s.id, category: s.category, type: s.type, title: s.title, description: s.description,
          license: s.license, tags: s.tags, sizeBytes: Number(s.size_bytes) },
        // Kiwix packs are opened through kiwix-serve (wired separately); the rest are served here.
        viewerUrl: s.type === 'kiwix' ? null : `${base}/${open.split('/').map(encodeURIComponent).join('/')}`,
        // Archives: a base URL the reader UI searches and browses under (see the /k/ proxy below).
        ...(s.type === 'kiwix' ? {
          archiveUrl: `${req.baseUrl}/k/${makeGrant(s.id)}/${s.id}`,
          readerAvailable: await kiwixAvailable(),
        } : {}),
      });
    } catch {
      res.status(500).json({ error: 'Failed to load item' });
    }
  });

  // ── Viewer: capability-URL file serving ─────────────────────────────────────

  const serve = express.Router({ strict: true });
  // The web app often runs on a different origin from the hub API (citinet.cloud, a dev server) and
  // shows these files in a frame, so helmet's same-origin-only framing rule must not apply here.
  // Access is still gated by the capability link, and scriptable files stay sandboxed.
  const allowFraming = (res) => res.removeHeader('X-Frame-Options');

  serve.get('/:grant/:sourceId/*', async (req, res) => {
    const { grant, sourceId } = req.params;
    allowFraming(res);
    if (!grantOk(grant, sourceId)) return res.status(403).type('text/plain').send('Link expired');
    const rel = safeRelPath(req.params[0] || '');
    const minio = getMinio();
    if (!rel || !minio) return res.status(404).type('text/plain').send('Not found');
    try {
      const sr = await pool.query(
        `SELECT s.vault_id, s.source_key, s.type, s.path, f.size_bytes
           FROM knowledge_sources s JOIN knowledge_files f ON f.source_id = s.id AND f.rel_path = $2
          WHERE s.id = $1 AND s.status = 'ready'`, [sourceId, rel]);
      const row = sr.rows[0];
      if (!row) return res.status(404).type('text/plain').send('Not found');
      const key = keyFor(row.vault_id, row.source_key, rel);
      const total = Number(row.size_bytes);
      const ext = extOf(rel);

      res.setHeader('Content-Type', mimeFor(rel));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*'); // EPUB reader fetches the bytes cross-origin
      // HTML/SVG can run script — give it an opaque origin so it can't touch this hub's session/E2E keys.
      if (ext === 'html' || ext === 'htm' || ext === 'svg') {
        res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-popups; default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'");
      }

      let start = 0;
      let end = total - 1;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range && total > 0) {
        if (range[1] === '' && range[2] !== '') { start = Math.max(0, total - Number(range[2])); }
        else { start = Number(range[1] || 0); if (range[2] !== '') end = Math.min(end, Number(range[2])); }
        if (start > end || start >= total) {
          res.setHeader('Content-Range', `bytes */${total}`);
          return res.status(416).end();
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      }
      res.setHeader('Content-Length', end - start + 1);
      if (req.method === 'HEAD' || total === 0) return res.end();
      const stream = (start === 0 && end === total - 1)
        ? await minio.getObject(bucket, key)
        : await minio.getPartialObject(bucket, key, start, end - start + 1);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (err) {
      console.warn('[knowledge] serve failed:', err.message);
      if (!res.headersSent) res.status(500).type('text/plain').send('Failed to load file');
    }
  });

  // ── Archive reader: proxy to kiwix-serve ────────────────────────────────────
  // The browser never talks to kiwix-serve directly: this proxy checks the capability link, pins
  // each request to one book, maps paths, rewrites redirects back under our prefix, and sandboxes
  // HTML (a zim can contain script) exactly like the other viewer routes.

  member.get('/kiwix/status', async (_req, res) => res.json({ available: await kiwixAvailable() }));

  const KEEP = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control', 'content-encoding', 'vary'];

  const archive = express.Router({ strict: true });
  archive.get('/:grant/:sourceId/*', async (req, res) => {
    const { grant, sourceId } = req.params;
    allowFraming(res);
    if (!grantOk(grant, sourceId)) return res.status(403).type('text/plain').send('Link expired');
    try {
      const sr = await pool.query(
        `SELECT vault_id, source_key FROM knowledge_sources WHERE id = $1 AND type = 'kiwix' AND status = 'ready'`, [sourceId]);
      const row = sr.rows[0];
      if (!row) return res.status(404).type('text/plain').send('Not found');
      const book = bookName(row.vault_id, row.source_key);
      const rest = req.params[0] || '';
      const prefix = `${req.baseUrl}/${grant}/${sourceId}`;

      if (rest === '__books') {
        // The archive's own book list, for archives that are book collections (see parseNautilusDatabase).
        res.setHeader('Access-Control-Allow-Origin', '*');
        let r;
        try { r = await kiwixGetText(`/content/${encodeURIComponent(book)}/database.js`); }
        catch { return res.status(503).json({ error: 'The archive reader is not running on this hub.' }); }
        const books = r.status === 200 ? parseNautilusDatabase(r.text) : null;
        if (!books || !books.length) return res.status(404).json({ error: 'Not a book collection' });
        return res.json({ books });
      }

      let upstreamPath;
      if (rest === '__suggest') {
        const term = String(req.query.term || '').slice(0, 200);
        upstreamPath = `/suggest?content=${encodeURIComponent(book)}&term=${encodeURIComponent(term)}&count=15`;
      } else {
        const rel = rest ? safeRelPath(rest) : '';
        if (rel === null) return res.status(404).type('text/plain').send('Not found');
        upstreamPath = `/content/${encodeURIComponent(book)}${rel ? '/' + rel.split('/').map(encodeURIComponent).join('/') : ''}`;
      }

      const headers = {};
      // A page being opened in the reader: ask for it uncompressed and whole, so the script can be added.
      const isPage = String(req.headers.accept || '').includes('text/html') && !req.headers.range;
      const forward = isPage ? [] : ['range', 'if-none-match', 'if-modified-since', 'accept-encoding'];
      for (const h of forward) if (req.headers[h]) headers[h] = req.headers[h];
      const up = http.request(new URL(upstreamPath, KIWIX_URL), { method: 'GET', headers, timeout: KIWIX_TIMEOUT_MS }, (ur) => {
        for (const h of KEEP) if (ur.headers[h]) res.setHeader(h, ur.headers[h]);
        const loc = ur.headers.location;
        if (loc) {
          const own = `/content/${encodeURIComponent(book)}`;
          if (loc.startsWith(own)) res.setHeader('Location', prefix + loc.slice(own.length));
        }
        const ct = String(ur.headers['content-type'] || '').toLowerCase();
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (ct.startsWith('text/html') || ct.startsWith('image/svg')) {
          res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-popups; default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'");
        }
        res.status(ur.statusCode || 502);
        if (isPage && ur.statusCode === 200 && ct.startsWith('text/html') && !ur.headers['content-encoding']) {
          for (const h of ['content-length', 'etag', 'last-modified', 'accept-ranges']) res.removeHeader(h);
          ur.pipe(res, { end: false });
          ur.on('end', () => res.end(ARCHIVE_NAV_SCRIPT));
        } else ur.pipe(res);
        ur.on('error', () => res.destroy());
      });
      up.on('timeout', () => up.destroy(new Error('timeout')));
      up.on('error', () => {
        kiwixProbe = { at: Date.now(), ok: false };
        if (!res.headersSent) res.status(503).type('text/plain').send('The archive reader is not running on this hub.');
        else res.destroy();
      });
      res.on('close', () => up.destroy());
      up.end();
    } catch (err) {
      console.warn('[knowledge] archive proxy failed:', err.message);
      if (!res.headersSent) res.status(500).type('text/plain').send('Failed to load archive page');
    }
  });

  return { init, admin, member, serve, archive, writeLibrary, createVaultRecord, removeVaultData, deleteHooks, zimDir, zimFile };
}

module.exports = { ARCHIVE_NAV_SCRIPT, parseNautilusDatabase, createKnowledgeVault, validateManifest, safeRelPath, ALLOWED_EXT, SOURCE_TYPES };
