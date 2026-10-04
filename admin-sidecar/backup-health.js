/**
 * Backup verification.
 *
 * Three layers, because "a backup file exists" is not the same as "I can get
 * my hub back":
 *
 *  1. Freshness (every 30 min): the newest local DB dump and storage archive
 *     exist, are non-trivial in size, and are recent. Read by listing /backups
 *     inside the backup container — no extra mounts needed.
 *  2. Off-site (every 6 h, only if the operator configured restic): the newest
 *     restic snapshot is recent. Asked of restic itself, not inferred from logs.
 *  3. Restore drill (weekly, and on demand): load the newest dump into a
 *     throwaway PostgreSQL container that has NO network and read-only access to
 *     the backups, and confirm real tables and users come out. If off-site is
 *     configured, the drill also pulls the dump back from the remote first, so
 *     it proves the remote copy restores too — the leg that actually matters in
 *     a lost-machine disaster.
 *
 * The drill never touches the live database: it runs a separate postgres on a
 * scratch data dir with networking disabled.
 */

const { docker, findContainer, demuxDockerLog, execIn } = require('./docker-util');
const { raise, clear } = require('./alerts');

const FRESH_MAX_HOURS = 36; // backups run daily; allow slack for a late/skipped run
const OFFSITE_MAX_HOURS = 48;
const LOCAL_EVERY_MS = 30 * 60_000;
const OFFSITE_EVERY_MS = 6 * 60 * 60_000;
const DRILL_EVERY_MS = 7 * 24 * 60 * 60_000;
const DRILL_FIRST_DELAY_MS = 15 * 60_000;
const DRILL_TIMEOUT_MS = 5 * 60_000;
const DRILL_RESTIC_FILE = '/backups/.drill-restic.sql';

const state = {
  local: { checkedAt: null, ok: null, db: null, storage: null, problem: null },
  offsite: { configured: false, checkedAt: null, ok: null, latestSnapshotAt: null, problem: null },
  drill: { running: false, lastRunAt: null, ok: null, results: [] },
};

const ageHours = (epochSec) => (Date.now() / 1000 - epochSec) / 3600;

async function backupContainer() {
  const found = await findContainer('citinet-backup');
  if (!found) return null;
  const info = await found.container.inspect();
  return { ...found, inspect: info };
}

// ── 1. Local freshness ─────────────────────────────────────────────────────

