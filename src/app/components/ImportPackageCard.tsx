import { useRef, useState } from 'react';
import { Upload, Loader2, Check, AlertTriangle, KeyRound, Copy } from 'lucide-react';
import {
  inspectPackageFile, loadPackage, summarizePackage, checkAccountIsFresh, importPackage, wasPackageImported,
  type LoadedPackage, type PackageSummary, type ImportOptions, type ImportReport,
} from '../utils/accountImport';
import type { ContainerMeta } from '../utils/portableContainer';
import { PACKAGE_EXTENSION } from '../utils/portablePackage';

const inputCls = 'w-full px-3 py-2 rounded-lg border cn-border cn-surface-1 text-sm cn-text-1 placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

type Stage = 'pick' | 'unlock' | 'choose' | 'running' | 'done';

const DEFAULTS: ImportOptions = {
  adoptKeys: true, profile: true, settings: true, notes: true, conversationsAsNotes: true,
  files: true, posts: true, atlas: false, marketplace: false,
};

/**
 * "Bring an account from another hub": the other half of "Move to another hub".
 * Pick the package file, unlock it, choose what to bring over, and import into
 * THIS account. Public-by-nature things (map pins, marketplace listings) start
 * unchecked, since they would appear on this hub's public map/market.
 */
export function ImportPackageCard({ hubSlug, hubName }: { hubSlug: string; hubName?: string }) {
  const [stage, setStage] = useState<Stage>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<ContainerMeta | null>(null);
  const [secret, setSecret] = useState('');
  const [pkg, setPkg] = useState<LoadedPackage | null>(null);
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [fresh, setFresh] = useState<{ fresh: boolean; reasons: string[] } | null>(null);
  const [opts, setOpts] = useState<ImportOptions>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [fraction, setFraction] = useState(0);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setStage('pick'); setFile(null); setMeta(null); setSecret(''); setPkg(null); setSummary(null); setFresh(null);
    setOpts(DEFAULTS); setBusy(false); setReport(null); setError(''); setCopied(false);
  };

  const onPick = async (f: File | null) => {
    setError('');
    if (!f) return;
    try {
      const m = await inspectPackageFile(f);
      setFile(f); setMeta(m); setStage('unlock');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const unlock = async () => {
    if (!file) return;
    setBusy(true); setError(''); setPhase('Unlocking…'); setFraction(0);
    try {
      const loaded = await loadPackage(file, secret, (f) => setFraction(f));
      const s = summarizePackage(loaded);
      const freshness = s.hasKeys ? await checkAccountIsFresh(hubSlug) : { fresh: false, reasons: [] };
      setPkg(loaded); setSummary(s); setFresh(freshness);
      setOpts({ ...DEFAULTS, adoptKeys: s.hasKeys && freshness.fresh });
      setStage('choose');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the package.');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!pkg) return;
    setStage('running'); setError(''); setFraction(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await importPackage(
        hubSlug, pkg,
        { ...opts, reusePhrase: meta?.hint === 'recovery-phrase' ? secret : undefined },
        (p, f) => { setPhase(p); setFraction(f); },
        controller.signal,
      );
      setReport(r); setStage('done');
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'AbortError' ? 'Import cancelled — whatever was already added stays.' : e instanceof Error ? e.message : 'Import failed.');
      setStage('choose');
    } finally {
      abortRef.current = null;
    }
  };

  const toggle = (k: keyof ImportOptions) => setOpts(o => ({ ...o, [k]: !o[k] }));

  const Option = ({ k, label, hint, count, disabled }: { k: keyof ImportOptions; label: string; hint: string; count?: number; disabled?: boolean }) => (
    <label className={`flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50'}`}>
      <input type="checkbox" checked={!!opts[k] && !disabled} onChange={() => toggle(k)} disabled={disabled} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900 dark:text-white">{label}{count !== undefined && <span className="font-normal text-slate-500 dark:text-zinc-400"> · {count}</span>}</span>
        <span className="block text-xs text-slate-500 dark:text-zinc-400">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Bring an account from another hub</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
          Have a portable package from another hub? Add its contents to your account on {hubName || 'this hub'}.
          Your old hub isn't changed, and you choose what comes over.
        </p>
      </div>

      {stage === 'pick' && (
        <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-zinc-700 p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-center">
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">Choose a package file</span>
          <span className="text-xs text-slate-500 dark:text-zinc-400">Ends in {PACKAGE_EXTENSION}</span>
          <input type="file" accept={`${PACKAGE_EXTENSION},application/octet-stream`} className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {stage === 'unlock' && file && meta && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3 text-xs space-y-0.5">
            <p className="font-medium text-slate-900 dark:text-white">{file.name}</p>
            <p className="text-slate-500 dark:text-zinc-400">
              {meta.hubName ? `From ${meta.hubName} · ` : ''}made {new Date(meta.createdAt).toLocaleDateString()} · {(file.size / 1048576).toFixed(1)} MB
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
              {meta.hint === 'recovery-phrase' ? 'Your recovery phrase from the old hub' : 'The package password'}
            </label>
            <input className={inputCls} type="password" value={secret} onChange={(e) => { setSecret(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && secret.trim() && !busy) unlock(); }}
              placeholder={meta.hint === 'recovery-phrase' ? 'your-recovery-phrase-words' : 'Package password'} autoComplete="off" disabled={busy} />
          </div>
          {busy && <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>}
          <div className="flex gap-2">
            <button onClick={unlock} disabled={!secret.trim() || busy} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {phase}</> : 'Unlock'}
            </button>
            <button onClick={reset} disabled={busy} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-700 dark:text-zinc-300 disabled:opacity-50">Back</button>
          </div>
        </div>
      )}

      {stage === 'choose' && pkg && summary && fresh && (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-800 dark:text-emerald-200">
            <p className="font-medium">Unlocked — account <strong>@{pkg.manifest.account.username}</strong> from {pkg.manifest.hub.name}</p>
            <p>Made {new Date(pkg.manifest.exportedAt).toLocaleString()}</p>
          </div>
          {wasPackageImported(hubSlug, pkg.manifest.packageId) && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> This package was already imported into this account on this device — importing again will create duplicates.</p>
          )}

          <Option k="adoptKeys" label="Keep my encryption identity" disabled={!summary.hasKeys || !fresh.fresh}
            hint={!summary.hasKeys ? 'This package was made without keys.'
              : !fresh.fresh ? `Not available: this account already has ${fresh.reasons.join(', ')} encrypted with its current keys, and replacing them would make those unreadable. Your data still imports, re-encrypted with the keys you have now.`
              : 'Use your old keys on this hub, so you keep one identity. Safe here because this account is new.'} />
          <Option k="profile" label="Profile" hint="Name, bio, headline, links and pictures." />
          <Option k="notes" label="Notes" count={summary.notes} hint="Come over as private notes." />
          <Option k="conversationsAsNotes" label="Old conversations" count={summary.conversations} hint="Saved as private notes (one per conversation). They can't be put back into other people's chats." />
          <Option k="files" label="Files" count={summary.files} hint={`Come over as private files.${summary.filesSkipped ? ` ${summary.filesSkipped} could not be included in the package.` : ''}`} />
          <Option k="posts" label="Posts" count={summary.posts} hint={`Come in as private posts, so they don't flood this hub's feed — share the ones you want.${summary.postsSkipped ? ` ${summary.postsSkipped} (polls) can't be recreated.` : ''}`} />
          <Option k="atlas" label="Atlas pins" count={summary.pins} hint="Adds them to this hub's public map — leave off if they were for a different area." />
          <Option k="marketplace" label="Marketplace page" count={summary.listings} hint="Recreates your vendor page and listings on this hub's market (pictures aren't carried over)." disabled={!summary.hasVendor} />
          <Option k="settings" label="Settings" hint="Navigation layout and notification preferences." />

          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={runImport} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">
              <Upload className="w-4 h-4" /> Import into this account
            </button>
            <button onClick={reset} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-700 dark:text-zinc-300">Cancel</button>
          </div>
        </div>
      )}

      {stage === 'running' && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{phase}</span>
            <button type="button" onClick={() => abortRef.current?.abort()} className="font-medium hover:underline">Stop</button>
          </div>
        </div>
      )}

      {stage === 'done' && report && (
        <div className="space-y-3">
          {report.recoveryPhrase && (
            <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-indigo-800 dark:text-indigo-200"><KeyRound className="w-4 h-4" /> {report.reusedPhrase ? 'Your recovery phrase carries over' : 'Your new recovery phrase — save it now'}</p>
              <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80">
                {report.reusedPhrase
                  ? 'This hub now backs up your keys under the same recovery phrase you used to open the package.'
                  : 'This replaces the phrase shown when you first signed up here. It is the only way to recover your encrypted notes on another device.'}
              </p>
              {!report.reusedPhrase && (
                <div className="flex items-center gap-2 rounded-lg bg-white/60 dark:bg-black/30 px-2.5 py-1.5">
                  <code className="flex-1 text-xs font-mono break-all text-slate-900 dark:text-white">{report.recoveryPhrase}</code>
                  <button onClick={async () => { await navigator.clipboard.writeText(report.recoveryPhrase!).catch(() => {}); setCopied(true); }} className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-black/10">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800">
            {report.steps.map(s => (
              <div key={s.id} className="p-3 text-xs space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                  {s.failed > 0 ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  {s.label}: {s.ok} imported{s.failed ? `, ${s.failed} failed` : ''}{s.skipped ? `, ${s.skipped} skipped` : ''}
                </p>
                {s.messages.slice(0, 6).map((m, i) => <p key={i} className="text-slate-500 dark:text-zinc-400 pl-5">{m}</p>)}
                {s.messages.length > 6 && <p className="text-slate-400 pl-5">…and {s.messages.length - 6} more</p>}
              </div>
            ))}
          </div>
          <button onClick={reset} className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-700 dark:text-zinc-300">Done</button>
        </div>
      )}

      {error && stage !== 'choose' && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
