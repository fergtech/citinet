import {
  Users, MessageCircle, Settings, Radio, Store,
  Calendar, AlertCircle, Lightbulb, Activity, MapPin, Clock, Wrench, LogOut, FolderOpen,
  RefreshCw, Loader2, Check, WifiOff, Link2, User, Shield,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { FeaturedCarousel } from './FeaturedCarousel';
import { useHub, useHubStatus } from '../context/HubContext';

interface DashboardProps {
  userName?: string;
  onNavigate: (screen: string) => void;
  onLogout?: () => void;
}

interface NavigationCardProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function NavigationCard({ icon, label, onClick }: NavigationCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] p-4 flex items-center gap-3 border border-slate-200 dark:border-zinc-700"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
        <div className="text-white">{icon}</div>
      </div>
      <span className="text-sm font-bold text-slate-900 dark:text-white">{label}</span>
    </button>
  );
}

export function Dashboard({ userName = "Neighbor", onNavigate, onLogout }: DashboardProps) {
  const { currentHub, currentUser, updateTunnelUrl } = useHub();
  const { dotColor, label: statusLabel, status: connectionStatus } = useHubStatus();

  // Tunnel reconnect state
  const [showTunnelInput, setShowTunnelInput] = useState(false);
  const [tunnelInput, setTunnelInput] = useState('');
  const [tunnelUpdating, setTunnelUpdating] = useState(false);
  const [tunnelError, setTunnelError] = useState('');
  const [tunnelSuccess, setTunnelSuccess] = useState(false);

  const handleTunnelReconnect = async () => {
    if (!tunnelInput.trim()) return;
    setTunnelUpdating(true);
    setTunnelError('');
    setTunnelSuccess(false);
    const result = await updateTunnelUrl(tunnelInput.trim());
    setTunnelUpdating(false);
    if (result.ok) {
      setTunnelSuccess(true);
      setTunnelInput('');
      setTimeout(() => {
        setShowTunnelInput(false);
        setTunnelSuccess(false);
      }, 1500);
    } else {
      setTunnelError(result.error || 'Could not reach hub');
    }
  };

  const handleForceUpdateUrl = async () => {
    if (!tunnelInput.trim()) return;
    setTunnelUpdating(true);
    setTunnelError('');
    setTunnelSuccess(false);
    const result = await updateTunnelUrl(tunnelInput.trim(), true);
    setTunnelUpdating(false);
    if (result.ok) {
      setTunnelSuccess(true);
      setTunnelInput('');
      setTimeout(() => {
        setShowTunnelInput(false);
        setTunnelSuccess(false);
      }, 1500);
    }
  };

  // Use hub context for real data, fall back to props/defaults
  const nodeName = currentHub?.name || 'Community';
  const displayName = currentUser?.displayName || userName;
  // isAdmin: explicit flag (new sessions) OR effectively-local hub (Mission 1).
  // 'https://' is the malformed URL stored by the old empty-URL bug; treat it as local too.
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  const nodeStatus = {
    activeMembers: currentHub?.meta?.activeMembers ?? 0,
    onlineNow: currentHub?.meta?.onlineNow ?? 0,
    signalStrength: currentHub?.connectionStatus === 'connected' ? 'Strong' : currentHub?.connectionStatus === 'connecting' ? 'Weak' : 'Offline'
  };

  const recentDiscussions = [
    {
      id: 1,
      type: 'Discussion',
      title: 'Proposed bike lane on Main Street',
      author: 'Sarah K.',
      timestamp: '2 hours ago',
      replies: 8
    },
    {
      id: 2,
      type: 'Announcement',
      title: 'Community meeting this Thursday at 7 PM',
      author: 'Highland Park Civic Association',
      timestamp: '5 hours ago',
      replies: 3
    },
    {
      id: 3,
      type: 'Request',
      title: 'Looking for volunteers for park cleanup',
      author: 'Maria G.',
      timestamp: '1 day ago',
      replies: 12
    }
  ];

  const upcomingEvents = [
    {
      id: 1,
      title: 'Town Hall: Infrastructure Planning',
      date: 'Thursday, Jan 9',
      time: '7:00 PM',
      location: 'Community Center'
    },
    {
      id: 2,
      title: 'Weekend Farmers Market',
      date: 'Saturday, Jan 11',
      time: '9:00 AM',
      location: 'Central Square'
    }
  ];

  const activeInitiatives = [
    {
      id: 1,
      title: 'Community Garden Expansion',
      participants: 23,
      status: 'In Progress'
    },
    {
      id: 2,
      title: 'Local Tool Library',
      participants: 15,
      status: 'Planning'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex relative">
      {/* Subtle mesh grid background pattern */}
      <div className="fixed inset-0 opacity-[0.03] dark:opacity-[0.08] pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dashboard-mesh" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-600 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dashboard-mesh)"/>
        </svg>
      </div>

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-72 lg:w-80 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-r border-slate-200/50 dark:border-zinc-800/50 sticky top-0 h-screen overflow-y-auto shrink-0 relative z-10">
        {/* User Identity */}
        <div className="p-6 border-b border-slate-200/50 dark:border-zinc-800/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{displayName}</h2>
                {isAdmin && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">Admin</span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{nodeName}</p>
            </div>
          </div>
          {/* Connection status + reconnect */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dotColor} ${currentHub?.connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
              <span className="text-xs text-slate-600 dark:text-slate-400 flex-1">{statusLabel}</span>
              <button
                onClick={() => { setShowTunnelInput(!showTunnelInput); setTunnelError(''); setTunnelSuccess(false); }}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="Update tunnel URL"
                aria-label="Update tunnel URL"
              >
                <Link2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </button>
            </div>

            {/* Tunnel URL input */}
            {showTunnelInput && (
              <div className="space-y-2 pt-1">
                {currentHub?.tunnelUrl && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono">
                    {currentHub.tunnelUrl}
                  </p>
                )}
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={tunnelInput}
                    onChange={(e) => { setTunnelInput(e.target.value); setTunnelError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleTunnelReconnect()}
                    placeholder="New tunnel URL..."
                    className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:border-transparent focus:outline-none"
                    disabled={tunnelUpdating}
                  />
                  <button
                    onClick={handleTunnelReconnect}
                    disabled={tunnelUpdating || !tunnelInput.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    {tunnelUpdating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : tunnelSuccess ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </button>
                </div>
                {tunnelError && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-red-500 dark:text-red-400 flex-1">{tunnelError}</p>
                    {tunnelInput.trim() && (
                      <button
                        onClick={handleForceUpdateUrl}
                        className="text-[10px] text-purple-500 dark:text-purple-400 underline hover:no-underline shrink-0"
                      >
                        Save anyway
                      </button>
                    )}
                  </div>
                )}
                {tunnelSuccess && (
                  <p className="text-[10px] text-green-500 dark:text-green-400">Reconnected!</p>
                )}
                {connectionStatus === 'unreachable' && !tunnelInput && (
                  <p className="text-[10px] text-orange-500 dark:text-orange-400">Hub unreachable — enter the new tunnel URL to reconnect.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <button
              onClick={() => onNavigate('feed')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <MessageCircle className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Discussions</span>
            </button>

            <button
              onClick={() => onNavigate('community')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Users className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Community</span>
            </button>

            <button
              onClick={() => onNavigate('marketplace')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Store className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Local Exchange</span>
            </button>

            <button
              onClick={() => onNavigate('neighbors')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Users className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Neighbors</span>
            </button>

            <button
              onClick={() => onNavigate('files')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <FolderOpen className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Files</span>
            </button>

            <button
              onClick={() => onNavigate('toolkit')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Wrench className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Discover</span>
            </button>

            <button
              onClick={() => onNavigate('network')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Radio className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Network</span>
            </button>

            <button
              onClick={() => onNavigate('messages')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <MessageCircle className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Messages</span>
            </button>
          </div>

          {/* Node Status - Simplified
          <div className="mt-6 relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 rounded-xl p-4 border border-slate-800/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Live Status</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Active Members</div>
                <div className="text-2xl font-bold text-white tabular-nums">{nodeStatus.activeMembers}</div>
              </div>

              <div className="h-px bg-slate-800"/>

              <div>
                <div className="text-xs text-slate-500 mb-1">Online Now</div>
                <div className="text-2xl font-bold text-white tabular-nums">{nodeStatus.onlineNow}</div>
              </div>
            </div>
          </div> */}
        </nav>

        {/* Bottom nav: Account, Hub Admin, Leave */}
        <div className="p-4 border-t border-slate-200/50 dark:border-zinc-800/50 space-y-1">
          <button
            onClick={() => onNavigate('account')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
          >
            <User className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">My Account</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => onNavigate('hub-management')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left group"
            >
              <Shield className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Hub Admin</span>
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left group"
            >
              <LogOut className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-red-500 dark:group-hover:text-red-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-red-600 dark:group-hover:text-red-400">Leave Hub</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 pb-24 overflow-x-hidden relative z-10">
        {/* Mobile Header - Only shown on mobile */}
        <div className="md:hidden bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-slate-900 dark:text-white font-semibold text-2xl mb-1 tracking-tight">
                  {displayName}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
                  {nodeName}
                </p>
              </div>
              <button
                onClick={() => onNavigate('settings')}
                className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                aria-label="Open settings"
              >
                <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center transition-colors"
                  aria-label="Leave hub"
                >
                  <LogOut className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </button>
              )}
            </div>

            {/* Mobile: connection status + reconnect */}
            {connectionStatus === 'unreachable' && (
              <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300 flex-1">Hub unreachable</span>
                  <button
                    onClick={() => setShowTunnelInput(!showTunnelInput)}
                    className="text-[10px] font-medium text-purple-600 dark:text-purple-400 underline"
                  >
                    Update URL
                  </button>
                </div>
                {showTunnelInput && (
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        value={tunnelInput}
                        onChange={(e) => { setTunnelInput(e.target.value); setTunnelError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleTunnelReconnect()}
                        placeholder="New tunnel URL..."
                        className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800/50 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                        disabled={tunnelUpdating}
                      />
                      <button
                        onClick={handleTunnelReconnect}
                        disabled={tunnelUpdating || !tunnelInput.trim()}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                      >
                        {tunnelUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      </button>
                    </div>
                    {tunnelError && (
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-red-500 flex-1">{tunnelError}</p>
                        {tunnelInput.trim() && (
                          <button
                            onClick={handleForceUpdateUrl}
                            className="text-[10px] text-purple-500 underline hover:no-underline shrink-0"
                          >
                            Save anyway
                          </button>
                        )}
                      </div>
                    )}
                    {tunnelSuccess && <p className="text-[10px] text-green-500">Reconnected!</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Header - Simpler, no user name since it's in sidebar */}
        <div className="hidden md:block bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
          <div className="px-8 py-5">
            <h1 className="text-slate-900 dark:text-white font-semibold text-2xl tracking-tight">
              {nodeName}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
              Welcome to the new internet, owned and operated by our local community.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8 overflow-x-hidden">
          {/* Node Status - Mobile Only (Desktop has it in sidebar) */}
          <div className="md:hidden relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-500 to-blue-500 rounded-2xl p-4 shadow-xl text-white max-w-full">
            {/* Subtle texture overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
            
            <div className="relative flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-medium text-white/90">Network Active</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Node Status</h2>
              </div>
              <Activity className="w-8 h-8 text-white/80" />
            </div>

            <div className="relative grid grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-4">
                <div className="text-3xl font-semibold mb-1">{nodeStatus.activeMembers}</div>
                <div className="text-xs text-white/80 font-light">Active Members</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-4">
                <div className="text-3xl font-semibold mb-1">{nodeStatus.onlineNow}</div>
                <div className="text-xs text-white/80 font-light">Online Now</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-4">
                <div className="text-base font-semibold mb-1">{nodeStatus.signalStrength}</div>
                <div className="text-xs text-white/80 font-light">Signal</div>
              </div>
            </div>
          </div>
          {/* Featured Content - Curated by Admins/Mods */}
          <div className="max-w-full overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Featured</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-light">Curated by community moderators</span>
            </div>
            <FeaturedCarousel />
          </div>
          {/* Recent Local Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Recent Activity</h2>
            <button
              onClick={() => onNavigate('feed')}
              className="text-sm font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {recentDiscussions.map(discussion => (
              <div
                key={discussion.id}
                className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wide bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-500/20">
                        {discussion.type}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{discussion.timestamp}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1">{discussion.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                      <span>{discussion.author}</span>
                      <span>•</span>
                      <span>{discussion.replies} replies</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two Column Grid for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Upcoming Events</h2>
              <button
                onClick={() => onNavigate('community')}
                className="text-sm font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              >
                Calendar
              </button>
            </div>

            <div className="space-y-3">
              {upcomingEvents.map(event => (
                <div
                  key={event.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer"
                >
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1 truncate">{event.title}</h3>
                      <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span>{event.date} • {event.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />
                          <span>{event.location}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Initiatives */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 tracking-tight">Community Initiatives</h2>

            <div className="space-y-3">
              {activeInitiatives.map(initiative => (
                <div
                  key={initiative.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                        <Lightbulb className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{initiative.title}</h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 dark:text-slate-400">
                          <Users className="w-3 h-3" />
                          <span>{initiative.participants} participants</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      {initiative.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Cards - Only shown on mobile */}
        <div className="md:hidden pt-8 border-t border-slate-200 dark:border-zinc-800">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-700 dark:text-slate-400 mb-1">Navigate</h2>
            <p className="text-xs text-slate-500 dark:text-slate-500">Access network tools and features</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NavigationCard
              icon={<MessageCircle className="w-5 h-5" />}
              label="Discussions"
              onClick={() => onNavigate('feed')}
            />
            <NavigationCard
              icon={<Users className="w-5 h-5" />}
              label="Community"
              onClick={() => onNavigate('community')}
            />
            <NavigationCard
              icon={<Store className="w-5 h-5" />}
              label="Local Exchange"
              onClick={() => onNavigate('marketplace')}
            />
            <NavigationCard
              icon={<Wrench className="w-5 h-5" />}
              label="Discover"
              onClick={() => onNavigate('toolkit')}
            />
            <NavigationCard
              icon={<Radio className="w-5 h-5" />}
              label="Network"
              onClick={() => onNavigate('network')}
            />
            <NavigationCard
              icon={<MessageCircle className="w-5 h-5" />}
              label="Messages"
              onClick={() => onNavigate('messages')}
            />
          </div>
        </div>

        {/* Civic Action Bar - Mobile Only */}
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-20">
          <div className="bg-slate-900/95 dark:bg-zinc-800/95 backdrop-blur-lg rounded-2xl shadow-2xl flex items-center justify-around p-4 border border-slate-700/50">
            <button
              onClick={() => onNavigate('post')}
              className="flex flex-col items-center gap-1 text-white hover:text-purple-400 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-xs font-medium">Discuss</span>
            </button>
            <div className="h-8 w-px bg-slate-700" />
            <button
              onClick={() => onNavigate('chat')}
              className="flex flex-col items-center gap-1 text-white hover:text-purple-400 transition-colors"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs font-medium">Report</span>
            </button>
            <div className="h-8 w-px bg-slate-700" />
            <button
              onClick={() => onNavigate('signal')}
              className="flex flex-col items-center gap-1 text-white hover:text-red-400 transition-colors"
            >
              <Radio className="w-5 h-5" />
              <span className="text-xs font-medium">Signal</span>
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
