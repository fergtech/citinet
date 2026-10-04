/**
 * Shared Docker helpers for the sidecar — one dockerode instance, exact-name
 * container lookup, log demux, and exec-in-container.
 */

const Docker = require('dockerode');
const { PassThrough } = require('stream');

const HUB_SLUG = process.env.HUB_SLUG || '';
// The exact suffix THIS hub's docker-compose.yml uses for every container_name
// (normally `-${HUB_SLUG}`; empty for older hubs like hub1 that predate that
// convention). Passed in explicitly and never guessed: a "try suffixed, fall
// back to unsuffixed" lookup once leaked another hub's real containers on a
// machine running several hubs. No fallback — a wrong value just reports the
// service as not present, which is the safe failure.
const CONTAINER_SUFFIX = process.env.CONTAINER_SUFFIX ?? (HUB_SLUG ? `-${HUB_SLUG}` : '');

// docker.sock is a Linux path — Docker Desktop on Windows/Mac exposes the same
// path inside every Linux container regardless of host OS.
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/** Exact-name lookup for THIS hub's one expected container name — Docker's own
 *  `name` filter is substring, so the result is re-checked client-side. */
async function findContainer(service) {
  const name = `${service}${CONTAINER_SUFFIX}`;
  const containers = await docker.listContainers({ all: true, filters: JSON.stringify({ name: [name] }) });
  const exact = containers.find((c) => (c.Names || []).some((n) => n.replace(/^\//, '') === name));
  return exact ? { info: exact, container: docker.getContainer(exact.Id) } : null;
}

/** Docker's non-TTY log stream multiplexes stdout/stderr with an 8-byte frame
 *  header per chunk (byte 0 = stream type, bytes 4-7 = big-endian size). */
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

/** Run a command inside a running container. Resolves { code, stdout, stderr }. */
async function execIn(container, cmd, { timeoutMs = 60_000 } = {}) {
  const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({ hijack: true, stdin: false });
  let stdout = '';
  let stderr = '';
  const out = new PassThrough();
  const err = new PassThrough();
  out.on('data', (d) => { stdout += d; });
  err.on('data', (d) => { stderr += d; });
  docker.modem.demuxStream(stream, out, err);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('exec timed out')), timeoutMs);
    stream.on('end', () => { clearTimeout(timer); resolve(); });
    stream.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
  const info = await exec.inspect();
  return { code: info.ExitCode, stdout, stderr };
}

let composeDirCache;
/** The host folder this hub's docker-compose.yml lives in, read from the compose label on
 *  this sidecar's own container — lets the UI show the exact `cd` for a hub owner. */
async function ownComposeDir() {
  if (composeDirCache !== undefined) return composeDirCache;
  try {
    const info = await docker.getContainer(require('os').hostname()).inspect();
    composeDirCache = info.Config?.Labels?.['com.docker.compose.project.working_dir'] || null;
  } catch {
    composeDirCache = null;
  }
  return composeDirCache;
}

module.exports = { docker, findContainer, demuxDockerLog, execIn, ownComposeDir, HUB_SLUG, CONTAINER_SUFFIX };
