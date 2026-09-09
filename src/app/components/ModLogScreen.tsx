import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScrollText, ChevronLeft, RefreshCw, Loader2, Search, ShieldCheck } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { modLogService, type ModLogEntry } from '../services/modLogService';
import { hubService } from '../services/hubService';
import { AvatarFallback } from './icons';

interface ModLogScreenProps {
  onBack: () => void;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  delete_post:       { label: 'Post Removed',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',    dot: 'bg-amber-400' },
  pin_featured:      { label: 'Post Featured',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-400' },
  remove_featured:   { label: 'Featured Removed',    color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  promote_moderator: { label: 'Promoted to Mod',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-400' },
  demote_moderator:  { label: 'Removed as Mod',      color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  promote_admin:     { label: 'Promoted to Admin',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-400' },
  demote_admin:      { label: 'Removed as Admin',    color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  remove_member:     { label: 'Member Removed',      color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',           dot: 'bg-red-400' },
  ban_user:          { label: 'User Banned',         color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',           dot: 'bg-red-500' },
  unban_user:        { label: 'User Unbanned',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-400' },
  create_poll:       { label: 'Poll Created',        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', dot: 'bg-indigo-400' },
  close_poll:        { label: 'Poll Closed',         color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  edit_poll:         { label: 'Poll Edited',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-400' },
  reopen_poll:       { label: 'Poll Reopened',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-400' },
};

// Groups action types for the filter chip row — client-side only (the
// backend just paginates, no server-side filter param exists).
const CATEGORY_OF: Record<string, string> = {
  delete_post: 'content', pin_featured: 'content', remove_featured: 'content',
  promote_moderator: 'roles', demote_moderator: 'roles', promote_admin: 'roles', demote_admin: 'roles',
  remove_member: 'members', ban_user: 'members', unban_user: 'members',
  create_poll: 'polls', close_poll: 'polls', edit_poll: 'polls', reopen_poll: 'polls',
};
const CATEGORY_LABELS: Record<string, string> = {
  content: 'Content', roles: 'Roles', members: 'Members', polls: 'Polls',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ModLogScreen({ onBack }: ModLogScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  // Mirrors the server's isMod() check -- mods/admins see the full moderation
  // log; everyone else sees only the member-visible Decisions subset (votes).
  const isMod = currentUser?.isAdmin === true
    || currentUser?.hubRole === 'admin'
    || currentUser?.hubRole === 'moderator';

  const [entries, setEntries] = useState<ModLogEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const PAGE = 50;

  const load = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    const { entries: newEntries, total: newTotal } = isMod
      ? await modLogService.list(hubSlug, offset, PAGE)
      : await modLogService.listDecisions(hubSlug, offset, PAGE);
    if (append) {
      setEntries(prev => [...prev, ...newEntries]);
    } else {
      setEntries(newEntries);
    }
    setTotal(newTotal);
    setLoading(false);
    setLoadingMore(false);
  }, [hubSlug, isMod]);

  useEffect(() => { load(); }, [load]);

  // Search + category filter apply over whatever's currently loaded — "Load
  // more" still paginates the real server list underneath.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      const cat = CATEGORY_OF[e.action_type];
      if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (category && CATEGORY_OF[e.action_type] !== category) return false;
      if (!q) return true;
      const cfg = ACTION_CONFIG[e.action_type];
      const haystack = `${e.actor_username ?? ''} ${e.target_name ?? ''} ${e.reason ?? ''} ${cfg?.label ?? e.action_type}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, search, category]);

  const filtersActive = !!search.trim() || !!category;

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="cn-glass sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="w-10 h-10 cn-action bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-sm shrink-0">
            <ScrollText className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold cn-text-1 leading-none">
              {isMod ? 'Moderation Log' : 'Decisions'}
            </h1>
            <p className="text-xs cn-text-3 mt-1">
              {total} {isMod ? 'action' : 'decision'}{total !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="w-9 h-9 rounded-lg cn-surface-2 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 cn-text-2 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Info card */}
        <div className="cn-glass rounded-2xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 cn-text-3 shrink-0 mt-0.5" />
          <p className="text-xs cn-text-3 leading-relaxed">
            {isMod
              ? 'The full moderation log, visible to admins and moderators only. Votes are also visible to every member in Decisions.'
              : 'A public record of every vote taken on this hub — anyone can see what was decided.'}
          </p>
        </div>

        {/* Search */}
        {entries.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isMod ? 'Search actions, members, reasons…' : 'Search decisions…'}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border cn-border cn-surface cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600/40 focus:outline-none text-sm transition-colors"
            />
          </div>
        )}

        {/* Category chips — mod view only, member Decisions is poll-only already */}
        {isMod && Object.keys(categoryCounts).length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
              const count = categoryCounts[key] ?? 0;
              if (count === 0) return null;
              const active = category === key;
              return (
                <button
                  key={key}
                  onClick={() => setCategory(active ? null : key)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'cn-surface cn-border cn-text-3 hover:cn-text-1'
                  }`}
                >
                  {label}
                  <span className={active ? 'opacity-80' : 'cn-text-4'}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 cn-text-4 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading log…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="cn-glass rounded-2xl text-center py-20">
            <ScrollText className="w-10 h-10 cn-text-4 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium cn-text-3">
              {isMod ? 'No actions recorded yet' : 'No decisions recorded yet'}
            </p>
            <p className="text-xs cn-text-4 mt-1">
              {isMod ? 'Moderation actions will appear here automatically' : 'Votes will appear here as soon as one is created'}
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="cn-glass rounded-2xl text-center py-16">
            <Search className="w-8 h-8 cn-text-4 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium cn-text-3">Nothing matches</p>
            {filtersActive && (
              <button
                onClick={() => { setSearch(''); setCategory(null); }}
                className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          // `isolate` scopes the timeline dots' z-10 (needed so they sit above
          // the absolutely-positioned line behind them) to a new stacking
          // context. Without it, that z-10 competed directly with the sticky
          // header's own z-10 at the page level -- once scrolled, whichever
          // entry's dot currently sits under the header would paint on top
          // of it instead of being covered by it.
          <div className="relative isolate">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-[var(--cn-border-strong)]" />

            <div className="space-y-1">
              {filteredEntries.map(entry => {
                const cfg = ACTION_CONFIG[entry.action_type] ?? {
                  label: entry.action_type.replace(/_/g, ' '),
                  color: 'cn-surface-2 cn-text-3',
                  dot:   'bg-slate-400',
                };
                return (
                  <div key={entry.id} className="flex items-start gap-4 py-3 pl-1 group">
                    {/* Timeline dot */}
                    <div className={`w-4 h-4 rounded-full ${cfg.dot} shrink-0 mt-0.5 ring-2 ring-white dark:ring-zinc-900 z-10`} />

                    <div className="flex-1 min-w-0 cn-surface rounded-2xl border cn-border px-4 py-3 hover:border-black/15 dark:hover:border-white/15 transition-colors">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Actor avatar */}
                          <div className="relative w-6 h-6 shrink-0">
                            <AvatarFallback className="absolute inset-0 rounded-full" name={entry.actor_username ?? undefined} />
                            {/* entry.actor_avatar_url from the API is a raw storage
                                object key, not a loadable URL -- same as everywhere
                                else in the app, resolve it through the avatar-serving
                                endpoint instead of using it directly. Still gated on
                                that field so we don't fire a doomed request for an
                                actor who never set an avatar in the first place. */}
                            {entry.actor_id && entry.actor_avatar_url && (
                              <img
                                src={hubService.getAvatarUrl(hubSlug, entry.actor_id) ?? undefined}
                                alt={entry.actor_username ?? ''}
                                className="absolute inset-0 w-full h-full rounded-full object-cover"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                          </div>
                          <span className="text-xs font-semibold cn-text-2">
                            {entry.actor_username ?? 'System'}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <span className="text-[10px] cn-text-4 shrink-0">{timeAgo(entry.created_at)}</span>
                      </div>

                      {entry.target_name && (
                        <p className="text-xs cn-text-3 mt-1.5 pl-8 line-clamp-2">
                          <span className="cn-text-4 mr-1">→</span>
                          {entry.target_name}
                        </p>
                      )}
                      {entry.reason && (
                        <p className="text-xs cn-text-4 mt-1 pl-8 italic">"{entry.reason}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {entries.length < total && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => load(entries.length, true)}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl cn-surface border cn-border text-sm cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Load more ({total - entries.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
