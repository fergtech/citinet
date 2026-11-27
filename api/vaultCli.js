#!/usr/bin/env node
/**
 * citinet vault — build, check and import Knowledge Vaults from ANY folder or drive.
 *
 * Normally run through the hub helper (`./citinet.sh vault ...` / `.\citinet.ps1 vault ...`),
 * which starts this file inside the citinet-api image with the chosen folder mounted at /vault.
 * That is why it works for any USB stick, SSD, SD card or network share on any OS: Docker is
 * the only thing that has to see the drive, and the API container itself never needs to.
 *
 *   check  <dir> [--deep]            validate manifest.json and that every listed file is there
 *   init   <dir> [--name "..."]      build manifest.json from a folder laid out as
 *                                    <category>/<file.pdf|file.epub|file.zim|site-folder/index.html>
 *   create <dir> --packs a,b         download catalog packs (e.g. medical,repair,reference) into <dir>
 *   create <dir> --pack <url|file>   ...or a pack file (resumable, checksummed)
 *   import <dir> [--hub URL]         send the vault to the hub (admin login; resumable)
 *
 * Environment (import): CITINET_TOKEN, or CITINET_ADMIN_USER + CITINET_ADMIN_PASSWORD, or it
 * prompts. HUB_URL / --hub sets the hub address (default http://citinet-api:9090 inside compose).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { validateManifest, safeRelPath, ALLOWED_EXT } = require('./knowledgeVault');

const MANIFEST = 'manifest.json';
const CONCURRENCY = 4;
const RETRIES = 3;

// ── tiny helpers ──────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = (code, s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => c(31, s);
const green = (s) => c(32, s);
const yellow = (s) => c(33, s);
const dim = (s) => c(2, s);
const bold = (s) => c(1, s);
const say = (s = '') => console.log(s);
const fail = (msg, code = 1) => { console.error(red(`✗ ${msg}`)); process.exit(code); };

const fmtBytes = (n) => {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(0)} KB`;
  return `${n} B`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
const titleCase = (s) =>
  s.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** One line that rewrites itself on a terminal and degrades to plain lines in logs. */
function progress(text) {
  if (isTTY) process.stdout.write(`\r\x1b[2K${text}`);
}
const endProgress = () => { if (isTTY) process.stdout.write('\r\x1b[2K'); };

function sha256File(file, onBytes) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => { h.update(d); if (onBytes) onBytes(d.length); })
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * Resolve a vault-relative path to a real file inside root. Symlinks that leave the drive are
 * refused: a vault is plain data, and following links would let a crafted stick read the host.
 */
function resolveInside(root, rel) {
  const full = path.resolve(root, rel);
  let real;
  try { real = fs.realpathSync(full); } catch { return null; }
  const rootReal = fs.realpathSync(root);
  // A drive root ("D:\", "/") already ends in a separator.
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (real !== rootReal && !real.startsWith(prefix)) return null;
  return real;
}

/** All importable files under a folder, as vault-relative POSIX paths. Skips links + hidden files. */
function walk(root, relDir, out = [], skipped = []) {
  const dirReal = resolveInside(root, relDir);
  if (!dirReal) return { files: out, skipped };
  for (const ent of fs.readdirSync(dirReal, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const rel = `${relDir}/${ent.name}`;
    if (ent.isSymbolicLink()) { skipped.push(`${rel} (symbolic link)`); continue; }
    if (ent.isDirectory()) { walk(root, rel, out, skipped); continue; }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).slice(1).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) { skipped.push(`${rel} (.${ext || 'none'} not allowed)`); continue; }
    out.push(rel);
  }
  return { files: out, skipped };
}

