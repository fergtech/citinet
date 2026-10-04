import { useState, useEffect } from 'react';
import { LifeBuoy, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { hubService } from '../services/hubService';

interface Props {
  hubSlug: string;
}

type Platform = 'windows' | 'unix';

interface Situation {
  title: string;
  when: string;
  command: string;
}

// Plain-language situations -> the one command that handles each. The commands
// come from the `citinet` helper that lives in every hub's own folder
// (scripts/hub-tools/citinet.sh|ps1), so nobody has to remember docker flags or paths.
const SITUATIONS: Situation[] = [
  { title: 'Something is wrong and I\'m not sure what', when: 'Slow, erroring, or members can\'t get in.', command: 'diagnose' },
  { title: 'It stopped working after a restart or power cut', when: 'Starts anything that should be running. Never touches your data.', command: 'fix' },
  { title: 'See what a part of the hub is saying', when: 'Add -f at the end to watch live. Services: api, db, storage, caddy, backup, admin.', command: 'logs api' },
  { title: 'Install the latest version', when: 'Backs up first, and goes back automatically if the new version won\'t start.', command: 'update' },
  { title: 'An update made things worse', when: 'Returns to the version you had before the last update.', command: 'rollback' },
  { title: 'Take a backup right now', when: 'Before something risky, e.g. moving the hub to a new drive.', command: 'backup-now' },
  { title: 'Prove my backups actually work', when: 'Restores the newest backup into a throwaway database.', command: 'restore-test' },
  { title: 'I need to ask someone for help', when: 'Makes one zip of logs and settings with passwords removed.', command: 'support-bundle' },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be unavailable (insecure context / permissions) — fall back.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopied(text);
    setTimeout(() => setCopied(c => (c === text ? null : c)), 1800);
  };
  return { copied, copy };
}

function CodeRow({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg cn-surface-3 px-2.5 py-1.5">
      <code className="flex-1 min-w-0 text-xs font-mono cn-text-1 break-all">{text}</code>
      <button onClick={onCopy} className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors" title="Copy">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 cn-text-3" />}
      </button>
    </div>
  );
}

/**
 * "If something goes wrong" — the commands a hub owner would otherwise have to
 * guess, grouped by situation and personalised with this hub's own folder.
 * They run on the hub machine, in a terminal, and use the `citinet` helper that
 * every hub has in its folder.
 */
export function QuickCommandsPanel({ hubSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [composeDir, setComposeDir] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(() => (/win/i.test(navigator.userAgent) ? 'windows' : 'unix'));
  const { copied, copy } = useCopy();

  useEffect(() => {
    // The sidecar reports the hub's real folder; best-effort (older sidecars don't).
    hubService.getStackHealth(hubSlug)
      .then(h => {
        const dir = h.composeDir ?? null;
        setComposeDir(dir);
        if (dir) setPlatform(/^[A-Za-z]:[\\/]/.test(dir) ? 'windows' : 'unix');
      })
      .catch(() => {});
  }, [hubSlug]);

  const tunnelUrl = hubService.getHubConnection(hubSlug)?.hub.tunnelUrl?.replace(/\/$/, '') || 'https://YOUR-HUB-ADDRESS';
  const win = platform === 'windows';
  const tool = win ? '.\\citinet.ps1' : './citinet.sh';
  const cd = composeDir ? `cd "${composeDir}"` : win ? 'cd "<your hub folder>"' : 'cd "<your hub folder>"';
  const install = win
    ? `Invoke-WebRequest ${tunnelUrl}/api/tools/citinet.ps1 -OutFile citinet.ps1`
    : `curl -fsSL ${tunnelUrl}/api/tools/citinet.sh -o citinet.sh && chmod +x citinet.sh`;

  return (
    <div className="cn-glass rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 p-4 text-left">
        <LifeBuoy className="w-4 h-4 cn-text-3" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold cn-text-1">If something goes wrong</h4>
          <p className="text-xs cn-text-3">Ready-made commands for common problems — run on the hub's own machine.</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 cn-text-3" /> : <ChevronDown className="w-4 h-4 cn-text-3" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex gap-1.5">
            {(['windows', 'unix'] as Platform[]).map(p => (
              <button key={p} onClick={() => setPlatform(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${platform === p
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'cn-border cn-surface-2 cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                {p === 'windows' ? 'Windows' : 'Mac / Linux'}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium cn-text-2">1. Open a terminal on the hub machine and go to the hub's folder</p>
            <CodeRow text={cd} copied={copied === cd} onCopy={() => copy(cd)} />
            {!composeDir && <p className="text-xs cn-text-4">This is the folder that contains your hub's <code>docker-compose.yml</code>.</p>}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium cn-text-2">2. Pick what's happening</p>
            {SITUATIONS.map(s => {
              const full = `${tool} ${s.command}`;
              return (
                <div key={s.command} className="rounded-xl border cn-border cn-surface-2 p-2.5 space-y-1.5">
                  <div>
                    <p className="text-sm font-medium cn-text-1">{s.title}</p>
                    <p className="text-xs cn-text-3">{s.when}</p>
                  </div>
                  <CodeRow text={full} copied={copied === full} onCopy={() => copy(full)} />
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium cn-text-2">Command not found?</p>
            <p className="text-xs cn-text-3">
              Hubs created before these shortcuts existed don't have the helper yet. Run this once in the hub's folder to get it
              — it's served by your own hub, nothing is downloaded from elsewhere.
            </p>
            <CodeRow text={install} copied={copied === install} onCopy={() => copy(install)} />
            {win && <p className="text-xs cn-text-4">If Windows blocks the script, run it as: <code>powershell -ExecutionPolicy Bypass -File .\citinet.ps1 diagnose</code></p>}
          </div>
        </div>
      )}
    </div>
  );
}
