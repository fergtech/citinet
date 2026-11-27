import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCw, X } from 'lucide-react';
import { libraryService, formatBytes, LibraryUnsupportedError, type Pack, type PacksResponse } from '../services/libraryService';

const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0);

/**
 * Library → Get content. One click installs a pack: the hub downloads it straight from Kiwix (a free,
 * open library project) in the background, checks it, and it appears in the Library for everyone on the
 * hub. Internet is needed only for the download. See api/knowledgePacks.js for how it's fetched safely.
 */
export function GetContentPanel({ hubSlug, onChanged }: { hubSlug: string; onChanged?: () => void }) {
  const [data, setData] = useState<PacksResponse | null>(null);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [busyPack, setBusyPack] = useState('');
  const [confirmCancel, setConfirmCancel] = useState('');
  const [actionError, setActionError] = useState<{ pack: string; message: string } | null>(null);
  const prevStates = useRef<Record<string, string>>({});
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async (resolve = false) => {
    try {
      const d = await libraryService.packs(hubSlug, resolve);
      // Tell the Library when something finished, so new content shows up without a reload.
      for (const p of d.packs) {
        const before = prevStates.current[p.id];
        if (before && before !== 'installed' && p.state === 'installed') onChangedRef.current?.();
        prevStates.current[p.id] = p.state;
      }
      setData(d);
      setError('');
    } catch (e) {
      if (e instanceof LibraryUnsupportedError) setUnsupported(true);
      else setError(e instanceof Error ? e.message : 'Could not load content packs');
    }
  }, [hubSlug]);

  // Packs first (instant), then their sizes, which take a while to look up from Kiwix.
  const [sizing, setSizing] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSizing(true);
      await load(false);
      if (cancelled) return;
      await load(true);
      if (!cancelled) setSizing(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Poll while something is downloading, so the progress bar moves.
  const downloading = data?.packs.some(p => p.state === 'installing') ?? false;
  useEffect(() => {
    if (!downloading) return;
    const t = setInterval(() => { void load(false); }, 2000);
    return () => clearInterval(t);
  }, [downloading, load]);

  const install = async (pack: Pack) => {
    setBusyPack(pack.id);
    setActionError(null);
    try {
      await libraryService.installPack(hubSlug, pack.id);
      await load(false);
    } catch (e) {
      setActionError({ pack: pack.id, message: e instanceof Error ? e.message : 'Could not start the download' });
    } finally {
      setBusyPack('');
    }
  };

  const cancel = async (pack: Pack) => {
    setBusyPack(pack.id);
    setActionError(null);
    try {
      await libraryService.cancelPack(hubSlug, pack.id);
      setConfirmCancel('');
      await load(false);
      onChangedRef.current?.();
    } catch (e) {
      setActionError({ pack: pack.id, message: e instanceof Error ? e.message : 'Could not cancel' });
    } finally {
      setBusyPack('');
    }
  };

  if (unsupported) return null; // an old hub: the Library screen already explains this
  const sizeKnown = (p: Pack) => p.totalBytes !== null;

  return (
    <div className="cn-glass rounded-2xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold cn-text-1 inline-flex items-center gap-2"><Download className="w-4 h-4" /> Get content</h2>
        <p className="text-xs cn-text-3 mt-1 leading-relaxed">
          One click and this hub downloads it for you, straight from Kiwix, a free library project. You only need internet for the
          download. When it's done, everyone on this hub can read it with no internet at all.
          {data?.freeBytes != null && <> Free space on this hub: <strong className="cn-text-2">{formatBytes(data.freeBytes)}</strong>.</>}
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {!data && !error && <Loader2 className="w-5 h-5 animate-spin cn-text-4" />}
      {data && sizing && (
        <p className="text-[11px] cn-text-4 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking sizes with Kiwix…
        </p>
      )}
      {data && !data.canInstall && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          This hub's storage isn't set up for downloads yet. It needs a software update, then a restart.
        </p>
      )}
      {data?.resolveError && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          Couldn't reach Kiwix to look up sizes. Check this hub's internet connection.
          <button onClick={() => void load(true)} className="underline font-semibold">Try again</button>
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {data?.packs.map(p => {
          const done = p.items.reduce((n, i) => n + i.done, 0);
          const total = p.items.reduce((n, i) => n + (i.total || 0), 0);
          const current = p.items.find(i => i.status === 'downloading' || i.status === 'verifying');
          const here = actionError?.pack === p.id ? actionError.message : '';
          const otherBusy = !!data.busy && p.state !== 'installing';
          return (
            <div key={p.id} className="rounded-2xl border cn-border p-4 flex flex-col gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold cn-text-1">{p.title}</h3>
                  {sizeKnown(p) && <span className="text-[11px] font-semibold cn-text-3 shrink-0">{formatBytes(p.totalBytes!)}</span>}
                </div>
                <p className="text-xs cn-text-3 mt-1 leading-relaxed">{p.description}</p>
              </div>

              <ul className="text-[11px] cn-text-3 flex flex-col gap-1">
                {p.items.map(i => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {i.status === 'done' ? '✓ ' : ''}{i.title}
                    </span>
                    {i.size !== null && <span className="shrink-0">{formatBytes(i.size)}</span>}
                  </li>
                ))}
              </ul>

              {p.state === 'installing' && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    {total > 0
                      ? <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct(done, total)}%` }} />
                      : <div className="h-full w-1/3 bg-blue-500 animate-pulse" />}
                  </div>
                  <p className="text-[11px] cn-text-3">
                    {total > 0 ? `${pct(done, total)}% · ${formatBytes(done)} of ${formatBytes(total)}` : 'Starting…'}
                    {current ? ` · ${current.status === 'verifying' ? 'Checking' : 'Downloading'} ${current.title}` : ''}
                  </p>
                  <p className="text-[10px] cn-text-4">It keeps going on the hub if you close this page.</p>
                  {confirmCancel === p.id ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setConfirmCancel('')} className="text-xs cn-text-3 hover:cn-text-1">Keep going</button>
                      <button onClick={() => cancel(p)} disabled={busyPack === p.id}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-60">
                        {busyPack === p.id ? 'Stopping…' : 'Stop and discard'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmCancel(p.id)} className="self-start inline-flex items-center gap-1 text-xs cn-text-3 hover:cn-text-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  )}
                </div>
              )}

              {p.state === 'installed' && (
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Installed — it's in the Library
                </p>
              )}

              {(p.state === 'failed' || p.state === 'paused') && (
                <div className="flex flex-col gap-2">
                  <p className={`text-xs ${p.state === 'failed' ? 'text-red-500' : 'cn-text-3'}`}>
                    {p.state === 'failed' ? (p.error || 'The download stopped.') : 'Partly downloaded — it will carry on where it left off.'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => install(p)} disabled={busyPack === p.id || otherBusy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50">
                      <RotateCw className="w-3.5 h-3.5" /> {p.state === 'failed' ? 'Retry' : 'Resume'}
                    </button>
                    <button onClick={() => cancel(p)} disabled={busyPack === p.id} className="text-xs cn-text-3 hover:cn-text-1">Discard</button>
                  </div>
                </div>
              )}

              {p.state === 'available' && (
                <button onClick={() => install(p)} disabled={busyPack === p.id || otherBusy || !data.canInstall || !!data.resolveError}
                  title={otherBusy ? 'Another pack is downloading — wait for it to finish' : undefined}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {busyPack === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {busyPack === p.id ? 'Starting…' : sizeKnown(p) ? `Install · ${formatBytes(p.totalBytes!)}` : 'Install'}
                </button>
              )}

              {here && <p className="text-xs text-red-500 leading-relaxed">{here}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