function readManifest(dir) {
  const file = path.join(dir, MANIFEST);
  if (!fs.existsSync(file)) fail(`No ${MANIFEST} in ${dir}. Is this a Citinet vault? (To make one from a folder of files: citinet vault init)`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { fail(`${MANIFEST} is not valid JSON: ${e.message}`); }
  const v = validateManifest(raw);
  if (!v.ok) {
    say(red(`✗ ${MANIFEST} has problems:`));
    v.errors.forEach((e) => say(`    - ${e}`));
    process.exit(1);
  }
  return v.manifest;
}

/** The files a source is made of, with sizes; also reports sources whose files are missing. */
function expandSources(dir, manifest) {
  const missing = [];
  const skipped = [];
  const plan = manifest.sources.map((s) => {
    if (s.type === 'html') {
      const folder = resolveInside(dir, s.path);
      if (!folder || !fs.statSync(folder).isDirectory()) { missing.push(`${s.id}: folder ${s.path} not found`); return { source: s, files: [] }; }
      const { files, skipped: sk } = walk(dir, s.path);
      skipped.push(...sk);
      if (!files.includes(`${s.path}/${s.entry}`)) missing.push(`${s.id}: entry page ${s.path}/${s.entry} not found`);
      return { source: s, files: files.map((rel) => ({ rel, size: fs.statSync(resolveInside(dir, rel)).size })) };
    }
    const real = resolveInside(dir, s.path);
    if (!real || !fs.statSync(real).isFile()) { missing.push(`${s.id}: file ${s.path} not found`); return { source: s, files: [] }; }
    return { source: s, files: [{ rel: s.path, size: fs.statSync(real).size }] };
  });
  return { plan, missing, skipped };
}

// ── args ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['deep', 'yes', 'help'].includes(key)) flags[key] = true;
      else flags[key] = argv[++i];
    } else pos.push(a);
  }
  return { pos, flags };
}

// ── check ─────────────────────────────────────────────────────────────────────

async function cmdCheck(dir, flags) {
  const manifest = readManifest(dir);
  const { plan, missing, skipped } = expandSources(dir, manifest);
  let total = 0;
  say(bold(`${manifest.name}`));
  for (const cat of manifest.categories) {
    const items = plan.filter((p) => p.source.category === cat.id);
    if (!items.length) continue;
    say(`\n  ${cat.label}`);
    for (const p of items) {
      const size = p.files.reduce((a, f) => a + f.size, 0);
      total += size;
      const mark = p.files.length ? green('ok') : red('x');
      say(`    ${mark} ${p.source.title} ${dim(`(${p.source.type}, ${fmtBytes(size)}${p.files.length > 1 ? `, ${p.files.length} files` : ''})`)}`);
    }
  }
  say(`\n  ${plan.length} sources · ${fmtBytes(total)}`);
  skipped.slice(0, 8).forEach((s) => say(yellow(`  ! will skip ${s}`)));
  if (skipped.length > 8) say(yellow(`  ! ...and ${skipped.length - 8} more skipped files`));

  let bad = missing.length;
  missing.forEach((m) => say(red(`  ✗ ${m}`)));

  if (flags.deep) {
    say('\nVerifying checksums (this reads every file once)...');
    let done = 0;
    const want = plan.reduce((a, p) => a + (p.source.sha256 && p.source.type !== 'html' ? p.files[0]?.size || 0 : 0), 0);
    for (const p of plan) {
      if (!p.source.sha256 || p.source.type === 'html' || !p.files[0]) continue;
      const got = await sha256File(resolveInside(dir, p.files[0].rel), (n) => { done += n; progress(`  ${p.source.title}  ${Math.floor((done / Math.max(want, 1)) * 100)}%`); });
      endProgress();
      if (got !== p.source.sha256) { bad++; say(red(`  ✗ ${p.source.title}: checksum does not match — the file is damaged or was changed`)); }
      else say(green(`  ok ${p.source.title}`));
    }
  } else {
    say(dim('  (add --deep to also verify every file against its checksum)'));
  }
  if (bad) fail(`${bad} problem${bad === 1 ? '' : 's'} found.`);
  say(green('\n✓ Vault looks good.'));
}

// ── init ──────────────────────────────────────────────────────────────────────

