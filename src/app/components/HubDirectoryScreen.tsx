/**
 * HubDirectoryScreen
 *
 * Fetches and displays all publicly registered hubs from the citinet.cloud registry.
 * Users can browse available hubs and click "Join" to be taken directly into
 * the connection flow with the hub URL pre-filled.
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Globe, Users, Wifi, WifiOff, RefreshCw, Search, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { registryService, type RegistryHub } from '../services/registryService';

interface HubDirectoryScreenProps {
  onBack: () => void;
  onJoinHub: (tunnelUrl: string) => void;
}

export function HubDirectoryScreen({ onBack, onJoinHub }: HubDirectoryScreenProps) {
  const [hubs, setHubs] = useState<RegistryHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    registryService.getHubs().then((result) => {
      if (cancelled) return;
      setHubs(result);
      setLoading(false);
      if (result.length === 0) {
        setError('registry-empty');
      }
    });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleRefresh = () => {
    setHubs([]);
    setRefreshKey(k => k + 1);
  };

  const filtered = hubs.filter((h) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      h.name.toLowerCase().includes(q) ||
      h.location.toLowerCase().includes(q) ||
      (h.description || '').toLowerCase().includes(q)
    );
  });

  const onlineHubs = filtered.filter(h => h.online !== false);
  const offlineHubs = filtered.filter(h => h.online === false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 relative overflow-hidden flex flex-col">
      {/* Background Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dir-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M 0 150 Q 50 100 100 150 T 200 150" stroke="white" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dir-pattern)" />
      </svg>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh hub list"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-sm font-medium">Refresh</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative z-10 p-4 pb-8">
        <div className="max-w-2xl mx-auto">

          {/* Title */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Hub Directory</h1>
            <p className="text-white/80 text-sm">
              Active community hubs registered on{' '}
              <span className="font-semibold text-white">citinet.cloud</span>
            </p>
          </div>

          {/* Search */}
          {!loading && hubs.length > 0 && (
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or location…"
                className="w-full pl-11 pr-4 py-3 bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/50 transition-colors text-sm"
              />
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/80 text-sm">Fetching hubs from citinet.cloud…</p>
            </div>
          )}

          {/* Registry unavailable */}
          {!loading && error === 'registry-empty' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
                <WifiOff className="w-7 h-7 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No hubs listed yet
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs mx-auto">
                The registry is live but no hubs have registered yet — or it may
                be temporarily unreachable. You can still join a hub directly
                with its URL.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleRefresh}
                  className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
                <button
                  onClick={onBack}
                  className="px-5 py-2.5 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Connect with a URL
                </button>
              </div>
            </div>
          )}

          {/* No search results */}
          {!loading && hubs.length > 0 && filtered.length === 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 text-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                No hubs match <strong>"{search}"</strong>
              </p>
              <button
                onClick={() => setSearch('')}
                className="mt-3 text-purple-600 dark:text-purple-400 text-sm font-semibold hover:underline"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Hub cards — online first */}
          {!loading && filtered.length > 0 && (
            <div className="space-y-3">
              {[...onlineHubs, ...offlineHubs].map((hub) => (
                <HubCard key={hub.id} hub={hub} onJoin={() => onJoinHub(hub.tunnel_url)} />
              ))}
            </div>
          )}

          {/* Footer note */}
          {!loading && hubs.length > 0 && (
            <p className="text-center text-white/50 text-xs mt-6">
              Hub admins: register your hub via the desktop client's Admin → Public Access panel.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Hub Card
// ──────────────────────────────────────────────

function HubCard({ hub, onJoin }: { hub: RegistryHub; onJoin: () => void }) {
  const isOnline = hub.online !== false;

  const lastSeen = hub.last_seen
    ? formatRelative(hub.last_seen)
    : hub.registered_at
      ? `Registered ${formatRelative(hub.registered_at)}`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-5 border border-white/10"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Hub info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-zinc-600'
              }`}
            />
            <h3 className="font-bold text-slate-900 dark:text-white truncate text-base">
              {hub.name}
            </h3>
          </div>

          {hub.location && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {hub.location}
              </span>
            </div>
          )}

          {hub.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2 mb-2">
              {hub.description}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {hub.member_count !== undefined && (
              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Users className="w-3.5 h-3.5" />
                {hub.member_count} {hub.member_count === 1 ? 'member' : 'members'}
              </span>
            )}
            <span className={`flex items-center gap-1 text-xs font-medium ${
              isOnline
                ? 'text-green-600 dark:text-green-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}>
              {isOnline ? (
                <><Wifi className="w-3.5 h-3.5" /> Online</>
              ) : (
                <><WifiOff className="w-3.5 h-3.5" /> Offline</>
              )}
            </span>
            {lastSeen && (
              <span className="text-xs text-slate-400 dark:text-slate-500">{lastSeen}</span>
            )}
          </div>
        </div>

        {/* Right: Join button */}
        <button
          onClick={onJoin}
          className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all hover:scale-[1.03] active:scale-95 shadow-sm"
        >
          Join
        </button>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 2) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}
