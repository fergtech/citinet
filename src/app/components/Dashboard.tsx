import {
  Users, MessageCircle, Radio, Store,
  Calendar, Lightbulb, Activity, MapPin, Clock, Wrench, LogOut, FolderOpen,
  RefreshCw, Loader2, Check, WifiOff, Link2, User, Shield, Map,
  X, ChevronRight, UserPlus, Share2, CheckCircle2, Target, UserCircle, Compass, HelpCircle, CircleAlert, Bug,
  LayoutGrid, Plus, Sparkles, Vote, ScrollText, Layers, NotebookPen,
} from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FeaturedCarousel } from './FeaturedCarousel';
import { PostDetailModal } from './PostDetailModal';
import { useHub, useHubStatus } from '../context/HubContext';
import { featuredService } from '../services/featuredService';
import { FeatureRequestModal } from './FeatureRequestModal';
import { hubService } from '../services/hubService';
import { marketplaceService } from '../services/marketplaceService';
import { useActivityFeed, timeAgo, type ActivityItem, type ActivityType } from '../hooks/useActivityFeed';
import { useNotificationCounts } from '../hooks/useNotificationCounts';
import { notificationsService, type NotificationFeature } from '../services/notificationsService';
import { registryService } from '../services/registryService';
import type { FeaturedItem } from '../types/featured';
import type { HubPost, HubVendor } from '../types/hub';