async function cmdInit(dir, flags) {
  const root = fs.realpathSync(dir);
  const name = flags.name || path.basename(root).replace(/[_-]+/g, ' ') || 'Knowledge Vault';
  const categories = [];
  const sources = [];
  const usedIds = new Set();
  const uid = (base) => {
    let id = base.slice(0, 56); let n = 2;
    while (usedIds.has(id)) id = `${base.slice(0, 52)}-${n++}`;
    usedIds.add(id); return id;
  };
  const skipped = [];

  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !['metadata', 'system volume information', '$recycle.bin'].includes(e.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const catDir of entries) {
    const catId = slugify(catDir.name);
    const found = [];
    for (const ent of fs.readdirSync(path.join(root, catDir.name), { withFileTypes: true })) {
      if (ent.name.startsWith('.') || ent.isSymbolicLink()) continue;
      const rel = `${catDir.name}/${ent.name}`;
      const ext = path.extname(ent.name).slice(1).toLowerCase();
      if (ent.isFile() && ['pdf', 'epub', 'zim'].includes(ext)) {
        found.push({ kind: 'file', ent, rel, ext });
      } else if (ent.isDirectory()) {
        const entry = ['index.html', 'index.htm'].find((n) => fs.existsSync(path.join(root, rel, n)));
        if (entry) found.push({ kind: 'site', ent, rel, entry });
        else skipped.push(`${rel}/ (no index.html — not a website folder)`);
      } else if (ent.isFile()) skipped.push(`${rel} (unsupported file type)`);
    }
    if (!found.length) continue;
    categories.push({ id: catId, label: titleCase(catDir.name) });
    for (const f of found.sort((a, b) => a.ent.name.localeCompare(b.ent.name))) {
      const base = `${catId}-${slugify(f.ent.name)}`;
      if (f.kind === 'site') {
        sources.push({ id: uid(base), type: 'html', category: catId, title: titleCase(f.ent.name), path: f.rel, entry: f.entry });
      } else {
        const size = fs.statSync(path.join(root, f.rel)).size;
        let done = 0;
        const sha = await sha256File(path.join(root, f.rel), (n) => { done += n; progress(`  fingerprinting ${f.ent.name}  ${Math.floor((done / Math.max(size, 1)) * 100)}%`); });
        endProgress();
        sources.push({ id: uid(base), type: f.ext === 'zim' ? 'kiwix' : f.ext, category: catId, title: titleCase(f.ent.name), path: f.rel, sha256: sha });
      }
    }
  }

  if (!sources.length) fail('Nothing to add. Put files in category folders first, e.g.  medical/first-aid.pdf  repair/ifixit.zim  survival/guide/index.html');
  const manifest = { vaultVersion: 1, name, createdAt: new Date().toISOString(), categories, sources };
  const v = validateManifest(manifest);
  if (!v.ok) fail(`Could not build a valid manifest:\n  - ${v.errors.join('\n  - ')}`);
  fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  say(green(`✓ Wrote ${MANIFEST}: ${categories.length} categories, ${sources.length} sources.`));
  skipped.slice(0, 8).forEach((s) => say(yellow(`  ! skipped ${s}`)));
  say(dim('  Edit titles/descriptions in manifest.json if you like, then: citinet vault check'));
}

// ── network helpers ───────────────────────────────────────────────────────────

const agentFor = (u) => (u.protocol === 'https:' ? new https.Agent({ keepAlive: true, maxSockets: CONCURRENCY + 2 }) : new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY + 2 }));

/** JSON request. Resolves { status, body }. */
function jsonRequest(hub, method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, hub.url);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method, agent: hub.agent,
      headers: { ...(token ? { Authorization: token } : {}), ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) },
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text.slice(0, 200) }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Stream one local file to the hub. Resolves { status, body }. */
function uploadFile(hub, token, vaultId, sourceKey, rel, file, size, onBytes) {
  return new Promise((resolve, reject) => {
    const u = new URL(`/api/admin/knowledge/vaults/${vaultId}/files?source=${encodeURIComponent(sourceKey)}&path=${encodeURIComponent(rel)}`, hub.url);
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method: 'PUT', agent: hub.agent,
      headers: { Authorization: token, 'Content-Type': 'application/octet-stream', 'Content-Length': size },
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* keep {} */ }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    const rs = fs.createReadStream(file);
    rs.on('data', (d) => onBytes(d.length));
    rs.on('error', (e) => { req.destroy(); reject(e); });
    rs.pipe(req);
  });
}

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      for (const k of ch) {
        if (k === '\r' || k === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); return resolve(buf); }
        if (k === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (k === '\u007f' || k === '\b') buf = buf.slice(0, -1); else buf += k;
      }
    };
    stdin.on('data', onData);
  });
}

