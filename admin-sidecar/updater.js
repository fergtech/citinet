/**
 * Update watchdog — notices when a newer image of one of this hub's own
 * containers has been published, and (on the admin's say-so) swaps it in.
 *
 * Why this exists: a hub's UI and API are frozen into its Docker image, so a fix
 * pushed to the repo never reaches a hub until someone rebuilds/pulls. Nothing
 * told an admin that was needed. This compares what each container is actually
 * running against what its image tag points to in the registry NOW — the
 * registry is the source of truth, so it works for any publisher: a fork that
 * runs its own image simply gets checked against its own registry tag.
 *
 * It never updates by itself. It checks, raises a (non-emailed) warning alert,
 * and waits for an explicit "Update now" from Hub Management → System.
 *
 * Applying an update is deliberately conservative:
 *   pull → stop the old container and park it under a "-pre-update" name →
 *   create the new one with the old one's exact config → wait until it is
 *   healthy → only then delete the old one. Any failure puts the old container
 *   straight back, so a bad image can't leave the hub without its API.
 *
 * Only registry-anonymous GHCR images are checked (that is where Citinet's
 * images live). Other images (postgres, minio, …) are left to the host.
 */

const { docker, findContainer, CONTAINER_SUFFIX } = require('./docker-util');
const { raise, clear } = require('./alerts');

const CHECK_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 2 * 60 * 1000;

// Services checked for a newer image. Anything not on the registry is skipped.
const CHECKED = ['citinet-api', 'citinet-caddy', 'citinet-backup', 'citinet-admin', 'citinet-livekit'];
// Services the UI may swap in place. citinet-admin can't recreate itself (it
// would kill the very process doing the work), so it is report-only here.
const APPLYABLE = new Set(['citinet-api']);

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const HEALTH_WAIT_MS = 120_000;
const STEADY_MS = 10_000;

let state = { checkedAt: null, error: null, services: [] };
let apply = { running: false, service: null, step: null, startedAt: null, finishedAt: null, ok: null, message: null };
let checking = null;

const label = (s) => s.replace(/^citinet-/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "ghcr.io/fergtech/citinet-api:latest" → { registry, repo, tag } (null if digest-pinned). */
function parseRef(ref) {
  if (!ref || ref.includes('@')) return null;
  const slash = ref.indexOf('/');
  if (slash === -1) return null;
  const registry = ref.slice(0, slash);
  const rest = ref.slice(slash + 1);
  const colon = rest.lastIndexOf(':');
  const hasTag = colon > rest.lastIndexOf('/');
  return { registry, repo: hasTag ? rest.slice(0, colon) : rest, tag: hasTag ? rest.slice(colon + 1) : 'latest' };
}

async function registryToken(repo) {
  const res = await fetch(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repo}:pull`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`registry token ${res.status}`);
  return (await res.json()).token;
}

async function registryGet(path, token, accept) {
  return fetch(`https://ghcr.io${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept || MANIFEST_ACCEPT },
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * What the tag points to right now: its digest, every platform-specific child
 * digest (a local image may record either), and — best effort — when it was built.
 */
async function remoteInfo(repo, tag) {
  const token = await registryToken(repo);
  const res = await registryGet(`/v2/${repo}/manifests/${encodeURIComponent(tag)}`, token);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const digest = res.headers.get('docker-content-digest');
  const body = await res.json();
  const children = Array.isArray(body.manifests) ? body.manifests.map((m) => m.digest) : [];

  let created = null;
  try {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    let manifest = body;
    if (Array.isArray(body.manifests)) {
      const pick = body.manifests.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === arch);
      if (pick) manifest = await (await registryGet(`/v2/${repo}/manifests/${pick.digest}`, token)).json();
    }
    if (manifest.config?.digest) {
      const cfg = await registryGet(`/v2/${repo}/blobs/${manifest.config.digest}`, token, '*/*');
      if (cfg.ok) created = (await cfg.json()).created || null;
    }
  } catch { /* "published on" is a nicety — never fails the check */ }

  return { digest, children, created };
}

async function checkOne(service) {
  const found = await findContainer(service);
  if (!found) return null;
  const info = await found.container.inspect();
  const ref = parseRef(info.Config?.Image);
  const out = {
    service,
    image: info.Config?.Image || null,
    canApply: APPLYABLE.has(service),
    updateAvailable: false,
    current: null,
    latest: null,
    note: null,
  };
  if (!ref || ref.registry !== 'ghcr.io') {
    out.note = 'Not a Citinet-published image — update it from the host.';
    return out;
  }

  // The image this container is ACTUALLY running (not whatever the tag points to locally now).
  let local;
  try {
    local = await docker.getImage(info.Image).inspect();
  } catch {
    out.note = 'Could not read the running image.';
    return out;
  }
  const prefix = `${ref.registry}/${ref.repo}@`;
  const localDigests = (local.RepoDigests || []).filter((d) => d.startsWith(prefix)).map((d) => d.slice(prefix.length));
  out.current = { digest: localDigests[0] || null, created: local.Created || null };

  const remote = await remoteInfo(ref.repo, ref.tag);
  out.latest = { digest: remote.digest, created: remote.created };

  if (!localDigests.length) {
    // Built locally / loaded without a registry record — we can't prove either way.
    out.note = 'Built locally, so it can\'t be compared with the published version.';
    return out;
  }
  const known = new Set([remote.digest, ...remote.children]);
  out.updateAvailable = !localDigests.some((d) => known.has(d));
  return out;
}

async function check() {
  if (checking) return checking;
  checking = (async () => {
    const services = [];
    let error = null;
    for (const service of CHECKED) {
      try {
        const r = await checkOne(service);
        if (r) services.push(r);
      } catch (err) {
        error = `Could not reach the image registry (${err.message}).`;
      }
    }
    state = { checkedAt: new Date().toISOString(), error, services };

    for (const s of services) {
      const key = `update-available:${s.service}`;
      if (s.updateAvailable) {
        raise(key, {
          severity: 'warning',
          title: `A new version of ${label(s.service)} is available`,
          detail: s.canApply
            ? 'Open Hub Management → System to update it. Your data is not touched.'
            : 'Update it from the host (run the citinet update command).',
        });
      } else if (!error) {
        clear(key);
      }
    }
    return state;
  })().finally(() => { checking = null; });
  return checking;
}

function pull(ref) {
  return new Promise((resolve, reject) => {
    docker.pull(ref, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (e) => (e ? reject(e) : resolve()));
    });
  });
}

