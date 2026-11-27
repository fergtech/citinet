/**
 * One-click content packs — the hub downloads reference archives (Kiwix .zim files) straight from
 * Kiwix's servers, so an admin never hunts for files. The USB-drive import (knowledgeVault.js)
 * stays for hubs with no internet; both end up as the same kind of vault.
 *
 *   Admin  GET  /api/admin/knowledge/packs[?resolve=1]   catalog + per-pack state/progress + free disk
 *          POST /api/admin/knowledge/packs/:id/install   start (or resume) a download   -> 202
 *          POST /api/admin/knowledge/packs/:id/cancel    stop and discard what was downloaded
 *
 * Safety:
 *  - Only the catalog decides what is fetched (an admin never types a URL), and only from the Kiwix
 *    download host. Mirrors it redirects to are followed, but never to a private/loopback/link-local
 *    address (checked at connect time, so a DNS trick can't slip past), which keeps the hub from
 *    being aimed at its own network.
 *  - Every archive is verified against Kiwix's published SHA-256 before it is made visible.
 *  - Downloads go to <name>.part and resume with Range; a file only gets its real name once verified.
 *  - One install at a time; disk space is checked first so a download can't fill the hub's drive.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');
const { validateManifest } = require('./knowledgeVault');
const bundledCatalog = require('./packCatalog');

const DEFAULT_BASE = 'https://download.kiwix.org/zim';
const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/fergtech/citinet-registry/main/packs.json';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;
const DIR_RE = /^[a-z0-9_-]{1,40}$/;
const RESOLVE_TTL_MS = 30 * 60 * 1000;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = 60 * 1000;
const RETRIES = 3;
const CONNECT_TIMEOUT_MS = 30 * 1000;
// A download averaging less than this over one window moves to another mirror (resuming where it was).
const SLOW_WINDOW_MS = 30 * 1000;
const SLOW_BYTES_PER_SEC = 200 * 1024;
const MAX_MIRRORS = 8;
const DISK_HEADROOM_BYTES = 2 * 1024 ** 3; // keep 2 GB free for the database, uploads and logs
const isAdmin = (u) => !!u && (u.is_admin === true || u.role === 'admin');
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── catalog validation ────────────────────────────────────────────────────────

/** Strict check of a catalog (the bundled one and any remote one): only well-formed kiwix items. */
function validateCatalog(input) {
  const errors = [];
  const packs = [];
  const seenPacks = new Set();
  const raw = Array.isArray(input?.packs) ? input.packs : [];
  if (input?.version !== 1) errors.push('catalog version must be 1');
  if (!raw.length) errors.push('catalog has no packs');
  for (const p of raw.slice(0, 30)) {
    const id = str(p?.id, 40);
    if (!SLUG_RE.test(id) || seenPacks.has(id)) { errors.push(`bad or duplicate pack id "${p?.id}"`); continue; }
    seenPacks.add(id);
    const catId = str(p.category?.id, 40);
    const catLabel = str(p.category?.label, 80);
    if (!SLUG_RE.test(catId) || !catLabel) { errors.push(`${id}: bad category`); continue; }
    const items = [];
    const seenItems = new Set();
    for (const it of (Array.isArray(p.items) ? p.items : []).slice(0, 30)) {
      const iid = str(it?.id, 40);
      const dir = str(it?.kiwix?.dir, 40);
      const name = str(it?.kiwix?.name, 80);
      if (!SLUG_RE.test(iid) || seenItems.has(iid) || !DIR_RE.test(dir) || !NAME_RE.test(name) || !str(it.title, 120)) {
        errors.push(`${id}: bad or duplicate item "${it?.id}"`); continue;
      }
      seenItems.add(iid);
      items.push({
        id: iid, title: str(it.title, 120), description: str(it.description, 300), license: str(it.license, 120),
        tags: (Array.isArray(it.tags) ? it.tags : []).map((t) => str(t, 40)).filter(Boolean).slice(0, 12),
        kiwix: { dir, name },
      });
    }
    if (!items.length) { errors.push(`${id}: no valid items`); continue; }
    packs.push({ id, title: str(p.title, 80) || id, description: str(p.description, 400), category: { id: catId, label: catLabel }, items });
  }
  return { ok: errors.length === 0, errors, catalog: { version: 1, packs } };
}