function promptLine(question) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

async function login(hub) {
  if (process.env.CITINET_TOKEN) return { token: process.env.CITINET_TOKEN, loggedIn: false };
  let user = process.env.CITINET_ADMIN_USER;
  let pass = process.env.CITINET_ADMIN_PASSWORD;
  if (!user || !pass) {
    if (!process.stdin.isTTY) fail('Need an admin login. Run this in a terminal, or set CITINET_ADMIN_USER and CITINET_ADMIN_PASSWORD.');
    say(dim('Sign in with a hub ADMIN account (the same login you use in the app).'));
    user = user || (await promptLine('  Username: '));
    pass = pass || (await promptHidden('  Password: '));
  }
  const r = await jsonRequest(hub, 'POST', '/api/auth/login', { body: { username: user, password: pass } });
  if (r.status !== 200 || !r.body.token) fail(r.body.error || `Login failed (HTTP ${r.status})`);
  if (!r.body.isAdmin && r.body.role !== 'admin') fail('That account is not a hub admin.');
  return { token: r.body.token, loggedIn: true };
}

// ── import ────────────────────────────────────────────────────────────────────

async function cmdImport(dir, flags) {
  const manifest = readManifest(dir);
  const { plan, missing, skipped } = expandSources(dir, manifest);
  if (missing.length) { missing.forEach((m) => say(red(`  ✗ ${m}`))); fail('The drive is missing files the vault lists. Run: citinet vault check'); }
  const totalBytes = plan.reduce((a, p) => a + p.files.reduce((x, f) => x + f.size, 0), 0);
  const fileCount = plan.reduce((a, p) => a + p.files.length, 0);
  say(bold(manifest.name));
  say(`  ${plan.length} sources · ${fileCount} files · ${fmtBytes(totalBytes)}`);
  skipped.slice(0, 5).forEach((s) => say(yellow(`  ! will skip ${s}`)));

  const url = flags.hub || process.env.HUB_URL || 'http://citinet-api:9090';
  const hub = { url, agent: agentFor(new URL(url)) };
  const health = await jsonRequest(hub, 'GET', '/health').catch((e) => fail(`Can't reach the hub at ${url}: ${e.message}`));
  if (health.status >= 500) fail(`The hub at ${url} isn't healthy (HTTP ${health.status}).`);

  const { token, loggedIn } = await login(hub);
  const started = await jsonRequest(hub, 'POST', '/api/admin/knowledge/vaults', { token, body: { manifest } });
  if (started.status === 409) { say(green(`✓ This vault is already imported on this hub.`)); return finish(hub, token, loggedIn); }
  if (started.status === 404) fail('This hub does not have the Knowledge Vault feature yet. Update it first: ./citinet.sh update api');
  if (started.status === 401 || started.status === 403) fail(started.body.error || 'Not allowed — admin login required.');
  if (started.status !== 200) fail(`Hub refused the vault (HTTP ${started.status}): ${started.body.error || ''} ${(started.body.details || []).join('; ')}`);

  const vaultId = started.body.vaultId;
  const have = new Map((started.body.done || []).map((d) => [`${d.source}\n${d.path}`, d.size]));
  if (started.body.resumed) say(yellow(`  Resuming an earlier import (${have.size} files already on the hub).`));

  const queue = [];
  let doneBytes = 0;
  for (const p of plan) for (const f of p.files) {
    if (have.get(`${p.source.id}\n${f.rel}`) === f.size) { doneBytes += f.size; continue; }
    queue.push({ src: p.source, ...f });
  }
  const t0 = Date.now();
  let finished = 0;
  let current = '';
  const errors = [];
  const tick = () => {
    const secs = Math.max((Date.now() - t0) / 1000, 1);
    progress(`  ${Math.floor((doneBytes / Math.max(totalBytes, 1)) * 100)}%  ${fmtBytes(doneBytes)} / ${fmtBytes(totalBytes)}  ${dim(`${fmtBytes((doneBytes) / secs)}/s`)}  ${dim(current.slice(-48))}`);
  };
  const timer = setInterval(tick, 400);

  async function worker() {
    while (queue.length && !errors.length) {
      const job = queue.shift();
      current = job.rel;
      const real = resolveInside(dir, job.rel);
      let attempt = 0;
      for (;;) {
        attempt++;
        let sent = 0;
        try {
          const r = await uploadFile(hub, token, vaultId, job.src.id, job.rel, real, job.size, (n) => { sent += n; doneBytes += n; });
          if (r.status === 200) { finished++; break; }
          doneBytes -= sent;
          // 4xx are final (bad file, checksum mismatch, not allowed) — retrying can't fix them.
          if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) { errors.push(`${job.rel}: ${r.body.error || `HTTP ${r.status}`}`); break; }
          throw new Error(r.body.error || `HTTP ${r.status}`);
        } catch (e) {
          doneBytes -= sent;
          if (attempt >= RETRIES) { errors.push(`${job.rel}: ${e.message}`); break; }
          await sleep(1000 * attempt);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(queue.length, 1)) }, worker));
  clearInterval(timer);
  endProgress();

  if (errors.length) {
    errors.slice(0, 5).forEach((e) => say(red(`  ✗ ${e}`)));
    say(yellow('\nImport stopped. Nothing is lost — run the same command again and it will pick up where it left off.'));
    process.exit(1);
  }
  const fin = await jsonRequest(hub, 'POST', `/api/admin/knowledge/vaults/${vaultId}/finish`, { token });
  if (fin.status !== 200) fail(`Could not finish the import: ${fin.body.error || fin.status}${fin.body.missing ? ` (incomplete: ${fin.body.missing.join(', ')})` : ''}`);
  say(green(`✓ Imported ${manifest.name}: ${plan.length} sources, ${fmtBytes(fin.body.totalBytes)}. It's now in the Library for everyone on this hub.`));
  return finish(hub, token, loggedIn);
}

