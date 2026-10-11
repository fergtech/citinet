/**
 * Citinet Admin Sidecar
 *
 * Internal-only Docker status/restart API for a single hub's own stack.
 * Deliberately has NO `ports:` entry in docker-compose.yml -- it is never
 * reachable from outside the Docker network at all. The only caller is
 * citinet-api, which proxies pre-authenticated (hub-admin-checked) requests
 * to it over the internal `citinet-network` bridge, by service name
 * (`http://citinet-admin:PORT`), and sends ADMIN_SIDECAR_TOKEN on every
 * request as a second layer -- so even another compromised container on the
 * same Docker network can't call this without that shared secret.
 *
 * This container mounts /var/run/docker.sock, which is always effectively
 * full Docker daemon access (see the comment on that volume mount in
 * scriptGenerator.ts's getComposeYaml) -- the actual safety boundary here is
 * network isolation + the shared token + this file's own narrow, allowlisted
 * routes (read-only status, and restart for exactly two service names), not
 * any permission the socket mount itself grants or withholds.
 */

const express = require('express');
const { findContainer, demuxDockerLog, ownComposeDir, HUB_SLUG } = require('./docker-util');
const watchdog = require('./watchdog');
const backupHealth = require('./backup-health');
const remoteConfig = require('./remote-config');
const updater = require('./updater');

const PORT = process.env.PORT || 7070;
const ADMIN_SIDECAR_TOKEN = process.env.ADMIN_SIDECAR_TOKEN || '';

if (!ADMIN_SIDECAR_TOKEN) {
  console.error('ADMIN_SIDECAR_TOKEN is not set -- refusing to start. This container has Docker socket access and must never run without the shared-secret check in place.');
  process.exit(1);
}

// Every service this sidecar will ever report on. Two container-naming
// conventions exist across hubs: HUB_SLUG-suffixed (citinet-backup-<slug>,
// the current default for newly created hubs) and unsuffixed (citinet-backup,
// older single-hub-per-machine installs) -- both are tried, suffixed first.
const KNOWN_SERVICES = [
  'citinet-api', 'citinet-db', 'citinet-storage', 'citinet-caddy',
  'citinet-backup', 'citinet-admin', 'citinet-livekit', 'citinet-ollama',
];

// Only these can be restarted remotely -- deliberately conservative to
// start. citinet-db/citinet-storage/citinet-caddy/citinet-api/citinet-admin
// itself are excluded: a bad remote restart of any of those is far more
// disruptive (or, for citinet-admin, self-defeating) than the two below.
const RESTARTABLE_SERVICES = new Set(['citinet-backup', 'citinet-livekit']);

const app = express();

app.use((req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_SIDECAR_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
});

app.get('/status', async (req, res) => {
  try {
    const services = await Promise.all(KNOWN_SERVICES.map(async service => {
      const found = await findContainer(service);
      if (!found) return { service, present: false };

      let recentLogs = '';
      try {
        const buf = await found.container.logs({ stdout: true, stderr: true, tail: 12, timestamps: false });
        recentLogs = demuxDockerLog(buf);
      } catch { /* logs are best-effort -- status itself still reports */ }

      return {
        service,
        present: true,
        state: found.info.State,   // "running" | "exited" | "restarting" | "paused" | "created"
        status: found.info.Status, // human string, e.g. "Up 3 hours"
        restartable: RESTARTABLE_SERVICES.has(service),
        recentLogs,
      };
    }));
    res.json({ hubSlug: HUB_SLUG, services });
  } catch (err) {
    console.error('GET /status error:', err);
    res.status(500).json({ error: 'Failed to read stack status' });
  }
});

// Aggregated self-healing + backup-verification state for Hub Management → System.
app.get('/health', async (req, res) => {
  res.json({ hubSlug: HUB_SLUG, composeDir: await ownComposeDir(), watchdog: watchdog.snapshot(), backups: backupHealth.snapshot() });
});

// Run the restore drill now (otherwise it runs weekly). Fire-and-forget: it can take
// minutes, so this returns immediately and the result shows up in /health.
app.post('/drill', (req, res) => {
  if (backupHealth.snapshot().drill.running) return res.status(409).json({ error: 'A restore test is already running' });
  backupHealth.runDrill().catch((e) => console.error('drill error:', e.message));
  res.status(202).json({ started: true });
});

// Update watchdog: what's published vs. what's running (checked every few hours).
app.get('/updates', (req, res) => res.json(updater.snapshot()));
app.post('/updates/check', async (req, res) => {
  try {
    res.json(await updater.check());
  } catch (err) {
    console.error('POST /updates/check error:', err);
    res.status(500).json({ error: 'Update check failed' });
  }
});
// Apply an update. Always an explicit admin action — nothing here ever runs on its own.
app.post('/update/:service', async (req, res) => {
  const r = await updater.startApply(req.params.service);
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.status(202).json({ started: true });
});

app.post('/restart/:service', async (req, res) => {
  const service = req.params.service;
  if (!RESTARTABLE_SERVICES.has(service)) {
    return res.status(403).json({ error: `${service} is not remotely restartable` });
  }
  try {
    const found = await findContainer(service);
    if (!found) return res.status(404).json({ error: `${service} container not found` });
    await found.container.restart();
    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /restart/${service} error:`, err);
    res.status(500).json({ error: 'Restart failed' });
  }
});

app.listen(PORT, () => {
  remoteConfig.start();
  watchdog.start();
  backupHealth.start();
  updater.start();
  console.log(`citinet-admin sidecar listening on ${PORT} (hub: ${HUB_SLUG || 'unknown'})`);
});