// ── network guard ─────────────────────────────────────────────────────────────

/** True for addresses a download must never reach: this machine, the LAN, link-local, CGNAT/Tailscale. */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
  }
  return true; // not an address we understand: refuse
}

/** A `lookup` for http(s).request that refuses private addresses at the moment of connecting. */
function guardedLookup(allowPrivate) {
  return (hostname, options, cb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) {
        return cb(Object.assign(new Error(`refusing to connect to a private address (${hostname})`), { code: 'EPRIVATE' }));
      }
      if (options && options.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

function createKnowledgePacks({ pool, authenticate, express, vault }, opts = {}) {
  const base = (opts.downloadBase || process.env.KIWIX_DOWNLOAD_BASE || DEFAULT_BASE).replace(/\/$/, '');
  const trustedHost = new URL(base).host;
  const catalogUrl = opts.catalogUrl !== undefined ? opts.catalogUrl : (process.env.PACK_CATALOG_URL ?? DEFAULT_CATALOG_URL);
  const allowPrivate = !!opts.allowPrivateHosts; // tests only
  const statfs = opts.statfs || ((p) => fs.promises.statfs(p));
  const lookup = guardedLookup(allowPrivate);
  const zimDir = vault.zimDir;

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  /** GET following redirects. Resolves the final IncomingMessage (body not yet read). */
  function fetchStream(urlStr, { headers = {}, signal, hops = 0, mustBeTrusted = true } = {}) {
    return new Promise((resolve, reject) => {
      if (hops > 6) return reject(new Error('too many redirects'));
      let u;
      try { u = new URL(urlStr); } catch { return reject(new Error('bad URL')); }
      if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('only http(s) is allowed'));
      // The first hop must be the catalog's own host; later hops are mirrors it redirected us to.
      if (mustBeTrusted && u.host !== trustedHost) return reject(new Error(`refusing to fetch from ${u.host}`));
      const req = (u.protocol === 'https:' ? https : http).get(u, { headers, lookup }, (res) => {
        clearTimeout(connectTimer); // from here the body has its own stall timeout
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return resolve(fetchStream(new URL(res.headers.location, u).toString(), { headers, signal, hops: hops + 1, mustBeTrusted: false }));
        }
        resolve(res);
      });
      const connectTimer = setTimeout(() => req.destroy(new Error('no response from server')), CONNECT_TIMEOUT_MS);
      req.on('error', (e) => { clearTimeout(connectTimer); reject(e); });
      if (signal) {
        if (signal.aborted) req.destroy(Object.assign(new Error('cancelled'), { cancelled: true }));
        signal.addEventListener('abort', () => req.destroy(Object.assign(new Error('cancelled'), { cancelled: true })), { once: true });
      }
    });
  }

  async function getText(urlStr, maxBytes = 8 * 1024 * 1024) {
    const res = await fetchStream(urlStr);
    if (res.statusCode !== 200) { res.resume(); throw new Error(`HTTP ${res.statusCode} for ${urlStr}`); }
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > maxBytes) res.destroy(new Error('response too large')); else chunks.push(d); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
  }

  /** Total size of a remote file via a 1-byte range request (mirrors often don't answer HEAD). */
  async function remoteSize(urlStr) {
    const res = await fetchStream(urlStr, { headers: { Range: 'bytes=0-0' } });
    res.resume();
    const cr = /\/(\d+)$/.exec(String(res.headers['content-range'] || ''));
    if (cr) return Number(cr[1]);
    return Number(res.headers['content-length']) || 0;
  }

  // ── catalog (bundled, optionally refreshed from the registry repo) ────────

  let catalogCache = null; // { at, catalog }
  async function loadCatalog() {
    if (opts.catalog) return validateCatalog(opts.catalog).catalog; // tests inject a small catalog
    if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.catalog;
    let catalog = validateCatalog(bundledCatalog).catalog;
    if (catalogUrl) {
      try {
        const u = new URL(catalogUrl);
        const res = await new Promise((resolve, reject) => {
          const r = https.get(u, { lookup, timeout: 8000 }, resolve);
          r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', reject);
        });
        if (res.statusCode === 200) {
          const chunks = []; let n = 0;
          for await (const d of res) { n += d.length; if (n > 512 * 1024) throw new Error('catalog too large'); chunks.push(d); }
          const remote = validateCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          if (remote.ok) catalog = remote.catalog;
          else console.warn('[packs] remote catalog rejected:', remote.errors.slice(0, 3).join('; '));
        } else res.resume();
      } catch { /* offline or no remote catalog: the bundled one is fine */ }
    }
    catalogCache = { at: Date.now(), catalog };
    return catalog;
  }

  // ── resolving "name" -> current file, checksum, size ──────────────────────

  const resolveCache = new Map(); // `${dir}/${name}` -> { at, value } | { at, promise }
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  async function resolveItem(item) {
    const key = `${item.kiwix.dir}/${item.kiwix.name}`;
    const hit = resolveCache.get(key);
    if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.promise || hit.value;
    const promise = (async () => {
      const listing = await getText(`${base}/${item.kiwix.dir}/`);
      const re = new RegExp(`href="(${escapeRe(item.kiwix.name)}_(\\d{4}-\\d{2}[a-z]?)\\.zim)"`, 'g');
      let best = null; let m;
      while ((m = re.exec(listing))) if (!best || m[2] > best.version) best = { filename: m[1], version: m[2] };
      if (!best) throw new Error(`"${item.kiwix.name}" was not found on the Kiwix download server`);
      const url = `${base}/${item.kiwix.dir}/${best.filename}`;
      const sumText = (await getText(`${url}.sha256`, 4096)).trim().split(/\s+/)[0].toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sumText)) throw new Error(`no valid checksum published for ${best.filename}`);
      const size = await remoteSize(url);
      return { filename: best.filename, version: best.version, url, sha256: sumText, size };
    })();
    resolveCache.set(key, { at: Date.now(), promise });
    try {
      const value = await promise;
      resolveCache.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      resolveCache.delete(key);
      throw err;
    }
  }

  // ── jobs ──────────────────────────────────────────────────────────────────

  let active = null; // the one running job: { packId, vaultId, status, error, items[], controller, done: Promise }
  const lastFailed = new Map(); // packId -> message, until the next attempt (also persisted on the vault row)

  function sha256File(file, signal) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      const rs = fs.createReadStream(file);
      rs.on('data', (d) => h.update(d));
      rs.on('error', reject);
      rs.on('end', () => resolve(h.digest('hex')));
      if (signal) signal.addEventListener('abort', () => rs.destroy(Object.assign(new Error('cancelled'), { cancelled: true })), { once: true });
    });
  }

  /**
   * Other places Kiwix says the same file can be fetched from, best first. The list comes from the
   * trusted host, every download is still checksum-verified, and the private-address guard applies.
   * An empty list just means no switching.
   */
  async function mirrorsFor(url) {
    try {
      const xml = await getText(`${url}.meta4`, 1024 * 1024);
      const found = [...xml.matchAll(/<url\b([^>]*)>\s*(https?:\/\/[^<\s]+)\s*<\/url>/g)]
        .map((m) => ({ url: m[2].replace(/&amp;/g, '&'), priority: Number(/priority="(\d+)"/.exec(m[1])?.[1] || 999) }));
      return found.sort((a, b) => a.priority - b.priority).slice(0, MAX_MIRRORS).map((f) => f.url);
    } catch { return []; }
  }

  /**
   * Download `url` to `${dest}.part`, resuming. Returns the .part path once fully received.
   * `mirror`: not the main address, so refuse anything that would throw away what we already have.
   * `mayDrop`: give up (error.slow) if this server is crawling, so another one can be tried.
   */
  async function downloadPart(url, dest, jobItem, signal, { mirror = false, mayDrop = false } = {}) {
    const part = `${dest}.part`;
    let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    // Mirror addresses come from the trusted host's own list; the private-address guard still applies.
    const res = await fetchStream(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal, mustBeTrusted: !mirror });
    if (res.statusCode === 416) { // we already hold the whole thing
      res.resume();
      if (have > 0) return part;
      throw new Error('server refused the download range');
    }
    if (![200, 206].includes(res.statusCode)) { res.resume(); throw new Error(`HTTP ${res.statusCode}`); }
    const rangeTotal = /\/(\d+)$/.exec(String(res.headers['content-range'] || ''));
    const len = Number(res.headers['content-length']) || 0;
    const offered = rangeTotal ? Number(rangeTotal[1]) : (res.statusCode === 200 ? len : 0);
    if (mirror && ((res.statusCode === 200 && have) || (offered && jobItem.total && offered !== jobItem.total))) {
      res.destroy();
      throw new Error('mirror cannot continue this download');
    }
    if (res.statusCode === 200 && have) { await fs.promises.truncate(part, 0); have = 0; } // server ignored Range
    jobItem.total = rangeTotal ? Number(rangeTotal[1]) : (have ? have + len : len) || jobItem.total;
    jobItem.done = have;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      res.setTimeout(IDLE_TIMEOUT_MS, () => res.destroy(new Error('download stalled')));
      let mark = jobItem.done;
      const windowMs = opts.slowWindowMs || SLOW_WINDOW_MS;
      const minRate = opts.slowBytesPerSec || SLOW_BYTES_PER_SEC;
      const speedCheck = mayDrop ? setInterval(() => {
        const rate = ((jobItem.done - mark) * 1000) / windowMs;
        mark = jobItem.done;
        // Not worth reconnecting when it would finish within a minute anyway.
        const nearlyDone = jobItem.total && rate > 0 && (jobItem.total - jobItem.done) / rate < 60;
        if (rate < minRate && !nearlyDone) res.destroy(Object.assign(new Error('slow mirror'), { slow: true, rate }));
      }, windowMs) : null;
      let failed = false;
      res.on('data', (d) => { jobItem.done += d.length; });
      // Let what already arrived reach the disk before the next attempt measures the file.
      res.on('error', (e) => { failed = true; clearInterval(speedCheck); res.unpipe(out); out.end(() => reject(e)); });
      out.on('error', (e) => { clearInterval(speedCheck); reject(e); });
      out.on('finish', () => { clearInterval(speedCheck); if (!failed) resolve(); });
      res.pipe(out);
    });
    if (jobItem.total && jobItem.done < jobItem.total) throw new Error('download ended early');
    return part;
  }

  async function discardVault(vaultId) {
    await pool.query('DELETE FROM knowledge_vaults WHERE id = $1', [vaultId]).catch(() => {});
    await vault.removeVaultData(vaultId).catch(() => {});
    await pool.query(`DELETE FROM knowledge_categories c WHERE NOT EXISTS (SELECT 1 FROM knowledge_sources s WHERE s.category = c.slug)`).catch(() => {});
    await vault.writeLibrary().catch(() => {});
  }

  async function runJob(job) {
    const { signal } = job.controller;
    try {
      for (const it of job.items) {
        if (signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
        const dest = path.join(zimDir, vault.zimFile(job.vaultId, it.id));
        if (fs.existsSync(dest)) { it.status = 'done'; it.done = it.total = fs.statSync(dest).size; continue; }
        let ok = false; let lastErr;
        const sources = [it.url, ...await mirrorsFor(it.url)];
        const slow = new Map(); // source index -> bytes/sec, for the ones that crawled
        const allowedFailures = Math.max(RETRIES, sources.length);
        let src = 0; let failures = 0;
        while (!ok && failures < allowedFailures) {
          try {
            it.status = 'downloading';
            const part = await downloadPart(sources[src], dest, it, signal,
              { mirror: src > 0, mayDrop: sources.length > 1 && slow.size < sources.length });
            it.status = 'verifying';
            const sum = await sha256File(part, signal);
            if (sum !== it.sha256) {
              await fs.promises.unlink(part).catch(() => {});
              throw Object.assign(new Error('checksum mismatch — the download was corrupted'), { retryFromScratch: true });
            }
            await fs.promises.rename(part, dest);
            ok = true;
          } catch (err) {
            if (err.cancelled || signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
            if (err.slow) {
              // Try each source once; if they are all slow, stay on the best one.
              slow.set(src, err.rate);
              const untried = sources.findIndex((_, i) => !slow.has(i));
              src = untried >= 0 ? untried : [...slow].sort((a, b) => b[1] - a[1])[0][0];
              console.log(`[packs] ${it.id}: slow download, switching to ${new URL(sources[src]).host}`);
              continue;
            }
            lastErr = err;
            failures++;
            src = (src + 1) % sources.length;
            if (failures < allowedFailures) await sleep(Math.min(2000 * failures, 8000) * (opts.fastRetry ? 0.01 : 1));
          }
        }
        if (!ok) throw new Error(`${it.title}: ${lastErr?.message || 'download failed'}`);
        const size = fs.statSync(dest).size;
        it.status = 'done'; it.done = it.total = size;
        await pool.query(
          `INSERT INTO knowledge_files (source_id, rel_path, size_bytes) VALUES ($1,$2,$3)
             ON CONFLICT (source_id, rel_path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes`, [it.sourceRowId, it.path, size]);
        await pool.query(`UPDATE knowledge_sources SET size_bytes = $2, status = 'ready' WHERE id = $1`, [it.sourceRowId, size]);
        await vault.writeLibrary(); // each archive becomes readable the moment it is verified
      }
      const total = job.items.reduce((n, i) => n + (i.total || 0), 0);
      await pool.query(`UPDATE knowledge_vaults SET status = 'ready', size_bytes = $2, install_error = NULL WHERE id = $1`, [job.vaultId, total]);
      await vault.writeLibrary();
      job.status = 'done';
    } catch (err) {
      if (err.cancelled) { job.status = 'cancelled'; return; }
      job.status = 'failed';
      job.error = err.message || 'Install failed';
      console.warn(`[packs] ${job.packId} failed:`, job.error);
      await pool.query('UPDATE knowledge_vaults SET install_error = $2 WHERE id = $1', [job.vaultId, job.error]).catch(() => {});
    } finally {
      if (active === job) active = null;
    }
  }

  /** Items for a vault, from its DB rows + the catalog (so a resumed install needs no network lookups). */
  async function itemsForVault(vaultId, pack, resolved) {
    const rows = (await pool.query(
      `SELECT id, source_key, path, sha256, title FROM knowledge_sources WHERE vault_id = $1 ORDER BY source_key`, [vaultId])).rows;
    const byId = new Map(pack.items.map((i) => [i.id, i]));
    return rows.map((r) => {
      const cat = byId.get(r.source_key);
      if (!cat) throw new Error(`"${r.source_key}" is no longer in the catalog`);
      const filename = path.posix.basename(r.path);
      return {
        id: r.source_key, sourceRowId: r.id, title: r.title, path: r.path, sha256: r.sha256,
        url: `${base}/${cat.kiwix.dir}/${filename}`,
        total: resolved?.get(r.source_key)?.size || 0, done: 0, status: 'queued',
      };
    });
  }

  function startJob(pack, vaultId, items) {
    const job = { packId: pack.id, vaultId, status: 'running', error: '', startedAt: Date.now(), items, controller: new AbortController() };
    active = job;
    job.done = runJob(job);
    return job;
  }

  async function freeBytes() {
    try { const s = await statfs(zimDir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
  }

  // ── routes ────────────────────────────────────────────────────────────────

  const admin = express.Router();
  admin.use(authenticate, (req, res, next) => (isAdmin(req.user) ? next() : res.status(403).json({ error: 'Admin only' })));

  /** File names of every archive already readable on this hub, however it got there. */
  async function archivesOnHub() {
    const rows = (await pool.query(
      `SELECT s.path FROM knowledge_sources s JOIN knowledge_vaults v ON v.id = s.vault_id
        WHERE s.type = 'kiwix' AND s.status = 'ready' AND v.status = 'ready'`)).rows;
    return rows.map((r) => path.posix.basename(r.path));
  }

  /** True when every archive in the pack is already here (e.g. imported from a drive), any edition. */
  function alreadyHave(pack, files) {
    return pack.items.every((i) => {
      // "<name>_YYYY-MM[a].zim": compare the part before the date exactly.
      return files.some((f) => f.replace(/_\d{4}-\d{2}[a-z]?\.zim$/, '') === i.kiwix.name);
    });
  }

  async function packState(pack, v, resolved, files) {
    const vrow = v || null;
    let state = 'available';
    if (vrow?.status === 'ready' || alreadyHave(pack, files)) state = 'installed';
    else if (active?.packId === pack.id) state = active.status === 'running' ? 'installing' : 'failed';
    else if (vrow) state = vrow.install_error ? 'failed' : 'paused'; // partial download waiting to resume
    const items = pack.items.map((i) => {
      const r = resolved.get(i.id);
      const j = active?.packId === pack.id ? active.items.find((x) => x.id === i.id) : null;
      return {
        id: i.id, title: i.title, description: i.description, license: i.license,
        size: r?.size || null, version: r?.version || null,
        status: j?.status || (state === 'installed' ? 'done' : 'queued'),
        done: j?.done ?? 0, total: j?.total || r?.size || 0,
      };
    });
    return {
      id: pack.id, title: pack.title, description: pack.description, category: pack.category.label,
      items, totalBytes: items.every((i) => i.size) ? items.reduce((n, i) => n + i.size, 0) : null,
      state, vaultId: vrow?.id || null,
      error: state === 'failed' ? (active?.packId === pack.id ? active.error : vrow?.install_error) || '' : '',
    };
  }

  admin.get('/', async (req, res) => {
    try {
      const catalog = await loadCatalog();
      const vaults = (await pool.query(
        `SELECT id, pack_id, status, install_error FROM knowledge_vaults WHERE pack_id IS NOT NULL`)).rows;
      const resolved = new Map();
      let resolveError = '';
      if (req.query.resolve) {
        // Sizes + versions come from Kiwix itself; offline just means "can't show sizes / start".
        await Promise.all(catalog.packs.flatMap((p) => p.items).map(async (it) => {
          try { resolved.set(it.id, await resolveItem(it)); } catch (e) { resolveError = resolveError || e.message; }
        }));
      } else {
        for (const p of catalog.packs) for (const it of p.items) {
          const hit = resolveCache.get(`${it.kiwix.dir}/${it.kiwix.name}`);
          if (hit?.value) resolved.set(it.id, hit.value);
        }
      }
      const files = await archivesOnHub();
      const packs = [];
      for (const p of catalog.packs) packs.push(await packState(p, vaults.find((v) => v.pack_id === p.id), resolved, files));
      res.json({ packs, freeBytes: await freeBytes(), canInstall: !!zimDir, resolveError, busy: !!(active && active.status === 'running') });
    } catch (err) {
      console.warn('[packs] list failed:', err.message);
      res.status(500).json({ error: 'Failed to load packs' });
    }
  });

  admin.post('/:id/install', async (req, res) => {
    if (!zimDir) return res.status(501).json({ error: 'This hub has no knowledge folder mounted (KNOWLEDGE_DIR), so it cannot store archives yet.' });
    try {
      const catalog = await loadCatalog();
      const pack = catalog.packs.find((p) => p.id === req.params.id);
      if (!pack) return res.status(404).json({ error: 'Unknown pack' });
      if (active && active.status === 'running') return res.status(409).json({ error: 'Another pack is installing — wait for it to finish.' });

      const existing = (await pool.query(
        `SELECT id, status FROM knowledge_vaults WHERE pack_id = $1 ORDER BY (status = 'importing') DESC LIMIT 1`, [pack.id])).rows[0];
      if (existing?.status === 'ready' || alreadyHave(pack, await archivesOnHub())) return res.status(409).json({ error: `${pack.title} is already installed.` });

      // Look everything up first: offline or a missing archive fails here, before anything is created.
      const resolved = new Map();
      try {
        await Promise.all(pack.items.map(async (it) => resolved.set(it.id, await resolveItem(it))));
      } catch (err) {
        return res.status(502).json({ error: `Couldn't reach the Kiwix download servers: ${err.message}` });
      }

      // Space: what's left to download (minus what a resumed install already has) + headroom.
      let need = 0;
      for (const it of pack.items) {
        const r = resolved.get(it.id);
        let got = 0;
        if (existing) {
          const f = path.join(zimDir, vault.zimFile(existing.id, it.id));
          if (fs.existsSync(f)) got = r.size; else if (fs.existsSync(`${f}.part`)) got = fs.statSync(`${f}.part`).size;
        }
        need += Math.max(r.size - got, 0);
      }
      await fs.promises.mkdir(zimDir, { recursive: true });
      const free = await freeBytes();
      if (free !== null && free < need + DISK_HEADROOM_BYTES) {
        const gb = (n) => (n / 1024 ** 3).toFixed(1);
        return res.status(409).json({ error: `Not enough free space: ${pack.title} needs about ${gb(need)} GB (plus ${gb(DISK_HEADROOM_BYTES)} GB spare) and this hub has ${gb(free)} GB free.` });
      }

      let vaultId = existing?.id;
      if (!vaultId) {
        const manifest = {
          vaultVersion: 1, name: pack.title, createdAt: new Date().toISOString(),
          categories: [pack.category],
          sources: pack.items.map((it) => {
            const r = resolved.get(it.id);
            return { id: it.id, type: 'kiwix', category: pack.category.id, title: it.title, description: it.description,
              license: it.license, tags: it.tags, path: `${pack.category.id}/${r.filename}`, sha256: r.sha256 };
          }),
        };
        const v = validateManifest(manifest);
        if (!v.ok) return res.status(500).json({ error: 'Pack could not be turned into a vault', details: v.errors });
        const hash = crypto.createHash('sha256').update(JSON.stringify(v.manifest)).digest('hex');
        ({ vaultId } = await vault.createVaultRecord(v.manifest, hash, req.user.id, { packId: pack.id }));
      } else {
        await pool.query('UPDATE knowledge_vaults SET install_error = NULL WHERE id = $1', [vaultId]);
      }
      lastFailed.delete(pack.id);
      startJob(pack, vaultId, await itemsForVault(vaultId, pack, resolved));
      res.status(202).json({ started: true, vaultId });
    } catch (err) {
      console.warn('[packs] install failed to start:', err.message);
      res.status(500).json({ error: 'Failed to start the install' });
    }
  });

  admin.post('/:id/cancel', async (req, res) => {
    try {
      const row = (await pool.query(`SELECT id, status FROM knowledge_vaults WHERE pack_id = $1 AND status <> 'ready'`, [req.params.id])).rows[0];
      if (!row) return res.status(404).json({ error: 'Nothing to cancel' });
      if (active?.vaultId === row.id) { active.controller.abort(); await active.done; }
      await discardVault(row.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to cancel' });
    }
  });

  // Deleting a vault (Hub Management) while it is still downloading must stop the download first.
  vault.deleteHooks.push(async (vaultId) => {
    if (active?.vaultId === vaultId) { active.controller.abort(); await active.done; }
  });

  /** After a restart, carry on any install that was running (but not ones that failed and are waiting for a Retry). */
  async function resumeInterrupted() {
    if (active) return;
    const row = (await pool.query(
      `SELECT id, pack_id FROM knowledge_vaults WHERE pack_id IS NOT NULL AND status = 'importing' AND install_error IS NULL LIMIT 1`)).rows[0];
    if (!row) return;
    const pack = (await loadCatalog()).packs.find((p) => p.id === row.pack_id);
    if (!pack) return;
    console.log(`[packs] resuming interrupted install of ${pack.id}`);
    startJob(pack, row.id, await itemsForVault(row.id, pack, null));
  }

  async function init() { /* tables are created by knowledgeVault.init() */ }
  function start() {
    if (!zimDir) return;
    setTimeout(() => resumeInterrupted().catch((e) => console.warn('[packs] resume failed:', e.message)), opts.resumeDelayMs ?? 20000);
  }

  return {
    init, start, admin, resumeInterrupted,
    _internals: { loadCatalog, resolveItem, getActive: () => active },
  };
}

module.exports = { createKnowledgePacks, validateCatalog, isPrivateAddress, guardedLookup };