async function listBackups(bc, pattern) {
  const r = await execIn(bc.container, [
    'sh', '-c', `for f in /backups/${pattern}; do [ -f "$f" ] && stat -c "%s %Y %n" "$f"; done; true`,
  ]);
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [size, mtime, ...name] = line.split(' ');
      return { size: Number(size), mtime: Number(mtime), name: name.join(' ') };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

async function checkLocal() {
  const bc = await backupContainer();
  if (!bc) {
    state.local = { checkedAt: new Date().toISOString(), ok: false, db: null, storage: null, problem: 'No backup container is running for this hub.' };
    return raise('backup-missing', {
      severity: 'warning',
      title: 'No backup container found',
      detail: 'This hub has no citinet-backup service running, so nothing is being backed up.',
    });
  }
  clear('backup-missing');
  if (!bc.inspect.State.Running) return; // watchdog's job; avoid a misleading "stale" alert

  const [dbs, stores] = await Promise.all([listBackups(bc, 'db-*.sql.gz'), listBackups(bc, 'storage-*.tar.gz')]);
  const summarize = (list, minSize) => {
    const newest = list[0];
    if (!newest) return { count: 0, newestAt: null, ageHours: null, sizeBytes: null, ok: false };
    const age = ageHours(newest.mtime);
    return {
      count: list.length,
      newestAt: new Date(newest.mtime * 1000).toISOString(),
      ageHours: Math.round(age * 10) / 10,
      sizeBytes: newest.size,
      ok: newest.size >= minSize && age <= FRESH_MAX_HOURS,
    };
  };
  const db = summarize(dbs, 1024);
  const storage = summarize(stores, 20); // an empty tar.gz is ~20 bytes; real ones are bigger
  const problem = !db.ok
    ? db.count === 0 ? 'No database backup has been made yet.' : db.sizeBytes < 1024 ? 'The latest database backup is suspiciously small.' : `The latest database backup is ${Math.round(db.ageHours)} hours old.`
    : !storage.ok
      ? storage.count === 0 ? 'No file-storage backup has been made yet.' : `The latest file-storage backup is ${Math.round(storage.ageHours)} hours old.`
      : null;

  state.local = { checkedAt: new Date().toISOString(), ok: !problem, db, storage, problem };
  if (problem) {
    await raise('backup-stale', { severity: 'critical', title: 'Backups are not up to date', detail: problem });
  } else {
    clear('backup-stale');
  }
}

// ── 2. Off-site (restic) ───────────────────────────────────────────────────

function offsiteConfigured(bc) {
  const env = bc.inspect.Config?.Env || [];
  const has = (k) => env.some((e) => e.startsWith(`${k}=`) && e.length > k.length + 1);
  return has('RESTIC_REPOSITORY') && has('RESTIC_PASSWORD');
}

function newestSnapshotTime(parsed) {
  // restic >= 0.16 returns [{ group_key, snapshots: [...] }]; older returns [snapshot, ...]
  const snaps = Array.isArray(parsed)
    ? parsed.flatMap((g) => (g && Array.isArray(g.snapshots) ? g.snapshots : [g]))
    : [];
  const times = snaps.map((s) => Date.parse(s?.time)).filter((t) => !Number.isNaN(t));
  return times.length ? Math.max(...times) : null;
}

async function checkOffsite() {
  const bc = await backupContainer();
  if (!bc || !bc.inspect.State.Running) return;
  const configured = offsiteConfigured(bc);
  state.offsite.configured = configured;
  if (!configured) {
    state.offsite = { configured: false, checkedAt: new Date().toISOString(), ok: null, latestSnapshotAt: null, problem: null };
    clear('offsite-stale');
    return;
  }

  const r = await execIn(
    bc.container,
    ['sh', '-c', 'restic snapshots --host "${HUB_SLUG:-hub}" --latest 1 --json'],
    { timeoutMs: 120_000 },
  ).catch((e) => ({ code: -1, stdout: '', stderr: e.message }));

  if (r.code === 127) {
    // restic is installed by the backup container at startup; give it time.
    state.offsite = { configured: true, checkedAt: new Date().toISOString(), ok: null, latestSnapshotAt: null, problem: 'restic is still being installed in the backup container.' };
    return;
  }
  let latest = null;
  if (r.code === 0) {
    try { latest = newestSnapshotTime(JSON.parse(r.stdout || '[]')); } catch { latest = null; }
  }
  const problem =
    r.code !== 0
      ? `Could not read the off-site repository: ${(r.stderr || '').trim().split('\n').pop()?.slice(0, 200) || 'unknown error'}`
      : latest === null
        ? 'The off-site repository has no snapshots yet.'
        : ageHours(latest / 1000) > OFFSITE_MAX_HOURS
          ? `The newest off-site snapshot is ${Math.round(ageHours(latest / 1000))} hours old.`
          : null;

  state.offsite = {
    configured: true,
    checkedAt: new Date().toISOString(),
    ok: !problem,
    latestSnapshotAt: latest ? new Date(latest).toISOString() : null,
    problem,
  };
  if (problem) {
    await raise('offsite-stale', { severity: 'warning', title: 'Off-site backup needs attention', detail: problem });
  } else {
    clear('offsite-stale');
  }
}

// ── 3. Restore drill ───────────────────────────────────────────────────────

// Runs inside the throwaway container. $FILE is the dump to load (.gz or plain).
const DRILL_SCRIPT = `
set -e
mkdir -p /tmp/pg && chown postgres /tmp/pg
su postgres -c "initdb -D /tmp/pg >/dev/null"
su postgres -c "pg_ctl -D /tmp/pg -o '-c listen_addresses= -c unix_socket_directories=/tmp' -w start >/dev/null"
su postgres -c "psql -h /tmp -q -d postgres -c 'create role citinet superuser' -c 'create database drill'"
[ -s "$FILE" ] || { echo "DRILL_FAIL the backup file is missing or empty"; exit 2; }
case "$FILE" in
  *.gz)
    gunzip -t "$FILE" 2>/dev/null || { echo "DRILL_FAIL the backup file is corrupt (gzip integrity check failed)"; exit 3; }
    gunzip -c "$FILE" > /tmp/dump.sql ;;
  *) cp "$FILE" /tmp/dump.sql ;;
esac
su postgres -c "psql -h /tmp -q -v ON_ERROR_STOP=1 -d drill -f /tmp/dump.sql" >/dev/null || { echo "DRILL_FAIL the dump did not load cleanly into a fresh database"; exit 4; }
TABLES=$(su postgres -c "psql -h /tmp -At -d drill -c \\"select count(*) from information_schema.tables where table_schema='public'\\"")
USERS=$(su postgres -c "psql -h /tmp -At -d drill -c 'select count(*) from hub_users'")
echo "DRILL_OK tables=$TABLES users=$USERS"
`;

async function runDrillContainer(bc, file) {
  const mount = (bc.inspect.Mounts || []).find((m) => m.Destination === '/backups');
  if (!mount) throw new Error('could not find the backup container\'s /backups mount');
  const bind = `${mount.Type === 'volume' ? mount.Name : mount.Source}:/backups:ro`;

  const container = await docker.createContainer({
    Image: bc.inspect.Config.Image,
    Entrypoint: ['sh', '-c'],
    Cmd: [DRILL_SCRIPT],
    Env: [`FILE=${file}`],
    Labels: { 'citinet.restore-drill': '1' },
    NetworkDisabled: true,
    HostConfig: { Binds: [bind], NetworkMode: 'none', Memory: 768 * 1024 * 1024 },
  });
  const started = Date.now();
  try {
    await container.start();
    const exit = await Promise.race([
      container.wait(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('restore drill timed out')), DRILL_TIMEOUT_MS)),
    ]);
    const log = demuxDockerLog(await container.logs({ stdout: true, stderr: true, tail: 40 }));
    const m = log.match(/DRILL_OK tables=(\d+) users=(\d+)/);
    return {
      ok: exit.StatusCode === 0 && !!m,
      tables: m ? Number(m[1]) : null,
      users: m ? Number(m[2]) : null,
      seconds: Math.round((Date.now() - started) / 1000),
      detail: m ? null : log.trim().split('\n').slice(-6).join('\n').slice(0, 600),
    };
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

async function runDrill() {
  if (state.drill.running) return { alreadyRunning: true };
  state.drill.running = true;
  const results = [];
  try {
    const bc = await backupContainer();
    if (!bc || !bc.inspect.State.Running) throw new Error('backup container is not running');

    // Leg 1: newest local dump.
    const dbs = await listBackups(bc, 'db-*.sql.gz');
    if (!dbs[0]) {
      results.push({ source: 'local', ok: false, detail: 'No local database backup to test yet.' });
    } else {
      const r = await runDrillContainer(bc, dbs[0].name).catch((e) => ({ ok: false, detail: e.message }));
      results.push({ source: 'local', file: dbs[0].name.split('/').pop(), ...r });
    }

    // Leg 2: pull the dump back from the off-site repo and restore that.
    if (offsiteConfigured(bc)) {
      let r;
      try {
        const pull = await execIn(
          bc.container,
          ['sh', '-c', `rm -rf /tmp/drill && mkdir -p /tmp/drill && restic restore latest --host "\${HUB_SLUG:-hub}" --include /tmp/db-latest.sql --target /tmp/drill >/dev/null && cp /tmp/drill/tmp/db-latest.sql ${DRILL_RESTIC_FILE}`],
          { timeoutMs: 240_000 },
        );
        r = pull.code === 0
          ? await runDrillContainer(bc, DRILL_RESTIC_FILE)
          : { ok: false, detail: `Could not restore from the off-site repository: ${(pull.stderr || pull.stdout).trim().split('\n').pop()?.slice(0, 300)}` };
      } catch (e) {
        r = { ok: false, detail: e.message };
      } finally {
        await execIn(bc.container, ['sh', '-c', `rm -rf /tmp/drill ${DRILL_RESTIC_FILE}`]).catch(() => {});
      }
      results.push({ source: 'off-site', ...r });
    }
  } catch (e) {
    results.push({ source: 'drill', ok: false, detail: e.message });
  } finally {
    state.drill = { running: false, lastRunAt: new Date().toISOString(), ok: results.length > 0 && results.every((r) => r.ok), results };
  }

  if (state.drill.ok) {
    clear('restore-drill-failed');
  } else {
    const bad = results.filter((r) => !r.ok);
    await raise('restore-drill-failed', {
      severity: 'critical',
      title: 'Restore test failed',
      detail: bad.map((r) => `${r.source}: ${r.detail || 'did not restore'}`).join(' | '),
    });
  }
  return state.drill;
}

// ── scheduling ──────────────────────────────────────────────────────────────

function start() {
  const safe = (fn) => () => fn().catch((e) => console.error(`[backup-health] ${fn.name}:`, e.message));
  // First checks wait a bit so a full-host reboot's own restart pass settles.
  setTimeout(() => {
    safe(checkLocal)();
    safe(checkOffsite)();
    setInterval(safe(checkLocal), LOCAL_EVERY_MS);
    setInterval(safe(checkOffsite), OFFSITE_EVERY_MS);
  }, 60_000);
  setTimeout(() => {
    safe(runDrill)();
    setInterval(safe(runDrill), DRILL_EVERY_MS);
  }, DRILL_FIRST_DELAY_MS);
}

function snapshot() {
  return state;
}

module.exports = { start, snapshot, runDrill, checkLocal, checkOffsite, DRILL_SCRIPT };
