import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react';
import { hostedAppService, type HostedApp } from '../services/hostedAppService';

const inputCls =
  'w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Hub Management → Apps → Hosted apps. Upload a built web app (zip of dist/) and the hub
 * serves it publicly at /apps/<slug>/. Admin-only for now; see api/hubApps.js for why.
 */
export function HostedAppsPanel({ hubSlug }: { hubSlug: string }) {
  const [apps, setApps] = useState<HostedApp[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busySlug, setBusySlug] = useState('');
  const [rowError, setRowError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setApps(await hostedAppService.listAdmin(hubSlug));
      setLoadError('');
    } catch (e) {
      // A hub that predates hosted apps answers 404 — say so instead of showing a raw error.
      const msg = e instanceof Error ? e.message : 'Failed to load apps';
      setLoadError(/404|not found/i.test(msg) ? 'This hub has not been updated to support hosted apps yet.' : msg);
    }
  }, [hubSlug]);

  useEffect(() => { void load(); }, [load]);

  const existing = apps?.find(a => a.slug === slug);
  const slugOk = SLUG_RE.test(slug);

  const handleUpload = async () => {
    if (!file || !slugOk) return;
    setUploading(true);
    setUploadError('');
    setWarnings([]);
    try {
      const result = await hostedAppService.upload(hubSlug, slug, file, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      });
      setWarnings(result.warnings);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      if (!existing) { setName(''); setSlug(''); setSlugTouched(false); setDescription(''); }
      await load();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const act = async (appSlug: string, fn: () => Promise<unknown>) => {
    setBusySlug(appSlug);
    setRowError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusySlug('');
    }
  };

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Hosted Apps</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Host a web app you built right on this hub. Build it, zip the contents of <code>dist/</code>, and upload it here —
          it goes live at <code>/apps/&lt;name&gt;/</code>. For Vite, set <code>base: './'</code> in vite.config first.
        </p>
      </div>

      <div className="cn-glass rounded-2xl p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            className={inputCls}
            placeholder="App name (e.g. Job Hunt)"
            value={name}
            maxLength={80}
            onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
          />
          <input
            className={inputCls}
            placeholder="address (e.g. jobs)"
            value={slug}
            maxLength={40}
            onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
          />
        </div>
        <input
          className={inputCls}
          placeholder="One-line description (optional)"
          value={description}
          maxLength={300}
          onChange={e => setDescription(e.target.value)}
        />
        {slug && !slugOk && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Use 1–40 lowercase letters, digits or hyphens (not starting or ending with a hyphen).
          </p>
        )}
        {existing && (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            <strong>{existing.name}</strong> already exists — uploading publishes a new version (the last 3 are kept for rollback).
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="text-xs text-slate-600 dark:text-zinc-300"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={handleUpload}
            disabled={!file || !slugOk || uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white disabled:opacity-40"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {existing ? 'Publish new version' : 'Upload & publish'}
          </button>
        </div>
        {uploadError && <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>}
        {warnings.map(w => (
          <p key={w} className="flex gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {w}
          </p>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {loadError && <p className="text-xs text-slate-500 dark:text-zinc-400">{loadError}</p>}
        {apps === null && !loadError && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        {rowError && <p className="text-xs text-red-600 dark:text-red-400">{rowError}</p>}
        {apps?.map(app => {
          const busy = busySlug === app.slug;
          const hubHref = hostedAppService.appUrl(hubSlug, app.path);
          const href = app.publicUrl ?? hubHref;
          return (
            <div key={app.slug} className="cn-glass rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{app.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${app.status === 'published' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                      {app.status === 'published' ? `live · v${app.currentVersion}` : 'disabled'}
                    </span>
                  </div>
                  {app.description && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{app.description}</p>}
                  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1 break-all">
                    {app.publicUrl ? app.publicUrl.replace(/^https:\/\//, '') : app.path} <ExternalLink className="w-3 h-3" />
                  </a>
                  {app.publicUrl && (
                    <a href={hubHref} target="_blank" rel="noreferrer" className="block text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5 break-all">
                      also on this hub at {app.path}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={busy}
                    onClick={() => act(app.slug, () => hostedAppService.setStatus(hubSlug, app.slug, app.status === 'published' ? 'disabled' : 'published'))}
                    className="px-2.5 py-1 rounded-lg text-xs border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 disabled:opacity-40"
                  >
                    {app.status === 'published' ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`Delete ${app.name}`}
                    onClick={() => { if (window.confirm(`Delete ${app.name} and all its versions? This can't be undone.`)) void act(app.slug, () => hostedAppService.remove(hubSlug, app.slug)); }}
                    className="p-1.5 rounded-lg text-red-600 dark:text-red-400 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {app.versions.length > 1 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {app.versions.map(v => (
                    <button
                      key={v.version}
                      disabled={busy || v.version === app.currentVersion}
                      onClick={() => act(app.slug, () => hostedAppService.rollback(hubSlug, app.slug, v.version))}
                      title={`${v.fileCount} files · ${kb(v.totalBytes)} · ${new Date(v.createdAt).toLocaleString()}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 disabled:opacity-50"
                    >
                      {v.version !== app.currentVersion && <RotateCcw className="w-3 h-3" />}
                      v{v.version}{v.version === app.currentVersion ? ' (live)' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
