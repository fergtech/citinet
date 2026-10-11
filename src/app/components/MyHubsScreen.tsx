import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plus, Search, X, RotateCw, ArrowRight, Loader2 } from 'lucide-react';
import { OnboardingBackground } from './OnboardingBackground';
import { HubIcon } from './HubIcon';
import { CitinetLogo } from './CitinetLogo';
import { hubService } from '../services/hubService';
import { registryService, isHubRestarting, type RegistryHub } from '../services/registryService';
import { listMyHubs, rememberHub, forgetHub, type MyHubEntry } from '../utils/myHubs';
import { openMyHub, isPublicHttpsUrl } from '../utils/hubHandoff';

type Liveness = 'checking' | 'online' | 'offline';

/**
 * The "sanctum": the one place that knows every hub this browser has opened.
 * Each hub's UI lives on its own origin, so switching hubs means passing through
 * here — pick a hub, get sent to it, and each hub keeps its own session so you
 * stay signed in to all of them.
 */
export function MyHubsScreen() {
  const navigate = useNavigate();
  const [hubs, setHubs] = useState<MyHubEntry[]>([]);
  const [registry, setRegistry] = useState<Record<string, RegistryHub>>({});
  const [live, setLive] = useState<Record<string, Liveness>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setHubs(listMyHubs()), []);

  // 1) Bring in hubs this browser already had sessions for (people who joined
  //    before My Hubs existed), and 2) apply the return-trip hint from a hub's UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const h of hubService.getJoinedHubs()) {
        const conn = hubService.getHubConnection(h.slug);
        if (conn?.user?.authToken && h.tunnelUrl) {
          rememberHub({ slug: h.slug, name: h.name, tunnelUrl: h.tunnelUrl }, 'signed-in');
        }
      }

      const params = new URLSearchParams(window.location.search);
      const from = params.get('from');
      const url = params.get('url');
      if (from || url) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (from && url && isPublicHttpsUrl(url)) {
        // Only trust the hint if the hub itself confirms who it is.
        try {
          const res = await fetch(`${url.replace(/\/$/, '')}/api/info`, { signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const info = (await res.json()) as { hub_slug?: string; hub_name?: string; name?: string };
            if (info.hub_slug === from) {
              rememberHub({ slug: from, name: info.hub_name || info.name || from, tunnelUrl: url.replace(/\/$/, '') }, 'signed-in');
            }
          }
        } catch { /* unverifiable hint — ignore it */ }
      }

      if (!cancelled) {
        refresh();
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // Registry enrichment (icon, "restarting") — best effort.
  useEffect(() => {
    registryService.getHubs().then((list) => {
      setRegistry(Object.fromEntries(list.map((h) => [h.slug, h])));
    }).catch(() => {});
  }, []);

  // Live status straight from each hub.
  useEffect(() => {
    let cancelled = false;
    for (const h of hubs) {
      if (!h.tunnelUrl || live[h.slug]) continue;
      setLive((l) => ({ ...l, [h.slug]: 'checking' }));
      fetch(`${h.tunnelUrl.replace(/\/$/, '')}/api/info`, { signal: AbortSignal.timeout(6000) })
        .then((r) => !cancelled && setLive((l) => ({ ...l, [h.slug]: r.ok ? 'online' : 'offline' })))
        .catch(() => !cancelled && setLive((l) => ({ ...l, [h.slug]: 'offline' })));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubs]);

  const handleOpen = async (h: MyHubEntry) => {
    setOpening(h.slug);
    try {
      await openMyHub(h, (path) => navigate(path));
    } finally {
      // A successful handoff navigates away; this only matters when it didn't.
      setOpening(null);
    }
  };

  const handleForget = (slug: string) => {
    forgetHub(slug);
    refresh();
  };

  return (
    <div
      className="min-h-[var(--app-height,100dvh)] relative overflow-hidden flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <OnboardingBackground />
      <div className="flex-1 flex flex-col p-4 pb-8 items-center justify-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="cn-glass rounded-3xl shadow-2xl p-6 relative z-10 max-w-[420px] w-full mx-auto"
        >
          <div className="flex flex-col items-center text-center mb-5">
            <CitinetLogo className="w-10 h-10 mb-2" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Your hubs</h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Pick where you're headed. You stay signed in to each hub.
            </p>
          </div>

          {!ready && (
            <div className="flex justify-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          )}

          {ready && hubs.length === 0 && (
            <p className="text-sm text-center text-slate-500 dark:text-zinc-400 py-6">
              You haven't opened any hubs on this device yet.
            </p>
          )}

          <div className="space-y-1.5">
            {hubs.map((h) => {
              const reg = registry[h.slug];
              const restarting = reg ? isHubRestarting(reg) : false;
              const status = live[h.slug] ?? 'checking';
              return (
                <div key={h.slug} className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <div className="relative shrink-0">
                    <HubIcon hub={reg ?? {}} baseUrl={h.tunnelUrl} size={38} variant="badge" />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                        restarting ? 'bg-amber-500' : status === 'online' ? 'bg-green-500' : status === 'checking' ? 'bg-slate-300 dark:bg-zinc-600 animate-pulse' : 'bg-rose-400'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{h.name}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      {restarting ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><RotateCw className="w-3 h-3 animate-spin" />Restarting</span>
                      ) : status === 'offline' ? (
                        <span>Unreachable right now</span>
                      ) : h.state === 'signed-in' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Signed in</span>
                      ) : (
                        <span>Not signed in yet</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpen(h)}
                    disabled={opening !== null}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {opening === h.slug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Enter<ArrowRight className="w-3 h-3" /></>}
                  </button>
                  <button
                    onClick={() => handleForget(h.slug)}
                    className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title="Remove from this list"
                    aria-label={`Remove ${h.name} from this list`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/10 flex flex-col gap-1.5">
            <button
              onClick={() => navigate('/join')}
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl py-2 transition-colors"
            >
              <Search className="w-4 h-4" /> Find another hub
            </button>
            <button
              onClick={() => navigate('/create')}
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl py-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create a hub
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
