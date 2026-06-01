import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useHub } from '../context/HubContext';
import { CircleHelp, Bug, Lightbulb, MessageSquareWarning, X, CheckCircle, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { requestsService, type RequestType } from '../services/requestsService';

const FEATURE_MAP: Record<string, string> = {
  feed: 'Feed', discover: 'Discover', atlas: 'Atlas',
  marketplace: 'Exchange', neighbors: 'Neighbors', files: 'Files',
  initiatives: 'Initiatives', toolkit: 'Resources', network: 'Network',
  messages: 'Messages', account: 'Account', profile: 'Profile',
  settings: 'Settings', 'hub-management': 'Hub Management',
  vendor: 'Vendor Profile', chat: 'Chat', notes: 'Notes',
  polls: 'Polls', 'mod-log': 'Mod Log', spaces: 'Spaces', assistant: 'Assistant',
};

type Kind = RequestType;

const KIND_CONFIG: {
  kind: Kind;
  icon: ReactNode;
  label: string;
  desc: string;
  placeholder: string;
  successMsg: string;
}[] = [
  {
    kind: 'help',
    icon: <CircleHelp className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />,
    label: 'Get Help',
    desc: 'Troubleshooting and support',
    placeholder: 'Describe what you need help with…',
    successMsg: 'Your help request was sent to the hub team.',
  },
  {
    kind: 'bug',
    icon: <Bug className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />,
    label: 'Report a Bug',
    desc: 'Report an issue on this feature',
    placeholder: 'Describe the issue — what happened vs. what you expected…',
    successMsg: 'Bug report submitted. Thanks for letting us know!',
  },
  {
    kind: 'feature',
    icon: <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
    label: 'Request a Feature',
    desc: 'Suggest an enhancement',
    placeholder: 'What would you like to see? How would it help you?',
    successMsg: 'Feature request submitted. We\'ll review it soon.',
  },
];

interface SupportLauncherProps {
  variant?: 'sidebar' | 'pill';
  align?: 'start' | 'center';
}

type ViewState = 'menu' | Kind | 'success' | 'error';

export function SupportLauncher({ variant = 'sidebar', align = 'start' }: SupportLauncherProps) {
  const [open, setOpen]     = useState(false);
  const [view, setView]     = useState<ViewState>('menu');
  const [text, setText]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { currentHub } = useHub();
  const { pathname }   = useLocation();
  const params         = useParams<{ hubSlug?: string }>();

  const segment     = pathname.toLowerCase().split('/').filter(Boolean)[0] ?? '';
  const featureName = FEATURE_MAP[segment] ?? (segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Dashboard');

  const hubSlug = params.hubSlug ?? currentHub?.slug ?? '';

  const reset = () => { setView('menu'); setText(''); setSubmitting(false); };

  const close = () => { setOpen(false); setTimeout(reset, 200); };

  const openKind = (kind: Kind) => { setView(kind); setText(''); };

  const submit = async (kind: Kind) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await requestsService.submit(hubSlug, {
        problem:       trimmed,
        type:          kind,
        screenContext: `${featureName} (${pathname})`,
        dataInvolved:  'none',
        scope:         'hub_only',
        priority:      kind === 'bug' ? 'important' : 'nice_to_have',
      });
      const cfg = KIND_CONFIG.find(c => c.kind === kind)!;
      setSuccessMsg(cfg.successMsg);
      setView('success');
      setText('');
      setTimeout(close, 3000);
    } catch {
      setView('error');
    } finally {
      setSubmitting(false);
    }
  };

  const popoverAlign = align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  const popoverWidth = variant === 'sidebar' ? 'w-full' : 'w-72';

  const activeKindCfg = (view !== 'menu' && view !== 'success' && view !== 'error')
    ? KIND_CONFIG.find(c => c.kind === view)
    : null;

  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className={`absolute bottom-full mb-2 z-50 ${popoverWidth} rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden ${popoverAlign}`}>

            {/* Header */}
            <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {view === 'menu'    ? 'Support'
                  : view === 'success' ? 'Submitted'
                  : view === 'error'   ? 'Something went wrong'
                  : activeKindCfg?.label}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {view === 'menu'
                    ? `Context: ${featureName}`
                    : view === 'success' || view === 'error'
                    ? ''
                    : activeKindCfg?.desc}
                </p>
              </div>
              <button onClick={close} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center" aria-label="Close">
                <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Body */}
            {view === 'menu' && (
              <div className="p-2 space-y-1">
                {KIND_CONFIG.map(({ kind, icon, label, desc }) => (
                  <button key={kind} onClick={() => openKind(kind)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left">
                    {icon}
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeKindCfg && view !== 'menu' && view !== 'success' && view !== 'error' && (
              <div className="p-3 space-y-3">
                <textarea
                  autoFocus
                  rows={4}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={activeKindCfg.placeholder}
                  className="w-full text-sm text-slate-800 dark:text-zinc-200 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setView('menu')}
                    disabled={submitting}
                    className="flex-1 text-xs font-medium py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => submit(view as Kind)}
                    disabled={!text.trim() || submitting}
                    className="flex-1 text-xs font-medium py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40"
                  >
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            )}

            {view === 'success' && (
              <div className="p-5 flex flex-col items-center gap-3 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
                <p className="text-sm text-slate-700 dark:text-zinc-300">{successMsg}</p>
              </div>
            )}

            {view === 'error' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="text-sm">Couldn't submit — please try again.</p>
                </div>
                <button
                  onClick={() => setView(activeKindCfg?.kind ?? 'menu')}
                  className="w-full text-xs font-medium py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {variant === 'sidebar' ? (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
          title="Support"
        >
          <MessageSquareWarning className="w-3.5 h-3.5 shrink-0" />
          Support
        </button>
      ) : (
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 dark:text-zinc-500 bg-white/80 dark:bg-zinc-900/80 backdrop-blur border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 hover:text-slate-700 dark:hover:text-zinc-300 shadow-sm transition-all"
          title="Support"
        >
          <MessageSquareWarning className="w-3 h-3 shrink-0" />
          Support
        </button>
      )}
    </div>
  );
}
