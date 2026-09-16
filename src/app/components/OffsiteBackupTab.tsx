import { useState } from 'react';
import { CloudUpload, Copy, Download, Eye, EyeOff, Laptop, Cpu, Check, KeyRound, AlertTriangle } from 'lucide-react';
import { detectOS, generateSecret } from '../utils/scriptGenerator';
import {
  downloadOffsiteBackupScript,
  validateOffsiteBackupConfig,
  type OffsiteBackupProvider,
  type OffsiteBackupScriptConfig,
} from '../utils/offsiteBackupScriptGenerator';

/** Small copy-to-clipboard button with transient "copied" feedback, matching NetworkReachTab's CopyButton. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 p-2 rounded-lg bg-white dark:bg-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-600 transition-colors border border-slate-200 dark:border-zinc-600"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        : <Copy className="w-4 h-4 text-slate-500 dark:text-zinc-400" />}
    </button>
  );
}

interface OffsiteBackupTabProps {
  hubSlug: string;
}

type ScriptOs = 'windows' | 'mac' | 'linux';
type PasswordMode = 'generate' | 'custom';

/**
 * Admin-only companion to the citinet-backup container's off-site push (see
 * scriptGenerator.ts's getComposeYaml + docs/hub-setup.md "Off-site backup").
 * That container only reads RESTIC_REPOSITORY/RESTIC_PASSWORD (and whatever
 * credential vars the chosen remote needs) from .env once at container
 * start -- getting a real value there has, until now, meant an admin opening
 * a text editor and a terminal by hand.
 *
 * This generates a small downloadable patch script instead: it never touches
 * anything in .env except the off-site-backup keys (not DB_PASSWORD,
 * JWT_SECRET, etc.), and never routes credentials through citinet-api or any
 * server at all -- everything here runs client-side in the browser, the same
 * trust model the hub-creation wizard already uses for every other secret.
 * See offsiteBackupScriptGenerator.ts for why (avoiding a Docker-socket grant
 * to citinet-api) and windows_bash_powershell_fs_boundary memory for the
 * encoding/escaping pitfalls already worked around here.
 */
