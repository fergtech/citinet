import { useRef, useState } from 'react';
import { Download, Loader2, Check, AlertTriangle } from 'lucide-react';
import {
  EXPORT_PARTS,
  buildAccountExport,
  downloadExport,
  type ExportPart,
  type ExportResult,
} from '../utils/accountExport';

interface Props {
  hubSlug: string;
  hubName?: string;
}

/**
 * "Your Data" — lets a member download their own data from this hub as a zip,
 * either everything or only the parts they pick (e.g. just Atlas pins, or just
 * files). The work happens in the browser so encrypted notes/messages/files can
 * be decrypted with the key held on this device.
 */
export function AccountExportCard({ hubSlug, hubName }: Props) {
  const [selected, setSelected] = useState<Set<ExportPart>>(
    () => new Set(EXPORT_PARTS.map((p) => p.id)),
  );
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [fraction, setFraction] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [fatal, setFatal] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const toggle = (id: ExportPart) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = selected.size === EXPORT_PARTS.length;

  const run = async () => {
    setRunning(true);
    setResult(null);
    setFatal('');
    setFraction(0);
    setPhase('Starting…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await buildAccountExport(hubSlug, {
        parts: [...selected],
        signal: controller.signal,
        onProgress: (p) => { setPhase(p.phase); setFraction(p.fraction); },
      });
      setResult(res);
      downloadExport(res);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setFatal(e instanceof Error ? e.message : 'Export failed');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Download className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Export your data</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
          Download your own data from {hubName || 'this hub'} to this device. Pick everything, or only
          what you need. Encrypted notes, messages and files are decrypted on this device, so they
          are readable in the download.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-zinc-400">{selected.size} of {EXPORT_PARTS.length} selected</span>
        <button
          type="button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(EXPORT_PARTS.map((p) => p.id)))}
          disabled={running}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <div className="space-y-1.5">
        {EXPORT_PARTS.map((p) => (
          <label
            key={p.id}
            className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50"
          >
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              disabled={running}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900 dark:text-white">{p.label}</span>
              <span className="block text-xs text-slate-500 dark:text-zinc-400">{p.description}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
        Messages include what other people wrote in conversations you are part of. Your encryption
        keys are never included.
      </p>

      {running ? (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{phase}</span>
            <button type="button" onClick={() => abortRef.current?.abort()} className="font-medium hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={selected.size === 0}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          <Download className="w-4 h-4" /> Download my data
        </button>
      )}

      {fatal && <p className="text-xs text-red-500">{fatal}</p>}

      {result && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3 space-y-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" /> Downloaded {result.filename}
          </p>
          <p className="text-slate-600 dark:text-zinc-400">
            {Object.entries(result.counts).map(([k, v]) => `${v} ${k}`).join(' · ')}
          </p>
          {(result.warnings.length > 0 || result.errors.length > 0) && (
            <div className="space-y-1 text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {result.errors.length > 0 ? 'Some parts could not be exported' : 'Some items were left out'}
              </p>
              <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">
                {[...result.errors, ...result.warnings].slice(0, 25).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="text-slate-500 dark:text-zinc-500">Full details are in manifest.json inside the download.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
