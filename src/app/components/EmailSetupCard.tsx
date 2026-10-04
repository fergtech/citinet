import { useState, useEffect, useCallback } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { hubService } from '../services/hubService';
import type { EmailSettingsStatus } from '../types/hub';

interface Preset {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  userHint: string;
  passHint: string;
  help: string;
}

// Starting points only — every field stays editable. The hub never runs a mail
// server: it just hands messages to whichever SMTP relay the owner already has.
const PRESETS: Preset[] = [
  { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false, userHint: 'you@gmail.com', passHint: 'App Password',
    help: 'Turn on 2-Step Verification for the Google account, then create an App Password (Google Account → Security → App passwords). Use that 16-character password here, not your normal one. Mail is sent from this Gmail address unless you have added a verified Send-as alias in Gmail.' },
  { id: 'brevo', label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, secure: false, userHint: 'Your Brevo SMTP login', passHint: 'SMTP key',
    help: 'In Brevo: SMTP & API → SMTP. Use the login shown there and generate an SMTP key. The From address must be a sender you have verified in Brevo.' },
  { id: 'resend', label: 'Resend', host: 'smtp.resend.com', port: 465, secure: true, userHint: 'resend', passHint: 'API key',
    help: 'Username is the word "resend"; the password is an API key from your Resend dashboard. The From address must use a domain you have verified there.' },
  { id: 'mailgun', label: 'Mailgun', host: 'smtp.mailgun.org', port: 587, secure: false, userHint: 'postmaster@your-domain', passHint: 'SMTP password',
    help: 'In Mailgun: Sending → your domain → SMTP credentials. Use the postmaster login and its SMTP password.' },
  { id: 'ses', label: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false, userHint: 'SMTP username', passHint: 'SMTP password',
    help: 'In the SES console create SMTP credentials (these are not your normal AWS keys). Change the host to match your SES region. The From address must be verified in SES.' },
  { id: 'zoho', label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465, secure: true, userHint: 'you@yourdomain', passHint: 'App-specific password',
    help: 'Use your Zoho address and an app-specific password (Zoho Account → Security).' },
  { id: 'other', label: 'Other / my own relay', host: '', port: 587, secure: false, userHint: 'Username (if required)', passHint: 'Password',
    help: 'Any SMTP server works: your domain host, a company relay, a self-hosted relay. Port 587 normally uses STARTTLS; port 465 uses SSL/TLS.' },
];

const inputCls = 'w-full px-3 py-2 rounded-lg border cn-border cn-surface-1 text-sm cn-text-1 placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';
const labelCls = 'block text-xs font-medium cn-text-2 mb-1';

/**
 * Email relay setup for Hub Management → System. The hub owner points the hub at
 * an SMTP relay they already have (no mail server runs on the hub). The password
 * is stored encrypted in this hub's own database and is never sent back to the
 * browser. "Send test email" checks the settings BEFORE saving, so a typo can't
 * replace a working setup.
 */
