import { useState, useEffect, useCallback } from 'react';
import { Server, RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import { hubService } from '../services/hubService';
import type { StackServiceStatus } from '../types/hub';

interface SystemTabProps {
  hubSlug: string;
}

const SERVICE_LABELS: Record<string, string> = {
  'citinet-api': 'API',
  'citinet-db': 'Database',
  'citinet-storage': 'File storage',
  'citinet-caddy': 'HTTPS / reverse proxy',
  'citinet-backup': 'Backups',
  'citinet-admin': 'Admin sidecar',
  'citinet-livekit': 'Calls & broadcasts',
  'citinet-ollama': 'AI assistant',
};

function StateBadge({ state, present }: { state?: string; present: boolean }) {
  if (!present) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium cn-text-4">not running</span>;
  }
  if (state === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> running
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
      <XCircle className="w-3.5 h-3.5" /> {state || 'stopped'}
    </span>
  );
}

function ServiceRow({
  item, onRestart, restarting,
}: {
  item: StackServiceStatus; onRestart: (service: string) => void; restarting: boolean;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const label = SERVICE_LABELS[item.service] || item.service;

  return (
    <div className="rounded-xl border cn-border cn-surface-2 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium cn-text-1">{label}</p>
          <p className="text-xs cn-text-4 font-mono">{item.service}</p>
        </div>
        <div className="text-right shrink-0">
          <StateBadge state={item.state} present={item.present} />
          {item.status && <p className="text-xs cn-text-4 mt-0.5">{item.status}</p>}
        </div>
        {item.present && item.recentLogs && (
          <button
            onClick={() => setShowLogs(v => !v)}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title={showLogs ? 'Hide recent logs' : 'Show recent logs'}
          >
            {showLogs ? <ChevronUp className="w-4 h-4 cn-text-4" /> : <ChevronDown className="w-4 h-4 cn-text-4" />}
          </button>
        )}
        {item.present && item.restartable && (
          <button
            onClick={() => onRestart(item.service)}
            disabled={restarting}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-surface hover:bg-black/5 dark:hover:bg-white/5 border cn-border text-xs font-medium cn-text-2 transition-colors disabled:opacity-50"
            title="Restart this service"
          >
            {restarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Restart
          </button>
        )}
      </div>
      {showLogs && (
        <pre className="text-[11px] font-mono leading-relaxed cn-text-3 bg-black/5 dark:bg-white/5 p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
          {item.recentLogs || '(no recent output)'}
        </pre>
      )}
    </div>
  );
}

/**
 * Admin-only stack status + restart panel, backed by citinet-admin (an
 * internal-only Docker sidecar never reachable from outside the Docker
 * network -- see admin-sidecar/server.js and hubService.ts's
 * getStackStatus/restartStackService). Hubs that predate this feature (or
 * where citinet-admin simply isn't running) show a clear "not set up" state
 * instead of an error, mirroring OffsiteBackupTab's "predates support"
 * messaging pattern.
 */
export function SystemTab({ hubSlug }: SystemTabProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [services, setServices] = useState<StackServiceStatus[]>([]);
  const [error, setError] = useState('');
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [restartError, setRestartError] = useState('');

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const result = await hubService.getStackStatus(hubSlug);
      setAvailable(result.available);
      setServices(result.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stack status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hubSlug]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleRestart = async (service: string) => {
    setRestartingService(service);
    setRestartError('');
    try {
      await hubService.restartStackService(hubSlug, service);
      // Give the container a moment to actually restart before re-reading status.
      setTimeout(() => fetchStatus(true), 2000);
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Restart failed');
    } finally {
      setRestartingService(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4 cn-text-3" />
        <h3 className="text-sm font-semibold cn-text-1">System</h3>
        <button
          onClick={() => fetchStatus(true)}
          disabled={refreshing || loading}
          className="ml-auto w-7 h-7 rounded-lg cn-surface-2 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 cn-text-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs cn-text-3">
        Live status for this hub's own containers, read directly from Docker on the
        hub machine — not from Citinet's servers.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-12 cn-text-4">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {!loading && !error && available === false && (
        <div className="cn-glass rounded-2xl p-5 text-center">
          <p className="text-sm font-medium cn-text-1 mb-1">Not set up on this hub yet</p>
          <p className="text-xs cn-text-3 max-w-sm mx-auto">
            This hub doesn't have <code className="cn-surface-3 px-1 rounded">citinet-admin</code>{' '}
            running. Re-download and re-run your hub's setup script (safe — it only
            updates <code className="cn-surface-3 px-1 rounded">docker-compose.yml</code>, never
            your data) to add it.
          </p>
        </div>
      )}

      {!loading && !error && available === true && (
        <div className="space-y-2">
          {restartError && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3">
              <p className="text-xs text-rose-700 dark:text-rose-300">{restartError}</p>
            </div>
          )}
          {services.map(item => (
            <ServiceRow
              key={item.service}
              item={item}
              onRestart={handleRestart}
              restarting={restartingService === item.service}
            />
          ))}
        </div>
      )}
    </div>
  );
}