const APP_TILES: { Icon: React.ElementType; label: string; screen: string; gradient: string; notifyFeature?: NotificationFeature }[] = [
  { Icon: Layers,        label: 'Spaces',      screen: 'spaces',      gradient: 'bg-gradient-to-br from-purple-500 to-violet-600' },
  { Icon: MessageCircle, label: 'Discussions', screen: 'feed',        gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',     notifyFeature: 'feed' },
  { Icon: Compass,       label: 'Discover',    screen: 'discover',    gradient: 'bg-gradient-to-br from-cyan-500 to-sky-600' },
  { Icon: Map,           label: 'Atlas',       screen: 'atlas',       gradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600' },
  { Icon: Store,         label: 'Exchange',    screen: 'marketplace', gradient: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
  { Icon: Users,         label: 'Neighbors',   screen: 'neighbors',   gradient: 'bg-gradient-to-br from-violet-500 to-purple-600' },
  { Icon: FolderOpen,    label: 'Files',       screen: 'files',       gradient: 'bg-gradient-to-br from-amber-500 to-orange-600' },
  { Icon: Target,        label: 'Initiatives', screen: 'initiatives', gradient: 'bg-gradient-to-br from-rose-500 to-pink-600' },
  { Icon: Wrench,        label: 'Resources',   screen: 'toolkit',     gradient: 'bg-gradient-to-br from-orange-500 to-amber-600' },
  { Icon: Radio,         label: 'Network',     screen: 'network',     gradient: 'bg-gradient-to-br from-teal-500 to-cyan-600' },
  { Icon: MessageCircle, label: 'Messages',    screen: 'messages',    gradient: 'bg-gradient-to-br from-fuchsia-500 to-violet-600', notifyFeature: 'messages' },
  { Icon: Vote,          label: 'Polls',       screen: 'polls',       gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600' },
  { Icon: ScrollText,    label: 'Mod Log',     screen: 'mod-log',     gradient: 'bg-gradient-to-br from-slate-600 to-slate-700' },
  { Icon: NotebookPen,   label: 'Notes',       screen: 'notes',       gradient: 'bg-gradient-to-br from-amber-500 to-yellow-500' },
];

const MOBILE_DOCK_APPS = [
  { Icon: MessageCircle, label: 'Discuss', screen: 'feed' },
  { Icon: Map, label: 'Atlas', screen: 'atlas' },
  { Icon: Store, label: 'Exchange', screen: 'marketplace' },
  { Icon: MessageCircle, label: 'Messages', screen: 'messages' },
];

// Apps enabled on a fresh hub with no admin configuration yet.
// null enabledApps on the Hub object means "all apps" (backward compat).
export const DEFAULT_ENABLED_APPS: string[] = [
  'feed', 'messages', 'atlas', 'neighbors', 'notes', 'polls',
];

const MOBILE_LAUNCHPAD_COLUMNS = 5;
const MOBILE_LAUNCHPAD_ROWS = 2;
const MOBILE_LAUNCHPAD_PAGE_SIZE = MOBILE_LAUNCHPAD_COLUMNS * MOBILE_LAUNCHPAD_ROWS;

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
  const [myVendor, setMyVendor] = useState<HubVendor | null>(null);

  const hubSlug = currentHub?.slug ?? '';

  // Re-fetch whenever the hub slug changes OR the connection comes (back) online.
  // This ensures the dashboard repopulates after a restart / boot recovery.
  const isConnected = connectionStatus === 'connected';
  useEffect(() => {
    if (!hubSlug) return;
    featuredService.getFeatured(hubSlug).then(setFeaturedItems);
    marketplaceService.getMyVendor(hubSlug).then(setMyVendor).catch(() => {});
  }, [hubSlug, isConnected]);

  const { items: activityItems, loading: activityLoading, refresh: refreshActivity } = useActivityFeed(hubSlug);
  const { counts: notifCounts, clearBadge } = useNotificationCounts(hubSlug);

  function handleTileNavigate(screen: string, notifyFeature?: NotificationFeature) {
    if (notifyFeature && notifCounts[notifyFeature] > 0) {
      clearBadge(notifyFeature);
      notificationsService.markRead(hubSlug, notifyFeature).catch(() => {});
    }
    onNavigate(screen);
  }

  async function handleFeaturedPostClick(postId: string) {
    try {
      const post = await hubService.getPost(hubSlug, postId);
      setFeaturedPost(post);
    } catch {
      // ignore — fall through silently
    }
  }

  // Feature request modal
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Mobile start/menu
  const [showMobileStartMenu, setShowMobileStartMenu] = useState(false);
  // Desktop start menu
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [showSupportMenu, setShowSupportMenu] = useState(false);

  // Tunnel reconnect state
  const [showTunnelInput, setShowTunnelInput] = useState(false);
  const [tunnelInput, setTunnelInput] = useState('');
  const [tunnelUpdating, setTunnelUpdating] = useState(false);
  const [tunnelError, setTunnelError] = useState('');
  const [tunnelSuccess, setTunnelSuccess] = useState(false);

  const autoRegisterHub = (tunnelUrl: string) => {
    if (!currentHub) return;
    // Fire-and-forget — failure is silent, doesn't affect the user's flow
    registryService.registerHub({
      id:           currentHub.slug,
      name:         currentHub.name,
      slug:         currentHub.slug,
      location:     currentHub.location ?? '',
      description:  currentHub.description ?? '',
      tunnel_url:   tunnelUrl,
      member_count: currentHub.meta?.activeMembers ?? 0,
      online:       true,
    }).catch(() => {});
  };

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
      autoRegisterHub(tunnelInput.trim());
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
      autoRegisterHub(tunnelInput.trim());
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
  const resolvedCurrentUserAvatarUrl = currentHub?.slug && currentUser?.hubUserId
    ? hubService.getAvatarUrl(currentHub.slug, currentUser.hubUserId)
    : (currentUser?.avatarUrl ?? null);
  const vendorLogoUrl = myVendor?.logo_file_name
    ? marketplaceService.getVendorLogoUrl(hubSlug, myVendor.logo_file_name)
    : null;

  const nodeStatus = {
    activeMembers: currentHub?.meta?.activeMembers ?? 0,
    onlineNow: currentHub?.meta?.onlineNow ?? 0,
    signalStrength: currentHub?.connectionStatus === 'connected' ? 'Strong' : currentHub?.connectionStatus === 'connecting' ? 'Weak' : 'Offline'
  };

  const [rsvpDone, setRsvpDone] = useState<Record<number, boolean>>({});
  const [showNodeStatus, setShowNodeStatus] = useState(false);

  // ── Hub app: initiatives ────────────────────────────────
  interface AppInfo { name: string; faviconUrl?: string; logoUrl?: string }
  interface LiveInitiative { id: string | number; title: string; progress: number; status: string; imageUrl?: string | null; members?: { id: string }[] }
  const [liveInitiatives, setLiveInitiatives] = useState<LiveInitiative[] | null>(null);
  const [initiativesAppInfo, setInitiativesAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (!currentHub?.tunnelUrl) return;
    const base = currentHub.tunnelUrl;
    const token = currentUser?.authToken;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    // Fetch app info (no auth needed — public endpoint)
    fetch(`${base}/api/initiatives/app-info`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setInitiativesAppInfo(d))
      .catch(() => {});

    // Fetch live initiatives
    fetch(`${base}/api/initiatives`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setLiveInitiatives(d?.initiatives ? d.initiatives.slice(0, 3) : []);
      })
      .catch(() => { setLiveInitiatives([]); });
  }, [currentHub?.tunnelUrl, currentUser?.authToken]);

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

  // activeInitiatives: live data when available, empty otherwise (no mock fallback)
  const activeInitiatives: LiveInitiative[] = liveInitiatives ?? [];

  const [selectedEvent, setSelectedEvent] = useState<typeof upcomingEvents[number] | null>(null);
  const [selectedInitiative] = useState<null>(null);

  const projectInfoUrlRaw = (import.meta.env.VITE_PROJECT_INFO_URL || 'https://citinet.cloud/').trim();
  const projectInfoUrl = /^https?:\/\//i.test(projectInfoUrlRaw)
    ? projectInfoUrlRaw
    : `https://${projectInfoUrlRaw}`;
  const githubIssueBaseUrl = 'https://github.com/fergtech/citinet/issues/new';

  const getCurrentFeatureContext = () => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    const cleanPath = path.toLowerCase();
    const firstSegment = cleanPath.split('/').filter(Boolean)[0] ?? '';

    const labelMap: Record<string, string> = {
      '': 'Dashboard',
      feed: 'Discussions',
      discover: 'Discover',
      atlas: 'Atlas',
      marketplace: 'Exchange',
      neighbors: 'Neighbors',
      files: 'Files',
      initiatives: 'Initiatives',
      toolkit: 'Resources',
      network: 'Network',
      messages: 'Messages',
      account: 'Account',
      profile: 'Profile',
      settings: 'Settings',
      'hub-management': 'Hub Management',
      vendor: 'Vendor Profile',
    };

    const featureName = labelMap[firstSegment] ?? (firstSegment ? `${firstSegment.charAt(0).toUpperCase()}${firstSegment.slice(1)}` : 'Dashboard');
    return { featureName, path };
  };

  const buildSupportUrl = (kind: 'help' | 'bug' | 'feature') => {
    const { featureName, path } = getCurrentFeatureContext();
    const params = new URLSearchParams();
    const contextText = [
      `Feature/Screen: ${featureName}`,
      `Route: ${path}`,
      `Hub: ${nodeName}`,
    ].join('\n');

    if (kind === 'help') {
      params.set('template', 'help.yml');
      params.set('title', `[Help] ${featureName}: `);
      params.set('question-summary', `Need help with ${featureName}`);
      params.set('additional-info', contextText);
    }

    if (kind === 'bug') {
      params.set('template', 'bug_report.yml');
      params.set('title', `[Bug] ${featureName}: `);
      params.set('what-happened', `Issue encountered in ${featureName}.`);
      params.set('steps-to-reproduce', `1. Open ${featureName}\n2. ...\n3. Observe issue`);
      params.set('additional-info', contextText);
    }

    if (kind === 'feature') {
      params.set('template', 'feature_request.yml');
      params.set('title', `[Feature] ${featureName}: `);
      params.set('feature-summary', `Enhance ${featureName}`);
      params.set('use-case', `While using ${featureName}, it would help if ...`);
      params.set('additional-info', contextText);
    }

    return `${githubIssueBaseUrl}?${params.toString()}`;
  };

  const openProjectInfo = () => {
    window.open(projectInfoUrl, '_blank', 'noopener,noreferrer');
  };

  const openSupportLink = (kind: 'help' | 'bug' | 'feature') => {
    window.open(buildSupportUrl(kind), '_blank', 'noopener,noreferrer');
    setShowSupportMenu(false);
  };

  // enabledApps: null = all enabled (existing hubs), array = restrict to those IDs
  const enabledSet = currentHub?.enabledApps ?? null;
  const visibleTiles = enabledSet
    ? APP_TILES.filter(t => enabledSet.includes(t.screen))
    : APP_TILES;

  const mobileLauncherTiles: typeof APP_TILES = myVendor
    ? [...visibleTiles, { Icon: Store, label: 'My Store', screen: `vendor/${myVendor.id}`, gradient: 'bg-gradient-to-br from-blue-600 to-purple-600' }]
    : visibleTiles;

  const mobileLaunchpadItems: typeof APP_TILES = [
    ...mobileLauncherTiles,
    {
      Icon: Plus,
      label: 'Suggest',
      screen: 'suggest',
      gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600',
    },
  ];

  const mobileLaunchpadPages: typeof mobileLaunchpadItems[] = [];
  for (let i = 0; i < mobileLaunchpadItems.length; i += MOBILE_LAUNCHPAD_PAGE_SIZE) {
    mobileLaunchpadPages.push(mobileLaunchpadItems.slice(i, i + MOBILE_LAUNCHPAD_PAGE_SIZE));
  }

  const mobileLaunchpadRef = useRef<HTMLDivElement | null>(null);
  const [mobileLaunchpadPage, setMobileLaunchpadPage] = useState(0);

  useEffect(() => {
    setMobileLaunchpadPage(prev => Math.min(prev, Math.max(0, mobileLaunchpadPages.length - 1)));
  }, [mobileLaunchpadPages.length]);

  const handleMobileLaunchpadScroll = () => {
    const el = mobileLaunchpadRef.current;
    if (!el) return;

    const first = el.firstElementChild as HTMLElement | null;
    const second = el.children[1] as HTMLElement | null;
    const pageSpan = second ? (second.offsetLeft - first!.offsetLeft) : el.clientWidth;
    const nextPage = Math.round(el.scrollLeft / Math.max(pageSpan, 1));
    const clamped = Math.max(0, Math.min(mobileLaunchpadPages.length - 1, nextPage));
    if (clamped !== mobileLaunchpadPage) setMobileLaunchpadPage(clamped);
  };

  const scrollToMobileLaunchpadPage = (pageIndex: number) => {
    const el = mobileLaunchpadRef.current;
    if (!el) return;
    const page = el.children[pageIndex] as HTMLElement | undefined;
    if (!page) return;
    el.scrollTo({ left: page.offsetLeft, behavior: 'smooth' });
  };

  const sectionLinkClass = 'inline-flex items-center rounded-md px-2 py-1 font-semibold bg-slate-950/65 text-cyan-200 border border-cyan-300/35 backdrop-blur-sm shadow-sm hover:bg-slate-950/80 hover:text-cyan-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70';

  return (
    <div className="min-h-screen flex relative">

      {/* ═══ DESKTOP OS UI (hidden on mobile) ═══ */}

      {/* Desktop Top Menubar */}
      <div className="hidden md:flex fixed top-0 inset-x-0 h-9 z-30 bg-slate-950/80 dark:bg-black/80 backdrop-blur-xl border-b border-slate-800/70 dark:border-zinc-800/70 items-center px-4 gap-3 select-none">
        <div className="w-2 h-2 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-100">{nodeName}</span>
        <div className="flex-1" />
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 ${connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
        <span className="text-xs text-slate-300">{statusLabel}</span>
        {nodeStatus.onlineNow > 0 && (
          <>
            <span className="text-xs text-slate-300 dark:text-zinc-600">·</span>
            <span className="text-xs text-slate-300">{nodeStatus.onlineNow} online</span>
          </>
        )}
        <button
          onClick={() => { setShowTunnelInput(v => !v); setTunnelError(''); setTunnelSuccess(false); }}
          className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          title="Update tunnel URL"
          aria-label="Update tunnel URL"
        >
          <Link2 className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        </button>
      </div>

      {/* Desktop Tunnel Update Panel */}
      {showTunnelInput && (
        <div className="hidden md:block fixed top-10 right-4 z-40 w-72 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-slate-200 dark:border-zinc-800 p-4 space-y-2">
          {currentHub?.tunnelUrl && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono">{currentHub.tunnelUrl}</p>
          )}
          <div className="flex gap-1.5">
            <input
              type="url"
              value={tunnelInput}
              onChange={e => { setTunnelInput(e.target.value); setTunnelError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleTunnelReconnect()}
              placeholder="New tunnel URL..."
              className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:border-transparent focus:outline-none"
              disabled={tunnelUpdating}
            />
            <button
              onClick={handleTunnelReconnect}
              disabled={tunnelUpdating || !tunnelInput.trim()}
              className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
            >
              {tunnelUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : tunnelSuccess ? <Check className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
            </button>
          </div>
          {tunnelError && (
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-red-500 dark:text-red-400 flex-1">{tunnelError}</p>
              {tunnelInput.trim() && (
                <button onClick={handleForceUpdateUrl} className="text-[10px] text-purple-500 dark:text-purple-400 underline hover:no-underline shrink-0">Save anyway</button>
              )}
            </div>
          )}
          {tunnelSuccess && <p className="text-[10px] text-green-500 dark:text-green-400">Reconnected!</p>}
          {connectionStatus === 'unreachable' && !tunnelInput && (
            <p className="text-[10px] text-orange-500 dark:text-orange-400">Hub unreachable — enter the new tunnel URL to reconnect.</p>
          )}
        </div>
      )}

      {/* Desktop Start Menu Panel */}
      <AnimatePresence>
        {showStartMenu && (
          <>
            <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setShowStartMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="hidden md:block fixed bottom-16 left-4 z-50 w-64 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
            >
              <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-base shrink-0">
                    {resolvedCurrentUserAvatarUrl
                      ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : displayName.charAt(0).toUpperCase()
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</span>
                      {isAdmin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shrink-0">Admin</span>}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">{nodeName}</span>
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                {currentUser?.hubUserId && (
                  <button
                    onClick={() => { setShowStartMenu(false); onNavigate(`profile/${currentUser.hubUserId}`); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                  >
                    <UserCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">My Profile</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowStartMenu(false); onNavigate('account'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <User className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">My Account</span>
                </button>
                
                {isAdmin && (
                  <button
                    onClick={() => { setShowStartMenu(false); onNavigate('hub-management'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                  >
                    <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Hub Admin</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowStartMenu(false); openProjectInfo(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <CircleAlert className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">About Citinet</span>
                </button>
                <button
                  onClick={() => { setShowStartMenu(false); setShowSupportMenu(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Support</span>
                </button>
              </div>
              {onLogout && (
                <>
                  <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
                  <div className="p-2">
                    <button
                      onClick={() => { setShowStartMenu(false); onLogout(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                      <span className="text-sm text-red-600 dark:text-red-400">Leave Hub</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Bottom Dock */}
      <div className="hidden md:flex fixed bottom-0 inset-x-0 h-14 z-30 bg-slate-900/66 dark:bg-black/62 backdrop-blur-xl border-t border-slate-700/60 dark:border-zinc-800/60 items-center px-4 gap-1">
        <button
          onClick={() => setShowStartMenu(v => !v)}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white hover:from-blue-700 hover:to-purple-700 transition-all shadow-sm hover:shadow-md active:scale-95 shrink-0"
          title="Menu"
          aria-label="Open menu"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
        <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700 mx-2 shrink-0" />
        {[
          { Icon: MessageCircle, label: 'Discussions', screen: 'feed' },
          { Icon: Map,           label: 'Atlas',       screen: 'atlas' },
          { Icon: Store,         label: 'Exchange',    screen: 'marketplace' },
          { Icon: Users,         label: 'Neighbors',   screen: 'neighbors' },
          { Icon: Wrench,        label: 'Resources',   screen: 'toolkit' },
        ].filter(app => !enabledSet || enabledSet.includes(app.screen)).map(app => (
          <button
            key={app.screen}
            onClick={() => onNavigate(app.screen)}
            title={app.label}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0"
          >
            <app.Icon className="w-5 h-5" />
          </button>
        ))}
        {myVendor && (
          <>
            <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700 mx-1 shrink-0" />
            <button
              onClick={() => onNavigate(`vendor/${myVendor.id}`)}
              title={myVendor.name}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold active:scale-95 shrink-0 hover:from-blue-700 hover:to-purple-700 transition-all overflow-hidden"
            >
              {vendorLogoUrl
                ? <img src={vendorLogoUrl} alt={myVendor.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : myVendor.name.charAt(0).toUpperCase()
              }
            </button>
          </>
        )}
        <div className="flex-1" />
        {isAdmin && (
          <button
            onClick={() => onNavigate('hub-management')}
            title="Hub Admin"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0"
          >
            <Shield className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={openProjectInfo}
          title="About Citinet"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0"
        >
          <CircleAlert className="w-5 h-5" />
        </button>
        <button
          onClick={() => onNavigate('account')}
          title="My Account"
          className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm active:scale-95 ml-1 shrink-0 hover:ring-2 hover:ring-purple-400 transition-all"
        >
          {resolvedCurrentUserAvatarUrl
            ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : displayName.charAt(0).toUpperCase()
          }
        </button>
      </div>

      {/* Desktop Sidebar - Hidden; replaced by OS dock + launcher */}
      <aside className="hidden">
        {/* User Identity */}
        <div className="p-6 border-b border-slate-200/50 dark:border-zinc-800/50">
          <div className="flex items-center gap-3 mb-2">
            {resolvedCurrentUserAvatarUrl
              ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-12 h-12 rounded-xl object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-lg shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{displayName}</h2>
                {isAdmin && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">Admin</span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{nodeName}</p>
              {currentUser?.hubUserId && (
                <button
                  onClick={() => onNavigate(`profile/${currentUser.hubUserId}`)}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-0.5"
                >
                  View my profile
                </button>
              )}
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
              onClick={() => onNavigate('discover')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Compass className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Discover</span>
            </button>

            <button
              onClick={() => onNavigate('toolkit')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Wrench className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Resources</span>
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

            {/* My Store — only visible to users who have a vendor page */}
            {myVendor && (
              <>
                <div className="my-2 border-t border-slate-200 dark:border-zinc-800" />
                <button
                  onClick={() => onNavigate(`vendor/${myVendor.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors text-left group"
                >
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 overflow-hidden">
                    {vendorLogoUrl
                      ? <img src={vendorLogoUrl} alt={myVendor.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : myVendor.name.charAt(0).toUpperCase()
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-purple-700 dark:text-purple-400 truncate block">{myVendor.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-500 leading-none">My Store</span>
                  </div>
                </button>
              </>
            )}
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
      <div className="flex-1 pb-24 md:pb-16 md:pt-9 overflow-x-hidden relative z-10">
        {/* Mobile Header - System strip + start menu trigger */}
        <div className="md:hidden bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-zinc-800/60 sticky top-0 z-20">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowMobileStartMenu(true)}
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform"
                aria-label="Open menu"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Hub Desktop</p>
                <h1 className="text-base font-semibold text-slate-900 dark:text-white truncate">{nodeName}</h1>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 bg-slate-100/80 dark:bg-zinc-800/80">
                <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">{statusLabel}</span>
              </div>

              <button
                onClick={() => setShowMobileStartMenu(true)}
                className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm active:scale-95 transition-transform"
                aria-label="Open profile menu"
              >
                {resolvedCurrentUserAvatarUrl
                  ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : displayName.charAt(0).toUpperCase()
                }
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 px-3 py-2">
              <span className="text-xs text-slate-600 dark:text-slate-300">{nodeStatus.onlineNow} online · {nodeStatus.activeMembers} members</span>
              <button
                onClick={() => setShowSupportMenu(true)}
                className="text-[11px] font-semibold text-purple-600 dark:text-purple-400"
              >
                Support
              </button>
            </div>

            {connectionStatus === 'unreachable' && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 space-y-2">
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

        {/* Desktop App Launcher - OS-style icon grid */}
        <div className="hidden md:block border-b border-slate-800/60 dark:border-zinc-800/60 bg-slate-950/35 dark:bg-black/30 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-8 py-5">
            <div className="grid grid-cols-5 lg:grid-cols-10 gap-1 justify-items-center">
              {visibleTiles.map(app => {
                const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
                return (
                  <button
                    key={app.screen}
                    onClick={() => handleTileNavigate(app.screen, app.notifyFeature)}
                    className="w-full max-w-[92px] flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-purple-500/15 dark:hover:bg-purple-400/15 transition-all group active:scale-95"
                  >
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-2xl ${app.gradient} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all`}>
                        <app.Icon className="w-6 h-6 text-white" />
                      </div>
                      {badge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md ring-2 ring-slate-950/30">
                          {badge > 9 ? '9+' : badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-200 text-center leading-tight">{app.label}</span>
                  </button>
                );
              })}
              {myVendor && (
                <button
                  onClick={() => onNavigate(`vendor/${myVendor.id}`)}
                  className="w-full max-w-[92px] flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-purple-500/15 dark:hover:bg-purple-400/15 transition-all group active:scale-95"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all text-white font-bold text-lg overflow-hidden">
                    {vendorLogoUrl
                      ? <img src={vendorLogoUrl} alt={myVendor.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : myVendor.name.charAt(0).toUpperCase()
                    }
                  </div>
                  <span className="text-[11px] font-medium text-purple-300 text-center leading-tight truncate w-full">{myVendor.name}</span>
                </button>
              )}
              <button
                onClick={() => setShowRequestModal(true)}
                className="w-full max-w-[92px] flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-indigo-500/15 transition-all group active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <span className="text-[11px] font-medium text-indigo-300 text-center leading-tight">Suggest</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8 overflow-x-hidden">
          {/* Mobile launcher - app first, widgets second */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Apps</h2>
              <button
                onClick={() => setShowMobileStartMenu(true)}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400"
              >
                Open Menu
              </button>
            </div>
            <div
              ref={mobileLaunchpadRef}
              onScroll={handleMobileLaunchpadScroll}
              className="overflow-x-auto snap-x snap-mandatory no-scrollbar"
              style={{ scrollbarWidth: 'none' }}
            >
              <div className="flex gap-3">
                {mobileLaunchpadPages.map((page, pageIdx) => (
                  <div key={`launchpad-page-${pageIdx}`} className="snap-start shrink-0 w-full grid grid-cols-5 gap-2 justify-items-center content-start">
                    {page.map(app => {
                      const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
                      const isSuggest = app.screen === 'suggest';
                      return (
                        <button
                          key={`${pageIdx}-${app.screen}`}
                          onClick={() => isSuggest ? setShowRequestModal(true) : handleTileNavigate(app.screen, app.notifyFeature)}
                          className={`w-full max-w-[72px] flex flex-col items-center gap-1.5 rounded-2xl p-2.5 border shadow-sm active:scale-95 transition-transform ${
                            isSuggest
                              ? 'bg-indigo-950/60 border-indigo-500/30'
                              : 'bg-slate-900/75 dark:bg-black/60 border-slate-700'
                          }`}
                        >
                          <div className="relative">
                            <div className={`w-10 h-10 rounded-xl ${app.gradient} flex items-center justify-center shadow-sm overflow-hidden text-white font-bold text-sm`}>
                              {(app.screen.startsWith('vendor/') && vendorLogoUrl)
                                ? <img src={vendorLogoUrl} alt={myVendor?.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                : <app.Icon className="w-5 h-5 text-white" />
                              }
                            </div>
                            {badge > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 shadow-md ring-2 ring-slate-900/50">
                                {badge > 9 ? '9+' : badge}
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] font-medium text-center leading-tight ${isSuggest ? 'text-indigo-300' : 'text-slate-200'}`}>
                            {app.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {mobileLaunchpadPages.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-1" aria-label="Launchpad page indicator">
                {mobileLaunchpadPages.map((_, idx) => {
                  const active = idx === mobileLaunchpadPage;
                  return (
                    <button
                      key={`launchpad-dot-${idx}`}
                      type="button"
                      onClick={() => scrollToMobileLaunchpadPage(idx)}
                      aria-label={`Go to launchpad page ${idx + 1}`}
                      className={`h-1.5 w-1.5 rounded-full transition-all ${
                        active
                          ? 'bg-purple-400 shadow-[0_0_8px_rgba(196,181,253,0.95)] scale-110'
                          : 'bg-slate-500/70 dark:bg-zinc-500/70 hover:bg-slate-400 dark:hover:bg-zinc-400'
                      }`}
                    />
                  );
                })}
              </div>
            )}
            {mobileLaunchpadPages.length > 1 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Swipe left for more apps</p>
            )}
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
                  <div key={i} className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/3" />
                      <div className="h-4 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-2/3" />
                      <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityItems.length === 0 ? (
              <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-zinc-800 p-8 text-center">
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
                      } else if (item.type === 'space_created') {
                        onNavigate('spaces');
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

            {/* Right: Initiatives + Events */}
            <div className="flex flex-col gap-6">
          {/* Community Initiatives — compact list */}
          {(liveInitiatives === null || activeInitiatives.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Initiatives</h2>
                  {initiativesAppInfo && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                      {initiativesAppInfo.faviconUrl
                        ? <img src={initiativesAppInfo.faviconUrl} className="w-3.5 h-3.5 rounded-sm" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : <Lightbulb className="w-3 h-3 text-purple-400" />
                      }
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-none">{initiativesAppInfo.name}</span>
                    </div>
                  )}
                </div>
                {activeInitiatives.length > 0 && (
                  <button onClick={() => onNavigate('initiatives')} className={`${sectionLinkClass} text-xs`}>
                    See all →
                  </button>
                )}
              </div>

              {liveInitiatives === null ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-zinc-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading…</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeInitiatives.map(initiative => {
                    const memberCount = initiative.members?.length ?? 0;
                    const iLabel = initiative.status === 'active' ? 'In Progress' : initiative.status === 'completed' ? 'Completed' : 'Planning';
                    const iStyle = initiative.status === 'active'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : initiative.status === 'completed'
                      ? 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
                    const iGradient = initiative.status === 'active'
                      ? 'from-emerald-500/25 to-teal-500/20 dark:from-emerald-900/50 dark:to-teal-900/40'
                      : initiative.status === 'completed'
                      ? 'from-slate-300/60 to-slate-400/40 dark:from-zinc-700 dark:to-zinc-800'
                      : 'from-amber-400/25 to-orange-400/20 dark:from-amber-900/50 dark:to-orange-900/40';
                    return (
                      <button
                        key={initiative.id}
                        onClick={() => onNavigate(`initiatives/${initiative.id}`)}
                        className="w-full text-left bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl p-3.5 border border-slate-200 dark:border-zinc-800 hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800/50 transition-all group flex gap-3 items-start"
                      >
                        <div className={`w-12 h-12 rounded-lg shrink-0 overflow-hidden flex items-center justify-center ${!initiative.imageUrl ? `bg-gradient-to-br ${iGradient}` : ''}`}>
                          {initiative.imageUrl
                            ? <img src={initiative.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <Lightbulb className="w-5 h-5 text-white/60" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <h3 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1 leading-tight flex-1">{initiative.title}</h3>
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${iStyle}`}>{iLabel}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Users className="w-3 h-3 text-slate-400" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                            <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">{initiative.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: `${initiative.progress}%` }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Upcoming Events</h2>
              <button
                onClick={() => onNavigate('atlas')}
                className={`${sectionLinkClass} text-sm`}
              >
                Atlas →
              </button>
            </div>

            <div className="space-y-3">
              {upcomingEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="w-full text-left bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-800/50 transition-all group"
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

          {/* Node Status */}
          <div className="relative overflow-hidden rounded-2xl p-4 border border-slate-300/50 dark:border-zinc-700/70 bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className="w-4 h-4 text-slate-200 shrink-0" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-100 truncate">Node Status</h2>
              </div>
              <button
                onClick={() => setShowNodeStatus(v => !v)}
                className="text-xs font-semibold text-cyan-200 hover:text-cyan-100 transition-colors"
              >
                {showNodeStatus ? 'Hide' : 'Show'}
              </button>
            </div>

            {showNodeStatus && (
              <>
                <div className="mt-3 h-px bg-slate-600/70" />
                <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="bg-slate-800/70 rounded-lg p-2 sm:p-4 border border-slate-600/60">
                    <div className="text-2xl sm:text-3xl font-semibold mb-1">{nodeStatus.activeMembers}</div>
                    <div className="text-xs text-slate-200">Active Members</div>
                  </div>
                  <div className="bg-slate-800/70 rounded-lg p-2 sm:p-4 border border-slate-600/60">
                    <div className="text-2xl sm:text-3xl font-semibold mb-1">{nodeStatus.onlineNow}</div>
                    <div className="text-xs text-slate-200">Online Now</div>
                  </div>
                  <div className="bg-slate-800/70 rounded-lg p-2 sm:p-4 border border-slate-600/60">
                    <div className="text-base font-semibold mb-1">{nodeStatus.signalStrength}</div>
                    <div className="text-xs text-slate-200">Signal</div>
                  </div>
                </div>
              </>
            )}
          </div>
            </div>
          </div>

        {/* Bottom padding so last content clears the tab bar */}
        <div className="md:hidden h-20" />
        </div>
      </div>

      {/* Mobile Bottom Dock */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900/68 dark:bg-black/64 backdrop-blur-xl border-t border-slate-700/60 dark:border-zinc-800/60">
        <div className="grid grid-cols-5 h-16 px-1">
          <button
            onClick={() => setShowMobileStartMenu(true)}
            className="flex flex-col items-center justify-center gap-1 text-purple-600 dark:text-purple-400 active:scale-95 transition-transform"
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[10px] font-semibold leading-none">Start</span>
          </button>

          {MOBILE_DOCK_APPS.map(app => {
            const notifyFeature = APP_TILES.find(t => t.screen === app.screen)?.notifyFeature;
            const badge = notifyFeature ? notifCounts[notifyFeature] : 0;
            return (
              <button
                key={app.screen}
                onClick={() => handleTileNavigate(app.screen, notifyFeature)}
                className="flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-purple-300 active:scale-95 transition-transform"
              >
                <div className="relative">
                  <app.Icon className="w-5 h-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-slate-900/50">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{app.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Start Menu Sheet */}
      <AnimatePresence>
        {showMobileStartMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm md:hidden"
              onClick={() => setShowMobileStartMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={{ type: 'spring', damping: 30, stiffness: 360 }}
              className="fixed inset-x-0 bottom-0 z-50 md:hidden rounded-t-3xl border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold shrink-0">
                      {resolvedCurrentUserAvatarUrl
                        ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : displayName.charAt(0).toUpperCase()
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{nodeName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMobileStartMenu(false)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center"
                    aria-label="Close menu"
                  >
                    <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="p-3 space-y-1">
                {currentUser?.hubUserId && (
                  <button
                    onClick={() => { setShowMobileStartMenu(false); onNavigate(`profile/${currentUser.hubUserId}`); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <UserCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-slate-800 dark:text-slate-200">My Profile</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileStartMenu(false); onNavigate('account'); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">My Account</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { setShowMobileStartMenu(false); onNavigate('hub-management'); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-slate-800 dark:text-slate-200">Hub Admin</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileStartMenu(false); openProjectInfo(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <CircleAlert className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">About Citinet</span>
                </button>
                <button
                  onClick={() => { setShowMobileStartMenu(false); setShowSupportMenu(true); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Support</span>
                </button>
                <button
                  onClick={() => { setShowMobileStartMenu(false); onNavigate('discover'); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <Compass className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Find Apps & People</span>
                </button>
                {onLogout && (
                  <button
                    onClick={() => { setShowMobileStartMenu(false); onLogout(); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
                  >
                    <LogOut className="w-4 h-4 text-red-500 dark:text-red-400" />
                    <span className="text-sm text-red-600 dark:text-red-400">Leave Hub</span>
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Feature request modal */}
      {showRequestModal && (
        <FeatureRequestModal
          hubSlug={hubSlug}
          onClose={() => setShowRequestModal(false)}
        />
      )}

      {/* Featured post detail modal */}
      {featuredPost && (
        <PostDetailModal
          isOpen
          onClose={() => setFeaturedPost(null)}
          post={featuredPost}
          hubSlug={hubSlug}
          currentUserId={currentUser?.hubUserId}
          currentUserAvatarUrl={resolvedCurrentUserAvatarUrl ?? undefined}
          isAdmin={isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(hubSlug, name) ?? ''}
          onDeleted={() => setFeaturedPost(null)}
        />
      )}

      {/* Support options modal */}
      <AnimatePresence>
        {showSupportMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
              onClick={() => setShowSupportMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Support</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Choose a GitHub form to open in a new tab</p>
                </div>
                <button
                  onClick={() => setShowSupportMenu(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0"
                  aria-label="Close support options"
                >
                  <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="p-2">
                <button
                  onClick={() => openSupportLink('help')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Get Help</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Troubleshooting or support questions</p>
                  </div>
                </button>

                <button
                  onClick={() => openSupportLink('bug')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <Bug className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Report a Bug</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Something is broken or not working right</p>
                  </div>
                </button>

                <button
                  onClick={() => openSupportLink('feature')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Request a Feature</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Suggest a new feature or enhancement</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
        {selectedInitiative && null /* initiative cards now deep-link directly */}
      </AnimatePresence>
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────

const ACTIVITY_CONFIG: Record<ActivityType, {
  Icon: React.ElementType;
  iconBg: string;
  label: string;
  barColor: string;
  verbColor: string;
}> = {
  discussion:      { Icon: MessageCircle, iconBg: 'bg-blue-500',    label: 'Discussion',   barColor: 'bg-blue-500',   verbColor: 'text-blue-600 dark:text-blue-400' },
  announcement:    { Icon: Radio,         iconBg: 'bg-amber-500',   label: 'Announcement', barColor: 'bg-amber-500',  verbColor: 'text-amber-600 dark:text-amber-400' },
  project:         { Icon: Lightbulb,     iconBg: 'bg-emerald-500', label: 'Project',      barColor: 'bg-emerald-500',verbColor: 'text-emerald-600 dark:text-emerald-400' },
  request:         { Icon: Users,         iconBg: 'bg-rose-500',    label: 'Request',      barColor: 'bg-rose-500',   verbColor: 'text-rose-600 dark:text-rose-400' },
  file_shared:     { Icon: FolderOpen,    iconBg: 'bg-amber-500',   label: 'File Shared',  barColor: 'bg-amber-500',  verbColor: 'text-amber-600 dark:text-amber-400' },
  neighbor_joined: { Icon: Users,         iconBg: 'bg-violet-500',  label: 'New Neighbor', barColor: 'bg-violet-500', verbColor: 'text-violet-600 dark:text-violet-400' },
  pin_added:       { Icon: MapPin,        iconBg: 'bg-indigo-500',  label: 'Atlas Pin',    barColor: 'bg-indigo-500', verbColor: 'text-indigo-600 dark:text-indigo-400' },
  space_created:   { Icon: Layers,        iconBg: 'bg-purple-500',  label: 'New Space',    barColor: 'bg-purple-500', verbColor: 'text-purple-600 dark:text-purple-400' },
};

const ACTIVITY_LOCATION: Record<string, string> = {
  feed:        'in Discussions',
  files:       'in Files',
  atlas:       'in Atlas',
  neighbors:   'in Neighbors',
  marketplace: 'in Exchange',
};

function ActivityCard({ item, onClick }: { item: ActivityItem; onClick: () => void }) {
  const cfg = ACTIVITY_CONFIG[item.type];
  const initial = item.actor.charAt(0).toUpperCase();
  const location = ACTIVITY_LOCATION[item.navigateTo] ?? '';

  return (
    <button
      onClick={onClick}
      className="w-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all text-left group flex"
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 self-stretch ${cfg.barColor} rounded-l-xl`} />

      <div className="flex items-start gap-3 px-4 py-3 flex-1 min-w-0">
        {/* Avatar */}
        {item.actorAvatarUrl ? (
          <img
            src={item.actorAvatarUrl}
            alt={item.actor}
            className="w-10 h-10 rounded-full object-cover shrink-0"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initial}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: name + verb */}
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span className="text-sm text-slate-800 dark:text-slate-200">{item.actor}</span>
            <span className={`text-sm font-semibold ${cfg.verbColor}`}>{item.summary}</span>
          </div>
          {/* Row 2: location · timestamp */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {location && <span className="text-xs text-slate-500 dark:text-slate-400">{location}</span>}
            {location && <span className="text-xs text-slate-400 dark:text-slate-500">·</span>}
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{timeAgo(item.timestamp)}</span>
          </div>
          {/* Row 3: title as caption */}
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 line-clamp-2 leading-snug">{item.title}</p>
          {/* CTA */}
          {item.cta && (
            <div className="mt-1.5">
              <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/40 transition-colors">
                {item.cta}
              </span>
            </div>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors shrink-0 mt-1" />
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
