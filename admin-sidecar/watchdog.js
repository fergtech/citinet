/**
 * Stack watchdog + dead-man's-switch heartbeat.
 *
 * Why this exists: Docker's own `restart: unless-stopped` only retries a
 * container that started and then died. A container whose very first start
 * failed — e.g. losing a port-80/443 bind race during a full-host reboot —
 * sits "exited" forever with RestartCount 0 (this took a real hub's HTTPS down
 * after a reboot on 2026-08-10). That used to be patched with a Windows
 * scheduled task on one machine; living in the sidecar instead, it covers every
 * hub on every OS, with no per-OS scheduler.
 *
 * What it will and won't restart: only a container that is NOT running AND
 * stopped for a reason that looks like a failure (never started, start error,
 * out-of-memory, or a non-zero exit that isn't docker's own stop signal). A
 * clean exit / `docker stop` is treated as the operator's intent and left alone.
 * A restart loop (several restarts in a short window) is NOT retried forever —
 * it is reported as a critical alert instead.
 */

const { findContainer } = require('./docker-util');
const { raise, clear } = require('./alerts');
const { getPingUrl, pingSource } = require('./remote-config');

const WATCHED = ['citinet-db', 'citinet-storage', 'citinet-api', 'citinet-caddy', 'citinet-backup', 'citinet-livekit', 'citinet-ollama'];
// What "the hub is up" means for the external heartbeat.
const CRITICAL = ['citinet-db', 'citinet-storage', 'citinet-api', 'citinet-caddy'];

const TICK_MS = 60_000;
const LOOP_WINDOW_MS = 30 * 60_000;
const LOOP_MAX = 4;
// Exit codes docker itself produces when told to stop — treated as intentional.
const STOP_CODES = new Set([0, 137, 143]);

const restartTimes = new Map(); // service -> [timestamps]
const events = []; // newest first, capped — surfaced in /health
let lastTick = null;
let lastPing = null; // { at, ok } — the most recent heartbeat attempt

const label = (service) => service.replace(/^citinet-/, '');

function recordEvent(e) {
  events.unshift({ at: new Date().toISOString(), ...e });
  events.length = Math.min(events.length, 50);
}

async function checkService(service) {
  const found = await findContainer(service);
  if (!found) return { service, present: false, running: false };

  const info = await found.container.inspect();
  const st = info.State;
  const running = !!st.Running;
  const out = { service, present: true, running };

  if (running || st.Restarting || st.Paused) {
    clear(`service-down:${service}`);
    if (running && st.Health?.Status === 'unhealthy') {
      raise(`service-unhealthy:${service}`, {
        severity: 'warning',
        title: `${label(service)} is running but failing its health check`,
        detail: (st.Health.Log || []).slice(-1)[0]?.Output?.slice(0, 300) || '',
      });
    } else {
      clear(`service-unhealthy:${service}`);
    }
    return out;
  }

  const policy = info.HostConfig?.RestartPolicy?.Name;
  if (!policy || policy === 'no') return out; // not meant to be kept alive

  const failed =
    st.Status === 'created' || !!st.Error || st.OOMKilled || (st.ExitCode != null && !STOP_CODES.has(st.ExitCode));
  if (!failed) return out; // clean stop — the operator's call

  const now = Date.now();
  const recent = (restartTimes.get(service) || []).filter((t) => now - t < LOOP_WINDOW_MS);
  if (recent.length >= LOOP_MAX) {
    await raise(`service-down:${service}`, {
      severity: 'critical',
      title: `${label(service)} keeps stopping`,
      detail: `Restarted ${recent.length} times in the last ${LOOP_WINDOW_MS / 60000} minutes and stopped again. Last error: ${st.Error || `exit code ${st.ExitCode}`}. Automatic restarts paused — check its logs.`,
    });
    return out;
  }

  try {
    await found.container.start();
    recent.push(now);
    restartTimes.set(service, recent);
    recordEvent({ service, action: 'restarted', reason: st.Error || (st.OOMKilled ? 'out of memory' : `exit code ${st.ExitCode}`) });
    console.log(`[watchdog] restarted ${service} (was ${st.Status}, exit ${st.ExitCode}${st.Error ? `, ${st.Error}` : ''})`);
    out.running = true;
  } catch (err) {
    recordEvent({ service, action: 'restart-failed', reason: err.message });
    await raise(`service-down:${service}`, {
      severity: 'critical',
      title: `${label(service)} is down and could not be restarted`,
      detail: err.message,
    });
  }
  return out;
}

async function tick() {
  const results = [];
  for (const service of WATCHED) {
    try {
      results.push(await checkService(service));
    } catch (err) {
      console.error(`[watchdog] ${service}:`, err.message);
    }
  }
  lastTick = new Date().toISOString();

  // Dead-man's switch: ping an external monitor ONLY while the hub's core
  // services are all up. If the machine, Docker or this sidecar dies, the pings
  // simply stop and the external monitor alerts — the one failure an
  // in-hub alert can never report.
  const pingUrl = getPingUrl();
  if (pingUrl) {
    const core = results.filter((r) => CRITICAL.includes(r.service));
    const healthy = core.length > 0 && core.every((r) => r.present && r.running);
    if (healthy) {
      fetch(pingUrl, { signal: AbortSignal.timeout(10_000) })
        .then((r) => { lastPing = { at: new Date().toISOString(), ok: r.ok }; })
        .catch(() => { lastPing = { at: new Date().toISOString(), ok: false }; });
    }
  }
  return results;
}

function start() {
  // Small delay: on a full-host reboot, let Docker finish its own restart pass
  // before deciding anything is "stuck".
  setTimeout(() => {
    tick().catch(() => {});
    setInterval(() => tick().catch(() => {}), TICK_MS);
  }, 30_000);
}

function snapshot() {
  return { lastTick, events, heartbeatConfigured: !!getPingUrl(), heartbeatSource: pingSource(), lastPing };
}

module.exports = { start, snapshot, tick };
