import { useRef, useState } from 'react';
import { PackageOpen, Loader2, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { createPortablePackage, downloadPackage, type PackageResult } from '../utils/portablePackage';
import type { SecretKind } from '../utils/portableContainer';

const inputCls = 'w-full px-3 py-2 rounded-lg border cn-border cn-surface-1 text-sm cn-text-1 placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

/**
 * "Move to another hub": makes one encrypted file with everything a member needs
 * to rebuild their account on a different hub — their data plus (optionally) their
 * encryption keys — which the other hub's "Bring an account from another hub"
 * import reads. It is encrypted at rest, because it holds everything.
 */
export function MovePackageCard({ hubSlug, hubName }: { hubSlug: string; hubName?: string }) {
  const [kind, setKind] = useState<SecretKind>('recovery-phrase');
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [includeKeys, setIncludeKeys] = useState(true);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [fraction, setFraction] = useState(0);
  const [result, setResult] = useState<PackageResult | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const mismatch = kind === 'password' && confirm !== '' && confirm !== secret;
  const ready = secret.trim().length > 0 && (kind === 'recovery-phrase' || (confirm === secret && secret.length > 0));

  const run = async () => {
    setRunning(true); setError(''); setResult(null); setFraction(0); setPhase('Checking…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await createPortablePackage(hubSlug, {
        secret, kind, includeKeys, signal: controller.signal,
        onProgress: (p) => { setPhase(p.phase); setFraction(p.fraction); },
      });
      setResult(res);
      downloadPackage(res);
      setSecret(''); setConfirm('');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Could not create the package.');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <PackageOpen className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Move to another hub</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
          Creates one encrypted file with your profile, notes, files, posts, pins and settings
          {includeKeys ? ', plus your encryption keys,' : ''} so you can rebuild your account on a different hub
          using <strong>Bring an account from another hub</strong> there. Nothing is removed from {hubName || 'this hub'}.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">Lock the file with</p>
        {([
          ['recovery-phrase', 'My recovery phrase', 'One secret to remember — the same one that unlocks your encrypted notes.'],
          ['password', 'A package password I choose', 'Use this if you can\'t find your recovery phrase.'],
        ] as const).map(([k, label, hint]) => (
          <label key={k} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50">
            <input type="radio" name="pkg-kind" checked={kind === k} onChange={() => { setKind(k); setSecret(''); setConfirm(''); setError(''); }} disabled={running} className="mt-0.5" />
            <span><span className="block text-sm font-medium text-slate-900 dark:text-white">{label}</span><span className="block text-xs text-slate-500 dark:text-zinc-400">{hint}</span></span>
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <input className={inputCls} type="password" value={secret} onChange={(e) => { setSecret(e.target.value); setError(''); }}
          placeholder={kind === 'recovery-phrase' ? 'your-recovery-phrase-words' : 'Package password (12+ characters)'} autoComplete="off" disabled={running} />
        {kind === 'password' && (
          <>
            <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" autoComplete="off" disabled={running} />
            {mismatch && <p className="text-xs text-rose-500">The two passwords don't match.</p>}
          </>
        )}
      </div>

      <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 cursor-pointer">
        <input type="checkbox" checked={includeKeys} onChange={(e) => setIncludeKeys(e.target.checked)} disabled={running} className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium text-slate-900 dark:text-white">Include my encryption keys (recommended)</span>
          <span className="block text-xs text-slate-500 dark:text-zinc-400">Lets you keep the same encryption identity on the new hub. Your messages and notes are always included as readable text either way.</span>
        </span>
      </label>

      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
        <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-200">
          The file is encrypted, but it holds everything about your account. Anyone with the file <em>and</em> your {kind === 'recovery-phrase' ? 'recovery phrase' : 'password'} can open it — treat it like a password, and delete it once you've moved.
          Messages include what other people wrote in conversations you're part of.
        </p>
      </div>

      {running ? (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{phase}</span>
            <button type="button" onClick={() => abortRef.current?.abort()} className="font-medium hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={run} disabled={!ready}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
          <PackageOpen className="w-4 h-4" /> Create portable package
        </button>
      )}

      {error && <p className="text-xs text-rose-500">{error}</p>}

      {result && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3 space-y-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Downloaded {result.filename}</p>
          <p className="text-slate-600 dark:text-zinc-400">{Object.entries(result.counts).map(([k, v]) => `${v} ${k}`).join(' · ')}{result.includesKeys ? ' · encryption keys' : ''}</p>
          {result.warnings.length > 0 && (
            <div className="space-y-1 text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Some items were left out</p>
              <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">{result.warnings.slice(0, 25).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <p className="text-slate-500 dark:text-zinc-500">Keep this file somewhere safe until you've confirmed everything arrived on the new hub.</p>
        </div>
      )}
    </div>
  );
}
