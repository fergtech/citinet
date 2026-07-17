import { X, Search, Users, Shield } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { HubMember } from '../types/hub';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';

interface MemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: HubMember[];
  filter?: 'all' | 'admins';
}

function getInitials(username: string): string {
  const parts = username.replace(/[_.-]/g, ' ').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

function formatJoinDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(isoDate));
  } catch {
    return '';
  }
}

export function MemberListModal({ isOpen, onClose, members, filter = 'all' }: MemberListModalProps) {
  const { currentHub } = useHub();
  const slug = currentHub?.slug ?? '';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'admins'>(filter);

  const filteredMembers = useMemo(() => {
    let result = members;

    if (selectedFilter === 'admins') {
      result = result.filter(m => m.is_admin);
    }

    if (searchQuery) {
      result = result.filter(m =>
        m.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return [...result].sort((a, b) => {
      if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  }, [members, searchQuery, selectedFilter]);

  if (!isOpen) return null;

  const adminCount = members.filter(m => m.is_admin).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="cn-surface border cn-border rounded-2xl max-w-lg w-full max-h-[80vh] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-4 border-b cn-border">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold cn-text-1">Community members</h2>
              <p className="text-xs cn-text-3 mt-0.5">
                {adminCount} admin{adminCount !== 1 ? 's' : ''} · {members.length} total
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4 cn-text-3" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4" />
            <input
              type="text"
              placeholder="Search members…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 cn-surface-2 border cn-border rounded-lg text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'cn-surface-2 cn-text-3 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              All members
            </button>
            <button
              onClick={() => setSelectedFilter('admins')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'admins'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'cn-surface-2 cn-text-3 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Admins
            </button>
          </div>
        </div>

        {/* Member List */}
        <div className="flex-1 overflow-y-auto p-4">
          {members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 cn-text-4 mx-auto mb-3" />
              <p className="text-sm cn-text-3">No members yet</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 cn-text-4 mx-auto mb-3" />
              <p className="text-sm cn-text-3">No members found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 bg-gradient-to-br from-blue-600 to-purple-600 relative overflow-hidden">
                    {getInitials(member.username)}
                    {slug && (
                      <img
                        src={hubService.getAvatarUrl(slug, member.user_id) ?? undefined}
                        alt={member.username}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium cn-text-1 truncate">
                        {member.username}
                      </h4>
                      {member.is_admin && (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    {member.created_at && (
                      <p className="text-xs cn-text-4">
                        Joined {formatJoinDate(member.created_at)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
