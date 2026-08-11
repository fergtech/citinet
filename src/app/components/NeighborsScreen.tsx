import { useState, useEffect, useMemo } from 'react';
import {
  Search, Loader2, AlertCircle, RefreshCw,
  Users, Shield, Crown, Calendar, Send, Tag, Sparkles, X, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubMember } from '../types/hub';

interface NeighborsScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
  onViewProfile?: (userId: string) => void;
}

function formatJoinDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function getAvatarColor(username: string): string {
  const colors = [
    'from-purple-500 to-indigo-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-violet-500 to-purple-500',
    'from-sky-500 to-blue-500',
    'from-lime-500 to-green-500',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isNewMember(dateStr: string): boolean {
  const t = new Date(dateStr).getTime();
  return !Number.isNaN(t) && Date.now() - t < THIRTY_DAYS_MS;
}

type FilterKey = 'all' | 'admin' | 'moderator' | 'new';

const FILTERS: { value: FilterKey; label: string; icon: typeof Users }[] = [
  { value: 'all',       label: 'All neighbors', icon: Users },
  { value: 'admin',     label: 'Admins',        icon: Crown },
  { value: 'moderator', label: 'Moderators',     icon: Shield },
  { value: 'new',       label: 'New members',    icon: Sparkles },
];

export function NeighborsScreen({ onBack, onNavigate, onViewProfile }: NeighborsScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug || '';

  const [members, setMembers] = useState<HubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const loadMembers = async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const result = await hubService.listMembers(slug);
      setMembers(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load neighbors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [slug]);

  // Read tag filter set by ProfileScreen navigation
  useEffect(() => {
    const tag = sessionStorage.getItem('citinet-filter-tag');
    if (tag) {
      setActiveTag(tag);
      sessionStorage.removeItem('citinet-filter-tag');
    }
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    members.forEach(m => m.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [members]);

  const counts = useMemo(() => ({
    all: members.length,
    admin: members.filter(m => m.role === 'admin').length,
    moderator: members.filter(m => m.role === 'moderator').length,
    new: members.filter(m => isNewMember(m.created_at)).length,
  }), [members]);

  const needle = searchQuery.trim().toLowerCase();
  const matchesSearch = (m: HubMember) =>
    !needle ||
    m.username.toLowerCase().includes(needle) ||
    (m.display_name?.toLowerCase().includes(needle) ?? false) ||
    (m.tags?.some(t => t.toLowerCase().includes(needle)) ?? false) ||
    (m.profile_headline?.toLowerCase().includes(needle) ?? false) ||
    (m.bio?.toLowerCase().includes(needle) ?? false);

  const filteredMembers = members.filter(m => {
    if (!matchesSearch(m)) return false;
    if (activeTag && !(m.tags?.includes(activeTag) ?? false)) return false;
    if (filter === 'admin') return m.role === 'admin';
    if (filter === 'moderator') return m.role === 'moderator';
    if (filter === 'new') return isNewMember(m.created_at);
    return true;
  });

  // Sort: admins first, then alphabetically
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  const currentUserId = currentUser?.hubUserId;

  const handleMessage = (member: HubMember) => {
    sessionStorage.setItem('citinet-deeplink-message-peer', JSON.stringify({ userId: member.user_id, username: member.username }));
    onNavigate?.('messages');
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-7 flex flex-col gap-4 md:gap-5">

        {/* Header */}
        <div>
          <button
            onClick={onBack}
            className="md:hidden inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:cn-text-1 mb-2.5 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: 'var(--cn-grad-identity)' }}
            >
              <Users className="w-[22px] h-[22px] text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-[26px] font-bold cn-text-1 tracking-tight">Neighbors</h1>
              <p className="text-[13px] cn-text-3 mt-0.5">
                {members.length.toLocaleString()} member{members.length === 1 ? '' : 's'} of {currentHub?.name ?? 'this hub'}
              </p>
            </div>
            <button
              onClick={loadMembers}
              disabled={loading}
              title="Refresh neighbors"
              className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
            >
              <RefreshCw className={`w-4 h-4 cn-text-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search neighbors by name or interest…"
            className="w-full h-[46px] pl-10 pr-4 rounded-xl cn-surface-2 border cn-border text-sm cn-text-1 placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {FILTERS.map(f => {
            const FIcon = f.icon;
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`inline-flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 border-transparent'
                    : 'cn-surface-2 cn-text-2 cn-border'
                }`}
              >
                <FIcon className="w-3 h-3" />
                {f.label}
                <span className="opacity-60">{counts[f.value]}</span>
              </button>
            );
          })}
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 -mt-1">
            {activeTag && (
              <button
                onClick={() => setActiveTag(null)}
                className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeTag === tag
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'cn-surface-2 cn-text-2 cn-border hover:border-purple-400 dark:hover:border-purple-600'
                }`}
              >
                <Tag className="w-3 h-3" />
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 cn-text-4">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading neighbors…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (() => {
          const isOffline = error.includes('Failed to fetch') || error.includes('tunnel') || error.includes('timed out');
          return isOffline ? (
            <div className="flex flex-col items-center justify-center py-20 cn-text-4">
              <Users className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium cn-text-3">No neighbors yet</p>
              <p className="text-xs mt-1 cn-text-4 text-center max-w-xs">
                Other members will appear here once they join the hub.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 cn-text-4">
              <AlertCircle className="w-8 h-8 mb-3 text-red-400" />
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button
                onClick={loadMembers}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          );
        })()}

        {/* Empty state */}
        {!loading && !error && sortedMembers.length === 0 && (
          <div className="cn-glass rounded-2xl px-6 py-14 text-center cn-text-3 text-sm">
            {activeTag
              ? `No neighbors tagged #${activeTag}.`
              : filter !== 'all'
              ? 'No neighbors match this filter.'
              : searchQuery
              ? `No neighbors match "${searchQuery}".`
              : 'No neighbors yet — be the first to join this hub!'}
          </div>
        )}

        {/* Neighbor cards */}
        {!loading && !error && sortedMembers.length > 0 && (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {sortedMembers.map((member, index) => {
                const isYou = member.user_id === currentUserId;
                const blurb = member.profile_headline || member.bio || '';
                return (
                  <motion.div
                    key={member.user_id || index}
                    role="button"
                    tabIndex={0}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => { if (isYou) onNavigate?.('account'); else onViewProfile?.(member.user_id); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isYou) onNavigate?.('account'); else onViewProfile?.(member.user_id);
                      }
                    }}
                    className="cn-glass rounded-2xl p-4 flex flex-col gap-2.5 text-left cursor-pointer hover:border-purple-300/60 dark:hover:border-purple-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(member.username)} ring-2 ring-white dark:ring-zinc-900 flex items-center justify-center text-white font-semibold text-sm shadow-sm relative overflow-hidden shrink-0`}>
                        {getInitials(member.username)}
                        <img
                          src={hubService.getAvatarUrl(slug, member.user_id) ?? undefined}
                          alt={member.username}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-semibold cn-text-1 truncate">{member.username}</span>
                          {member.role === 'admin' && <Crown className="w-3.5 h-3.5 cn-text-3 shrink-0" />}
                          {member.role === 'moderator' && <Shield className="w-3.5 h-3.5 cn-text-3 shrink-0" />}
                          {isYou && (
                            <span className="px-1.5 py-0.5 cn-surface-3 cn-text-2 text-[10px] font-medium rounded-full shrink-0">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 cn-text-4 shrink-0" />
                          <span className="text-[11px] cn-text-4 truncate">Joined {formatJoinDate(member.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {blurb && (
                      <p className="text-xs leading-relaxed cn-text-3 line-clamp-2">{blurb}</p>
                    )}

                    {member.tags && member.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {member.tags.slice(0, 4).map(t => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-[10.5px] font-medium cn-surface-2 cn-text-3">{t}</span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] cn-text-4 truncate">{member.location ?? ''}</span>
                      {!isYou && onNavigate && (
                        <button
                          onClick={e => { e.stopPropagation(); handleMessage(member); }}
                          title={`Message @${member.username}`}
                          className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
                        >
                          <Send className="w-3.5 h-3.5 cn-text-3" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {/* Footer count */}
        {!loading && !error && members.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-2 cn-text-4 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{members.length} {members.length === 1 ? 'neighbor' : 'neighbors'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
