import { useState, useEffect } from 'react';
import {
  ArrowLeft, Search, Loader2, AlertCircle, RefreshCw,
  Users, Shield, UserCircle, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubMember } from '../types/hub';

interface NeighborsScreenProps {
  onBack: () => void;
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

export function NeighborsScreen({ onBack }: NeighborsScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug || '';

  const [members, setMembers] = useState<HubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredMembers = members.filter(m =>
    m.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: admins first, then alphabetically
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  const currentUserId = currentUser?.hubUserId;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              title="Back"
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Neighbors</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>
          <button
            onClick={loadMembers}
            disabled={loading}
            title="Refresh members"
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search neighbors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
          />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading neighbors...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <AlertCircle className="w-8 h-8 mb-3 text-red-400" />
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button
              onClick={loadMembers}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && sortedMembers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm font-medium">
              {searchQuery ? 'No neighbors match your search' : 'No neighbors yet'}
            </p>
            <p className="text-xs mt-1 text-slate-400">
              {searchQuery ? 'Try a different search term' : 'Be the first to join this hub!'}
            </p>
          </div>
        )}

        {/* Members List */}
        {!loading && !error && sortedMembers.length > 0 && (
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {sortedMembers.map((member, index) => {
                const isYou = member.user_id === currentUserId;
                return (
                  <motion.div
                    key={member.user_id || index}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ delay: index * 0.03 }}
                    className="group bg-white dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50 rounded-xl p-4 hover:border-purple-300 dark:hover:border-purple-600/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(member.username)} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}>
                        {getInitials(member.username)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {member.username}
                          </span>
                          {isYou && (
                            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-medium rounded-full">
                              You
                            </span>
                          )}
                          {member.is_admin && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium rounded-full">
                              <Shield className="w-2.5 h-2.5" />
                              Admin
                            </span>
                          )}
                        </div>
                        {member.created_at && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Joined {formatJoinDate(member.created_at)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Icon */}
                      <UserCircle className="w-5 h-5 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {/* Footer */}
        {!loading && !error && members.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-6 text-slate-400 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{members.length} {members.length === 1 ? 'neighbor' : 'neighbors'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
