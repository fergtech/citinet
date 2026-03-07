import {
  Users, MessageCircle, Settings, Radio, Store,
  Calendar, Lightbulb, Activity, MapPin, Clock, Wrench, LogOut, FolderOpen,
  RefreshCw, Loader2, Check, WifiOff, Link2, User, Shield, Map,
  X, ChevronRight, UserPlus, Share2, CheckCircle2, Target,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FeaturedCarousel } from './FeaturedCarousel';
import { PostDetailModal } from './PostDetailModal';
import { useHub, useHubStatus } from '../context/HubContext';
import { featuredService } from '../services/featuredService';
import { hubService } from '../services/hubService';
import { useActivityFeed, timeAgo, type ActivityItem, type ActivityType } from '../hooks/useActivityFeed';
import type { FeaturedItem } from '../types/featured';
import type { HubPost } from '../types/hub';

interface DashboardProps {
  userName?: string;
  onNavigate: (screen: string) => void;
  onLogout?: () => void;
}

export function Dashboard({ userName = "Neighbor", onNavigate, onLogout }: DashboardProps) {
  const { currentHub, currentUser, updateTunnelUrl } = useHub();
  const { dotColor, label: statusLabel, status: connectionStatus } = useHubStatus();

  // Featured
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
  const [featuredPost, setFeaturedPost] = useState<HubPost | null>(null);

  const hubSlug = currentHub?.slug ?? '';

  useEffect(() => {
    if (!hubSlug) return;
    featuredService.getFeatured(hubSlug).then(setFeaturedItems);
  }, [hubSlug]);

  const { items: activityItems, loading: activityLoading, refresh: refreshActivity } = useActivityFeed(hubSlug);

  async function handleFeaturedPostClick(postId: string) {
    try {
      const post = await hubService.getPost(hubSlug, postId);
      setFeaturedPost(post);
    } catch {
      // ignore — fall through silently
    }
  }

  // Mobile user menu
  const [showUserMenu, setShowUserMenu] = useState(false);

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

  const [rsvpDone, setRsvpDone] = useState<Record<number, boolean>>({});

  const upcomingEvents = [
    {
      id: 1,
      title: 'Town Hall: Infrastructure Planning',
      date: 'Thursday, Jan 9',
      time: '7:00 PM',
      location: 'Community Center',
      organizer: 'Hub Admin',
      attendees: 34,
      description: 'Join your neighbors for an open discussion on upcoming infrastructure improvements, road maintenance priorities, and broadband expansion plans for our community. All residents welcome — bring your questions and ideas.',
    },
    {
      id: 2,
      title: 'Weekend Farmers Market',
      date: 'Saturday, Jan 11',
      time: '9:00 AM',
      location: 'Central Square',
      organizer: 'Local Growers Collective',
      attendees: 112,
      description: 'Fresh produce, local honey, artisan goods, and live music. Our weekly market brings together over 20 local vendors. Bring your own bags and enjoy a morning in the square with the community.',
    },
  ] as const;

  const activeInitiatives = [
    {
      id: 1,
      title: 'Community Garden Expansion',
      participants: 23,
      status: 'In Progress',
      progress: 62,
      goal: 'Convert the vacant lot on Elm St. into a shared vegetable garden with 40 raised beds available to all residents.',
      description: 'We\'ve secured the land lease and have 14 beds built so far. Next steps: irrigation install and bed assignments. Volunteers needed every weekend.',
    },
    {
      id: 2,
      title: 'Local Tool Library',
      participants: 15,
      status: 'Planning',
      progress: 28,
      goal: 'Establish a lending library of tools and equipment so neighbors can borrow instead of buy.',
      description: 'Inventory catalogue underway with 80+ tools donated so far. Looking for a space to host and a volunteer coordinator. Sign up to help shape the programme.',
    },
  ] as const;

  const [selectedEvent, setSelectedEvent] = useState<typeof upcomingEvents[number] | null>(null);
  const [selectedInitiative, setSelectedInitiative] = useState<typeof activeInitiatives[number] | null>(null);

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
      <aside className="hidden md:flex md:flex-col md:w-72 lg:w-80 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-r border-slate-200/50 dark:border-zinc-800/50 sticky top-0 h-screen overflow-y-auto shrink-0 z-10">
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
              onClick={() => onNavigate('atlas')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Map className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Atlas</span>
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
              onClick={() => onNavigate('initiatives')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Target className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Initiatives</span>
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
              {/* Avatar button — opens user menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-base shadow-sm active:scale-95 transition-transform"
                  aria-label="Open user menu"
                >
                  {displayName.charAt(0).toUpperCase()}
                </button>
                {showUserMenu && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    {/* Dropdown */}
                    <div className="absolute right-0 top-12 z-50 w-48 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                      <button
                        onClick={() => { setShowUserMenu(false); onNavigate('account'); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800 active:bg-slate-100 transition-colors text-left"
                      >
                        <User className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">My Account</span>
                      </button>
                      <button
                        onClick={() => { setShowUserMenu(false); onNavigate('settings'); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800 active:bg-slate-100 transition-colors text-left"
                      >
                        <Settings className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">Settings</span>
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => { setShowUserMenu(false); onNavigate('hub-management'); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800 active:bg-slate-100 transition-colors text-left"
                        >
                          <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">Hub Admin</span>
                        </button>
                      )}
                      {onLogout && (
                        <>
                          <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
                          <button
                            onClick={() => { setShowUserMenu(false); onLogout(); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 transition-colors text-left"
                          >
                            <LogOut className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">Leave Hub</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
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
            <FeaturedCarousel
              items={featuredItems}
              hubSlug={hubSlug}
              onPostClick={handleFeaturedPostClick}
            />
          </div>
          {/* Activity + sidebar two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left: Recent Activity */}
            <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Recent Activity</h2>
              <button
                onClick={refreshActivity}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Refresh activity"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 dark:text-slate-500 ${activityLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {activityLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <div className="flex">
                      <div className="w-1 bg-slate-200 dark:bg-zinc-700 animate-pulse shrink-0" />
                      <div className="flex-1 p-4 space-y-2">
                        <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/3" />
                        <div className="h-4 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-2/3" />
                        <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : activityItems.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-8 text-center">
                <Activity className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No activity yet — be the first to post!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityItems.map(item => (
                  <ActivityCard
                    key={item.id}
                    item={item}
                    onClick={() => {
                      const postTypes = ['discussion', 'announcement', 'project', 'request'];
                      if (postTypes.includes(item.type) && item.itemId) {
                        handleFeaturedPostClick(item.itemId);
                      } else if (item.type === 'file_shared' && item.itemId) {
                        sessionStorage.setItem('citinet-deeplink-file', item.itemId);
                        onNavigate('files');
                      } else if (item.type === 'pin_added' && item.itemId) {
                        sessionStorage.setItem('citinet-deeplink-pin', item.itemId);
                        onNavigate('atlas');
                      } else if (item.type === 'neighbor_joined') {
                        sessionStorage.setItem('citinet-deeplink-welcome', JSON.stringify({ username: item.actor }));
                        onNavigate('feed');
                      } else {
                        onNavigate(item.navigateTo);
                      }
                    }}
                  />
                ))}
              </div>
            )}
            </div>

            {/* Right: Events + Initiatives */}
            <div className="flex flex-col gap-8">
          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Upcoming Events</h2>
              <button
                onClick={() => onNavigate('atlas')}
                className="text-sm font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              >
                Atlas →
              </button>
            </div>

            <div className="space-y-3">
              {upcomingEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-800/50 transition-all group"
                >
                  <div className="flex gap-3 items-center">
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
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Active Initiatives */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 tracking-tight">Community Initiatives</h2>

            <div className="space-y-3">
              {activeInitiatives.map(initiative => (
                <button
                  key={initiative.id}
                  onClick={() => setSelectedInitiative(initiative)}
                  className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-800/50 transition-all group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center shrink-0">
                        <Lightbulb className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">{initiative.title}</h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 dark:text-slate-400">
                          <Users className="w-3 h-3 shrink-0" />
                          <span>{initiative.participants} participants</span>
                          <span>·</span>
                          <div className="flex-1 max-w-[80px] h-1 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: `${initiative.progress}%` }} />
                          </div>
                          <span>{initiative.progress}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${initiative.status === 'In Progress' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {initiative.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
            </div>
          </div>

        {/* Bottom padding so last content clears the tab bar */}
        <div className="md:hidden h-20" />
        </div>
      </div>

      {/* Mobile Bottom Tab Bar — horizontally scrollable */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-zinc-800">
        {/* Fade hint on right edge */}
        <div className="relative">
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/95 dark:from-zinc-900/95 to-transparent z-10" />
          <div
            className="flex items-stretch h-16 overflow-x-auto"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {[
              { icon: <MessageCircle className="w-5 h-5" />, label: 'Discuss',   screen: 'feed' },
              { icon: <Map className="w-5 h-5" />,            label: 'Atlas',     screen: 'atlas' },
              { icon: <Store className="w-5 h-5" />,          label: 'Exchange',  screen: 'marketplace' },
              { icon: <Users className="w-5 h-5" />,          label: 'Neighbors', screen: 'neighbors' },
              { icon: <FolderOpen className="w-5 h-5" />,     label: 'Files',     screen: 'files' },
              { icon: <Target className="w-5 h-5" />,          label: 'Initiatives', screen: 'initiatives' },
              { icon: <Wrench className="w-5 h-5" />,         label: 'Discover',  screen: 'toolkit' },
              { icon: <Radio className="w-5 h-5" />,          label: 'Network',   screen: 'network' },
              { icon: <MessageCircle className="w-5 h-5" />,  label: 'Messages',  screen: 'messages' },
            ].map(item => (
              <button
                key={item.screen}
                onClick={() => onNavigate(item.screen)}
                className="flex-shrink-0 w-20 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 active:scale-95 transition-all"
              >
                {item.icon}
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            ))}
            {/* Extra right padding so last tab isn't obscured by the fade */}
            <div className="flex-shrink-0 w-4" />
          </div>
        </div>
      </nav>

      {/* Featured post detail modal */}
      {featuredPost && (
        <PostDetailModal
          isOpen
          onClose={() => setFeaturedPost(null)}
          post={featuredPost}
          hubSlug={hubSlug}
          currentUserId={currentUser?.hubUserId}
          isAdmin={isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(hubSlug, name) ?? ''}
          onDeleted={() => setFeaturedPost(null)}
        />
      )}

      {/* ── Event Detail Modal ── */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedEvent(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header gradient */}
              <div className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-purple-700 px-6 pt-6 pb-8">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-3">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white leading-tight pr-8">{selectedEvent.title}</h2>
                <p className="text-sm text-white/70 mt-1">Organised by {selectedEvent.organizer}</p>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Meta chips */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-purple-500" />
                    {selectedEvent.date} · {selectedEvent.time}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-purple-500" />
                    {selectedEvent.location}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Users className="w-3.5 h-3.5 text-purple-500" />
                    {rsvpDone[selectedEvent.id] ? selectedEvent.attendees + 1 : selectedEvent.attendees} going
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{selectedEvent.description}</p>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setRsvpDone(prev => ({ ...prev, [selectedEvent.id]: !prev[selectedEvent.id] }))}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      rsvpDone[selectedEvent.id]
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-sm'
                    }`}
                  >
                    {rsvpDone[selectedEvent.id]
                      ? <><CheckCircle2 className="w-4 h-4" /> You're going</>
                      : <><UserPlus className="w-4 h-4" /> RSVP</>
                    }
                  </button>
                  <button
                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                    aria-label="Share event"
                    title="Share"
                  >
                    <Share2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Initiative Detail Modal ── */}
      <AnimatePresence>
        {selectedInitiative && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedInitiative(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header gradient */}
              <div className="relative bg-gradient-to-br from-purple-600 via-pink-600 to-rose-600 px-6 pt-6 pb-8">
                <button
                  onClick={() => setSelectedInitiative(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                    <Lightbulb className="w-6 h-6 text-white" />
                  </div>
                  <div className="pr-8">
                    <h2 className="text-xl font-bold text-white leading-tight">{selectedInitiative.title}</h2>
                    <span className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      selectedInitiative.status === 'In Progress'
                        ? 'bg-white/20 text-white'
                        : 'bg-white/15 text-white/80'
                    }`}>
                      {selectedInitiative.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Progress</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedInitiative.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedInitiative.progress}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                    />
                  </div>
                </div>

                {/* Goal */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Goal</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{selectedInitiative.goal}</p>
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">What's happening</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{selectedInitiative.description}</p>
                </div>

                {/* Participants */}
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Users className="w-4 h-4 text-purple-500" />
                  <span>
                    <span className="font-semibold text-slate-900 dark:text-white">{selectedInitiative.participants}</span> neighbors participating
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => {
                      sessionStorage.setItem('citinet-deeplink-initiative', String(selectedInitiative.id));
                      setSelectedInitiative(null);
                      onNavigate('initiatives');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-semibold shadow-sm transition-all"
                  >
                    <Target className="w-4 h-4" /> View Initiative
                  </button>
                  <button
                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                    aria-label="Share initiative"
                    title="Share"
                  >
                    <Share2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────

const ACTIVITY_CONFIG: Record<ActivityType, {
  Icon: React.ElementType;
  iconBg: string;
  border: string;
  label: string;
}> = {
  discussion:      { Icon: MessageCircle, iconBg: 'bg-blue-500',    border: 'border-l-blue-500',    label: 'Discussion' },
  announcement:    { Icon: Radio,         iconBg: 'bg-amber-500',   border: 'border-l-amber-500',   label: 'Announcement' },
  project:         { Icon: Lightbulb,     iconBg: 'bg-emerald-500', border: 'border-l-emerald-500', label: 'Project' },
  request:         { Icon: Users,         iconBg: 'bg-rose-500',    border: 'border-l-rose-500',    label: 'Request' },
  file_shared:     { Icon: FolderOpen,    iconBg: 'bg-violet-500',  border: 'border-l-violet-500',  label: 'File Shared' },
  neighbor_joined: { Icon: Users,         iconBg: 'bg-teal-500',    border: 'border-l-teal-500',    label: 'New Neighbor' },
  pin_added:       { Icon: MapPin,        iconBg: 'bg-orange-500',  border: 'border-l-orange-500',  label: 'Atlas Pin' },
};

function ActivityCard({ item, onClick }: { item: ActivityItem; onClick: () => void }) {
  const cfg = ACTIVITY_CONFIG[item.type];

  return (
    <button
      onClick={onClick}
      className="w-full bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-md transition-all text-left group"
    >
      <div className="flex">
        {/* Left accent border */}
        <div className={`w-[3px] shrink-0 ${cfg.border.replace('border-l-', 'bg-')}`} />

        <div className="flex-1 px-4 py-3 flex items-start gap-3 min-w-0">
          {/* Icon */}
          <div className={`w-8 h-8 rounded-lg ${cfg.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
            <cfg.Icon className="w-4 h-4 text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.actor}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{item.summary}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto shrink-0">{timeAgo(item.timestamp)}</span>
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
          </div>
        </div>

        {/* CTA (Say Welcome etc.) */}
        {item.cta && (
          <div className="flex items-center pr-3 shrink-0">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/40 transition-colors">
              {item.cta}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
};
