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
const Docker = require('dockerode');

const PORT = process.env.PORT || 7070;
const HUB_SLUG = process.env.HUB_SLUG || '';
const ADMIN_SIDECAR_TOKEN = process.env.ADMIN_SIDECAR_TOKEN || '';
// The exact suffix THIS hub's own docker-compose.yml uses for every
// container_name (normally `-${HUB_SLUG}`, matching scriptGenerator.ts's
// getComposeYaml -- empty for older hubs like hub1 that predate that
// convention). Passed in explicitly rather than guessed: this container has
// no way to know, on a machine that might run several hubs, whether an
// unsuffixed "citinet-backup" it can see belongs to THIS hub or a completely
// different one -- an earlier version of this file tried "suffixed, then
// fall back to unsuffixed" and that fallback leaked another hub's real
// container logs through a mismatched HUB_SLUG during testing. No fallback,
// no guessing: if this is wrong, the affected service just reports as not
// present, which is the safe failure mode (nothing found beats the wrong
// thing found).
const CONTAINER_SUFFIX = process.env.CONTAINER_SUFFIX ?? (HUB_SLUG ? `-${HUB_SLUG}` : '');

if (!ADMIN_SIDECAR_TOKEN) {
  console.error('ADMIN_SIDECAR_TOKEN is not set -- refusing to start. This container has Docker socket access and must never run without the shared-secret check in place.');
  process.exit(1);
}

// docker.sock is a Linux path -- Docker Desktop on Windows/Mac exposes the
// same path *inside* every Linux container regardless of host OS (containers
// always run in the Linux VM/WSL2 backend), so no host-OS branching is
// needed here despite hubs running on Windows, macOS, or Linux hosts.
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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

/** Exact-name lookup for THIS hub's one expected container name -- Docker's
 *  own `name` filter is substring, not exact, so the result is re-checked
 *  client-side before accepting it. Deliberately never tries a second/
 *  fallback name -- see CONTAINER_SUFFIX's comment above for why. */
async function findContainer(service) {
  const name = `${service}${CONTAINER_SUFFIX}`;
  const containers = await docker.listContainers({ all: true, filters: JSON.stringify({ name: [name] }) });
  const exact = containers.find(c => (c.Names || []).some(n => n.replace(/^\//, '') === name));
  return exact ? { info: exact, container: docker.getContainer(exact.Id) } : null;
}

/** Docker's non-TTY log stream multiplexes stdout/stderr with an 8-byte
 *  frame header per chunk (byte 0 = stream type, bytes 4-7 = big-endian
 *  payload size) -- every one of this project's containers runs without a
 *  TTY, so this demux is required or log output has garbage header bytes
 *  mixed into the text. */
function demuxDockerLog(buffer) {
  let result = '';
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + size, buffer.length);
    result += buffer.slice(start, end).toString('utf8');
    offset = start + size;
  }
  return result;
}

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
  console.log(`citinet-admin sidecar listening on ${PORT} (hub: ${HUB_SLUG || 'unknown'})`);
});
