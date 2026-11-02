/**
 * Hub-hosted apps — a hub admin uploads a built static web app (a zip of a Vite/React
 * `dist/`) and the hub serves it publicly at /apps/<slug>/. Files live in the hub's own
 * MinIO bucket under hub-apps/<slug>/v<N>/..., so there is nothing new to mount or back up
 * beyond what the hub already stores.
 *
 * v1 is deliberately admin-only: served apps share the hub's origin, so a member-uploaded
 * app could read the hub UI's localStorage (session + E2E keys). Opening uploads to members
 * is gated on serving apps from their own origin (see serveApp() — it only needs a slug and
 * a path, so a Host-header router can reuse it unchanged).
 *
 *   Admin  PUT    /api/admin/hub-apps/:slug/upload?name=&description=   (raw zip body)
 *          GET    /api/admin/hub-apps
 *          PATCH  /api/admin/hub-apps/:slug        { name?, description?, status? }
 *          POST   /api/admin/hub-apps/:slug/rollback { version }
 *          DELETE /api/admin/hub-apps/:slug
 *   Member GET    /api/hub-apps                      published apps, for listings
 *   Public GET    /apps/<slug>/...                   the app itself (no auth)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');
const { postJson } = require('./httpsPostJson');

// Public addresses (<app>.citinet.io) come from the central cert broker + the edge Worker in
// edge/apps-worker. A hub only needs its existing HUB_SLUG / HUB_CERT_SECRET and a public TUNNEL_URL.
const BROKER_URL = process.env.CERT_BROKER_URL || 'https://citinet.cloud/api/cert-broker';
const APPS_DOMAIN = process.env.APPS_PUBLIC_DOMAIN || 'citinet.io';
const RESYNC_MS = 6 * 60 * 60 * 1000;

const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const KEEP_VERSIONS = 3;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
// Slugs that would collide with hub routes or look official once host-based serving lands.
const RESERVED_SLUGS = new Set([
  'api', 'admin', 'www', 'apps', 'app', 'hub', 'assets', 'static', 'mail', 'cdn', 'status', 'help',
  'support', 'login', 'signup', 'citinet',
]);

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  pdf: 'application/pdf', wasm: 'application/wasm',
};

function mimeFor(name) {
  const ext = path.posix.extname(name).slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function isAdmin(user) {
  return !!user && (user.is_admin === true || user.role === 'admin');
}

/** Normalise a zip entry / request path to a safe relative POSIX path, or null if it escapes. */
function safeRelPath(raw) {
  if (typeof raw !== 'string' || raw.includes('\0')) return null;
  const norm = path.posix.normalize(raw.replace(/\\/g, '/'));
  if (norm.startsWith('/') || norm === '..' || norm.startsWith('../')) return null;
  return norm === '.' ? '' : norm;
}

