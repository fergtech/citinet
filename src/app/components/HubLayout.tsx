import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Home, Search, Link2, Grid3x3, Shield, CircleAlert, PanelLeft, PanelBottom,
  LogOut, ArrowRightLeft, User, UserCircle, HelpCircle, WifiOff, Loader2, RefreshCw, X,
  Sparkles, Store, Bug, Lightbulb, MapPin, Users, Sun, Moon, GripVertical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useHub, useHubStatus } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { marketplaceService } from '../services/marketplaceService';
import { aiService } from '../services/aiService';
import { useNotificationCounts } from '../hooks/useNotificationCounts';
import { notificationsService } from '../services/notificationsService';
import type { NotificationFeature } from '../services/notificationsService';
import { registryService } from '../services/registryService';
import type { RegistryHub } from '../services/registryService';
import { FeatureRequestModal } from './FeatureRequestModal';
import { CallProvider } from '../context/CallContext';
import { BroadcastProvider } from '../context/BroadcastContext';
import { InCallOverlay } from './comms/InCallOverlay';
import { IncomingCallModal } from './comms/IncomingCallModal';
import { MinimizedCallBar } from './comms/MinimizedCallBar';
import { BroadcastOverlay } from './comms/BroadcastOverlay';
import { MinimizedBroadcastBar } from './comms/MinimizedBroadcastBar';
import { HubIcon, hubIconRegistryFields } from './HubIcon';
import { hubPath, clearSubdomainCache } from '../utils/subdomain';
import { APP_TILES, DOCK_PRIORITY_SCREENS } from '../data/appTiles';
import { HUB_CATEGORIES } from '../data/hubCategories';
import type { HubVendor } from '../types/hub';

// Screens pinned to the desktop sidebar/dock out of the box — users can repin
// and reorder from the "More" overlay's Edit mode, synced to the account via
// updateUserPreferences (see the reconciliation effect in HubLayout below).
const DEFAULT_PINNED_NAV = ['feed', 'messages', 'atlas', 'marketplace', 'toolkit'];

type NavTile = { Icon: React.ElementType; label: string; screen: string; gradient: string };

// Sentinel id for the "Tap to pin" tray's own droppable area — lets dragging
// a pinned item back out register as "drop here to unpin" even when it isn't
// released directly on top of another tile (e.g. dropped on empty grid space).
const UNPINNED_DROP_ZONE = 'nav-unpinned-zone';

/** One row in "Pinned in navigation" — drag the handle to reorder, or the ×
 * to unpin. Whole-row drag was the other option (Trello/iOS-style), but a
 * dedicated handle keeps that gesture from fighting with the × button and
 * the row's own click-through. */
function SortablePinnedRow({ app, onUnpin }: { app: NavTile; onUnpin: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.screen });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60"
    >
      <div className={`w-8 h-8 rounded-lg ${app.gradient} flex items-center justify-center text-white shrink-0`}>
        <app.Icon className="w-4 h-4" />
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{app.label}</span>
      <button
        onClick={onUnpin}
        title="Remove from navigation"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <button
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 cursor-grab active:cursor-grabbing shrink-0 touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </div>
  );
}

/** One tile in "Tap to pin" — still tappable (dnd-kit's activation distance
 * means a plain click never gets mistaken for a drag start), but also a drag
 * source: dropping it on or over the pinned list above pins it at that spot. */
function DraggableUnpinnedTile({ app, onPin }: { app: NavTile; onPin: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.screen });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onPin}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-purple-500/10 dark:hover:bg-purple-400/10 transition-colors text-left cursor-grab active:cursor-grabbing touch-none"
    >
      <div className={`w-8 h-8 rounded-lg ${app.gradient} flex items-center justify-center text-white shrink-0`}>
        <app.Icon className="w-4 h-4" />
      </div>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{app.label}</span>
    </button>
  );
}

/** Wraps the "Tap to pin" grid so it's a drop target in its own right — a
 * pinned item dragged back out only needs to land somewhere in this tray
 * (not exactly on another tile) to register as "drop here to unpin". */
function UnpinnedDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNPINNED_DROP_ZONE });
  return (
    <div ref={setNodeRef} className={`grid grid-cols-2 gap-1.5 rounded-xl transition-colors ${isOver ? 'bg-purple-500/10' : ''}`}>
      {children}
    </div>
  );
}

/** Floating, elevated copy of whatever's being dragged — the "premium touch"
 * (scale + shadow) that follows the pointer, rendered via DragOverlay so it
 * isn't clipped by either list's own layout. */
function NavDragPreview({ app }: { app: NavTile }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 shadow-2xl scale-105 ring-2 ring-purple-400/60">
      <div className={`w-8 h-8 rounded-lg ${app.gradient} flex items-center justify-center text-white shrink-0`}>
        <app.Icon className="w-4 h-4" />
      </div>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{app.label}</span>
    </div>
  );
}