async function finish(hub, token, loggedIn) {
  if (loggedIn) await jsonRequest(hub, 'POST', '/api/auth/logout', { token }).catch(() => {});
}

// ── create (download a pack) ──────────────────────────────────────────────────

/** GET with redirects and resume. Writes to `${dest}.part`, then renames on success. */
function download(urlStr, dest, expectedSize, onBytes, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'));
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('only http(s) downloads are allowed'));
    const part = `${dest}.part`;
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    const req = (u.protocol === 'https:' ? https : http).get(u, { headers: have ? { Range: `bytes=${have}-` } : {} }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, u).toString(), dest, expectedSize, onBytes, redirects + 1));
      }
      if (res.statusCode === 416) { res.resume(); fs.renameSync(part, dest); return resolve(); }
      if (![200, 206].includes(res.statusCode)) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const resumed = res.statusCode === 206;
      if (!resumed && have) fs.truncateSync(part, 0);
      if (resumed) onBytes(have);
      const out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      res.on('data', (d) => onBytes(d.length));
      res.pipe(out);
      out.on('finish', () => { fs.renameSync(part, dest); resolve(); });
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function getText(urlStr, maxBytes = 8 * 1024 * 1024, redirects = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('only http(s) is allowed'));
    const req = (u.protocol === 'https:' ? https : http).get(u, { timeout: 15000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume();
        return resolve(getText(new URL(res.headers.location, u).toString(), maxBytes, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`)); }
      const chunks = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > maxBytes) res.destroy(new Error('response too large')); else chunks.push(d); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

async function loadPack(spec) {
  const text = /^https?:\/\//i.test(spec) ? await getText(spec) : fs.readFileSync(spec, 'utf8');
  return JSON.parse(text.replace(/^﻿/, ''));
}

// ── the shared pack catalog (the same one the hub's "Get content" button uses) ──

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/fergtech/citinet-registry/main/packs.json';
const KIWIX_BASE = process.env.KIWIX_BASE || 'https://download.kiwix.org/zim';

/** The registry's packs.json if reachable and valid, else the catalog bundled with this image. */
async function loadCatalog(flags) {
  const { validateCatalog } = require('./knowledgePacks');
  const spec = flags.catalog || process.env.PACK_CATALOG_URL || DEFAULT_CATALOG_URL;
  try {
    const v = validateCatalog(await loadPack(spec));
    if (v.ok) return { catalog: v.catalog, from: spec };
    say(yellow(`  ! ${spec} is not a valid catalog (${v.errors[0]}); using the built-in one`));
  } catch (e) {
    if (flags.catalog) fail(`Could not read the catalog ${flags.catalog}: ${e.message}`);
    // no registry file yet, or offline: the built-in catalog is fine
  }
  return { catalog: validateCatalog(require('./packCatalog')).catalog, from: 'built-in' };
}

/** "medical" finds "medical-essentials" (unique id prefix, or its category id). */
function pickPacks(catalog, wanted) {
  const out = [];
  for (const w of wanted) {
    const key = w.trim().toLowerCase();
    if (!key) continue;
    const exact = catalog.packs.filter((p) => p.id === key || p.category.id === key);
    const hits = exact.length ? exact : catalog.packs.filter((p) => p.id.startsWith(key));
    if (hits.length !== 1) {
      const names = catalog.packs.map((p) => `${p.id}`).join(', ');
      fail(`${hits.length ? 'Ambiguous' : 'Unknown'} pack "${w}". Available: ${names}`);
    }
    if (!out.includes(hits[0])) out.push(hits[0]);
  }
  return out;
}

/** Kiwix archive name -> newest file, its published checksum and size. */
async function resolveKiwix(item) {
  const listing = await getText(`${KIWIX_BASE}/${item.kiwix.dir}/`);
  const esc = item.kiwix.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`href="(${esc}_(\\d{4}-\\d{2}[a-z]?)\\.zim)"`, 'g');
  let best = null; let m;
  while ((m = re.exec(listing))) if (!best || m[2] > best.version) best = { filename: m[1], version: m[2] };
  if (!best) throw new Error(`"${item.kiwix.name}" was not found on the Kiwix download server`);
  const url = `${KIWIX_BASE}/${item.kiwix.dir}/${best.filename}`;
  const sha256 = (await getText(`${url}.sha256`, 4096)).trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`no valid checksum published for ${best.filename}`);
  return { ...best, url, sha256 };
}

/** Turn catalog packs into the same {categories, sources} shape `--pack` files use. */
async function packFromCatalog(ids, flags) {
  const { catalog, from } = await loadCatalog(flags);
  const picked = pickPacks(catalog, ids);
  if (!picked.length) fail(`Say which packs to download. Available: ${catalog.packs.map((p) => p.id).join(', ')}`);
  say(dim(`  catalog: ${from}`));
  const pack = { name: picked.length === 1 ? picked[0].title : 'Citinet Knowledge Vault', categories: [], sources: [] };
  for (const p of picked) {
    pack.categories.push(p.category);
    for (const it of p.items) {
      let r;
      try { r = await resolveKiwix(it); } catch (e) { fail(`${it.title}: ${e.message}. Check this computer's internet connection.`); }
      pack.sources.push({
        id: it.id, type: 'kiwix', category: p.category.id, title: it.title, description: it.description,
        license: it.license, tags: it.tags, url: r.url, path: `${p.category.id}/${r.filename}`, sha256: r.sha256,
      });
    }
  }
  return pack;
}

async function cmdCreate(dir, flags) {
  if (!flags.pack && !flags.packs) {
    fail('Say what to download:  citinet vault create <folder> --packs medical,repair   (or --pack <url or file>)');
  }
  let pack;
  try { pack = flags.packs ? await packFromCatalog(String(flags.packs).split(','), flags) : await loadPack(flags.pack); }
  catch (e) { fail(`Could not read the pack: ${e.message}`); }
  const root = fs.realpathSync(dir);
  const merged = fs.existsSync(path.join(root, MANIFEST)) ? JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8').replace(/^﻿/, '')) : null;
  const manifest = {
    vaultVersion: 1,
    name: flags.name || merged?.name || pack.name || 'Knowledge Vault',
    createdAt: new Date().toISOString(),
    categories: [...(merged?.categories || [])],
    sources: [...(merged?.sources || [])],
  };
  for (const cat of pack.categories || []) if (!manifest.categories.some((x) => x.id === cat.id)) manifest.categories.push(cat);

  // Every pack source is re-checked against the drive: present+matching = skipped, missing/damaged = fetched again.
  const packSources = pack.sources || [];
  for (const s of packSources) {
    if (!s.url) fail(`Pack source "${s.id}" has no url.`);
    if (s.type === 'html') fail(`Pack source "${s.id}": website sources can't be downloaded yet — put the site in a folder and use "citinet vault init".`);
  }
  say(bold(manifest.name));
  say(`  ${packSources.length} items in this pack${merged ? ` (drive already lists ${merged.sources.length})` : ''}\n`);

  let n = 0;
  for (const s of packSources) {
    n++;
    const rel = safeRelPath(s.path);
    if (!rel) fail(`Pack source "${s.id}" has an unsafe path.`);
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const label = `[${n}/${packSources.length}] ${s.title}`;
    let ok = false;
    // Already downloaded and matching? Skip — this is what makes create resumable.
    if (fs.existsSync(dest) && s.sha256) {
      progress(`  ${label}  checking existing copy...`);
      ok = (await sha256File(dest)) === s.sha256;
      endProgress();
      if (ok) say(`  ${green('ok')} ${label} ${dim('(already here)')}`);
    }
    for (let attempt = 1; !ok && attempt <= RETRIES; attempt++) {
      let got = 0;
      try {
        await download(s.url, dest, s.size, (b) => { got += b; progress(`  ${label}  ${fmtBytes(got)}${s.size ? ` / ${fmtBytes(s.size)}` : ''}`); });
        endProgress();
        const sha = await sha256File(dest);
        if (s.sha256 && sha !== s.sha256) { fs.unlinkSync(dest); throw new Error('checksum mismatch'); }
        s.sha256 = s.sha256 || sha;
        ok = true;
        say(`  ${green('ok')} ${label} ${dim(fmtBytes(fs.statSync(dest).size))}`);
      } catch (e) {
        endProgress();
        if (attempt >= RETRIES) fail(`${s.title}: ${e.message}. Run the same command again to retry — finished items are kept.`);
        await sleep(1500 * attempt);
      }
    }
    const entry = {
      id: s.id, type: s.type, category: s.category, title: s.title, description: s.description || '',
      license: s.license || '', tags: s.tags || [], path: rel, sha256: s.sha256,
    };
    const at = manifest.sources.findIndex((x) => x.id === s.id);
    if (at >= 0) manifest.sources[at] = entry; else manifest.sources.push(entry);
    fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n'); // survives a cut
  }
  const v = validateManifest(manifest);
  if (!v.ok) fail(`The pack produced an invalid manifest:\n  - ${v.errors.join('\n  - ')}`);
  say(green(`\n✓ Vault ready on ${root}. Move it to any hub and run: citinet vault import`));
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, dir] = pos;
  if (!cmd || flags.help || !['check', 'init', 'create', 'import'].includes(cmd)) {
    say(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 18).map((l) => l.replace(/^ ?\* ?/, '')).join('\n'));
    process.exit(cmd && !flags.help ? 1 : 0);
  }
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`Folder not found: ${dir || '(none given)'}`);
  if (cmd === 'check') return cmdCheck(dir, flags);
  if (cmd === 'init') return cmdInit(dir, flags);
  if (cmd === 'create') return cmdCreate(dir, flags);
  return cmdImport(dir, flags);
}

if (require.main === module) {
  // Exit explicitly: the keep-alive connections to the hub would otherwise hold the process open.
  main().then(() => process.exit(0), (e) => fail(e && e.message ? e.message : String(e)));
}

module.exports = { parseArgs, walk, resolveInside, expandSources };
