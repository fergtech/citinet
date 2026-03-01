import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Settings, Crown, RefreshCw, Shield } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import type { HubMember } from '../types/hub';

interface HubManagementScreenProps {
  onBack: () => void;
}

export function HubManagementScreen({ onBack }: HubManagementScreenProps) {
  const { currentHub, currentUser } = useHub();
  const [activeTab, setActiveTab] = useState<'info' | 'members'>('info');
  const [members, setMembers] = useState<HubMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');

  // isAdmin: explicit flag (new sessions) OR effectively-local hub (Mission 1).
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  const loadMembers = async () => {
    if (!currentHub?.slug) return;
    setMembersLoading(true);
    setMembersError('');
    try {
      const list = await hubService.listMembers(currentHub.slug);
      setMembers(list);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Could not load members');
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'members') {
      loadMembers();
    }
  }, [activeTab]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center">
        <div className="text-center px-6">
          <Shield className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Admin access required</p>
          <button
            onClick={onBack}
            className="text-sm text-purple-600 dark:text-purple-400 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Header */}
      <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Hub Management</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{currentHub?.name}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'info'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              Hub Info
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'members'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              Members
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* ─── Hub Info Tab ─── */}
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-5">
              <InfoRow label="Hub Name" value={currentHub?.name} note="Synced from hub API" />
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              <InfoRow label="Slug" value={currentHub?.slug} mono />
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              <InfoRow label="Description" value={currentHub?.description || undefined} placeholder="No description set" />
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              <InfoRow label="Location" value={currentHub?.location || undefined} placeholder="Not set" />
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              <InfoRow label="Hub API" value={currentHub?.tunnelUrl || undefined} placeholder="Not configured" mono small />
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Hub Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Members" value={currentHub?.meta?.activeMembers ?? '—'} />
                <StatCard label="Uptime" value={currentHub?.meta?.uptime ?? '—'} />
              </div>
            </div>
          </div>
        )}

        {/* ─── Members Tab ─── */}
        {activeTab === 'members' && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {membersLoading ? 'Loading...' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
              </span>
              <button
                onClick={loadMembers}
                disabled={membersLoading}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Refresh members"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${membersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {membersError && (
              <div className="px-4 py-6 text-center space-y-1">
                <p className="text-sm text-slate-500 dark:text-slate-400">{membersError}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Member list requires hub API access</p>
              </div>
            )}

            {!membersLoading && !membersError && members.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No members found
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {members.map(member => (
                <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {member.username}
                      </span>
                      {member.is_admin && (
                        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">
                          <Crown className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    {member.created_at && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Joined {new Date(member.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  note,
  placeholder,
  mono = false,
  small = false,
}: {
  label: string;
  value?: string;
  note?: string;
  placeholder?: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      {value ? (
        <p className={`${small ? 'text-xs' : 'text-sm'} ${mono ? 'font-mono break-all' : ''} text-slate-800 dark:text-slate-200`}>
          {value}
        </p>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">{placeholder ?? 'Not set'}</p>
      )}
      {note && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{note}</p>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4">
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}
