import { ArrowLeft, Radio, Users, QrCode, Server, AlertTriangle, Zap, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { NetworkMap } from './NetworkMap';
import { MemberListModal } from './MemberListModal';
import { SignalDiagnosticsModal } from './SignalDiagnosticsModal';
import { InviteNeighborsModal } from './InviteNeighborsModal';
import { HostNodeModal } from './HostNodeModal';
import { EmergencySignalModal } from './EmergencySignalModal';
import { useHub, useHubStatus } from '../context/HubContext';
import { hubService } from '../services/hubService';
import type { HubMember } from '../types/hub';

interface NetworkScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

export function NetworkScreen({ onBack, onNavigate }: NetworkScreenProps) {
  const [memberListOpen, setMemberListOpen] = useState(false);
  const [memberListFilter, setMemberListFilter] = useState<'all' | 'admins'>('all');
  const [signalDiagnosticsOpen, setSignalDiagnosticsOpen] = useState(false);
  const [inviteNeighborsOpen, setInviteNeighborsOpen] = useState(false);
  const [hostNodeOpen, setHostNodeOpen] = useState(false);
  const [emergencySignalOpen, setEmergencySignalOpen] = useState(false);
  const [members, setMembers] = useState<HubMember[]>([]);

  const { currentHub } = useHub();
  const { status, label: statusLabel, dotColor } = useHubStatus();

  // Fetch real hub members
  useEffect(() => {
    if (!currentHub?.slug) return;
    const load = () => {
      hubService.listMembers(currentHub.slug).then(setMembers).catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [currentHub?.slug]);

  const activeMembers = members.length;
  const targetUsers = 100;
  const progress = activeMembers > 0 ? Math.min((activeMembers / targetUsers) * 100, 100) : 0;
  const hubName = currentHub?.name || 'Community Hub';
  const tunnelUrl = currentHub?.tunnelUrl || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Header */}
      <div className="sticky top-0 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              aria-label="Back to previous screen"
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <div>
              <h2 className="text-slate-900 dark:text-white text-2xl font-semibold tracking-tight">Network</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-light">Your local mesh infrastructure</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">
        {/* Two Column Layout - Map and Stats Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Network Map - Takes 2 columns */}
          <div className="lg:col-span-2">
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Live Network</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-light">Real-time visualization</p>
            </div>
            <div className="h-[500px]">
              <NetworkMap members={members} />
            </div>
          </div>

          {/* Stats Column */}
          <div className="space-y-4">
            <button
              onClick={() => {
                setMemberListFilter('all');
                setMemberListOpen(true);
              }}
              className="w-full bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all cursor-pointer text-left"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1 tabular-nums">{activeMembers}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Active Members</div>
            </button>

            <div className="w-full bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1 tabular-nums">
                {currentHub?.connectionStatus === 'connected' ? 'Online' : 'Local'}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Hub Status</div>
            </div>

            <button
              onClick={() => setSignalDiagnosticsOpen(true)}
              className="w-full bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer text-left"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  status === 'connected'    ? 'bg-green-100 dark:bg-green-900/30' :
                  status === 'connecting'   ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                  status === 'unreachable'  ? 'bg-orange-100 dark:bg-orange-900/30' :
                                             'bg-slate-100 dark:bg-zinc-800'
                }`}>
                  <Radio className={`w-4 h-4 ${
                    status === 'connected'   ? 'text-green-600 dark:text-green-400' :
                    status === 'connecting'  ? 'text-yellow-600 dark:text-yellow-400' :
                    status === 'unreachable' ? 'text-orange-500 dark:text-orange-400' :
                                              'text-slate-400'
                  }`} />
                </div>
                <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${status === 'connected' ? 'animate-pulse' : ''}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                {status === 'connected'   ? 'Connected' :
                 status === 'connecting'  ? 'Connecting' :
                 status === 'unreachable' ? 'Unreachable' :
                                           'Local Only'}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Hub Connection</div>
            </button>
          </div>
        </div>

        {/* Status and Growth in One Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cloud Status */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{hubName}</h3>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${status === 'connected' ? 'animate-pulse' : ''}`} />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">{statusLabel.toUpperCase()}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
                  {tunnelUrl ? (
                    <span className="font-mono text-xs break-all">{tunnelUrl}</span>
                  ) : (
                    'No tunnel URL configured'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Community Growth */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Growth</h3>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{activeMembers}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">/ {targetUsers}</span>
            </div>
            <div className="space-y-1.5">
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {targetUsers - activeMembers} more until next milestone
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setInviteNeighborsOpen(true)}
              className="group bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <QrCode className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold text-sm mb-1">Invite Neighbors</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Share QR or link</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setHostNodeOpen(true)}
              className="group bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Server className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold text-sm mb-1">Host a Node</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Setup guide</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setEmergencySignalOpen(true)}
              className="group bg-white dark:bg-zinc-900 rounded-xl p-5 border-2 border-red-200 dark:border-red-900/50 hover:border-red-300 dark:hover:border-red-800 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold text-sm mb-1">Emergency Signal</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Urgent alert</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Future Features */}
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-5 border border-blue-200 dark:border-blue-800/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Coming Soon: Physical Nodes
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                When mesh nodes deploy, you'll see node names, signal metrics, and interactive maps.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <MemberListModal
        isOpen={memberListOpen}
        onClose={() => setMemberListOpen(false)}
        members={members}
        filter={memberListFilter}
      />
      <SignalDiagnosticsModal
        isOpen={signalDiagnosticsOpen}
        onClose={() => setSignalDiagnosticsOpen(false)}
      />
      <InviteNeighborsModal
        isOpen={inviteNeighborsOpen}
        onClose={() => setInviteNeighborsOpen(false)}
      />
      <HostNodeModal
        isOpen={hostNodeOpen}
        onClose={() => setHostNodeOpen(false)}
        onNavigate={onNavigate}
      />
      <EmergencySignalModal
        isOpen={emergencySignalOpen}
        onClose={() => setEmergencySignalOpen(false)}
      />
    </div>
  );
}