export function HubLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentHub, currentUser, leaveHub, signOutOfHub, updateTunnelUrl, userPreferences, updateUserPreferences } = useHub();
  const { dotColor, label: statusLabel, status: connectionStatus } = useHubStatus();
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const toggleTheme = () => setTheme(isDarkMode ? 'light' : 'dark');

  const hubSlug = currentHub?.slug ?? '';
  const { counts: notifCounts, clearBadge } = useNotificationCounts(hubSlug);

  const showNav = pathname !== '/onboard';

  const [desktopNavLayout, setDesktopNavLayout] = useState<'dock' | 'sidebar'>(() => {
    if (typeof window === 'undefined') return 'sidebar';
    return localStorage.getItem('citinet-desktop-nav-layout') === 'dock' ? 'dock' : 'sidebar';
  });
  const hubCategory = HUB_CATEGORIES.find(cat => cat.hubFocus === currentHub?.hubFocus);
  const defaultPinnedNav = hubCategory?.pinnedNav ?? DEFAULT_PINNED_NAV;
  const [pinnedNavScreens, setPinnedNavScreens] = useState<string[]>(() => {
    if (typeof window === 'undefined') return defaultPinnedNav;
    try {
      const parsed = JSON.parse(localStorage.getItem('citinet-pinned-nav') ?? 'null');
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPinnedNav;
    } catch {
      return defaultPinnedNav;
    }
  });
  // Reconcile with the account's server-synced nav prefs once they load —
  // localStorage above is only a fast local cache for first paint (avoids a
  // flash of the default layout before the network round trip resolves).
  // Without this, "Customize navigation" only ever stuck to one browser: a
  // different device/browser would just see localStorage's default and never
  // learn the account actually customized it. Runs once per mount (not on
  // every userPreferences change) so a local edit's own optimistic update
  // — which also flows through userPreferences — never gets re-applied to
  // itself or clobbers a newer local edit made before the fetch resolved.
  const navPrefsReconciledRef = useRef(false);
  useEffect(() => {
    if (navPrefsReconciledRef.current) return;
    if (userPreferences.nav_layout === undefined && userPreferences.nav_pinned === undefined) return;
    navPrefsReconciledRef.current = true;
    if (userPreferences.nav_layout === 'dock' || userPreferences.nav_layout === 'sidebar') {
      setDesktopNavLayout(userPreferences.nav_layout);
      localStorage.setItem('citinet-desktop-nav-layout', userPreferences.nav_layout);
    }
    if (userPreferences.nav_pinned) {
      try {
        const parsed = JSON.parse(userPreferences.nav_pinned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedNavScreens(parsed);
          localStorage.setItem('citinet-pinned-nav', JSON.stringify(parsed));
        }
      } catch { /* malformed value — keep the local default */ }
    }
  }, [userPreferences]);

  const [navEditMode, setNavEditMode] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showMobileAccountMenu, setShowMobileAccountMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileAppsMenu, setShowMobileAppsMenu] = useState(false);
  const [showSupportMenu, setShowSupportMenu] = useState(false);
  const [showHubInfoModal, setShowHubInfoModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [myVendor, setMyVendor] = useState<HubVendor | null>(null);
  const [showTunnelInput, setShowTunnelInput] = useState(false);
  const [tunnelInput, setTunnelInput] = useState('');
  const [tunnelUpdating, setTunnelUpdating] = useState(false);
  const [tunnelError, setTunnelError] = useState('');
  const [tunnelSuccess, setTunnelSuccess] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [registryHubs, setRegistryHubs] = useState<RegistryHub[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);

  const isConnected = connectionStatus === 'connected';

  useEffect(() => {
    if (!hubSlug) return;
    marketplaceService.getMyVendor(hubSlug).then(setMyVendor).catch(() => {});
    aiService.getStatus(hubSlug).then(s => setAiEnabled(s.enabled)).catch(() => {});
  }, [hubSlug, isConnected]);

  useEffect(() => {
    if (!showTunnelInput && connectionStatus !== 'unreachable') return;
    if (registryHubs.length > 0) return;
    setRegistryLoading(true);
    registryService.getHubs().then(setRegistryHubs).catch(() => {}).finally(() => setRegistryLoading(false));
  }, [showTunnelInput, connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps


  const filteredRegistryHubs = registrySearchQuery.trim()
    ? registryHubs.filter(h =>
        h.name.toLowerCase().includes(registrySearchQuery.toLowerCase()) ||
        h.slug.toLowerCase().includes(registrySearchQuery.toLowerCase())
      )
    : registryHubs;

  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);
  const displayName = currentUser?.displayName || currentUser?.username || 'Neighbor';
  const nodeName = currentHub?.name || hubSlug || 'Community Hub';
  const resolvedAvatarUrl = (currentHub?.slug && currentUser?.hubUserId)
    ? hubService.getAvatarUrl(currentHub.slug, currentUser.hubUserId)
    : (currentUser?.avatarUrl ?? null);
  const vendorLogoUrl = myVendor?.logo_file_name
    ? marketplaceService.getVendorLogoUrl(hubSlug, myVendor.logo_file_name)
    : null;
  const nodeStatus = {
    activeMembers: currentHub?.meta?.activeMembers ?? 0,
    onlineNow: currentHub?.meta?.onlineNow ?? 0,
  };

  const enabledSet = currentHub?.enabledApps ?? null;
  const AI_TILE = { Icon: Sparkles, label: 'Assistant', screen: 'assistant', gradient: 'bg-gradient-to-br from-violet-500 to-purple-600', notifyFeature: undefined as NotificationFeature | undefined };
  const orderedTiles = hubCategory?.pinnedNav
    ? [...APP_TILES].sort((a, b) => {
        const ai = hubCategory.pinnedNav!.indexOf(a.screen);
        const bi = hubCategory.pinnedNav!.indexOf(b.screen);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : APP_TILES;
  const baseTiles = enabledSet ? orderedTiles.filter(t => enabledSet.includes(t.screen)) : orderedTiles;
  const visibleTiles = aiEnabled ? [...baseTiles, AI_TILE] : baseTiles;

  const dockItems = DOCK_PRIORITY_SCREENS
    .map(screen => visibleTiles.find(t => t.screen === screen))
    .filter(Boolean) as typeof APP_TILES;

  const desktopNavItems = pinnedNavScreens
    .map(screen => visibleTiles.find(t => t.screen === screen))
    .filter(Boolean) as typeof APP_TILES;

  // Split so live drag reordering (many rapid updates per gesture, see
  // handleNavDragOver below) can update just the visible state without
  // spamming localStorage/the server on every pointer-move — persistPinnedNav
  // is only called once, when a gesture actually settles.
  const persistPinnedNav = (next: string[]) => {
    localStorage.setItem('citinet-pinned-nav', JSON.stringify(next));
    // Account-level, not just this browser — see the reconciliation effect
    // above for why "Customize navigation" needs to follow the user across
    // devices/sessions rather than living only in localStorage.
    updateUserPreferences({ nav_pinned: JSON.stringify(next) }).catch(() => {});
  };
  const updatePinnedNav = (next: string[]) => {
    setPinnedNavScreens(next);
    persistPinnedNav(next);
  };
  const pinApp = (screen: string) => updatePinnedNav([...pinnedNavScreens, screen]);
  const unpinApp = (screen: string) => updatePinnedNav(pinnedNavScreens.filter(s => s !== screen));

  // ── drag-and-drop nav customization ────────────────────
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragStartPinnedRef = useRef<string[]>([]);
  const navDndSensors = useSensors(
    // A small activation distance is what lets a plain tap-to-pin/tap-to-
    // remove click still work on these same elements — only a real drag
    // gesture (pointer actually moves) starts a dnd-kit drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleNavDragStart = (event: DragStartEvent) => {
    dragStartPinnedRef.current = pinnedNavScreens;
    setActiveDragId(event.active.id as string);
  };

  // Live reflow while the gesture is in progress — dragging an unpinned tile
  // over the pinned list inserts it there immediately (so the list visibly
  // makes space, Trello/Notion-style), and dragging a pinned item back over
  // the tray removes it just as live. Nothing is persisted here.
  const handleNavDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeIsPinned = pinnedNavScreens.includes(activeId);
    if (!activeIsPinned && pinnedNavScreens.includes(overId)) {
      setPinnedNavScreens(prev => {
        if (prev.includes(activeId)) return prev;
        const overIdx = prev.indexOf(overId);
        return [...prev.slice(0, overIdx), activeId, ...prev.slice(overIdx)];
      });
    } else if (activeIsPinned && (overId === UNPINNED_DROP_ZONE || !pinnedNavScreens.includes(overId))) {
      setPinnedNavScreens(prev => prev.filter(id => id !== activeId));
    }
  };

  const handleNavDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    const activeId = active.id as string;
    if (!over) {
      // Dropped somewhere invalid — revert to how the list looked before
      // this gesture rather than keeping whatever dragOver left mid-flight.
      setPinnedNavScreens(dragStartPinnedRef.current);
      return;
    }
    const overId = over.id as string;
    // Computed from `pinnedNavScreens` directly (this handler's own render
    // closure), not a setState updater function — persistPinnedNav below
    // calls updateUserPreferences, which sets state on HubProvider, and
    // doing that from inside a setPinnedNavScreens updater is exactly the
    // "setState while rendering a different component" React warns about.
    let next = pinnedNavScreens;
    if (overId === UNPINNED_DROP_ZONE) {
      next = pinnedNavScreens.filter(id => id !== activeId);
    } else if (pinnedNavScreens.includes(activeId) && pinnedNavScreens.includes(overId) && activeId !== overId) {
      next = arrayMove(pinnedNavScreens, pinnedNavScreens.indexOf(activeId), pinnedNavScreens.indexOf(overId));
    }
    setPinnedNavScreens(next);
    const startedFrom = dragStartPinnedRef.current;
    const unchanged = startedFrom.length === next.length && startedFrom.every((id, i) => id === next[i]);
    if (!unchanged) persistPinnedNav(next);
  };

  const activeDragTile = activeDragId ? visibleTiles.find(t => t.screen === activeDragId) : undefined;

  const pinnedScreens = new Set(desktopNavItems.map(i => i.screen));
  const moreNavItems = [
    ...visibleTiles.filter(app => !pinnedScreens.has(app.screen) && !app.screen.startsWith('vendor/')),
    { Icon: Sparkles, label: 'Suggest', screen: 'suggest', gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600', notifyFeature: undefined as NotificationFeature | undefined },
  ];

  const mobileLaunchpadItems = [
    ...visibleTiles,
    ...(myVendor ? [{ Icon: Store, label: myVendor.name, screen: `vendor/${myVendor.id}`, gradient: 'bg-gradient-to-br from-blue-600 to-purple-600', notifyFeature: undefined as NotificationFeature | undefined }] : []),
    { Icon: Sparkles, label: 'Suggest', screen: 'suggest', gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600', notifyFeature: undefined as NotificationFeature | undefined },
  ].filter(app => !DOCK_PRIORITY_SCREENS.includes(app.screen));

  // Navigation with deeplink/badge clearing
  const handleNavigate = async (screen: string, notifyFeature?: NotificationFeature) => {
    setShowMoreMenu(false);
    setShowMobileAppsMenu(false);
    let target = screen;
    if (notifyFeature && notifCounts[notifyFeature] > 0) {
      try {
        const unread = await notificationsService.getUnread(hubSlug);
        if (screen === 'messages') {
          const msgNotifs = unread.filter(n => n.type === 'message' && n.ref_id);
          if (msgNotifs[0]?.ref_id) sessionStorage.setItem('citinet-deeplink-message-conv', msgNotifs[0].ref_id);
        } else if (screen === 'feed') {
          const hit = unread.find(n => n.type === 'reply' && n.ref_id);
          if (hit?.ref_id) target = `feed/${hit.ref_id}`;
          clearBadge('feed');
          notificationsService.markRead(hubSlug, 'feed').catch(() => {});
        }
      } catch { /* navigation proceeds even if fetch fails */ }
    }
    navigate(hubPath(`/${target}`));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    sessionStorage.setItem('citinet-deeplink-search', q);
    setSearchQuery('');
    navigate(hubPath('/discover'));
  };

  /** Lightweight sign-out — keeps the hub connection/profile so the account
   * menu's "Sign Out" leads to a quick re-login on /onboard instead of the
   * full hub picker. */
  const handleSignOut = () => {
    const slug = currentHub?.slug || hubSlug;
    if (slug) signOutOfHub(slug);
    navigate(hubPath('/onboard'));
  };

  /** Full disconnect — forgets this hub entirely and returns to hub discovery.
   * Distinct from handleSignOut: this is for switching to a different hub. */
  const handleLeaveHub = () => {
    const slug = currentHub?.slug || hubSlug;
    if (slug) leaveHub(slug);
    clearSubdomainCache();
    window.location.href = window.location.origin + '/join';
  };

  const autoRegisterHub = (url: string) => {
    if (!currentHub) return;
    registryService.registerHub({
      id: currentHub.slug, name: currentHub.name, slug: currentHub.slug,
      location: currentHub.location ?? '', description: currentHub.description ?? '',
      tunnel_url: url, member_count: currentHub.meta?.activeMembers ?? 0, online: true,
      ...hubIconRegistryFields(currentHub),
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
      setTimeout(() => { setShowTunnelInput(false); setTunnelSuccess(false); }, 1500);
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
      setTimeout(() => { setShowTunnelInput(false); setTunnelSuccess(false); }, 1500);
    }
  };

  const handleRegistryReconnect = async (url: string) => {
    setTunnelUpdating(true);
    setTunnelError('');
    const result = await updateTunnelUrl(url);
    setTunnelUpdating(false);
    if (result.ok) {
      setTunnelSuccess(true);
      autoRegisterHub(url);
      setTimeout(() => { setShowTunnelInput(false); setTunnelSuccess(false); }, 1500);
    } else {
      setTunnelError(result.error || 'Could not reach hub');
    }
  };

  const toggleDesktopNavLayout = () => {
    setDesktopNavLayout(prev => {
      const next = prev === 'dock' ? 'sidebar' : 'dock';
      localStorage.setItem('citinet-desktop-nav-layout', next);
      // Account-level — see updatePinnedNav's own note.
      updateUserPreferences({ nav_layout: next }).catch(() => {});
      return next;
    });
  };

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
      messages: 'Communications',
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

  if (!showNav) return <>{children}</>;

  return (
    <CallProvider>
      <BroadcastProvider>
    <div className="h-[100dvh]">

      {/* ═══ DESKTOP TOP MENUBAR ═══ */}
      <div className="hidden md:flex fixed top-0 inset-x-0 h-9 z-30 bg-white/85 dark:bg-black/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-zinc-800/70 items-center px-4 gap-3 select-none">
        <button
          onClick={() => setShowHubInfoModal(true)}
          className="flex items-center gap-1.5 -mx-1.5 px-1.5 h-6 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
          title="About this hub"
        >
          <HubIcon hub={currentHub} baseUrl={currentHub?.tunnelUrl ?? ''} size={16} variant="inline" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{nodeName}</span>
        </button>
        <form onSubmit={handleSearchSubmit} className="flex-1 flex justify-center min-w-0 px-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search posts, people, files…"
              className="w-full h-6 pl-7 pr-2 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-500 hover:bg-black/10 dark:hover:bg-white/10 focus:bg-black/10 dark:focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-purple-400/40 transition-colors"
            />
          </div>
        </form>
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 ${connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
        <span className="text-xs text-slate-700 dark:text-slate-300">{statusLabel}</span>
        {nodeStatus.onlineNow > 0 && (
          <>
            <span className="text-xs cn-text-4">·</span>
            <span className="text-xs text-slate-700 dark:text-slate-300">{nodeStatus.onlineNow} online</span>
          </>
        )}
        <button
          onClick={() => { setShowTunnelInput(v => !v); setTunnelError(''); setTunnelSuccess(false); }}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-zinc-800 transition-colors"
          title="Update tunnel URL"
        >
          <Link2 className="w-3 h-3 text-slate-500 dark:text-slate-500" />
        </button>
      </div>

      {/* ═══ DESKTOP RECONNECT PANEL ═══ */}
      {showTunnelInput && (
        <div className="hidden md:block fixed top-10 right-4 z-40 w-72 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Find your hub</p>
            {registryLoading && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
            {tunnelSuccess && <span className="text-[10px] text-green-500 font-medium">Reconnected!</span>}
          </div>
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
                      <button onClick={handleForceUpdateUrl} className="text-[10px] cn-text-3 underline hover:no-underline shrink-0">Save anyway</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DESKTOP ACCOUNT MENU PANEL ═══ */}
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
                    {resolvedAvatarUrl
                      ? <img src={resolvedAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : displayName.charAt(0).toUpperCase()
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</span>
                      {isAdmin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full cn-surface-3 cn-text-2 shrink-0">Admin</span>}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">{nodeName}</span>
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                {currentUser?.hubUserId && (
                  <button
                    onClick={() => { setShowAccountMenu(false); navigate(hubPath(`/profile/${currentUser.hubUserId}`)); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                  >
                    <UserCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">View Profile</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowAccountMenu(false); navigate(hubPath('/account')); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <User className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Account Settings</span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  {isDarkMode
                    ? <Moon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    : <Sun className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />}
                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">Dark Mode</span>
                  <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${isDarkMode ? 'bg-purple-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                  </span>
                </button>
                <button
                  onClick={() => { setShowAccountMenu(false); setShowSupportMenu(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <HelpCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Help & Support</span>
                </button>
              </div>
              <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
              <div className="p-2">
                <button
                  onClick={() => { setShowAccountMenu(false); handleSignOut(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Sign Out</span>
                </button>
                <button
                  onClick={() => { setShowAccountMenu(false); handleLeaveHub(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                >
                  <ArrowRightLeft className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                  <span className="text-sm text-red-600 dark:text-red-400">Switch Hub</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ DESKTOP BOTTOM DOCK or SIDEBAR ═══ */}
      {desktopNavLayout === 'dock' ? (
        <div className="hidden md:flex fixed bottom-0 inset-x-0 h-14 z-30 bg-white/85 dark:bg-black/62 backdrop-blur-xl border-t border-slate-200/70 dark:border-zinc-800/60 items-center px-4 gap-1">
          <button
            onClick={() => navigate(hubPath('/'))}
            title="Home"
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-all active:scale-95 shrink-0"
          >
            <Home className="w-5 h-5" />
          </button>
          {desktopNavItems.map(app => {
            const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
            return (
              <button
                key={app.screen}
                onClick={() => handleNavigate(app.screen, app.notifyFeature)}
                title={app.label}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-all active:scale-95 shrink-0"
              >
                <app.Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-white dark:ring-slate-900/50">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            );
          })}
          <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700/60 mx-1 shrink-0" />
          <button
            onClick={() => setShowMoreMenu(true)}
            title="More"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-all active:scale-95 shrink-0"
          >
            <Grid3x3 className="w-5 h-5" />
          </button>
          {myVendor && (
            <>
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700/60 mx-1 shrink-0" />
              <button
                onClick={() => handleNavigate(`vendor/${myVendor.id}`)}
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
              onClick={() => { clearBadge('hub_management'); notificationsService.markRead(hubSlug, 'hub_management').catch(() => {}); handleNavigate('hub-management'); }}
              title="Hub Admin"
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-all active:scale-95 shrink-0"
            >
              <Shield className="w-5 h-5" />
              {notifCounts.hub_management > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-white dark:ring-slate-900/50">
                  {notifCounts.hub_management > 9 ? '9+' : notifCounts.hub_management}
                </span>
              )}
            </button>
          )}
          <button
            onClick={openProjectInfo}
            title="About citinet"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-all active:scale-95 shrink-0"
          >
            <CircleAlert className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowAccountMenu(v => !v)}
            title="Account"
            aria-label="Open account menu"
            className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm active:scale-95 ml-1 shrink-0 hover:ring-2 hover:ring-purple-400 transition-all"
          >
            {resolvedAvatarUrl
              ? <img src={resolvedAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : displayName.charAt(0).toUpperCase()
            }
          </button>
          <button
            onClick={toggleDesktopNavLayout}
            title="Switch to sidebar layout"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-all active:scale-95 shrink-0 ml-1"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="hidden md:flex flex-col fixed left-0 top-9 bottom-0 z-30 w-16 hover:w-60 overflow-hidden transition-[width] duration-200 ease-out bg-white/85 dark:bg-black/62 backdrop-blur-xl border-r border-slate-200/70 dark:border-zinc-800/60 group">
          <button
            onClick={() => navigate(hubPath('/'))}
            title="Home"
            className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            <span className="w-16 h-12 flex items-center justify-center shrink-0">
              <Home className="w-5 h-5" />
            </span>
            <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">Home</span>
          </button>
          {desktopNavItems.map(app => {
            const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
            return (
              <button
                key={app.screen}
                onClick={() => handleNavigate(app.screen, app.notifyFeature)}
                title={app.label}
                className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              >
                <span className="relative w-16 h-12 flex items-center justify-center shrink-0">
                  <app.Icon className="w-5 h-5" />
                  {badge > 0 && (
                    <span className="absolute top-2 right-3 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-white dark:ring-slate-900/50">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">{app.label}</span>
              </button>
            );
          })}
          <div className="h-px mx-4 my-1 bg-slate-200 dark:bg-zinc-700/60 shrink-0" />
          <button
            onClick={() => setShowMoreMenu(true)}
            title="More"
            className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            <span className="w-16 h-12 flex items-center justify-center shrink-0"><Grid3x3 className="w-5 h-5" /></span>
            <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">More</span>
          </button>
          {myVendor && (
            <>
              <div className="h-px mx-4 my-1 bg-slate-200 dark:bg-zinc-700/60 shrink-0" />
              <button
                onClick={() => handleNavigate(`vendor/${myVendor.id}`)}
                title={myVendor.name}
                className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
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
              onClick={() => { clearBadge('hub_management'); notificationsService.markRead(hubSlug, 'hub_management').catch(() => {}); handleNavigate('hub-management'); }}
              title="Hub Admin"
              className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
            >
              <span className="relative w-16 h-12 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
                {notifCounts.hub_management > 0 && (
                  <span className="absolute top-1.5 right-3 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-white dark:ring-slate-900/50">
                    {notifCounts.hub_management > 9 ? '9+' : notifCounts.hub_management}
                  </span>
                )}
              </span>
              <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">Hub Admin</span>
            </button>
          )}
          <button
            onClick={openProjectInfo}
            title="About citinet"
            className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            <span className="w-16 h-12 flex items-center justify-center shrink-0"><CircleAlert className="w-5 h-5" /></span>
            <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">About citinet</span>
          </button>
          <button
            onClick={() => setShowAccountMenu(v => !v)}
            title="Account"
            className="flex items-center h-12 shrink-0 overflow-hidden text-slate-500 dark:text-slate-300 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            <span className="w-16 h-12 flex items-center justify-center shrink-0">
              <span className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                {resolvedAvatarUrl
                  ? <img src={resolvedAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : displayName.charAt(0).toUpperCase()
                }
              </span>
            </span>
            <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 truncate">{displayName}</span>
          </button>
          <button
            onClick={toggleDesktopNavLayout}
            title="Switch to bottom dock"
            className="flex items-center h-12 shrink-0 mb-1 overflow-hidden text-slate-500 dark:text-slate-400 hover:bg-purple-500/15 dark:hover:bg-purple-400/15 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            <span className="w-16 h-12 flex items-center justify-center shrink-0"><PanelBottom className="w-5 h-5" /></span>
            <span className="pr-4 whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150">Bottom dock</span>
          </button>
        </div>
      )}

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className={`h-full flex flex-col relative z-10 ${desktopNavLayout === 'sidebar' ? 'md:pl-16 md:pt-9' : 'md:pt-9 md:pb-14'}`}>

        {/* Mobile Header — single compact row (name, online count, connection status) */}
        <div className="md:hidden bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-zinc-800/60 shrink-0 z-20">
          <div className="px-3 pb-2 space-y-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center gap-2">
              <HubIcon hub={currentHub} baseUrl={currentHub?.tunnelUrl ?? ''} size={16} variant="inline" />
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate flex-1 min-w-0">{nodeName}</h1>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">{nodeStatus.onlineNow} online</span>
              <div className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 bg-slate-100/80 dark:bg-zinc-800/80 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
                <span className="text-[9px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">{statusLabel}</span>
              </div>
            </div>
            {connectionStatus === 'unreachable' && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300 flex-1">Hub unreachable</span>
                  {tunnelSuccess && <span className="text-[10px] text-green-500 font-medium">Reconnected!</span>}
                  {registryLoading && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                </div>
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
                <div>
                  <button onClick={() => setShowManualUrl(v => !v)} className="text-[10px] text-slate-400 dark:text-slate-500 underline hover:no-underline">
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
                          <p className="text-[10px] text-red-500 dark:text-red-400 flex-1">{tunnelError}</p>
                          {tunnelInput.trim() && (
                            <button onClick={handleForceUpdateUrl} className="text-[10px] cn-text-3 underline hover:no-underline shrink-0">Save anyway</button>
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

        {/* Scrollable content zone — fills remaining height after mobile header */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar pb-16 md:pb-0">
          {children}
        </div>
      </div>

      {/* ═══ MOBILE BOTTOM DOCK ═══ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/85 dark:bg-black/64 backdrop-blur-xl border-t border-slate-200/70 dark:border-zinc-800/60">
        <div className="flex items-stretch h-16 px-1">
          {/* Home */}
          <button
            onClick={() => navigate(hubPath('/'))}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 active:scale-95 transition-transform"
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Home</span>
          </button>
          {/* Feed · Search (from DOCK_PRIORITY_SCREENS, Search inserted after Feed) */}
          {dockItems.flatMap(app => {
            const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
            const tile = (
              <button
                key={app.screen}
                onClick={() => handleNavigate(app.screen, app.notifyFeature)}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 active:scale-95 transition-transform"
              >
                <div className="relative">
                  <app.Icon className="w-5 h-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-white dark:ring-slate-900/50">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{app.label}</span>
              </button>
            );
            if (app.screen !== 'feed') return [tile];
            return [tile, (
              <button
                key="search"
                onClick={() => handleNavigate('discover')}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 active:scale-95 transition-transform"
              >
                <Search className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">Search</span>
              </button>
            )];
          })}
          {/* Apps waffle — reveals the full app grid (incl. Messages); replaces the old fixed Messages slot */}
          <button
            onClick={() => setShowMobileAppsMenu(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 active:scale-95 transition-transform"
          >
            <div className="relative">
              <Grid3x3 className="w-5 h-5" />
              {notifCounts.messages > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-1 ring-white dark:ring-slate-900/50">
                  {notifCounts.messages > 9 ? '9+' : notifCounts.messages}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">Apps</span>
          </button>
          {/* Profile */}
          <button
            onClick={() => setShowMobileAccountMenu(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 active:scale-95 transition-transform"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-[10px]">
              {resolvedAvatarUrl
                ? <img src={resolvedAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : displayName.charAt(0).toUpperCase()
              }
            </div>
            <span className="text-[10px] font-medium leading-none">Profile</span>
          </button>
        </div>
      </nav>

      {/* ═══ MOBILE ACCOUNT SHEET ═══ */}
      <AnimatePresence>
        {showMobileAccountMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/45 backdrop-blur-sm md:hidden"
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
                      {resolvedAvatarUrl
                        ? <img src={resolvedAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : displayName.charAt(0).toUpperCase()
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</p>
                        {isAdmin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full cn-surface-3 cn-text-2 shrink-0">Admin</span>}
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
                    onClick={() => { setShowMobileAccountMenu(false); navigate(hubPath(`/profile/${currentUser.hubUserId}`)); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <UserCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm text-slate-800 dark:text-slate-200">View Profile</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileAccountMenu(false); navigate(hubPath('/account')); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Account Settings</span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  {isDarkMode
                    ? <Moon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    : <Sun className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                  <span className="text-sm text-slate-800 dark:text-slate-200 flex-1">Dark Mode</span>
                  <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${isDarkMode ? 'bg-purple-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                  </span>
                </button>
                <button
                  onClick={() => { setShowMobileAccountMenu(false); setShowSupportMenu(true); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <HelpCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Help & Support</span>
                </button>
              </div>
              <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
              <div className="p-3 space-y-1">
                {isAdmin && (
                  <button
                    onClick={() => { setShowMobileAccountMenu(false); navigate(hubPath('/hub-management')); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm text-slate-800 dark:text-slate-200">Hub Admin</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileAccountMenu(false); openProjectInfo(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <CircleAlert className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">About citinet</span>
                </button>
              </div>
              <div className="mx-3 border-t border-slate-100 dark:border-zinc-800" />
              <div className="p-3 space-y-1">
                <button
                  onClick={() => { setShowMobileAccountMenu(false); handleSignOut(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                >
                  <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Sign Out</span>
                </button>
                <button
                  onClick={() => { setShowMobileAccountMenu(false); handleLeaveHub(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
                >
                  <ArrowRightLeft className="w-4 h-4 text-red-500 dark:text-red-400" />
                  <span className="text-sm text-red-600 dark:text-red-400">Switch Hub</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ FEATURE REQUEST MODAL ═══ */}
      {showRequestModal && (
        <FeatureRequestModal hubSlug={hubSlug} onClose={() => setShowRequestModal(false)} />
      )}

      {/* ═══ SUPPORT OPTIONS MODAL ═══ */}
      <AnimatePresence>
        {showSupportMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm"
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
                >
                  <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="p-2">
                <button onClick={() => openSupportLink('help')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left">
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Get Help</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Troubleshooting or support questions</p>
                  </div>
                </button>
                <button onClick={() => openSupportLink('bug')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left">
                  <Bug className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Report a Bug</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Something is broken or not working right</p>
                  </div>
                </button>
                <button onClick={() => openSupportLink('feature')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left">
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

      {/* ═══ HUB INFO MODAL ═══ */}
      <AnimatePresence>
        {showHubInfoModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm"
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
                  <HubIcon hub={currentHub} baseUrl={currentHub?.tunnelUrl ?? ''} size={40} variant="badge" />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">{nodeName}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Hub</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHubInfoModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0"
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
                    onClick={() => { setShowHubInfoModal(false); navigate(hubPath('/hub-management')); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                  >
                    {currentHub?.description ? 'Edit hub info' : 'Add a description'}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ MORE / APPS OVERLAY ═══ */}
      <AnimatePresence>
        {(showMoreMenu || showMobileAppsMenu) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm"
              onClick={() => { setShowMoreMenu(false); setShowMobileAppsMenu(false); setNavEditMode(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[calc(100vw-2rem)] max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {showMobileAppsMenu ? 'Apps' : navEditMode ? 'Customize navigation' : 'More'}
                </h3>
                <div className="flex items-center gap-1">
                  {!showMobileAppsMenu && (
                    <button
                      onClick={() => setNavEditMode(v => !v)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold cn-text-3 hover:cn-text-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                    >
                      {navEditMode ? 'Done' : 'Edit'}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMoreMenu(false); setShowMobileAppsMenu(false); setNavEditMode(false); }}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0"
                  >
                    <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>
              {!showMobileAppsMenu && navEditMode ? (
                <DndContext
                  sensors={navDndSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleNavDragStart}
                  onDragOver={handleNavDragOver}
                  onDragEnd={handleNavDragEnd}
                >
                <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto no-scrollbar">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                      Pinned in navigation
                    </p>
                    <SortableContext items={pinnedNavScreens} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-1.5 min-h-[2.75rem]">
                        {desktopNavItems.length === 0 && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic px-3 py-2">
                            Nothing pinned — drag or tap an app below to add it.
                          </p>
                        )}
                        {desktopNavItems.map((app) => (
                          <SortablePinnedRow key={app.screen} app={app} onUnpin={() => unpinApp(app.screen)} />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                  {moreNavItems.filter(a => a.screen !== 'suggest').length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                        Tap to pin
                      </p>
                      <UnpinnedDropZone>
                        {moreNavItems.filter(a => a.screen !== 'suggest').map(app => (
                          <DraggableUnpinnedTile key={app.screen} app={app} onPin={() => pinApp(app.screen)} />
                        ))}
                      </UnpinnedDropZone>
                    </div>
                  )}
                </div>
                <DragOverlay>{activeDragTile ? <NavDragPreview app={activeDragTile} /> : null}</DragOverlay>
                </DndContext>
              ) : (
              <div className="p-5 max-h-[70vh] overflow-y-auto no-scrollbar">
                {!showMobileAppsMenu && moreNavItems.filter(a => a.screen !== 'suggest').length === 0 && (
                  <div className="flex flex-col items-center text-center gap-2 py-5 mb-2">
                    <Grid3x3 className="w-7 h-7 text-slate-300 dark:text-zinc-600" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Everything's pinned to your navigation</p>
                    <button
                      onClick={() => setNavEditMode(true)}
                      className="text-xs font-semibold cn-text-3 hover:cn-text-1 hover:underline"
                    >
                      Tap Edit to rearrange or unpin apps
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-3">
                {(showMobileAppsMenu ? mobileLaunchpadItems : moreNavItems).map(app => {
                  const isSuggest = app.screen === 'suggest';
                  const badge = app.notifyFeature ? notifCounts[app.notifyFeature] : 0;
                  return (
                    <button
                      key={app.screen}
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowMobileAppsMenu(false);
                        if (isSuggest) setShowRequestModal(true);
                        else handleNavigate(app.screen, app.notifyFeature);
                      }}
                      className={`flex flex-col items-center gap-2 p-2 rounded-2xl transition-all group active:scale-95 ${
                        isSuggest ? 'hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10' : 'hover:bg-purple-500/10 dark:hover:bg-purple-400/10'
                      }`}
                    >
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-2xl ${app.gradient} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all text-white overflow-hidden`}>
                          {(app.screen.startsWith('vendor/') && vendorLogoUrl)
                            ? <img src={vendorLogoUrl} alt={myVendor?.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <app.Icon className="w-6 h-6" />
                          }
                        </div>
                        {badge > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 shadow ring-2 ring-white dark:ring-zinc-900">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] font-medium text-center leading-tight ${isSuggest ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
                        {app.label}
                      </span>
                    </button>
                  );
                })}
                </div>
              </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <InCallOverlay />
      <IncomingCallModal />
      <MinimizedCallBar />
      <BroadcastOverlay />
      <MinimizedBroadcastBar />
    </div>
      </BroadcastProvider>
    </CallProvider>
  );
}
