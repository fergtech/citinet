import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, RefreshCw, Loader2, CheckCircle2, AlertTriangle, ArrowUpCircle } from 'lucide-react';
import { hubService } from '../services/hubService';
import { snoozeUpdate } from '../utils/updateSnooze';
import type { StackUpdates, StackUpdateService } from '../types/hub';

const RECENT_RESULT_MS = 10 * 60 * 1000;

function fmtDate(iso?: string | null): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} hr ago` : `${Math.round(hrs / 24)} days ago`;
}

const label = (s: string) => s.replace(/^citinet-/, '');

const STEP_TEXT: Record<string, string> = {
  pulling: 'Downloading the new version…',
  switching: 'Switching over — your hub restarts for a moment…',
  verifying: 'Making sure the new version is healthy…',
};

/**
 * Update watchdog panel for Hub Management → System. Compares what this hub's
 * containers are running with what has been published, and lets an admin apply
 * it. Never updates anything by itself — and a failed update rolls back, so the
 * hub keeps running its previous version.
 */
export function UpdatesPanel({ hubSlug }: { hubSlug: string }) {
  const [data, setData] = useState<StackUpdates | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [watching, setWatching] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const failures = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await hubService.getStackUpdates(hubSlug);
      failures.current = 0;
      setReconnecting(false);
      setData(d);
      setError('');
      return d;
    } catch (err) {
      // While the API restarts during a swap, a few failed polls are expected.
      failures.current += 1;
      setReconnecting(true);
      if (failures.current > 40) setError(err instanceof Error ? err.message : 'Could not reach the hub');
      return null;
    }
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);

  const applyRunning = !!data?.apply?.running;
  useEffect(() => {
    if (!applyRunning && !watching) return;
    const t = setInterval(async () => {
      const d = await load();
      // The sidecar reports the outcome; stop watching once it says it's finished.
      if (d && !d.apply?.running && d.apply?.finishedAt) setWatching(false);
    }, 3000);
    return () => clearInterval(t);
  }, [applyRunning, watching, load]);

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    try {
      setData(await hubService.checkStackUpdates(hubSlug));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async (service: string) => {
    setStarting(true);
    setError('');
    try {
      await hubService.applyStackUpdate(hubSlug, service);
      setConfirming(null);
      setWatching(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update could not be started');
    } finally {
      setStarting(false);
    }
  };

  if (!data) {
    return error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null;
  }
  if (!data.available) return null; // no sidecar — SystemTab already explains that
  if (data.outdated) {
    return (
      <div className="cn-glass rounded-2xl p-4">
        <p className="text-sm font-medium cn-text-1">Updates</p>
        <p className="text-xs cn-text-3 mt-1">
          This hub's admin sidecar predates update checks. Update it once from the host
          (run <code className="cn-surface-3 px-1 rounded">citinet update</code>) and this card will start working.
        </p>
      </div>
    );
  }

  const services = data.services ?? [];
  const apply = data.apply;
  const recentResult =
    apply && !apply.running && apply.finishedAt && Date.now() - new Date(apply.finishedAt).getTime() < RECENT_RESULT_MS
      ? apply
      : null;
  const busy = applyRunning || watching;
  const pending = services.filter((s) => s.updateAvailable);

  const row = (s: StackUpdateService) => (
    <div key={s.service} className="p-3 flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        {s.updateAvailable
          ? <ArrowUpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          : <CheckCircle2 className={`w-4 h-4 ${s.note ? 'cn-text-4' : 'text-emerald-600 dark:text-emerald-400'}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium cn-text-1 capitalize">{label(s.service)}</p>
        <p className="text-xs cn-text-3 mt-0.5">
          {s.note
            ? s.note
            : s.updateAvailable
              ? `Running a build from ${fmtDate(s.current?.created)} · new version published ${fmtDate(s.latest?.created)}`
              : `Up to date · build from ${fmtDate(s.current?.created)}`}
        </p>
        {s.updateAvailable && !s.canApply && (
          <p className="text-[11px] cn-text-4 mt-1">
            Update this one from the host: run <code className="cn-surface-3 px-1 rounded">citinet update</code>.
          </p>
        )}
        {s.updateAvailable && s.canApply && confirming === s.service && !busy && (
          <div className="mt-2 rounded-lg cn-surface-2 p-2.5 space-y-2">
            <p className="text-xs cn-text-2">
              Your hub restarts for about a minute. Your data isn't touched, and if the new
              version doesn't start cleanly it's rolled back automatically.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleApply(s.service)}
                disabled={starting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Update now
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium cn-text-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {s.updateAvailable && s.canApply && confirming !== s.service && !busy && (
        <div className="shrink-0 flex gap-1.5">
          <button
            onClick={() => setConfirming(s.service)}
            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
          >
            Update
          </button>
          <button
            onClick={() => { snoozeUpdate(hubSlug, s.service, s.latest?.digest ?? null); setConfirming(null); }}
            className="px-2.5 py-1.5 rounded-lg cn-surface hover:bg-black/5 dark:hover:bg-white/5 border cn-border text-xs font-medium cn-text-2"
            title="Stop reminding me about this version for a few days"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 cn-text-3" />
        <h4 className="text-sm font-semibold cn-text-1">Updates</h4>
        {pending.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">{pending.length} available</span>
        )}
        <button
          onClick={handleCheck}
          disabled={checking || busy}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium cn-text-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          Check now
        </button>
      </div>
      <p className="text-xs cn-text-3">
        Citinet checks for newer versions of this hub's software every few hours
        {data.checkedAt ? ` (last checked ${timeAgo(data.checkedAt)})` : ''}. Nothing updates unless you say so.
      </p>

      {data.error && (
        <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {data.error}
        </p>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {busy && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 flex items-center gap-2.5">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-xs text-blue-800 dark:text-blue-200">
            {reconnecting && !applyRunning
              ? 'Reconnecting to your hub as it restarts…'
              : STEP_TEXT[apply?.step ?? 'pulling'] ?? 'Updating…'}
          </p>
        </div>
      )}

      {!busy && recentResult && (
        <div
          className={`rounded-xl border p-3 flex items-start gap-2.5 ${recentResult.ok
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
            : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20'}`}
        >
          {recentResult.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="text-xs cn-text-1">{recentResult.message}</p>
            {recentResult.ok && (
              <button
                onClick={() => window.location.reload()}
                className="mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline"
              >
                Reload to use the new version
              </button>
            )}
          </div>
        </div>
      )}

      <div className="cn-glass rounded-2xl divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
        {services.length === 0
          ? <p className="p-3 text-xs cn-text-3">No version information yet — the first check runs a couple of minutes after the hub starts.</p>
          : services.map(row)}
      </div>
    </div>
  );
}