export function OffsiteBackupTab({ hubSlug }: OffsiteBackupTabProps) {
  const guessedOs: ScriptOs = detectOS();
  const [os, setOs] = useState<ScriptOs>(guessedOs);

  const [provider, setProvider] = useState<OffsiteBackupProvider>('b2');

  // Backblaze B2
  const [b2Bucket, setB2Bucket] = useState('');
  const [b2AccountId, setB2AccountId] = useState('');
  const [b2AccountKey, setB2AccountKey] = useState('');
  const [showB2Key, setShowB2Key] = useState(false);

  // Cloudflare R2
  const [r2AccountId, setR2AccountId] = useState('');
  const [r2Bucket, setR2Bucket] = useState('');
  const [r2AccessKeyId, setR2AccessKeyId] = useState('');
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState('');
  const [showR2Secret, setShowR2Secret] = useState(false);

  // S3 / S3-compatible
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3Region, setS3Region] = useState('');
  const [showS3Secret, setShowS3Secret] = useState(false);

  // Advanced / custom
  const [customRepository, setCustomRepository] = useState('');
  const [customEnvText, setCustomEnvText] = useState('');

  // Passphrase
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('generate');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [showCustomPassword, setShowCustomPassword] = useState(false);

  const [retentionDays, setRetentionDays] = useState('30');

  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  const handleGeneratePassword = () => {
    setGeneratedPassword(generateSecret(32)); // 64-char hex, same algorithm as every other hub secret
    setPasswordSaved(false);
    setDownloaded(false);
  };

  const activePassword = passwordMode === 'generate' ? generatedPassword : customPassword;
  const passwordReady = passwordMode === 'generate' ? (generatedPassword.length > 0 && passwordSaved) : customPassword.length >= 12;

  const buildConfig = (): OffsiteBackupScriptConfig => ({
    provider,
    hubSlug,
    password: activePassword,
    retentionDays: Number(retentionDays) || 30,
    b2Bucket, b2AccountId, b2AccountKey,
    r2AccountId, r2Bucket, r2AccessKeyId, r2SecretAccessKey,
    s3Bucket, s3Endpoint, s3AccessKeyId, s3SecretAccessKey, s3Region,
    customRepository, customEnvText,
  });

  const configError = passwordReady ? validateOffsiteBackupConfig(buildConfig()) : 'Set a backup passphrase first.';
  const canDownload = !configError;

  const handleDownload = () => {
    setDownloadError('');
    try {
      downloadOffsiteBackupScript(buildConfig(), os);
      setDownloaded(true);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate script');
    }
  };

  const runCommand = os === 'windows'
    ? 'powershell -ExecutionPolicy Bypass -File citinet-backup-config.ps1'
    : 'sh citinet-backup-config.sh';

  const inputClass = 'w-full px-3 py-2 rounded-lg border cn-border cn-surface-2 text-sm cn-text-1 font-mono focus:border-blue-500 focus:outline-none transition-colors';
  const cardBaseClass = 'flex-1 flex items-center gap-3 p-3 rounded-xl border text-left transition-colors';
  const cardActiveClass = 'border-blue-500 bg-blue-50 dark:bg-blue-500/10';
  const cardInactiveClass = 'cn-border cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5';

  const PROVIDERS: { id: OffsiteBackupProvider; label: string; sub: string }[] = [
    { id: 'b2', label: 'Backblaze B2', sub: 'Cheap, simple' },
    { id: 'r2', label: 'Cloudflare R2', sub: 'Free egress — cheaper to restore' },
    { id: 's3', label: 'S3 / S3-compatible', sub: 'AWS, Wasabi, etc.' },
    { id: 'custom', label: 'Advanced', sub: 'Any other restic backend' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CloudUpload className="w-4 h-4 cn-text-3" />
        <h3 className="text-sm font-semibold cn-text-1">Off-site Backup</h3>
      </div>
      <p className="text-xs cn-text-3">
        The nightly local backup on this hub's own machine protects against bad data —
        accidental deletes, a bad update — but not against losing the machine itself
        (a dead drive, fire, theft). This sends encrypted, incremental backups to a
        remote storage account you control — nothing routes through Citinet's own
        servers, and the remote never sees anything but ciphertext. See{' '}
        <code className="cn-surface-3 px-1 rounded">docs/hub-setup.md</code> for the full
        picture, including how to restore from one.
      </p>

      <div className="cn-glass rounded-2xl p-4 space-y-4">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium cn-text-3 mb-2">Where should backups go?</label>
          <div className="flex flex-col sm:flex-row gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProvider(p.id); setDownloaded(false); }}
                className={`${cardBaseClass} ${provider === p.id ? cardActiveClass : cardInactiveClass}`}
              >
                <div>
                  <p className="text-sm font-medium cn-text-1">{p.label}</p>
                  <p className="text-xs cn-text-3">{p.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {provider === 'b2' && (
          <div className="space-y-3">
            <p className="text-xs cn-text-4">
              Create a bucket and an application key at{' '}
              <span className="cn-surface-3 px-1 rounded">backblaze.com/b2</span> first, then
              paste them in below.
            </p>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Bucket name</label>
              <input type="text" value={b2Bucket} onChange={e => setB2Bucket(e.target.value)} placeholder="e.g. my-hub-backups" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Key ID (Account ID)</label>
              <input type="text" value={b2AccountId} onChange={e => setB2AccountId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Application Key</label>
              <div className="relative">
                <input
                  type={showB2Key ? 'text' : 'password'}
                  value={b2AccountKey}
                  onChange={e => setB2AccountKey(e.target.value)}
                  className={`${inputClass} pr-10`}
                />
                <button type="button" onClick={() => setShowB2Key(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 cn-text-4 hover:cn-text-2">
                  {showB2Key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {provider === 'r2' && (
          <div className="space-y-3">
            <p className="text-xs cn-text-4">
              Create a bucket at <span className="cn-surface-3 px-1 rounded">dash.cloudflare.com</span> →
              R2, then an API token (Manage API Tokens → Create API Token) scoped to that
              bucket. Your account ID is shown on the same R2 page.
            </p>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Cloudflare Account ID</label>
              <input type="text" value={r2AccountId} onChange={e => setR2AccountId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Bucket name</label>
              <input type="text" value={r2Bucket} onChange={e => setR2Bucket(e.target.value)} placeholder="e.g. my-hub-backups" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Access Key ID</label>
              <input type="text" value={r2AccessKeyId} onChange={e => setR2AccessKeyId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Secret Access Key</label>
              <div className="relative">
                <input
                  type={showR2Secret ? 'text' : 'password'}
                  value={r2SecretAccessKey}
                  onChange={e => setR2SecretAccessKey(e.target.value)}
                  className={`${inputClass} pr-10`}
                />
                <button type="button" onClick={() => setShowR2Secret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 cn-text-4 hover:cn-text-2">
                  {showR2Secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {provider === 's3' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Bucket name</label>
              <input type="text" value={s3Bucket} onChange={e => setS3Bucket(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Endpoint (blank = AWS)</label>
              <input type="text" value={s3Endpoint} onChange={e => setS3Endpoint(e.target.value)} placeholder="e.g. s3.us-west-002.wasabisys.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Access Key ID</label>
              <input type="text" value={s3AccessKeyId} onChange={e => setS3AccessKeyId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Secret Access Key</label>
              <div className="relative">
                <input
                  type={showS3Secret ? 'text' : 'password'}
                  value={s3SecretAccessKey}
                  onChange={e => setS3SecretAccessKey(e.target.value)}
                  className={`${inputClass} pr-10`}
                />
                <button type="button" onClick={() => setShowS3Secret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 cn-text-4 hover:cn-text-2">
                  {showS3Secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Region (optional)</label>
              <input type="text" value={s3Region} onChange={e => setS3Region(e.target.value)} placeholder="e.g. us-west-002" className={inputClass} />
            </div>
          </div>
        )}

        {provider === 'custom' && (
          <div className="space-y-3">
            <p className="text-xs cn-text-4">
              For any other restic backend (SFTP, Azure, Google Cloud Storage, a REST
              server, ...). See{' '}
              <span className="cn-surface-3 px-1 rounded">restic.net</span> for repository
              string formats.
            </p>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Restic repository string</label>
              <input type="text" value={customRepository} onChange={e => setCustomRepository(e.target.value)} placeholder="e.g. sftp:user@host:/path/to/repo" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Credential variables (one per line)</label>
              <textarea
                value={customEnvText}
                onChange={e => setCustomEnvText(e.target.value)}
                rows={3}
                placeholder={'AZURE_ACCOUNT_NAME=...\nAZURE_ACCOUNT_KEY=...'}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
        )}

        {/* Passphrase */}
        <div className="pt-2 border-t cn-border">
          <label className="block text-xs font-medium cn-text-3 mb-2">Backup passphrase</label>
          <p className="text-xs cn-text-4 mb-3">
            Encrypts every backup — the remote storage provider never sees plaintext.
            Losing it makes backups permanently unreadable, so treat it like a recovery
            phrase, not a login password.
          </p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => { setPasswordMode('generate'); setDownloaded(false); }}
              className={`${cardBaseClass} ${passwordMode === 'generate' ? cardActiveClass : cardInactiveClass}`}
            >
              <KeyRound className="w-4 h-4 cn-text-3 shrink-0" />
              <div><p className="text-sm font-medium cn-text-1">Generate one for me</p><p className="text-xs cn-text-3">Recommended</p></div>
            </button>
            <button
              type="button"
              onClick={() => { setPasswordMode('custom'); setDownloaded(false); }}
              className={`${cardBaseClass} ${passwordMode === 'custom' ? cardActiveClass : cardInactiveClass}`}
            >
              <div><p className="text-sm font-medium cn-text-1">I'll set my own</p><p className="text-xs cn-text-3">At least 12 characters</p></div>
            </button>
          </div>

          {passwordMode === 'generate' ? (
            generatedPassword ? (
              <>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 font-mono text-sm text-center text-slate-900 dark:text-white break-all select-all">
                  {generatedPassword}
                </div>
                <button type="button" onClick={handleGeneratePassword}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium cn-text-3 hover:cn-text-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copy to clipboard
                </button>
                {!passwordSaved && (
                  <div className="rounded-xl p-3 mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      Save this now, somewhere other than this machine (a password manager) —
                      it won't be shown again, and it's the only way to ever restore these backups.
                    </p>
                  </div>
                )}
                {!passwordSaved && (
                  <button onClick={() => setPasswordSaved(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                    I've saved it
                  </button>
                )}
              </>
            ) : (
              <button onClick={handleGeneratePassword}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                <KeyRound className="w-4 h-4" /> Generate passphrase
              </button>
            )
          ) : (
            <div className="relative">
              <input
                type={showCustomPassword ? 'text' : 'password'}
                value={customPassword}
                onChange={e => setCustomPassword(e.target.value)}
                placeholder="At least 12 characters"
                className={`${inputClass} pr-10`}
              />
              <button type="button" onClick={() => setShowCustomPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 cn-text-4 hover:cn-text-2">
                {showCustomPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Advanced: retention + OS */}
        <details className="group">
          <summary className="text-xs font-medium cn-text-3 cursor-pointer select-none">Advanced</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Keep backups for (days)</label>
              <input type="text" value={retentionDays} onChange={e => setRetentionDays(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-2">
                Detected: {guessedOs === 'windows' ? 'Windows' : guessedOs === 'mac' ? 'macOS' : 'Linux'} — is that what your <strong>hub machine</strong> runs?
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => setOs('windows')} className={`${cardBaseClass} ${os === 'windows' ? cardActiveClass : cardInactiveClass}`}>
                  <Laptop className="w-5 h-5 cn-text-3 shrink-0" />
                  <p className="text-sm font-medium cn-text-1">Windows</p>
                </button>
                <button type="button" onClick={() => setOs('linux')} className={`${cardBaseClass} ${os === 'linux' ? cardActiveClass : cardInactiveClass}`}>
                  <Cpu className="w-5 h-5 cn-text-3 shrink-0" />
                  <p className="text-sm font-medium cn-text-1">Linux</p>
                </button>
                <button type="button" onClick={() => setOs('mac')} className={`${cardBaseClass} ${os === 'mac' ? cardActiveClass : cardInactiveClass}`}>
                  <Laptop className="w-5 h-5 cn-text-3 shrink-0" />
                  <p className="text-sm font-medium cn-text-1">macOS</p>
                </button>
              </div>
            </div>
          </div>
        </details>

        {downloadError && <p className="text-xs text-rose-600 dark:text-rose-400">{downloadError}</p>}

        <button
          onClick={handleDownload}
          disabled={!canDownload}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Setup Script
        </button>
        {!canDownload && configError && (
          <p className="text-xs cn-text-4 text-center">{configError}</p>
        )}

        {downloaded && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-900 dark:bg-black">
              <p className="text-xs text-slate-400 mb-2 font-mono">
                {os === 'windows'
                  ? '# In your hub folder (the one with docker-compose.yml), run:'
                  : '# In your hub folder (the one with docker-compose.yml), run:'}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-green-400 font-mono break-all">{runCommand}</code>
                <CopyButton text={runCommand} />
              </div>
            </div>
            <p className="text-xs cn-text-4">
              This only updates the off-site backup settings in your existing{' '}
              <code className="cn-surface-3 px-1 rounded">.env</code> (nothing else in it is
              touched) and restarts the backup service. If your hub was created before
              off-site backup support existed, it'll tell you to re-run your original hub
              setup script first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
