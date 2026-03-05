import { X, Activity, Server, Clock, Users, ArrowRight, CheckCircle2, WifiOff, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useHub, useHubStatus } from '../context/HubContext';

interface SignalDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HubStatusData {
  uptime: string;
  user_count: number;
}

function tunnelType(url: string): string {
  if (!url || url === 'https://' || url === 'http://') return 'Not configured';
  if (url.includes('.ts.net'))   return 'Tailscale Funnel';
  if (url.includes('localhost') || url.includes('192.168') || url.includes('10.')) return 'Local Network';
  if (url.includes('trycloudflare') || url.includes('cloudflare')) return 'Cloudflare Tunnel';
  return 'Custom Tunnel';
}

function latencyColor(ms: number | null) {
  if (ms === null) return 'text-slate-400 dark:text-slate-500';
  if (ms < 100)   return 'text-green-600 dark:text-green-400';
  if (ms < 300)   return 'text-yellow-600 dark:text-yellow-400';
  return 'text-orange-600 dark:text-orange-400';
}

function latencyLabel(ms: number | null) {
  if (ms === null) return '—';
  if (ms < 100)   return 'Low';
  if (ms < 300)   return 'Moderate';
  return 'High';
}

export function SignalDiagnosticsModal({ isOpen, onClose }: SignalDiagnosticsModalProps) {
  const { currentHub } = useHub();
  const { status, label: statusLabel, dotColor } = useHubStatus();

  const [latency, setLatency] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [hubStatus, setHubStatus] = useState<HubStatusData | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isReachable = status === 'connected' || status === 'connecting';

  async function measure() {
    if (!tunnelUrl || !isReachable) {
      setLatency(null);
      return;
    }
    setMeasuring(true);
    try {
      // Measure round-trip to /health (no auth required, minimal payload)
      const t0 = performance.now();
      await fetch(`${tunnelUrl}/health`, { method: 'HEAD', cache: 'no-store' });
      setLatency(Math.round(performance.now() - t0));

      // Also fetch /api/status for uptime + user count
      const res = await fetch(`${tunnelUrl}/api/status`, { cache: 'no-store' });
      if (res.ok) setHubStatus(await res.json());
    } catch {
      setLatency(null);
    } finally {
      setMeasuring(false);
      setLastChecked(new Date());
    }
  }

  useEffect(() => {
    if (isOpen) measure();
  }, [isOpen]);

  if (!isOpen) return null;

  const tType = tunnelType(tunnelUrl);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full max-h-[85vh] shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">

        {/* Header */}
        <div className={`relative p-6 text-white ${
          status === 'connected'   ? 'bg-gradient-to-br from-green-600 to-emerald-600' :
          status === 'connecting'  ? 'bg-gradient-to-br from-yellow-500 to-amber-500' :
          status === 'unreachable' ? 'bg-gradient-to-br from-orange-600 to-red-600' :
                                     'bg-gradient-to-br from-slate-600 to-slate-700'
        }`}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Hub Connection</h3>
              <p className="text-white/80 text-sm mt-0.5 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${status === 'connected' ? 'animate-pulse' : ''}`} />
                {statusLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* Latency */}
          <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-white">Round-trip Latency</span>
              </div>
              <button
                onClick={measure}
                disabled={measuring || !isReachable}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {measuring ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {measuring ? 'Measuring…' : 'Re-test'}
              </button>
            </div>

            {!isReachable ? (
              <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                <WifiOff className="w-4 h-4" />
                <span className="text-sm">Hub not reachable — cannot measure latency</span>
              </div>
            ) : measuring && latency === null ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Measuring…</span>
              </div>
            ) : (
              <div className="flex items-end gap-3">
                <span className={`text-3xl font-bold tabular-nums ${latencyColor(latency)}`}>
                  {latency !== null ? `${latency}ms` : '—'}
                </span>
                <span className={`text-sm font-medium mb-0.5 ${latencyColor(latency)}`}>
                  {latencyLabel(latency)}
                </span>
              </div>
            )}
            {lastChecked && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Measured {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Hub stats from /api/status */}
          {hubStatus && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Uptime</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{hubStatus.uptime}</p>
              </div>
              <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Members</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{hubStatus.user_count}</p>
              </div>
            </div>
          )}

          {/* Connection path */}
          <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Connection Path</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 text-xs font-medium text-slate-700 dark:text-slate-300">
                Your Browser
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 text-xs font-medium text-slate-700 dark:text-slate-300">
                {tType}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 text-xs font-medium text-slate-700 dark:text-slate-300">
                {currentHub?.name || 'Hub'} API
              </span>
            </div>
            {tunnelUrl && (
              <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-2 break-all">{tunnelUrl}</p>
            )}
          </div>

          {/* Status summary */}
          <div className={`rounded-xl p-4 flex items-start gap-3 ${
            isReachable
              ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40'
              : 'bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40'
          }`}>
            {isReachable
              ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              : <WifiOff className="w-4 h-4 text-orange-500 dark:text-orange-400 mt-0.5 shrink-0" />
            }
            <div>
              <p className={`text-sm font-medium ${isReachable ? 'text-green-800 dark:text-green-300' : 'text-orange-800 dark:text-orange-300'}`}>
                {isReachable ? 'Hub is reachable' : 'Hub is not reachable'}
              </p>
              <p className={`text-xs mt-0.5 ${isReachable ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}`}>
                {isReachable
                  ? 'You have an active connection to your hub.'
                  : 'Check that your hub is running and your tunnel URL is correct.'}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
