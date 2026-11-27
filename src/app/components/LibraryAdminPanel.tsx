import { useCallback, useEffect, useState } from 'react';
import { Library, Loader2, Trash2 } from 'lucide-react';
import { GetContentPanel } from './GetContentPanel';
import { libraryService, formatBytes, LibraryUnsupportedError, type LibraryVault } from '../services/libraryService';

const cmd = 'px-2 py-1 rounded-md bg-black/5 dark:bg-white/8 text-[11px] cn-text-1 select-all';

/**
 * Hub Management → Apps → Library. Shows which Knowledge Vaults are on this hub and lets an admin
 * remove one. Importing is done with the hub helper on the machine that holds the drive, because
 * the hub runs in Docker and only the host can see USB sticks (see api/vaultCli.js).
 */
export function LibraryAdminPanel({ hubSlug }: { hubSlug: string }) {
  const [vaults, setVaults] = useState<LibraryVault[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(async () => {
    try {
      setVaults(await libraryService.vaults(hubSlug));
      setError('');
    } catch (e) {
      setError(e instanceof LibraryUnsupportedError ? e.message : e instanceof Error ? e.message : 'Failed to load vaults');
    }
  }, [hubSlug]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await libraryService.removeVault(hubSlug, id);
      setConfirmId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the vault');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white inline-flex items-center gap-2">
          <Library className="w-4 h-4" /> Library
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Offline reference material loaded from a Knowledge Vault drive. Everyone on this hub can read it, with no internet.
        </p>
      </div>

      <GetContentPanel hubSlug={hubSlug} onChanged={() => void load()} />

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-zinc-700 p-4 flex flex-col gap-3">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {vaults === null && !error && <Loader2 className="w-4 h-4 animate-spin cn-text-4" />}
        {vaults?.length === 0 && <p className="text-xs cn-text-3">No vaults imported yet.</p>}

        {vaults?.map(v => (
          <div key={v.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium cn-text-1 truncate">{v.name}</p>
              <p className="text-[11px] cn-text-3">
                {v.source_count} item{v.source_count === 1 ? '' : 's'} · {formatBytes(v.size_bytes)} ·{' '}
                {v.status === 'ready' ? `added ${new Date(v.imported_at).toLocaleDateString()}` : (
                  <span className="text-amber-600 dark:text-amber-400">import unfinished — run the import command again to resume</span>
                )}
              </p>
            </div>
            {confirmId === v.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setConfirmId('')} className="text-xs cn-text-3 hover:cn-text-1">Cancel</button>
                <button
                  onClick={() => remove(v.id)}
                  disabled={busy === v.id}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
                >
                  {busy === v.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmId(v.id)} aria-label={`Remove ${v.name}`}
                className="w-8 h-8 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        <div className="border-t border-slate-200 dark:border-zinc-700 pt-3 text-xs cn-text-3 flex flex-col gap-1.5">
          <p className="font-semibold cn-text-2">No internet on this hub? Add a vault from a drive</p>
          <p>On the computer that runs this hub (Windows: <code className={cmd}>.\citinet.ps1</code>, Mac/Linux: <code className={cmd}>./citinet.sh</code>):</p>
          <p><code className={cmd}>vault check &lt;drive or folder&gt;</code> verify it first</p>
          <p><code className={cmd}>vault import &lt;drive or folder&gt;</code> load it into this hub (asks for your admin login; safe to re-run if interrupted)</p>
        </div>
      </div>
    </div>
  );
}
