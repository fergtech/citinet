import { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronLeft, RefreshCw, Loader2 } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { modLogService, type ModLogEntry } from '../services/modLogService';

interface ModLogScreenProps {
  onBack: () => void;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  delete_post:       { label: 'Post Removed',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',    dot: 'bg-amber-400' },
  pin_featured:      { label: 'Post Featured',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-400' },
  remove_featured:   { label: 'Featured Removed',    color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  promote_moderator: { label: 'Promoted to Mod',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-400' },
  demote_moderator:  { label: 'Removed as Mod',      color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  promote_admin:     { label: 'Promoted to Admin',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', dot: 'bg-purple-400' },
  demote_admin:      { label: 'Removed as Admin',    color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
  remove_member:     { label: 'Member Removed',      color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',           dot: 'bg-red-400' },
  ban_user:          { label: 'User Banned',         color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',           dot: 'bg-red-500' },
  unban_user:        { label: 'User Unbanned',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-400' },
  create_poll:       { label: 'Poll Created',        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', dot: 'bg-indigo-400' },
  close_poll:        { label: 'Poll Closed',         color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',        dot: 'bg-slate-400' },
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
  const { currentHub } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const [entries, setEntries] = useState<ModLogEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 50;

  const load = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    const { entries: newEntries, total: newTotal } = await modLogService.list(hubSlug, offset, PAGE);
    if (append) {
      setEntries(prev => [...prev, ...newEntries]);
    } else {
      setEntries(newEntries);
    }
    setTotal(newTotal);
    setLoading(false);
    setLoadingMore(false);
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-20">
      {/* Header */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-slate-400 dark:text-zinc-400" />
              Moderation Log
            </h1>
            <p className="text-xs text-slate-400 dark:text-zinc-500">{total} action{total !== 1 ? 's' : ''} recorded</p>
          </div>
          <button onClick={() => load()} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-800/30 rounded-xl px-4 py-3 text-xs text-indigo-700 dark:text-indigo-300">
          This is a public record of all moderation actions taken on this hub. Every member can view it.
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading log…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <ScrollText className="w-10 h-10 text-slate-200 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400 dark:text-zinc-500">No actions recorded yet</p>
            <p className="text-xs text-slate-300 dark:text-zinc-600 mt-1">Moderation actions will appear here automatically</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-slate-200 dark:bg-zinc-800" />

            <div className="space-y-1">
              {entries.map(entry => {
                const cfg = ACTION_CONFIG[entry.action_type] ?? {
                  label: entry.action_type.replace(/_/g, ' '),
                  color: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',
                  dot:   'bg-slate-400',
                };
                return (
                  <div key={entry.id} className="flex items-start gap-4 py-3 pl-1 group">
                    {/* Timeline dot */}
                    <div className={`w-4 h-4 rounded-full ${cfg.dot} shrink-0 mt-0.5 ring-2 ring-white dark:ring-zinc-950 z-10`} />

                    <div className="flex-1 min-w-0 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/60 dark:border-zinc-800/60 px-4 py-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Actor avatar */}
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {entry.actor_username?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {entry.actor_username ?? 'System'}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0">{timeAgo(entry.created_at)}</span>
                      </div>

                      {entry.target_name && (
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 pl-8 line-clamp-2">
                          <span className="text-slate-300 dark:text-zinc-600 mr-1">→</span>
                          {entry.target_name}
                        </p>
                      )}
                      {entry.reason && (
                        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 pl-8 italic">"{entry.reason}"</p>
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
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
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