/** True when this hub can claim public addresses at all (older / local-only hubs can't). */
function edgeEnabled() {
  return !!(process.env.HUB_SLUG && process.env.HUB_CERT_SECRET && /^https:\/\//i.test(process.env.TUNNEL_URL || ''));
}

/** Ask the broker to claim/refresh (sync-app) or free (release-app) <app>.<APPS_DOMAIN>. Never throws. */
async function brokerApp(op, app) {
  try {
    const res = await postJson(BROKER_URL, {
      op, slug: process.env.HUB_SLUG, secret: process.env.HUB_CERT_SECRET, app, origin: process.env.TUNNEL_URL,
    });
    return { ok: res.ok, status: res.status, error: res.body?.error || '' };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

function createHubApps({ pool, authenticate, express, getMinio, bucket }) {
  // slug -> { version, status, at } — keeps the hot serve path off Postgres.
  const slugCache = new Map();
  const CACHE_MS = 10 * 1000;
  const invalidate = (slug) => (slug ? slugCache.delete(slug) : slugCache.clear());

  const keyFor = (slug, version, rel) => `hub-apps/${slug}/v${version}/${rel}`;

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_apps (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug            TEXT UNIQUE NOT NULL,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        owner_id        UUID,
        current_version INTEGER,
        status          TEXT NOT NULL DEFAULT 'published',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE hub_apps ADD COLUMN IF NOT EXISTS public_synced_at TIMESTAMPTZ`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_app_versions (
        app_id      UUID NOT NULL REFERENCES hub_apps(id) ON DELETE CASCADE,
        version     INTEGER NOT NULL,
        file_count  INTEGER NOT NULL,
        total_bytes BIGINT NOT NULL,
        created_by  UUID,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (app_id, version)
      )
    `);
  }

  // ── Zip handling ────────────────────────────────────────────────────────────

  /** Stream the request body to a temp file, enforcing the zip size cap. */
  function receiveBody(req, tmpPath) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(tmpPath);
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_ZIP_BYTES) {
          req.unpipe(out);
          out.destroy();
          const err = new Error(`Zip is larger than ${MAX_ZIP_BYTES / 1024 / 1024} MB`);
          err.status = 413;
          reject(err);
        }
      });
      req.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => resolve(size));
      req.pipe(out);
    });
  }

  function openZip(file) {
    return new Promise((resolve, reject) => {
      yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) =>
        err ? reject(err) : resolve(zip),
      );
    });
  }

  /** Read every entry header; validate names/limits; work out any wrapper folder to strip. */
  async function inspectZip(file) {
    const zip = await openZip(file);
    try {
      const entries = [];
      let declared = 0;
      await new Promise((resolve, reject) => {
        zip.on('error', reject);
        zip.on('end', resolve);
        zip.on('entry', (e) => {
          if (e.fileName.endsWith('/')) return zip.readEntry(); // directory
          if (e.fileName.startsWith('__MACOSX/') || path.posix.basename(e.fileName) === '.DS_Store') {
            return zip.readEntry();
          }
          const rel = safeRelPath(e.fileName);
          if (!rel) return reject(Object.assign(new Error(`Unsafe path in zip: ${e.fileName}`), { status: 400 }));
          // Unix mode lives in the high 16 bits of externalFileAttributes; 0o120000 = symlink.
          if (((e.externalFileAttributes >>> 16) & 0o170000) === 0o120000) {
            return reject(Object.assign(new Error(`Symlinks are not allowed: ${e.fileName}`), { status: 400 }));
          }
          if (e.uncompressedSize > MAX_FILE_BYTES) {
            return reject(Object.assign(new Error(`${rel} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`), { status: 400 }));
          }
          declared += e.uncompressedSize;
          if (entries.length + 1 > MAX_FILES) {
            return reject(Object.assign(new Error(`Too many files (max ${MAX_FILES})`), { status: 400 }));
          }
          if (declared > MAX_TOTAL_BYTES) {
            return reject(Object.assign(new Error(`Unpacked size exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB`), { status: 400 }));
          }
          entries.push({ rel, entry: e });
          zip.readEntry();
        });
        zip.readEntry();
      });

      // Strip a single wrapper folder (e.g. zipping the dist folder itself, not its contents).
      let prefix = '';
      if (entries.length && !entries.some((x) => x.rel === 'index.html')) {
        const tops = new Set(entries.map((x) => x.rel.split('/')[0]));
        if (tops.size === 1 && entries.every((x) => x.rel.includes('/'))) prefix = `${[...tops][0]}/`;
      }
      const files = entries.map((x) => ({ ...x, rel: prefix ? x.rel.slice(prefix.length) : x.rel }));
      if (!files.some((f) => f.rel === 'index.html')) {
        throw Object.assign(new Error('The zip must contain an index.html at its top level (zip the contents of dist/).'), { status: 400 });
      }
      return { zip, files };
    } catch (err) {
      zip.close();
      throw err;
    }
  }

  function openEntryStream(zip, entry) {
    return new Promise((resolve, reject) =>
      zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))),
    );
  }

  /** Upload one zip entry to MinIO, enforcing the per-file cap on real (not declared) bytes. */
  async function putEntry(minio, zip, entry, key, rel, counter) {
    const stream = await openEntryStream(zip, entry);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      counter.total += chunk.length;
      if (size > MAX_FILE_BYTES || counter.total > MAX_TOTAL_BYTES) {
        stream.destroy();
        throw Object.assign(new Error(`${rel} exceeds the size limits once unpacked`), { status: 400 });
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    await minio.putObject(bucket, key, body, body.length, { 'Content-Type': mimeFor(rel) });
    return body;
  }

  async function removePrefix(minio, prefix) {
    const keys = [];
    await new Promise((resolve, reject) => {
      const s = minio.listObjectsV2(bucket, prefix, true);
      s.on('data', (o) => o.name && keys.push(o.name));
      s.on('end', resolve);
      s.on('error', reject);
    });
    if (keys.length) await minio.removeObjects(bucket, keys);
  }

  async function pruneVersions(minio, appId, slug) {
    const { rows } = await pool.query(
      `SELECT version FROM hub_app_versions WHERE app_id = $1 ORDER BY version DESC OFFSET $2`,
      [appId, KEEP_VERSIONS],
    );
    for (const { version } of rows) {
      await removePrefix(minio, `hub-apps/${slug}/v${version}/`).catch(() => {});
      await pool.query(`DELETE FROM hub_app_versions WHERE app_id = $1 AND version = $2`, [appId, version]);
    }
  }

  // ── Admin routes ────────────────────────────────────────────────────────────

  const admin = express.Router();
  admin.use(authenticate, (req, res, next) =>
    isAdmin(req.user) ? next() : res.status(403).json({ error: 'Admin access required' }),
  );

  admin.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT a.slug, a.name, a.description, a.status, a.current_version, a.updated_at, a.public_synced_at,
               COALESCE((SELECT json_agg(json_build_object(
                           'version', v.version, 'fileCount', v.file_count,
                           'totalBytes', v.total_bytes, 'createdAt', v.created_at)
                         ORDER BY v.version DESC)
                         FROM hub_app_versions v WHERE v.app_id = a.id), '[]') AS versions
          FROM hub_apps a ORDER BY a.created_at DESC`);
      res.json(rows.map((r) => ({
        slug: r.slug, name: r.name, description: r.description, status: r.status,
        currentVersion: r.current_version, updatedAt: r.updated_at, versions: r.versions,
        path: `/apps/${r.slug}/`,
        publicUrl: r.public_synced_at ? `https://${r.slug}.${APPS_DOMAIN}` : null,
      })));
    } catch {
      res.status(500).json({ error: 'Failed to list apps' });
    }
  });

  admin.put('/:slug/upload', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
      return res.status(400).json({
        error: 'Slug must be 1-40 lowercase letters, digits or hyphens (not starting/ending with a hyphen) and not a reserved word',
      });
    }
    const minio = getMinio();
    if (!minio) return res.status(503).json({ error: 'File storage is not configured' });

    const name = String(req.query.name || slug).trim().slice(0, 80) || slug;
    const description = String(req.query.description || '').trim().slice(0, 300);

    // Public address (<slug>.citinet.io): claim it up front so a taken name fails before a big upload,
    // not after. Any other broker trouble never blocks publishing — the app is still live at /apps/<slug>/
    // and syncAll() keeps retrying.
    let publicOk = false;
    let claimedNew = false;
    let committed = false;
    const publicWarnings = [];
    if (edgeEnabled()) {
      const ex = await pool.query(`SELECT public_synced_at FROM hub_apps WHERE slug = $1`, [slug]);
      const isNew = !ex.rows[0];
      if (isNew || !ex.rows[0].public_synced_at) {
        const r = await brokerApp('sync-app', slug);
        if (r.ok) {
          publicOk = true;
          claimedNew = isNew;
        } else if (isNew && (r.status === 409 || r.status === 429)) {
          req.resume();
          return res.status(r.status).json({
            error: r.status === 409
              ? `${slug}.${APPS_DOMAIN} is already taken — choose another address.`
              : r.error,
          });
        } else {
          publicWarnings.push(
            `Published on this hub, but ${slug}.${APPS_DOMAIN} could not be set up yet (${r.error || 'broker unreachable'}). It will retry automatically.`,
          );
        }
      } else {
        publicOk = true;
      }
    }

    const tmpPath = path.join(os.tmpdir(), `hubapp-${crypto.randomBytes(8).toString('hex')}.zip`);
    let zip = null;
    let uploadedPrefix = null;
    try {
      await receiveBody(req, tmpPath);
      let inspected;
      try {
        inspected = await inspectZip(tmpPath);
      } catch (err) {
        // Anything the zip reader itself rejects (bad archive, unsafe entry name) is the caller's problem.
        throw err.status ? err : Object.assign(err, { status: 400 });
      }
      zip = inspected.zip;

      const up = await pool.query(
        `INSERT INTO hub_apps (slug, name, description, owner_id)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE
              SET name = CASE WHEN $5 THEN EXCLUDED.name ELSE hub_apps.name END,
                  description = CASE WHEN $6 THEN EXCLUDED.description ELSE hub_apps.description END,
                  updated_at = NOW()
         RETURNING id`,
        [slug, name, description, req.user.id, !!req.query.name, !!req.query.description],
      );
      const appId = up.rows[0].id;
      const next = await pool.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM hub_app_versions WHERE app_id = $1`,
        [appId],
      );
      const version = next.rows[0].v;
      uploadedPrefix = `hub-apps/${slug}/v${version}/`;

      const counter = { total: 0 };
      const warnings = [];
      for (const f of inspected.files) {
        const body = await putEntry(minio, zip, f.entry, keyFor(slug, version, f.rel), f.rel, counter);
        if (f.rel === 'index.html') {
          // Vite's default base is "/", which makes every asset URL absolute and breaks under /apps/<slug>/.
          if (/(?:src|href)=["']\/(?!\/)/.test(body.toString('utf8'))) {
            warnings.push(
              'index.html references root-absolute asset paths (e.g. /assets/...). Set `base: "./"` in vite.config and rebuild, or the app will not load at /apps/' + slug + '/.',
            );
          }
        }
      }

      await pool.query(
        `INSERT INTO hub_app_versions (app_id, version, file_count, total_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [appId, version, inspected.files.length, counter.total, req.user.id],
      );
      await pool.query(
        `UPDATE hub_apps SET current_version = $1, status = 'published', updated_at = NOW() WHERE id = $2`,
        [version, appId],
      );
      if (publicOk) {
        await pool.query(`UPDATE hub_apps SET public_synced_at = COALESCE(public_synced_at, NOW()) WHERE id = $1`, [appId]);
      }
      invalidate(slug);
      committed = true;
      uploadedPrefix = null; // committed — don't clean up on later errors
      pruneVersions(minio, appId, slug).catch(() => {});
      res.json({
        slug, version, fileCount: inspected.files.length, totalBytes: counter.total,
        path: `/apps/${slug}/`,
        publicUrl: publicOk ? `https://${slug}.${APPS_DOMAIN}` : null,
        warnings: [...warnings, ...publicWarnings],
      });
    } catch (err) {
      if (uploadedPrefix) await removePrefix(minio, uploadedPrefix).catch(() => {});
      // A name claimed for an app that never got published would just sit there eating the hub's quota.
      if (claimedNew && !committed) brokerApp('release-app', slug);
      const status = err.status || 500;
      if (status === 500) console.warn('[hub-apps] upload failed:', err.message);
      res.status(status).json({ error: status === 500 ? 'Upload failed' : err.message });
    } finally {
      if (zip) zip.close();
      fs.promises.unlink(tmpPath).catch(() => {});
    }
  });

  admin.patch('/:slug', express.json(), async (req, res) => {
    const { name, description, status } = req.body || {};
    if (status !== undefined && !['published', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'status must be published or disabled' });
    }
    try {
      const r = await pool.query(
        `UPDATE hub_apps
            SET name = COALESCE($2, name), description = COALESCE($3, description),
                status = COALESCE($4, status), updated_at = NOW()
          WHERE slug = $1 RETURNING slug`,
        [req.params.slug, typeof name === 'string' ? name.trim().slice(0, 80) || null : null,
         typeof description === 'string' ? description.trim().slice(0, 300) : null, status ?? null],
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'App not found' });
      invalidate(req.params.slug);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to update app' });
    }
  });

  admin.post('/:slug/rollback', express.json(), async (req, res) => {
    const version = parseInt(req.body?.version, 10);
    if (!Number.isInteger(version)) return res.status(400).json({ error: 'version is required' });
    try {
      const r = await pool.query(
        `UPDATE hub_apps a SET current_version = $2, updated_at = NOW()
          WHERE a.slug = $1
            AND EXISTS (SELECT 1 FROM hub_app_versions v WHERE v.app_id = a.id AND v.version = $2)
        RETURNING a.slug`,
        [req.params.slug, version],
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'App or version not found' });
      invalidate(req.params.slug);
      res.json({ ok: true, currentVersion: version });
    } catch {
      res.status(500).json({ error: 'Rollback failed' });
    }
  });

  admin.delete('/:slug', async (req, res) => {
    try {
      const r = await pool.query(`DELETE FROM hub_apps WHERE slug = $1 RETURNING slug`, [req.params.slug]);
      if (!r.rows[0]) return res.status(404).json({ error: 'App not found' });
      invalidate(req.params.slug);
      const minio = getMinio();
      if (minio) await removePrefix(minio, `hub-apps/${r.rows[0].slug}/`).catch(() => {});
      if (edgeEnabled()) await brokerApp('release-app', r.rows[0].slug);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete app' });
    }
  });

  // ── Member listing ──────────────────────────────────────────────────────────

  const member = express.Router();
  member.get('/', authenticate, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT slug, name, description, current_version, updated_at, public_synced_at
           FROM hub_apps WHERE status = 'published' AND current_version IS NOT NULL
          ORDER BY name`,
      );
      res.json(rows.map((r) => ({
        slug: r.slug, name: r.name, description: r.description,
        version: r.current_version, updatedAt: r.updated_at, path: `/apps/${r.slug}/`,
        publicUrl: r.public_synced_at ? `https://${r.slug}.${APPS_DOMAIN}` : null,
      })));
    } catch {
      res.status(500).json({ error: 'Failed to list apps' });
    }
  });

  // ── Public serving ──────────────────────────────────────────────────────────

  async function lookup(slug) {
    const hit = slugCache.get(slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const { rows } = await pool.query(
      `SELECT current_version, status FROM hub_apps WHERE slug = $1`,
      [slug],
    );
    const value = rows[0] && rows[0].status === 'published' && rows[0].current_version
      ? { version: rows[0].current_version }
      : null;
    slugCache.set(slug, { at: Date.now(), value });
    return value;
  }

  /**
   * Stream one file of a published app. `rel` is the path inside the app ('' = index).
   * Extension-less misses fall back to index.html so client-side routing works.
   */
  async function serveApp(slug, rel, req, res) {
    const minio = getMinio();
    const live = minio && SLUG_RE.test(slug) ? await lookup(slug) : null;
    const safe = safeRelPath(rel);
    if (!live || safe === null) return res.status(404).type('text/plain').send('Not found');

    let target = safe === '' || safe.endsWith('/') ? `${safe}index.html` : safe;
    let stat;
    try {
      stat = await minio.statObject(bucket, keyFor(slug, live.version, target));
    } catch {
      if (path.posix.extname(target)) return res.status(404).type('text/plain').send('Not found');
      target = 'index.html';
      try {
        stat = await minio.statObject(bucket, keyFor(slug, live.version, target));
      } catch {
        return res.status(404).type('text/plain').send('Not found');
      }
    }

    const etag = `"${stat.etag}-v${live.version}"`;
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Cache-Control',
      target.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    res.setHeader('Content-Type', mimeFor(target));
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();
    const stream = await minio.getObject(bucket, keyFor(slug, live.version, target));
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  // strict: '/:slug' (redirect) must not also match '/:slug/', or the redirect would loop.
  const serve = express.Router({ strict: true });
  // /apps/<slug> must end in a slash or the app's relative asset URLs resolve against /apps/.
  serve.get('/:slug', (req, res) => res.redirect(301, `${req.baseUrl}/${req.params.slug}/`));
  serve.get(['/:slug/', '/:slug/*'], async (req, res) => {
    try {
      await serveApp(req.params.slug, req.params[0] ?? '', req, res);
    } catch (err) {
      console.warn('[hub-apps] serve failed:', err.message);
      if (!res.headersSent) res.status(500).type('text/plain').send('Failed to load app');
    }
  });

  /**
   * Re-assert every published app's public address with the broker: picks up apps whose first claim
   * failed, a changed TUNNEL_URL, or an edge KV that was wiped. Cheap — refreshes don't write GitHub.
   */
  async function syncAll() {
    if (!edgeEnabled()) return;
    const { rows } = await pool.query(`SELECT slug FROM hub_apps WHERE status = 'published' AND current_version IS NOT NULL`);
    for (const { slug } of rows) {
      const r = await brokerApp('sync-app', slug);
      if (r.ok) await pool.query(`UPDATE hub_apps SET public_synced_at = COALESCE(public_synced_at, NOW()) WHERE slug = $1`, [slug]);
      else console.warn(`[hub-apps] public address sync failed for ${slug}: ${r.status} ${r.error}`);
    }
  }

  /** Call once at startup. Syncs shortly after boot (the registry heartbeat waits for the DB too), then every 6h. */
  function start() {
    if (!edgeEnabled()) return;
    setTimeout(() => syncAll().catch(() => {}), 90 * 1000);
    setInterval(() => syncAll().catch(() => {}), RESYNC_MS);
  }

  return { init, start, syncAll, admin, member, serve, serveApp };
}

module.exports = { createHubApps, safeRelPath, SLUG_RE };
