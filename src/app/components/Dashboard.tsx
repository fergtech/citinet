import {
  Users, MessageCircle, Radio, Store,
  Calendar, Lightbulb, Activity, MapPin, Clock, LogOut, FolderOpen,
  RefreshCw, Loader2, Check, WifiOff, Link2, User, Shield, Map,
  X, ChevronRight, Target, UserCircle, Compass, HelpCircle, CircleAlert, Bug, Search,
  Grid3x3, Plus, Sparkles, Vote, ScrollText, Layers, NotebookPen, Package, Bot,
  PanelLeft, PanelBottom, Hexagon, Pencil, MessageSquare,
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
import { aiService } from '../services/aiService';
import type { FeaturedItem } from '../types/featured';
import type { HubPost, HubVendor } from '../types/hub';

const APP_TILES: { Icon: React.ElementType; label: string; screen: string; gradient: string; notifyFeature?: NotificationFeature }[] = [
  { Icon: Layers,        label: 'Spaces',      screen: 'spaces',      gradient: 'bg-gradient-to-br from-purple-500 to-violet-600' },
  { Icon: MessageCircle, label: 'Feed',        screen: 'feed',        gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',     notifyFeature: 'feed' },
  { Icon: Compass,       label: 'Discover',    screen: 'discover',    gradient: 'bg-gradient-to-br from-cyan-500 to-sky-600' },
  { Icon: Map,           label: 'Atlas',       screen: 'atlas',       gradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600' },
  { Icon: Store,         label: 'Exchange',    screen: 'marketplace', gradient: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
  { Icon: Users,         label: 'Neighbors',   screen: 'neighbors',   gradient: 'bg-gradient-to-br from-violet-500 to-purple-600' },
  { Icon: FolderOpen,    label: 'Files',       screen: 'files',       gradient: 'bg-gradient-to-br from-amber-500 to-orange-600' },
  { Icon: Target,        label: 'Initiatives', screen: 'initiatives', gradient: 'bg-gradient-to-br from-rose-500 to-pink-600' },
  { Icon: Package,       label: 'Resources',   screen: 'toolkit',     gradient: 'bg-gradient-to-br from-orange-500 to-amber-600' },
  { Icon: Radio,         label: 'Network',     screen: 'network',     gradient: 'bg-gradient-to-br from-teal-500 to-cyan-600' },
  { Icon: MessageCircle, label: 'Messages',    screen: 'messages',    gradient: 'bg-gradient-to-br from-fuchsia-500 to-violet-600', notifyFeature: 'messages' },
  { Icon: Vote,          label: 'Polls',       screen: 'polls',       gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600' },
  { Icon: ScrollText,    label: 'Mod Log',     screen: 'mod-log',     gradient: 'bg-gradient-to-br from-slate-600 to-slate-700' },
  { Icon: NotebookPen,   label: 'Notes',       screen: 'notes',       gradient: 'bg-gradient-to-br from-amber-500 to-yellow-500' },
];

// Priority-ordered screen IDs for the mobile bottom dock.
// Derived from visibleTiles so icons, labels, badges, and feature-gating
// all stay in sync with the launchpad automatically.
const DOCK_PRIORITY_SCREENS = ['feed', 'atlas', 'messages'];

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

  const [aiEnabled, setAiEnabled] = useState(false);

  // Re-fetch whenever the hub slug changes OR the connection comes (back) online.
  // This ensures the dashboard repopulates after a restart / boot recovery.
  const isConnected = connectionStatus === 'connected';
  useEffect(() => {
    if (!hubSlug) return;
    featuredService.getFeatured(hubSlug).then(setFeaturedItems);
    marketplaceService.getMyVendor(hubSlug).then(setMyVendor).catch(() => {});
    aiService.getStatus(hubSlug).then(s => setAiEnabled(s.enabled)).catch(() => {});
    setActivityExpanded(false);
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

  // Mobile account menu (mirrors desktop's Account Menu Panel)
  const [showMobileAccountMenu, setShowMobileAccountMenu] = useState(false);
  // Desktop account menu
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showSupportMenu, setShowSupportMenu] = useState(false);
  const [showHubInfoModal, setShowHubInfoModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // Mobile "Apps" overlay — quick access to everything not in the bottom dock (mirrors desktop's "More" waffle)
  const [showMobileAppsMenu, setShowMobileAppsMenu] = useState(false);

  // Dashboard search — submits to Discover with the query pre-filled
  const [searchQuery, setSearchQuery] = useState('');
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    sessionStorage.setItem('citinet-deeplink-search', q);
    setSearchQuery('');
    onNavigate('discover');
  }

  // Desktop nav layout: bottom dock (default) or left sidebar
  const [desktopNavLayout, setDesktopNavLayout] = useState<'dock' | 'sidebar'>(() => {
    if (typeof window === 'undefined') return 'dock';
    return localStorage.getItem('citinet-desktop-nav-layout') === 'sidebar' ? 'sidebar' : 'dock';
  });
  const toggleDesktopNavLayout = () => {
    setDesktopNavLayout(prev => {
      const next = prev === 'dock' ? 'sidebar' : 'dock';
      localStorage.setItem('citinet-desktop-nav-layout', next);
      return next;
    });
  };

  // Tunnel reconnect state
  const [showTunnelInput, setShowTunnelInput] = useState(false);
  const [tunnelInput, setTunnelInput] = useState('');
  const [tunnelUpdating, setTunnelUpdating] = useState(false);
  const [tunnelError, setTunnelError] = useState('');
  const [tunnelSuccess, setTunnelSuccess] = useState(false);

  // Registry-based reconnect
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [registryHubs, setRegistryHubs] = useState<import('../services/registryService').RegistryHub[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);

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

  // Load registry whenever the panel opens or hub goes unreachable
  useEffect(() => {
    if (!showTunnelInput && connectionStatus !== 'unreachable') return;
    if (registryHubs.length > 0) return;
    setRegistryLoading(true);
    registryService.getHubs()
      .then(hubs => setRegistryHubs(hubs))
      .catch(() => {})
      .finally(() => setRegistryLoading(false));
  }, [showTunnelInput, connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRegistryHubs = registrySearchQuery.trim()
    ? registryHubs.filter(h =>
        h.name.toLowerCase().includes(registrySearchQuery.toLowerCase()) ||
        h.slug.toLowerCase().includes(registrySearchQuery.toLowerCase())
      )
    : registryHubs;

  const handleRegistryReconnect = async (tunnelUrl: string) => {
    setTunnelUpdating(true);
    setTunnelError('');
    // probe=false (default) — actually verify the hub is reachable before claiming success
    const result = await updateTunnelUrl(tunnelUrl);
    setTunnelUpdating(false);
    if (result.ok) {
      setTunnelSuccess(true);
      setRegistrySearchQuery('');
      setShowTunnelInput(false);
      setTimeout(() => setTunnelSuccess(false), 2000);
    } else {
      setTunnelError('Hub not reachable at that address. It may be offline.');
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

  // activeInitiatives: live data when available, empty otherwise (no mock fallback)
  const activeInitiatives: LiveInitiative[] = liveInitiatives ?? [];

  // ── Live events ─────────────────────────────────────────
  const [upcomingEvents, setUpcomingEvents] = useState<HubPost[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<HubPost | null>(null);
  const [selectedInitiative] = useState<null>(null);

  useEffect(() => {
    if (!hubSlug || !isConnected) return;
    setEventsLoading(true);
    hubService.getUpcomingEvents(hubSlug, 3)
      .then(setUpcomingEvents)
      .finally(() => setEventsLoading(false));
  }, [hubSlug, isConnected]);

  const projectInfoUrlRaw = (import.meta.env.VITE_PROJECT_INFO_URL || 'https://info.citinet.cloud').trim();
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
      feed: 'Feed',
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
  const AI_TILE = { Icon: Bot, label: 'Assistant', screen: 'assistant', gradient: 'bg-gradient-to-br from-violet-500 to-purple-600' };
  const baseTiles = enabledSet ? APP_TILES.filter(t => enabledSet.includes(t.screen)) : APP_TILES;
  const visibleTiles = aiEnabled ? [...baseTiles, AI_TILE] : baseTiles;

  // Bottom dock — priority screens resolved from visibleTiles so icons/labels/badges/gating stay in sync
  const dockItems = DOCK_PRIORITY_SCREENS
    .map(screen => visibleTiles.find(t => t.screen === screen))
    .filter((t): t is typeof APP_TILES[number] => !!t);

  // Desktop dock/sidebar — primary navigation icons, shared between both layouts
  const desktopNavItems = [
    { Icon: MessageCircle, label: 'Feed',      screen: 'feed' },
    { Icon: MessageSquare, label: 'Messages',  screen: 'messages', notifyFeature: 'messages' as const },
    { Icon: Map,           label: 'Atlas',     screen: 'atlas' },
    { Icon: Store,         label: 'Exchange',  screen: 'marketplace' },
    { Icon: Users,         label: 'Neighbors', screen: 'neighbors' },
    { Icon: Package,       label: 'Resources', screen: 'toolkit' },
  ].filter(app => !enabledSet || enabledSet.includes(app.screen));

  const mobileLauncherTiles: typeof APP_TILES = myVendor
    ? [...visibleTiles, { Icon: Store, label: 'My Store', screen: `vendor/${myVendor.id}`, gradient: 'bg-gradient-to-br from-blue-600 to-purple-600' }]
    : visibleTiles;

  // Excludes DOCK_PRIORITY_SCREENS — those already live in the fixed bottom
  // dock, so showing them again here would duplicate the nav (mirrors how
  // desktop's "More" overlay excludes its own pinned sidebar/dock items).
  const mobileLaunchpadItems: typeof APP_TILES = [
    ...mobileLauncherTiles,
    {
      Icon: Plus,
      label: 'Suggest',
      screen: 'suggest',
      gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600',
    },
  ].filter(app => !DOCK_PRIORITY_SCREENS.includes(app.screen));

  const mobileLaunchpadPages: typeof mobileLaunchpadItems[] = [];
  for (let i = 0; i < mobileLaunchpadItems.length; i += MOBILE_LAUNCHPAD_PAGE_SIZE) {
    mobileLaunchpadPages.push(mobileLaunchpadItems.slice(i, i + MOBILE_LAUNCHPAD_PAGE_SIZE));
  }

  const mobileLaunchpadRef = useRef<HTMLDivElement | null>(null);
  const [mobileLaunchpadPage, setMobileLaunchpadPage] = useState(0);
  const [activityExpanded, setActivityExpanded] = useState(false);

  const desktopAppItems: typeof APP_TILES = myVendor
    ? [...visibleTiles, { Icon: Store, label: myVendor.name, screen: `vendor/${myVendor.id}`, gradient: 'bg-gradient-to-br from-blue-600 to-purple-600' }]
    : visibleTiles;

  const desktopAppItemsWithSuggest: typeof APP_TILES = [
    ...desktopAppItems,
    {
      Icon: Sparkles,
      label: 'Suggest',
      screen: 'suggest',
      gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600',
    },
  ];

  // "More" overlay — everything not already pinned in the dock/sidebar (or shown as the vendor tile)
  const pinnedScreens = new Set(desktopNavItems.map(item => item.screen));
  const moreNavItems = desktopAppItemsWithSuggest.filter(app => !pinnedScreens.has(app.screen) && !app.screen.startsWith('vendor/'));

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


  const sectionLinkClass = 'inline-flex items-center rounded-md px-2 py-1 font-semibold bg-slate-950/65 text-slate-400 border border-slate-600/30 backdrop-blur-sm shadow-sm hover:bg-slate-950/80 hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40';

  return (
    <div className="min-h-screen flex relative">

      {/* ═══ DESKTOP OS UI (hidden on mobile) ═══ */}

      {/* Desktop Top Menubar */}
      <div className="hidden md:flex fixed top-0 inset-x-0 h-9 z-30 bg-slate-950/80 dark:bg-black/80 backdrop-blur-xl border-b border-slate-800/70 dark:border-zinc-800/70 items-center px-4 gap-3 select-none">
        <button
          onClick={() => setShowHubInfoModal(true)}
          className="flex items-center gap-1.5 -mx-1.5 px-1.5 h-6 rounded-md hover:bg-white/10 transition-colors shrink-0"
          title="About this hub"
        >
          <Hexagon className="w-4 h-4 text-purple-400 shrink-0" fill="currentColor" strokeWidth={0} />
          <span className="text-sm font-semibold text-slate-100">{nodeName}</span>
        </button>
        <form onSubmit={handleSearchSubmit} className="flex-1 flex justify-center min-w-0 px-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search posts, people, files…"
              className="w-full h-6 pl-7 pr-2 rounded-md bg-white/5 border border-white/10 text-xs text-slate-200 placeholder:text-slate-500 hover:bg-white/10 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-purple-400/40 transition-colors"
            />
          </div>
        </form>
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

      {/* Desktop Reconnect Panel */}
      {showTunnelInput && (
        <div className="hidden md:block fixed top-10 right-4 z-40 w-72 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Find your hub</p>
            {registryLoading && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
            {tunnelSuccess && <span className="text-[10px] text-green-500 font-medium">Reconnected!</span>}
          </div>

          {/* Name search */}
          <div className="space-y-1.5">
            <input
              type="text"
              value={registrySearchQuery}
              onChange={e => setRegistrySearchQuery(e.target.value)}
              placeholder="Search hub by name…"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:outline-none"
            />
            {registrySearchQuery.trim() && (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {filteredRegistryHubs.length === 0 ? (
                  <p className="text-[10px] text-slate-400 px-1">No hubs found.</p>
                ) : filteredRegistryHubs.map(hub => (
                  <button
                    key={hub.id}
                    onClick={() => handleRegistryReconnect(hub.tunnel_url)}
                    disabled={tunnelUpdating}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{hub.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{hub.location}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual URL fallback */}
          <div>
            <button onClick={() => setShowManualUrl(v => !v)} className="text-[10px] text-slate-400 underline hover:no-underline">
              {showManualUrl ? 'Hide' : 'Enter URL manually'}
            </button>
            {showManualUrl && (
              <div className="mt-1.5 space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={tunnelInput}
                    onChange={e => { setTunnelInput(e.target.value); setTunnelError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleTunnelReconnect()}
                    placeholder="https://…"
                    className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                    disabled={tunnelUpdating}
                  />
                  <button
                    onClick={handleTunnelReconnect}
                    disabled={tunnelUpdating || !tunnelInput.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center shrink-0"
                  >
                    {tunnelUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </div>
                {tunnelError && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-red-500 dark:text-red-400 flex-1">{tunnelError}</p>
                    {tunnelInput.trim() && (
                      <button onClick={handleForceUpdateUrl} className="text-[10px] text-purple-500 underline hover:no-underline shrink-0">Save anyway</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Account Menu Panel */}
      <AnimatePresence>
        {showAccountMenu && (
          <>
            <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setShowAccountMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className={`hidden md:block fixed z-50 w-64 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden ${desktopNavLayout === 'sidebar' ? 'left-[4.5rem] bottom-12' : 'bottom-16 right-4'}`}
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
                    onClick={() => { setShowAccountMenu(false); onNavigate(`profile/${currentUser.hubUserId}`); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                  >
                    <UserCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">View Profile</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowAccountMenu(false); onNavigate('account'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <User className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Account Settings</span>
                </button>
                <button
                  onClick={() => { setShowAccountMenu(false); setShowSupportMenu(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Help & Support</span>
                </button>
              </div>
              {onLogout && (
                <>
                  <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
                  <div className="p-2">
                    <button
                      onClick={() => { setShowAccountMenu(false); onLogout(); }}
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
      {desktopNavLayout === 'dock' ? (
      <div className="hidden md:flex fixed bottom-0 inset-x-0 h-14 z-30 bg-slate-900/66 dark:bg-black/62 backdrop-blur-xl border-t border-slate-700/60 dark:border-zinc-800/60 items-center px-4 gap-1">
        {desktopNavItems.map(app => {
          const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
          return (
            <button
              key={app.screen}
              onClick={() => handleTileNavigate(app.screen, app.notifyFeature)}
              title={app.label}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0"
            >
              <app.Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-slate-900/50">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
        <div className="w-px h-8 bg-slate-700/60 dark:bg-zinc-700/60 mx-1 shrink-0" />
        <button
          onClick={() => setShowMoreMenu(true)}
          title="More"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0"
        >
          <Grid3x3 className="w-5 h-5" />
        </button>
        {myVendor && (
          <>
            <div className="w-px h-8 bg-slate-700/60 dark:bg-zinc-700/60 mx-1 shrink-0" />
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
          title="About citinet"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0"
        >
          <CircleAlert className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowAccountMenu(v => !v)}
          title="Account"
          aria-label="Open account menu"
          className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm active:scale-95 ml-1 shrink-0 hover:ring-2 hover:ring-purple-400 transition-all"
        >
          {resolvedCurrentUserAvatarUrl
            ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : displayName.charAt(0).toUpperCase()
          }
        </button>
        <button
          onClick={toggleDesktopNavLayout}
          title="Switch to sidebar layout"
          aria-label="Switch to sidebar layout"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-all active:scale-95 shrink-0 ml-1"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
      ) : (
      <div className="hidden md:flex flex-col fixed left-0 top-9 bottom-0 z-30 w-16 hover:w-60 overflow-hidden transition-[width] duration-200 ease-out bg-slate-900/66 dark:bg-black/62 backdrop-blur-xl border-r border-slate-700/60 dark:border-zinc-800/60 group">
        {desktopNavItems.map(app => {
          const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
          return (
            <button
              key={app.screen}
              onClick={() => handleTileNavigate(app.screen, app.notifyFeature)}
              title={app.label}
              className="flex items-center h-12 shrink-0 overflow-hidden text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
            >
              <span className="relative w-16 h-12 flex items-center justify-center shrink-0">
                <app.Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute top-2 right-3 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-slate-900/50">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">{app.label}</span>
            </button>
          );
        })}

        <div className="h-px mx-4 my-1 bg-slate-700/60 dark:bg-zinc-700/60 shrink-0" />

        <button
          onClick={() => setShowMoreMenu(true)}
          title="More"
          className="flex items-center h-12 shrink-0 overflow-hidden text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
        >
          <span className="w-16 h-12 flex items-center justify-center shrink-0">
            <Grid3x3 className="w-5 h-5" />
          </span>
          <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">More</span>
        </button>

        {myVendor && (
          <>
            <div className="h-px mx-4 my-1 bg-slate-700/60 dark:bg-zinc-700/60 shrink-0" />
            <button
              onClick={() => onNavigate(`vendor/${myVendor.id}`)}
              title={myVendor.name}
              className="flex items-center h-12 shrink-0 overflow-hidden text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
            >
              <span className="w-16 h-12 flex items-center justify-center shrink-0">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                  {vendorLogoUrl
                    ? <img src={vendorLogoUrl} alt={myVendor.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : myVendor.name.charAt(0).toUpperCase()
                  }
                </span>
              </span>
              <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 truncate">{myVendor.name}</span>
            </button>
          </>
        )}

        <div className="flex-1" />

        {isAdmin && (
          <button
            onClick={() => onNavigate('hub-management')}
            title="Hub Admin"
            className="flex items-center h-12 shrink-0 overflow-hidden text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
          >
            <span className="w-16 h-12 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </span>
            <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">Hub Admin</span>
          </button>
        )}
        <button
          onClick={openProjectInfo}
          title="About citinet"
          className="flex items-center h-12 shrink-0 overflow-hidden text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
        >
          <span className="w-16 h-12 flex items-center justify-center shrink-0">
            <CircleAlert className="w-5 h-5" />
          </span>
          <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">About citinet</span>
        </button>
        <button
          onClick={() => setShowAccountMenu(v => !v)}
          title="Account"
          aria-label="Open account menu"
          className="flex items-center h-12 shrink-0 overflow-hidden text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
        >
          <span className="w-16 h-12 flex items-center justify-center shrink-0">
            <span className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
              {resolvedCurrentUserAvatarUrl
                ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : displayName.charAt(0).toUpperCase()
              }
            </span>
          </span>
          <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 truncate">{displayName}</span>
        </button>
        <button
          onClick={toggleDesktopNavLayout}
          title="Switch to bottom dock"
          aria-label="Switch to bottom dock"
          className="flex items-center h-12 shrink-0 mb-1 overflow-hidden text-slate-400 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-300 transition-colors"
        >
          <span className="w-16 h-12 flex items-center justify-center shrink-0">
            <PanelBottom className="w-5 h-5" />
          </span>
          <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">Bottom dock</span>
        </button>
      </div>
      )}

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
                  <p className="text-[10px] text-orange-500 dark:text-orange-400">Hub unreachable — auto-retrying. Enter a new URL only if the address changed.</p>
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
              <span className="text-sm font-medium text-slate-900 dark:text-white">Feed</span>
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
              <Package className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
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
      <div className={`flex-1 pb-24 md:pt-9 overflow-x-hidden relative z-10 ${desktopNavLayout === 'sidebar' ? 'md:pl-16' : 'md:pb-16'}`}>
        {/* Mobile Header - System strip + start menu trigger */}
        <div className="md:hidden bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-zinc-800/60 sticky top-0 z-20">
          <div className="px-4 py-3 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">{nodeStatus.onlineNow} online · {nodeStatus.activeMembers} members</p>
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 bg-slate-100/80 dark:bg-zinc-800/80 shrink-0">
                  <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
                  <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">{statusLabel}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Hexagon className="w-5 h-5 text-purple-400 shrink-0" fill="currentColor" strokeWidth={0} />
                <h1 className="text-base font-semibold text-slate-900 dark:text-white truncate">{nodeName}</h1>
              </div>
            </div>

            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search posts, people, files…"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 border border-transparent text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-zinc-900 focus:border-purple-400/40 focus:outline-none focus:ring-1 focus:ring-purple-400/40 transition-colors"
              />
            </form>

            {connectionStatus === 'unreachable' && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300 flex-1">Hub unreachable</span>
                  {tunnelSuccess && <span className="text-[10px] text-green-500 font-medium">Reconnected!</span>}
                  {registryLoading && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                </div>

                {/* Registry search — friendly first */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Search for your hub by name:</p>
                  <input
                    type="text"
                    value={registrySearchQuery}
                    onChange={e => setRegistrySearchQuery(e.target.value)}
                    placeholder="Hub name…"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-orange-200 dark:border-orange-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  />
                  {registrySearchQuery.trim() && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {filteredRegistryHubs.length === 0 ? (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1">No hubs found — try the URL option below.</p>
                      ) : filteredRegistryHubs.map(hub => (
                        <button
                          key={hub.id}
                          onClick={() => handleRegistryReconnect(hub.tunnel_url)}
                          disabled={tunnelUpdating}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left disabled:opacity-50"
                        >
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{hub.name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{hub.location}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual URL — power-user fallback */}
                <div>
                  <button
                    onClick={() => setShowManualUrl(v => !v)}
                    className="text-[10px] text-slate-400 dark:text-slate-500 underline hover:no-underline"
                  >
                    {showManualUrl ? 'Hide' : 'Enter URL manually'}
                  </button>
                  {showManualUrl && (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="flex gap-1.5">
                        <input
                          type="url"
                          value={tunnelInput}
                          onChange={e => { setTunnelInput(e.target.value); setTunnelError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleTunnelReconnect()}
                          placeholder="https://…"
                          className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-orange-200 dark:border-orange-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500 focus:outline-none"
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
                            <button onClick={handleForceUpdateUrl} className="text-[10px] text-purple-500 underline hover:no-underline shrink-0">Save anyway</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8 overflow-x-hidden">
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
            {/* Quick post prompt */}
            <button
              onClick={() => { sessionStorage.setItem('citinet-deeplink-compose', '1'); onNavigate('feed'); }}
              className="w-full flex items-center gap-3 mb-4 rounded-2xl p-3 border border-slate-300/50 dark:border-zinc-700/70 bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {resolvedCurrentUserAvatarUrl
                  ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : displayName.charAt(0).toUpperCase()
                }
              </div>
              <span className="text-sm text-slate-300 flex-1">Share something with your neighbors…</span>
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-purple-300 group-hover:bg-purple-500/15 group-hover:text-purple-200 transition-colors shrink-0">
                <Plus className="w-4 h-4" />
              </span>
            </button>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Recent Activity</h2>
                {!activityLoading && activityItems.some(i => i.actor !== 'A neighbor') && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Live</span>
                  </span>
                )}
              </div>
              <button
                onClick={refreshActivity}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Refresh activity"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 dark:text-slate-500 ${activityLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Who's Active — presence strip */}
            {!activityLoading && activityItems.length > 0 && (() => {
              const seen = new Set<string>();
              const activeActors = activityItems.filter(i => {
                // Skip fallback "A neighbor" entries — not real members
                if (i.actor === 'A neighbor') return false;
                if (seen.has(i.actor)) return false;
                seen.add(i.actor);
                return true;
              }).slice(0, 6);
              if (activeActors.length === 0) return null;
              return (
                <div className="flex items-center gap-4 mb-5 overflow-x-auto pb-1 no-scrollbar">
                  {activeActors.map(item => {
                    const ini = item.actor.charAt(0).toUpperCase();
                    // Current user is always green — they're online right now
                    const isCurrentUser = item.actor === currentUser?.username;
                    const fresh = isCurrentUser || Date.now() - item.timestamp.getTime() < 3_600_000;
                    return (
                      <button
                        key={item.actor}
                        onClick={() => {
                          const postTypes = ['discussion', 'announcement', 'project', 'request'];
                          if (postTypes.includes(item.type) && item.itemId) handleFeaturedPostClick(item.itemId);
                          else onNavigate(item.navigateTo);
                        }}
                        className="flex flex-col items-center gap-1.5 shrink-0 group"
                      >
                        <div className="relative">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white dark:ring-zinc-900 group-hover:ring-purple-400 transition-all">
                            {ini}
                          </div>
                          {item.actorAvatarUrl && (
                            <img src={item.actorAvatarUrl} alt={item.actor} className="absolute inset-0 w-11 h-11 rounded-full object-cover ring-2 ring-white dark:ring-zinc-900 group-hover:ring-purple-400 transition-all" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-950 ${fresh ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'}`} />
                        </div>
                        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 max-w-[48px] truncate leading-tight">{item.actor.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {activityLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md rounded-2xl border border-slate-300/50 dark:border-zinc-700/70 overflow-hidden">
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/3" />
                      <div className="h-4 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-2/3" />
                      <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityItems.length === 0 ? (
              <div className="bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md rounded-2xl border border-slate-300/50 dark:border-zinc-700/70 p-8 text-center text-white">
                <Activity className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No activity yet — be the first to post!</p>
              </div>
            ) : (() => {
              const PAGE = 6;
              const visible = activityExpanded ? activityItems : activityItems.slice(0, PAGE);
              const hiddenCount = activityItems.length - PAGE;
              const handleClick = (item: ActivityItem) => {
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
              };
              return (
                <div className="space-y-2">
                  {visible.map(item => (
                    <ActivityCard key={item.id} item={item} onClick={() => handleClick(item)} />
                  ))}
                  {!activityExpanded && hiddenCount > 0 && (
                    <button
                      onClick={() => setActivityExpanded(true)}
                      className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 text-sm text-slate-500 dark:text-slate-400 hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all font-medium"
                    >
                      Show {hiddenCount} more
                    </button>
                  )}
                  {activityExpanded && activityItems.length > PAGE && (
                    <button
                      onClick={() => setActivityExpanded(false)}
                      className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 text-sm text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-all font-medium"
                    >
                      Show less
                    </button>
                  )}
                </div>
              );
            })()}
            </div>

            {/* Right: Initiatives + Events */}
            <div className="flex flex-col gap-6">
              {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Upcoming Events</h2>
              <button onClick={() => onNavigate('feed')} className={`${sectionLinkClass} text-sm`}>
                See all →
              </button>
            </div>

            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-zinc-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading…</span>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md rounded-2xl border border-slate-300/50 dark:border-zinc-700/70 p-5 text-center text-white">
                <Calendar className="w-7 h-7 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming events yet</p>
                <button
                  onClick={() => onNavigate('feed')}
                  className="mt-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                >
                  Post one in the Feed →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(event => {
                  const d = event.event_date ? new Date(event.event_date) : null;
                  const dateStr = d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null;
                  const timeStr = d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;
                  return (
                    <button
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className="w-full text-left relative overflow-hidden rounded-2xl p-4 border border-slate-300/50 dark:border-zinc-700/70 bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md text-white hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-800/50 transition-all group"
                    >
                      <div className="flex gap-3 items-center">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1 truncate">{event.title}</h3>
                          <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                            {dateStr && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                <span>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
                              </div>
                            )}
                            {event.event_location && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">{event.event_location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
                        className="w-full text-left relative overflow-hidden rounded-2xl p-3.5 border border-slate-300/50 dark:border-zinc-700/70 bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md text-white hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800/50 transition-all group flex gap-3 items-start"
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

          

          {/* Node Status */}
          <div className="relative overflow-hidden rounded-2xl p-4 border border-slate-300/50 dark:border-zinc-700/70 bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className="w-4 h-4 text-slate-200 shrink-0" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-100 truncate">Node Status</h2>
              </div>
              <button
                onClick={() => setShowNodeStatus(v => !v)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
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

          {/* Mobile launcher — apps after community content */}
          <div className="md:hidden space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Apps</h2>
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

        {/* Bottom padding so last content clears the tab bar */}
        <div className="md:hidden h-20" />
        </div>
      </div>

      {/* Mobile Bottom Dock */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900/68 dark:bg-black/64 backdrop-blur-xl border-t border-slate-700/60 dark:border-zinc-800/60">
        <div className="flex items-stretch h-16 px-1">
          {dockItems.slice(0, 2).map(app => {
            const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
            return (
              <button
                key={app.screen}
                onClick={() => handleTileNavigate(app.screen, app.notifyFeature)}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-purple-300 active:scale-95 transition-transform"
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

          <button
            onClick={() => onNavigate('discover')}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-purple-300 active:scale-95 transition-transform"
          >
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Search</span>
          </button>

          {dockItems.slice(2).map(app => {
            const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
            return (
              <button
                key={app.screen}
                onClick={() => handleTileNavigate(app.screen, app.notifyFeature)}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-purple-300 active:scale-95 transition-transform"
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

          <button
            onClick={() => setShowMobileAppsMenu(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-purple-300 active:scale-95 transition-transform"
          >
            <Grid3x3 className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Apps</span>
          </button>

          <button
            onClick={() => setShowMobileAccountMenu(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-purple-300 active:scale-95 transition-transform"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-[10px]">
              {resolvedCurrentUserAvatarUrl
                ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : displayName.charAt(0).toUpperCase()
              }
            </div>
            <span className="text-[10px] font-medium leading-none">Profile</span>
          </button>
        </div>
      </nav>

      {/* Mobile Account Menu Sheet — mirrors the desktop Account Menu Panel, plus Hub Admin/About (no dedicated icons on mobile) */}
      <AnimatePresence>
        {showMobileAccountMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm md:hidden"
              onClick={() => setShowMobileAccountMenu(false)}
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</p>
                        {isAdmin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shrink-0">Admin</span>}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{nodeName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMobileAccountMenu(false)}
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
                    onClick={() => { setShowMobileAccountMenu(false); onNavigate(`profile/${currentUser.hubUserId}`); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <UserCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-slate-800 dark:text-slate-200">View Profile</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileAccountMenu(false); onNavigate('account'); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Account Settings</span>
                </button>
                <button
                  onClick={() => { setShowMobileAccountMenu(false); setShowSupportMenu(true); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Help & Support</span>
                </button>
              </div>

              <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
              <div className="p-3 space-y-1">
                {isAdmin && (
                  <button
                    onClick={() => { setShowMobileAccountMenu(false); onNavigate('hub-management'); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-slate-800 dark:text-slate-200">Hub Admin</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileAccountMenu(false); openProjectInfo(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <CircleAlert className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">About citinet</span>
                </button>
              </div>

              {onLogout && (
                <>
                  <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
                  <div className="p-3">
                    <button
                      onClick={() => { setShowMobileAccountMenu(false); onLogout(); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
                    >
                      <LogOut className="w-4 h-4 text-red-500 dark:text-red-400" />
                      <span className="text-sm text-red-600 dark:text-red-400">Leave Hub</span>
                    </button>
                  </div>
                </>
              )}
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
          onNavigateToProfile={(userId) => { setFeaturedPost(null); onNavigate(`profile/${userId}`); }}
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

      {/* About this hub modal */}
      <AnimatePresence>
        {showHubInfoModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
              onClick={() => setShowHubInfoModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Hexagon className="w-5 h-5 text-purple-500 dark:text-purple-400" fill="currentColor" strokeWidth={0} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">{nodeName}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Hub</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHubInfoModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {currentHub?.description ? (
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{currentHub.description}</p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500">
                    {isAdmin ? 'No description yet — tell your neighbors what this hub is about.' : "This hub hasn't added a description yet."}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                  {currentHub?.location && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{currentHub.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Users className="w-3.5 h-3.5" />
                    <span>{nodeStatus.activeMembers} {nodeStatus.activeMembers === 1 ? 'member' : 'members'}</span>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => { setShowHubInfoModal(false); onNavigate('hub-management'); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {currentHub?.description ? 'Edit hub info' : 'Add a description'}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* "More"/"Apps" overlay — waffle-style grid of everything not already pinned in the dock/sidebar */}
      <AnimatePresence>
        {(showMoreMenu || showMobileAppsMenu) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
              onClick={() => { setShowMoreMenu(false); setShowMobileAppsMenu(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[calc(100vw-2rem)] max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{showMobileAppsMenu ? 'Apps' : 'More'}</h3>
                <button
                  onClick={() => { setShowMoreMenu(false); setShowMobileAppsMenu(false); }}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="p-5 grid grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto no-scrollbar">
                {(showMobileAppsMenu ? mobileLaunchpadItems : moreNavItems).map(app => {
                  const isSuggest = app.screen === 'suggest';
                  return (
                    <button
                      key={app.screen}
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowMobileAppsMenu(false);
                        if (isSuggest) setShowRequestModal(true);
                        else handleTileNavigate(app.screen, app.notifyFeature);
                      }}
                      className={`flex flex-col items-center gap-2 p-2 rounded-2xl transition-all group active:scale-95 ${
                        isSuggest ? 'hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10' : 'hover:bg-purple-500/10 dark:hover:bg-purple-400/10'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl ${app.gradient} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all text-white overflow-hidden`}>
                        {(app.screen.startsWith('vendor/') && vendorLogoUrl)
                          ? <img src={vendorLogoUrl} alt={myVendor?.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <app.Icon className="w-6 h-6" />
                        }
                      </div>
                      <span className={`text-[11px] font-medium text-center leading-tight ${isSuggest ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
                        {app.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Event Detail Modal (reuses PostDetailModal — events are posts) ── */}
      {selectedEvent && (
        <PostDetailModal
          isOpen
          onClose={() => setSelectedEvent(null)}
          post={selectedEvent}
          hubSlug={hubSlug}
          currentUserId={currentUser?.hubUserId}
          currentUserAvatarUrl={resolvedCurrentUserAvatarUrl ?? undefined}
          isAdmin={isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(hubSlug, name) ?? ''}
          onDeleted={(postId) => { setUpcomingEvents(prev => prev.filter(e => e.id !== postId)); setSelectedEvent(null); }}
          onNavigateToProfile={(userId) => { setSelectedEvent(null); onNavigate(`profile/${userId}`); }}
        />
      )}

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
  feed:        'in Feed',
  files:       'in Files',
  atlas:       'in Atlas',
  neighbors:   'in Neighbors',
  marketplace: 'in Exchange',
};

function ActivityCard({ item, onClick }: { item: ActivityItem; onClick: () => void }) {
  const cfg = ACTIVITY_CONFIG[item.type];
  const initial = item.actor.charAt(0).toUpperCase();
  const location = ACTIVITY_LOCATION[item.navigateTo] ?? '';
  const isLive = Date.now() - item.timestamp.getTime() < 3_600_000;

  return (
    <button
      onClick={onClick}
      className="w-full relative overflow-hidden rounded-2xl p-4 border border-slate-300/50 dark:border-zinc-700/70 bg-slate-900/45 dark:bg-zinc-900/45 backdrop-blur-md text-white hover:shadow-md hover:-translate-y-0.5 transition-all text-left group flex"
    >
      {/* Left accent bar removed — type is already communicated via verb text color */}

      <div className="flex items-start gap-2 flex-1 min-w-0">
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title leads — this is the content, make it the hero */}
          <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug pr-1">{item.title}</p>

          {/* Attribution row: mini-avatar · name · verb · location · time */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative w-4 h-4 shrink-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold">{initial}</div>
              {item.actorAvatarUrl && (
                <img src={item.actorAvatarUrl} alt={item.actor} className="absolute inset-0 w-full h-full rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.actor}</span>
            <span className={`text-xs font-medium ${cfg.verbColor}`}>{item.summary}</span>
            {location && <><span className="text-xs text-slate-300 dark:text-zinc-600">·</span><span className="text-xs text-slate-500 dark:text-slate-400">{location}</span></>}
            <span className="text-xs text-slate-300 dark:text-zinc-600">·</span>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
              {timeAgo(item.timestamp)}
            </span>
          </div>

          {/* Social signals row: reply count + CTA */}
          {((item.replyCount !== undefined && item.replyCount > 0) || item.cta) && (
            <div className="flex items-center gap-3 pt-0.5">
              {item.replyCount !== undefined && item.replyCount > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {item.replyCount} {item.replyCount === 1 ? 'reply' : 'replies'}
                </span>
              )}
              {item.cta && (
                <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-zinc-900/20 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-800 group-hover:bg-slate-100 dark:group-hover:bg-zinc-900/40 transition-colors">
                  {item.cta}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors shrink-0 mt-0.5" />
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

