import { X, Search, Users, Shield } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { HubMember } from '../types/hub';

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[80vh] shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Community Members</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {adminCount} admin{adminCount !== 1 ? 's' : ''} • {members.length} total
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close member list modal"
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedFilter === 'all'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Users className="w-4 h-4" />
              All Members
            </button>
            <button
              onClick={() => setSelectedFilter('admins')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedFilter === 'admins'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Shield className="w-4 h-4" />
              Admins
            </button>
          </div>
        </div>

        {/* Member List */}
        <div className="flex-1 overflow-y-auto p-6">
          {members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400">No members yet</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400">No members found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${
                    member.is_admin
                      ? 'bg-gradient-to-br from-purple-600 to-blue-600'
                      : 'bg-slate-400 dark:bg-slate-600'
                  }`}>
                    {getInitials(member.username)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {member.username}
                      </h4>
                      {member.is_admin && (
                        <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    {member.created_at && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
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