export function EmailSetupCard({ hubSlug }: { hubSlug: string }) {
  const [status, setStatus] = useState<EmailSettingsStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [preset, setPreset] = useState<string>('other');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<'test' | 'save' | 'remove' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [tested, setTested] = useState(false); // current values passed a test

  const load = useCallback(async () => {
    try {
      const s = await hubService.getEmailSettings(hubSlug);
      setStatus(s);
      if (s.configured) {
        setHost(s.host); setPort(String(s.port)); setSecure(s.secure); setUser(s.user); setFrom(s.from);
        const match = PRESETS.find(p => p.host && p.host === s.host);
        setPreset(match?.id ?? 'other');
      }
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load email settings');
    }
  }, [hubSlug]);
  useEffect(() => { load(); }, [load]);

  const touched = () => { setTested(false); setResult(null); };
  const current = PRESETS.find(p => p.id === preset) ?? PRESETS[PRESETS.length - 1];

  const pickPreset = (id: string) => {
    const p = PRESETS.find(x => x.id === id)!;
    setPreset(id);
    if (p.host) setHost(p.host);
    setPort(String(p.port));
    setSecure(p.secure);
    if (id === 'resend') setUser('resend');
    touched();
  };

  const input = () => ({ host: host.trim(), port: parseInt(port, 10) || 587, secure, user: user.trim(), pass, from: from.trim() });

  const runTest = async () => {
    setBusy('test'); setResult(null);
    try {
      const r = await hubService.testEmailSettings(hubSlug, { ...input(), to: testTo.trim() || undefined });
      setTested(r.ok);
      setResult(r.ok
        ? { ok: true, message: `Test email sent to ${r.to}. Check that inbox (and spam) to confirm it arrived.` }
        : { ok: false, message: r.error || 'The test failed.' });
    } catch (err) {
      setTested(false);
      setResult({ ok: false, message: err instanceof Error ? err.message : 'The test failed.' });
    } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save'); setResult(null);
    try {
      await hubService.saveEmailSettings(hubSlug, input());
      setPass('');
      setResult({ ok: true, message: 'Saved. This hub will now send email through this relay.' });
      await load();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove'); setResult(null);
    try {
      await hubService.deleteEmailSettings(hubSlug);
      setHost(''); setPort('587'); setSecure(false); setUser(''); setPass(''); setFrom(''); setTested(false); setPreset('other');
      await load();
      setResult({ ok: true, message: 'Email settings removed. This hub will no longer send email.' });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Could not remove.' });
    } finally { setBusy(null); }
  };

  if (loadError) {
    return <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3"><p className="text-xs text-rose-700 dark:text-rose-300">{loadError}</p></div>;
  }
  if (!status) return null;

  // Gmail SMTP doesn't reject a From it doesn't own — it silently swaps in the
  // login address — so a custom-domain From would "succeed" yet arrive from Gmail.
  const fromDomain = (from.match(/@([^\s<>@]+)>?\s*$/)?.[1] ?? '').toLowerCase();
  const gmailFromMismatch = host.trim().toLowerCase() === 'smtp.gmail.com'
    && !!fromDomain && fromDomain !== 'gmail.com' && fromDomain !== 'googlemail.com';

  const needsPassword = !!user.trim() && !pass && !status.hasPassword;
  const ready = !!host.trim() && !!from.trim() && !needsPassword;

  return (
    <div className="cn-glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 cn-text-3" />
        <h4 className="text-sm font-semibold cn-text-1">Email alerts</h4>
        {status.configured && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> {status.source === 'env' ? 'on (set in .env)' : 'on'}
          </span>
        )}
      </div>
      <p className="text-xs cn-text-3">
        Lets this hub email its admins about problems — a service down, backups out of date, a failed restore test.
        Your hub does not run a mail server: pick a relay you already have and paste its details.
        The password is stored encrypted on this hub and never shown again.
      </p>

      {!status.canStoreSecrets && (
        <p className="text-xs text-rose-600 dark:text-rose-400">This hub has no <code>JWT_SECRET</code>, so it cannot store passwords safely. Set one in the hub's .env first.</p>
      )}

      <div>
        <label className={labelCls}>Email provider</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p.id} type="button" onClick={() => pickPreset(p.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${preset === p.id
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                : 'cn-border cn-surface-2 cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs cn-text-3 mt-1.5">{current.help}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-2">
          <label className={labelCls}>Mail server</label>
          <input className={inputCls} value={host} onChange={e => { setHost(e.target.value); touched(); }} placeholder="smtp.example.com" autoComplete="off" />
        </div>
        <div>
          <label className={labelCls}>Port</label>
          <input className={inputCls} value={port} inputMode="numeric" onChange={e => { setPort(e.target.value.replace(/\D/g, '')); touched(); }} placeholder="587" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Security</label>
        <select className={inputCls} value={secure ? 'ssl' : 'starttls'} onChange={e => { setSecure(e.target.value === 'ssl'); touched(); }}>
          <option value="starttls">STARTTLS (port 587, most common)</option>
          <option value="ssl">SSL/TLS (port 465)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>Username</label>
          <input className={inputCls} value={user} onChange={e => { setUser(e.target.value); touched(); }} placeholder={current.userHint} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls}>{current.passHint}</label>
          <input className={inputCls} type="password" value={pass} onChange={e => { setPass(e.target.value); touched(); }}
            placeholder={status.hasPassword ? 'Saved — leave blank to keep' : ''} autoComplete="new-password" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Send from</label>
        <input className={inputCls} value={from} onChange={e => { setFrom(e.target.value); touched(); }} placeholder="Your Hub <alerts@yourdomain.org>" autoComplete="off" />
        <p className="text-xs cn-text-4 mt-1">Use an address your provider has verified — providers reject mail from addresses they don't know you own.</p>
        {gmailFromMismatch && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            Gmail won't send as @{fromDomain} unless you've added it as a verified Send-as alias in Gmail. Otherwise Gmail replaces this
            with your Gmail address, and the test can look successful while the mail still arrives from Gmail. For your own domain,
            use Resend, Brevo, Mailgun or SES instead.
          </p>
        )}
      </div>

      <div>
        <label className={labelCls}>Send the test to <span className="font-normal cn-text-4">(blank = your account's email)</span></label>
        <input className={inputCls} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@example.com" autoComplete="off" />
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
        <button onClick={runTest} disabled={!ready || busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border cn-border cn-surface-2 text-sm font-medium cn-text-1 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">
          {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send test email
        </button>
        <button onClick={save} disabled={!ready || busy !== null}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${tested ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-500 hover:bg-slate-600'}`}>
          {busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {tested ? 'Save' : 'Save without testing'}
        </button>
        {status.source === 'ui' && (
          <button onClick={remove} disabled={busy !== null} className="ml-auto text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50">
            {busy === 'remove' ? 'Removing…' : 'Remove email settings'}
          </button>
        )}
      </div>
    </div>
  );
}
