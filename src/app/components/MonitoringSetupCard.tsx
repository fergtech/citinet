import { useState, useEffect, useCallback } from 'react';
import { HeartPulse, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { hubService } from '../services/hubService';

const inputCls = 'w-full px-3 py-2 rounded-lg border cn-border cn-surface-1 text-sm cn-text-1 placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono';

type Provider = 'kuma' | 'healthchecks';

const STEPS: Record<Provider, { title: string; steps: string[] }> = {
  kuma: {
    title: 'Uptime Kuma',
    steps: [
      'Run Uptime Kuma on a different device than this hub — a Raspberry Pi, a second hub, a cheap VPS. (If it runs on this same machine it goes down with it and cannot warn you.)',
      'In Kuma: Add New Monitor → type "Push".',
      'Set "Heartbeat Interval" to 120 seconds (this hub pings every minute), then add your email under Notifications.',
      'Copy the "Push URL" Kuma shows and paste it below.',
    ],
  },
  healthchecks: {
    title: 'Healthchecks.io',
    steps: [
      'Create a free account at healthchecks.io and add a check.',
      'Set Period to 5 minutes and Grace Time to 5 minutes (this hub pings every minute).',
      'Add your email under Integrations.',
      'Copy the check\'s ping URL and paste it below.',
    ],
  },
};

function timeAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 90) return 'a moment ago';
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} hr ago`;
}

/**
 * Outage-alert setup. A hub that is completely off can't tell you it's off, so
 * this hub pings an outside monitor once a minute while healthy; when the pings
 * stop, THAT service (Uptime Kuma, Healthchecks.io, ...) emails you. The ping URL
 * is a secret, so it's stored encrypted on this hub and only shown masked.
 */
export function MonitoringSetupCard({ hubSlug }: { hubSlug: string }) {
  const [lastPing, setLastPing] = useState<{ at: string; ok: boolean } | null>(null);
  const [configured, setConfigured] = useState(false);
  const [masked, setMasked] = useState('');
  const [provider, setProvider] = useState<Provider>('kuma');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const s = await hubService.getMonitoringSettings(hubSlug);
      setConfigured(s.configured);
      setMasked(s.pingUrlMasked);
      setLoadError('');
      // Best-effort: the sidecar may be missing or older; the card works without it.
      hubService.getStackHealth(hubSlug).then(h => setLastPing(h.watchdog?.lastPing ?? null)).catch(() => {});
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load monitoring settings');
    }
  }, [hubSlug]);
  useEffect(() => { load(); }, [load]);

  const saveAndTest = async () => {
    setBusy('save'); setResult(null);
    try {
      const t = await hubService.testMonitoringSettings(hubSlug, url.trim());
      if (!t.ok) {
        setResult({ ok: false, message: t.error || 'The monitoring service did not accept the ping.' });
        return;
      }
      await hubService.saveMonitoringSettings(hubSlug, url.trim());
      setUrl('');
      setResult({ ok: true, message: 'Saved. A test ping went through, and this hub will now ping every minute while it is healthy. The change is picked up within about 5 minutes.' });
      await load();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setBusy(null); }
  };

  const retest = async () => {
    setBusy('test'); setResult(null);
    try {
      const t = await hubService.testMonitoringSettings(hubSlug);
      setResult(t.ok ? { ok: true, message: 'Ping accepted.' } : { ok: false, message: t.error || 'The ping was not accepted.' });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed.' });
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove'); setResult(null);
    try {
      await hubService.deleteMonitoringSettings(hubSlug);
      await load();
      setResult({ ok: true, message: 'Removed. Pings stop within about 5 minutes — your monitoring service will then report this hub as down.' });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Could not remove.' });
    } finally { setBusy(null); }
  };

  if (loadError) {
    return <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3"><p className="text-xs text-rose-700 dark:text-rose-300">{loadError}</p></div>;
  }

  return (
    <div className="cn-glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <HeartPulse className="w-4 h-4 cn-text-3" />
        <h4 className="text-sm font-semibold cn-text-1">Outage alert</h4>
        {configured && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> on
          </span>
        )}
      </div>
      <p className="text-xs cn-text-3">
        If this hub's machine loses power or its network, it cannot email you about it. So this hub checks in with an outside
        monitor once a minute; if the check-ins stop, that service alerts you. Nothing here goes through Citinet.
      </p>

      {configured && (
        <div className="text-xs cn-text-3 space-y-0.5">
          <p>Pinging <code className="cn-surface-3 px-1 rounded">{masked}</code></p>
          {lastPing && <p>Last ping {timeAgo(lastPing.at)} — {lastPing.ok ? 'accepted' : 'not accepted'}</p>}
        </div>
      )}

      <div className="flex gap-1.5">
        {(['kuma', 'healthchecks'] as Provider[]).map(p => (
          <button key={p} type="button" onClick={() => setProvider(p)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${provider === p
              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
              : 'cn-border cn-surface-2 cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'}`}>
            {STEPS[p].title}
          </button>
        ))}
      </div>
      <ol className="list-decimal pl-5 space-y-1 text-xs cn-text-3">
        {STEPS[provider].steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      <div>
        <label className="block text-xs font-medium cn-text-2 mb-1">{configured ? 'Replace ping URL' : 'Ping URL'}</label>
        <input className={inputCls} value={url} onChange={e => { setUrl(e.target.value); setResult(null); }}
          placeholder={provider === 'kuma' ? 'http://your-kuma:3001/api/push/XXXXXXXX?status=up&msg=OK&ping=' : 'https://hc-ping.com/your-uuid'} autoComplete="off" />
      </div>

      {result && (
        <div className={`rounded-lg border p-2.5 flex items-start gap-2 text-xs ${result.ok
          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
          : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'}`}>
          {result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="break-words">{result.message}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={saveAndTest} disabled={!url.trim() || busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
          {busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Test &amp; save
        </button>
        {configured && (
          <>
            <button onClick={retest} disabled={busy !== null} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
              {busy === 'test' ? 'Pinging…' : 'Send a test ping'}
            </button>
            <button onClick={remove} disabled={busy !== null} className="ml-auto text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50">
              {busy === 'remove' ? 'Removing…' : 'Remove'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
