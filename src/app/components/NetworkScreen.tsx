import { Radio, Users, QrCode, Server, AlertTriangle, Activity, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
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

const GROWTH_MILESTONE = 100;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function StatCard({ icon, label, value, sub, grad, onClick, pulse }: {
  icon: React.ElementType; label: string; value: string; sub?: string; grad: string;
  onClick?: () => void; pulse?: boolean;
}) {
  const Icon = icon;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`flex flex-col gap-2.5 rounded-2xl cn-glass p-4 text-left ${onClick ? 'hover:border-black/15 dark:hover:border-white/15 transition-colors' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </span>
        {pulse && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      </div>
      <div>
        <div className="font-mono text-xl font-bold cn-text-1 leading-none">{value}</div>
        <div className="text-[11px] cn-text-3 mt-1.5">{label}</div>
      </div>
      {sub && <div className="text-[11px] cn-text-4 truncate">{sub}</div>}
    </Wrapper>
  );
}

function GrowthCard({ current, goal }: { current: number; goal: number }) {
  const pct = current > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  return (
    <div className="rounded-2xl cn-glass p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold cn-text-1">Growth toward next milestone</span>
        <span className="font-mono text-[11px] cn-text-3">{current} / {goal}</span>
      </div>
      <div className="h-2 rounded-full cn-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] cn-text-4">{Math.max(0, goal - current)} more members until the next milestone.</p>
    </div>
  );
}

interface QuickAction { icon: React.ElementType; label: string; desc: string; danger?: boolean; onClick: () => void; }

function QuickActionsCard({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="rounded-2xl cn-glass p-4">
      <h3 className="text-sm font-semibold cn-text-1 mb-2.5">Quick actions</h3>
      <div className="flex flex-col gap-1">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
          >
            <span className={`w-9 h-9 rounded-xl cn-surface-2 flex items-center justify-center shrink-0 ${a.danger ? 'text-red-500 dark:text-red-400' : 'text-purple-500 dark:text-purple-300'}`}>
              <a.icon className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold cn-text-1">{a.label}</span>
              <span className="block text-[11px] cn-text-3">{a.desc}</span>
            </span>
            <ChevronRight className="w-4 h-4 cn-text-4 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
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
  const newThisMonth = useMemo(() => {
    const now = Date.now();
    return members.filter(m => now - new Date(m.created_at).getTime() < THIRTY_DAYS_MS).length;
  }, [members]);
  const hubName = currentHub?.name || 'Community Hub';
  const tunnelUrl = currentHub?.tunnelUrl || '';

  const actions: QuickAction[] = [
    { icon: QrCode, label: 'Invite neighbors', desc: 'Share a QR code or join link', onClick: () => setInviteNeighborsOpen(true) },
    { icon: Server, label: 'Host a node', desc: 'Set up a relay to extend coverage', onClick: () => setHostNodeOpen(true) },
    { icon: AlertTriangle, label: 'Emergency signal', desc: 'Broadcast an urgent alert', danger: true, onClick: () => setEmergencySignalOpen(true) },
  ];

  const statsRow = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard
        icon={Users}
        label="Active members"
        value={String(activeMembers)}
        sub={memberListFilter === 'admins' ? undefined : 'View member list →'}
        grad="from-purple-500 to-indigo-600"
        pulse
        onClick={() => { setMemberListFilter('all'); setMemberListOpen(true); }}
      />
      <StatCard
        icon={Radio}
        label="Hub connection"
        value={statusLabel}
        sub={tunnelUrl ? tunnelUrl.replace(/^https?:\/\//, '') : 'No tunnel configured'}
        grad="from-teal-500 to-cyan-600"
        pulse={status === 'connected'}
        onClick={() => setSignalDiagnosticsOpen(true)}
      />
      <StatCard
        icon={TrendingUp}
        label="Growth this month"
        value={`+${newThisMonth}`}
        sub={`${newThisMonth === 1 ? 'neighbor' : 'neighbors'} joined recently`}
        grad="from-amber-500 to-orange-600"
      />
    </div>
  );

  const sidebar = (
    <div className="flex flex-col gap-4">
      <GrowthCard current={activeMembers} goal={GROWTH_MILESTONE} />
      <QuickActionsCard actions={actions} />
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-7">
        {/* Breadcrumb */}
        <button onClick={onBack} className="flex items-center gap-0.5 mb-4 group">
          <ChevronLeft className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300 transition-colors" />
          <span className="text-sm font-medium text-purple-400 group-hover:text-purple-300 transition-colors">{hubName}</span>
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <span className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600 shadow-md">
            <Radio className="w-6 h-6 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold cn-text-1 tracking-tight leading-none">Network</h1>
            <p className="text-sm cn-text-3 mt-0.5">Live status for {hubName}</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full cn-surface-2 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${status === 'connected' ? 'animate-pulse' : ''}`} />
            <span className="text-xs font-semibold cn-text-2">{statusLabel}</span>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {statsRow}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
            {/* Main column */}
            <div className="flex flex-col gap-5 min-w-0">
              <div>
                <h2 className="text-base font-semibold cn-text-1 mb-0.5">Live network</h2>
                <p className="text-xs cn-text-3 mb-3">Real-time member locations around this hub</p>
                <div className="h-[420px]">
                  <NetworkMap members={members} />
                </div>
              </div>
              {/* Sidebar content repeats here on mobile, below the map */}
              <div className="lg:hidden">{sidebar}</div>
            </div>

            {/* Sidebar — desktop only */}
            <div className="hidden lg:block sticky top-7">{sidebar}</div>
          </div>

          {/* Honest note — no physical relay hardware yet, this is a single hub + tunnel today */}
          <div className="rounded-2xl cn-glass p-4 flex items-center gap-3">
            <Activity className="w-4 h-4 cn-text-4 shrink-0" />
            <p className="text-xs cn-text-3">
              This hub runs as a single node today — when physical relay nodes are supported, you'll see live signal metrics and coverage here.
            </p>
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