/** Wait until a started container is genuinely up, not just "created". */
async function waitHealthy(container) {
  const deadline = Date.now() + HEALTH_WAIT_MS;
  let steadySince = null;
  while (Date.now() < deadline) {
    const st = (await container.inspect()).State;
    if (!st.Running || st.Restarting) {
      steadySince = null;
      if (st.Status === 'exited') throw new Error(`exited with code ${st.ExitCode}`);
    } else if (st.Health) {
      if (st.Health.Status === 'healthy') return;
      if (st.Health.Status === 'unhealthy') throw new Error('failed its health check');
    } else {
      steadySince = steadySince || Date.now();
      if (Date.now() - steadySince >= STEADY_MS) return;
    }
    await sleep(2000);
  }
  throw new Error('did not become healthy in time');
}

/**
 * Replace `service`'s container with a fresh one built from `imageRef`, keeping
 * the old one parked until the new one is proven. Exported separately from the
 * pull so it can be exercised with local images.
 */
async function recreateWithImage(service, imageRef, onStep = () => {}) {
  const found = await findContainer(service);
  if (!found) throw new Error(`${service} container not found`);
  const oldC = found.container;
  const info = await oldC.inspect();
  const name = info.Name.replace(/^\//, '');
  const parked = `${name}-pre-update`;

  // A leftover from an earlier failed run would block the rename.
  try { await docker.getContainer(parked).remove({ force: true }); } catch { /* none */ }

  const { Hostname, ...cfg } = info.Config; // hostname is the old container's id — let docker assign one
  const shortId = info.Id.slice(0, 12);
  const nets = Object.entries(info.NetworkSettings?.Networks || {});
  const endpoint = (n) => ({
    Aliases: (n.Aliases || []).filter((a) => a !== shortId),
    ...(n.IPAMConfig ? { IPAMConfig: n.IPAMConfig } : {}),
    ...(n.Links ? { Links: n.Links } : {}),
  });
  const [firstNetName, firstNet] = nets[0] || [];

  onStep('switching');
  await oldC.stop({ t: 20 }).catch((e) => { if (e.statusCode !== 304) throw e; });
  await oldC.rename({ name: parked });

  let fresh = null;
  try {
    fresh = await docker.createContainer({
      ...cfg,
      Image: imageRef,
      name,
      HostConfig: info.HostConfig,
      NetworkingConfig: firstNetName ? { EndpointsConfig: { [firstNetName]: endpoint(firstNet) } } : undefined,
    });
    for (const [netName, n] of nets.slice(1)) {
      await docker.getNetwork(netName).connect({ Container: fresh.id, EndpointConfig: endpoint(n) });
    }
    await fresh.start();
    onStep('verifying');
    await waitHealthy(fresh);
  } catch (err) {
    // Put things back exactly as they were.
    if (fresh) {
      await fresh.stop({ t: 5 }).catch(() => {});
      await fresh.remove({ force: true }).catch(() => {});
    }
    await oldC.rename({ name }).catch(() => {});
    await oldC.start().catch(() => {});
    throw err;
  }

  await oldC.remove({ v: false }).catch(() => {});
}

async function startApply(service) {
  if (apply.running) return { ok: false, status: 409, error: 'An update is already running' };
  if (!APPLYABLE.has(service)) return { ok: false, status: 403, error: `${service} can't be updated from here` };
  const found = await findContainer(service);
  if (!found) return { ok: false, status: 404, error: `${service} container not found` };
  const imageRef = (await found.container.inspect()).Config?.Image;
  if (!parseRef(imageRef)) return { ok: false, status: 400, error: 'This container is pinned to a fixed image' };

  apply = { running: true, service, step: 'pulling', startedAt: new Date().toISOString(), finishedAt: null, ok: null, message: null };
  (async () => {
    try {
      await pull(imageRef);
      await recreateWithImage(service, imageRef, (step) => { apply.step = step; });
      apply = { ...apply, running: false, step: 'done', finishedAt: new Date().toISOString(), ok: true, message: `${label(service)} updated.` };
      console.log(`[updater] ${service} updated to the latest ${imageRef}`);
      clear(`update-available:${service}`);
    } catch (err) {
      apply = {
        ...apply, running: false, step: 'failed', finishedAt: new Date().toISOString(), ok: false,
        message: `Update failed and was rolled back — your hub is still running the previous version. (${err.message})`,
      };
      console.error(`[updater] ${service} update failed, rolled back:`, err.message);
    }
    check().catch(() => {});
  })();
  return { ok: true, status: 202 };
}

const isBusy = () => apply.running;
const snapshot = () => ({ ...state, apply, suffix: CONTAINER_SUFFIX });

function start() {
  setTimeout(() => {
    check().catch(() => {});
    setInterval(() => check().catch(() => {}), CHECK_MS);
  }, FIRST_CHECK_MS);
}

module.exports = { start, check, snapshot, startApply, recreateWithImage, isBusy, parseRef, remoteInfo };
