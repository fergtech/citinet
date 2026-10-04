import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Loader2, CheckCircle2, XCircle, Database, Cloud, FlaskConical, HeartPulse, Mail } from 'lucide-react';
import { hubService } from '../services/hubService';
import type { StackAlert, StackHealth, StackBackupFileInfo } from '../types/hub';

function timeAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

function formatBytes(n?: number | null): string {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function Row({ icon, label, ok, children }: { icon: React.ReactNode; label: string; ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="mt-0.5 cn-text-3 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium cn-text-1">{label}</p>
        <div className="text-xs cn-text-3 mt-0.5 space-y-0.5">{children}</div>
      </div>
      <div className="shrink-0 mt-0.5">
        {ok === true && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        {ok === false && <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
        {ok === null && <span className="text-xs cn-text-4">—</span>}
      </div>
    </div>
  );
}

function fileLine(label: string, f: StackBackupFileInfo | null) {
  if (!f || f.count === 0) return <p>{label}: none yet</p>;
  return <p>{label}: {timeAgo(f.newestAt)} · {formatBytes(f.sizeBytes)} · {f.count} kept</p>;
}

/**
 * Self-healing + backup-verification status for Hub Management → System.
 * Everything here is read from this hub's own citinet-admin sidecar via
 * citinet-api; nothing leaves the hub.
 */
export function StackHealthPanel({ hubSlug }: { hubSlug: string }) {
  const [health, setHealth] = useState<StackHealth | null>(null);
  const [alerts, setAlerts] = useState<StackAlert[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [h, a] = await Promise.all([hubService.getStackHealth(hubSlug), hubService.getStackAlerts(hubSlug)]);
      setHealth(h);
      setAlerts(a.alerts);
      setEmailConfigured(a.emailConfigured);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health');
    }
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);

  // While a restore test runs, check back every few seconds until it finishes.
  const drillRunning = !!health?.backups?.drill.running;
  useEffect(() => {
    if (!drillRunning && !starting) return;
    poll.current = setInterval(load, 4000);
    return () => clearInterval(poll.current);
  }, [drillRunning, starting, load]);
  useEffect(() => { if (drillRunning) setStarting(false); }, [drillRunning]);

  const runDrill = async () => {
    setStarting(true);
    try {
      await hubService.runRestoreDrill(hubSlug);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the restore test');
      setStarting(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3">
        <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
      </div>
    );
  }
  if (!health) return null;

  if (!health.available) {
    return health.outdated ? (
      <div className="cn-glass rounded-2xl p-4">
        <p className="text-sm font-medium cn-text-1 mb-1">Health monitoring needs an update</p>
        <p className="text-xs cn-text-3">
          This hub's <code className="cn-surface-3 px-1 rounded">citinet-admin</code> container is an older version.
          Update it to turn on automatic recovery, backup checks and restore tests.
        </p>
      </div>
    ) : null;
  }

  const open = alerts.filter(a => a.open);
  const b = health.backups;
  const wd = health.watchdog;
  const allGood = open.length === 0;

  return (
    <div className="space-y-3">
      {/* Headline: are there open problems? */}
      <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${allGood
        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20'}`}>
        {allGood
          ? <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          : <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${allGood ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'}`}>
            {allGood ? 'No problems found' : `${open.length} problem${open.length === 1 ? '' : 's'} need attention`}
          </p>
          {open.map(a => (
            <div key={a.id} className="mt-1.5">
              <p className="text-xs font-medium text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                {a.severity === 'warning' && <AlertTriangle className="w-3 h-3" />}{a.title}
                <span className="font-normal opacity-70">· {timeAgo(a.created_at)}</span>
              </p>
              {a.detail && <p className="text-xs text-rose-700 dark:text-rose-300 break-words">{a.detail}</p>}
            </div>
          ))}
          {allGood && wd?.lastTick && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Last checked {timeAgo(wd.lastTick)}. Stopped services are restarted automatically.</p>
          )}
        </div>
      </div>

      {b && (
        <div className="rounded-xl border cn-border cn-surface-2 divide-y divide-black/5 dark:divide-white/5">
          <Row icon={<Database className="w-4 h-4" />} label="Local backups" ok={b.local.ok}>
            {fileLine('Database', b.local.db)}
            {fileLine('Files', b.local.storage)}
            {b.local.problem && <p className="text-rose-600 dark:text-rose-400">{b.local.problem}</p>}
          </Row>

          <Row icon={<Cloud className="w-4 h-4" />} label="Off-site backup" ok={b.offsite.configured ? b.offsite.ok : null}>
            {b.offsite.configured ? (
              <>
                <p>Newest copy: {timeAgo(b.offsite.latestSnapshotAt)}</p>
                {b.offsite.problem && <p className="text-rose-600 dark:text-rose-400">{b.offsite.problem}</p>}
              </>
            ) : (
              <p>Not set up. Local backups live on this same machine, so they can't help if it's lost — see the Off-site backup tab.</p>
            )}
          </Row>

          <Row icon={<FlaskConical className="w-4 h-4" />} label="Restore test" ok={b.drill.lastRunAt ? b.drill.ok : null}>
            {b.drill.running || starting ? (
              <p className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Restoring a backup into a scratch database…</p>
            ) : b.drill.lastRunAt ? (
              <>
                <p>Last run {timeAgo(b.drill.lastRunAt)} — loads each backup into a throwaway database to prove it actually restores.</p>
                {b.drill.results.map(r => (
                  <p key={r.source} className={r.ok ? '' : 'text-rose-600 dark:text-rose-400'}>
                    {r.source === 'off-site' ? 'Off-site copy' : 'Local copy'}:{' '}
                    {r.ok ? `restored OK (${r.tables} tables, ${r.users} accounts)` : (r.detail || 'failed')}
                  </p>
                ))}
              </>
            ) : (
              <p>Runs weekly. Hasn't run yet on this hub.</p>
            )}
            {!b.drill.running && !starting && (
              <button onClick={runDrill} className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                Run restore test now
              </button>
            )}
          </Row>
        </div>
      )}

      <div className="rounded-xl border cn-border cn-surface-2 divide-y divide-black/5 dark:divide-white/5">
        <Row icon={<HeartPulse className="w-4 h-4" />} label="Outage alert" ok={wd?.heartbeatConfigured ? true : null}>
          {wd?.heartbeatConfigured ? (
            <>
              <p>This hub pings your monitoring service every minute while it's healthy. If the pings stop, that service alerts you — even if the whole machine is off.</p>
              {wd.lastPing && <p>Last ping {timeAgo(wd.lastPing.at)} — {wd.lastPing.ok ? 'accepted' : 'not accepted'}</p>}
            </>
          ) : (
            <p>Not set up. A hub that is completely off can't tell you itself — set up an outside monitor in <strong>Outage alert</strong> below.</p>
          )}
        </Row>
        <Row icon={<Mail className="w-4 h-4" />} label="Email alerts" ok={emailConfigured ? true : null}>
          {emailConfigured ? (
            <p>Admins with an email address are emailed when something critical happens.</p>
          ) : (
            <p>Off. Problems still appear here, but nobody is emailed. Turn it on in <strong>Email alerts</strong> below.</p>
          )}
        </Row>
      </div>

      {wd && wd.events.length > 0 && (
        <div className="rounded-xl border cn-border cn-surface-2 p-3">
          <p className="text-xs font-medium cn-text-2 mb-1.5">Recent automatic recoveries</p>
          <ul className="space-y-0.5">
            {wd.events.slice(0, 5).map((e, i) => (
              <li key={i} className="text-xs cn-text-3">
                {timeAgo(e.at)} — {e.service.replace('citinet-', '')} {e.action === 'restarted' ? 'was down and was restarted' : 'could not be restarted'}
                {e.reason ? ` (${e.reason})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
