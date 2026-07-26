import {
  Users, MessageCircle, Radio, Store,
  Calendar, Lightbulb, Activity, MapPin, FolderOpen,
  RefreshCw, Loader2, Plus, Layers, Bot, ChevronRight,
  X, Clock, Share2, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef } from 'react';
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
import { aiService } from '../services/aiService';
import { openLocationInAtlas } from '../utils/geocoding';
import type { FeaturedItem } from '../types/featured';
import type { HubPost, HubVendor, HubEventAttendee } from '../types/hub';
import { APP_TILES, DOCK_PRIORITY_SCREENS } from '../data/appTiles';

const MOBILE_LAUNCHPAD_COLUMNS = 5;
const MOBILE_LAUNCHPAD_ROWS = 2;
const MOBILE_LAUNCHPAD_PAGE_SIZE = MOBILE_LAUNCHPAD_COLUMNS * MOBILE_LAUNCHPAD_ROWS;

// Hidden (not removed) — superseded by HubLayout's mobile bottom-dock "Apps" button,
// which now reveals the same app grid. Flip back to true to restore this section.
const SHOW_MOBILE_LAUNCHPAD = false;

interface DashboardProps {
  userName?: string;
  onNavigate: (screen: string) => void;
}

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }
const ATTENDEE_AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
];
function attendeeAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return ATTENDEE_AVATAR_COLORS[Math.abs(h) % ATTENDEE_AVATAR_COLORS.length];
}

function AttendeeAvatar({ userId, username, hubSlug, onClick }: { userId: string; username: string; hubSlug: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  const url = hubService.getAvatarUrl(hubSlug, userId);
  return (
    <button
      onClick={onClick}
      title={username}
      className="w-7 h-7 rounded-full ring-2 ring-white dark:ring-zinc-900 overflow-hidden shrink-0 hover:z-10 hover:scale-110 transition-transform"
    >
      {url && !failed
        ? <img src={url} alt={username} className="w-full h-full object-cover" onError={() => setFailed(true)} />
        : <div className={`w-full h-full bg-gradient-to-br ${attendeeAvatarColor(username)} flex items-center justify-center text-white text-[9px] font-semibold`}>{getInitials(username)}</div>
      }
    </button>
  );
}

// ── Event Detail Modal ───────────────────────────────────
// Compact RSVP-focused overlay for a quick glance at an upcoming event, opened
// from the dashboard's "Upcoming events" list. RSVP is real and shared (hub_event_rsvps),
// with a clickable attendee avatar stack. "View full post" deep-links into Feed and
// opens the exact same post detail view you'd get by clicking the event there.
function EventDetailModal({ event, hubSlug, onClose, onNavigate }: { event: HubPost; hubSlug: string; onClose: () => void; onNavigate: (screen: string) => void }) {
  const { currentHub } = useHub();
  const d = event.event_date ? new Date(event.event_date) : null;
  const weekdayStr = d ? d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() : '—';
  const dayOfMonth = d ? d.getDate() : '–';
  const timeStr = d ? `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : null;

  const [going, setGoing] = useState(event.my_rsvp ?? false);
  const [count, setCount] = useState(event.rsvp_count ?? 0);
  const [attendees, setAttendees] = useState<HubEventAttendee[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAttendeesLoading(true);
    hubService.listRsvps(hubSlug, event.id)
      .then(data => {
        if (cancelled) return;
        setAttendees(data.attendees);
        setCount(data.count);
        setGoing(data.going);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAttendeesLoading(false); });
    return () => { cancelled = true; };
  }, [hubSlug, event.id]);

  const toggleGoing = async () => {
    if (toggling) return;
    setToggling(true);
    const wasGoing = going;
    setGoing(!wasGoing);
    setCount(c => wasGoing ? Math.max(0, c - 1) : c + 1);
    try {
      const result = await hubService.toggleRsvp(hubSlug, event.id);
      setGoing(result.going);
      setCount(result.count);
      const data = await hubService.listRsvps(hubSlug, event.id);
      setAttendees(data.attendees);
    } catch {
      setGoing(wasGoing);
      setCount(c => wasGoing ? c + 1 : Math.max(0, c - 1));
    } finally {
      setToggling(false);
    }
  };

  const handleShare = () => {
    const parts = [event.title];
    if (timeStr) parts.push(timeStr);
    if (event.event_location) parts.push(event.event_location);
    navigator.clipboard.writeText(parts.join(' — '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm z-50"
      />
      <div key="panel-wrap" className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="cn-surface border cn-border rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden"
        >
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold cn-text-3 uppercase tracking-wide">Event</span>
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 cn-text-3" />
              </button>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-14 text-center rounded-xl cn-surface-2 border cn-border py-2 shrink-0">
                <div className="text-[10px] font-bold tracking-wider text-purple-400">{weekdayStr}</div>
                <div className="font-mono text-xl font-bold leading-tight cn-text-1">{dayOfMonth}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold cn-text-1 leading-snug">{event.title}</h2>
                <div className="flex flex-col gap-1 mt-1.5 text-xs cn-text-3">
                  {timeStr && <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 shrink-0" />{timeStr}</span>}
                </div>
              </div>
            </div>

            {event.body && <p className="text-sm cn-text-2 leading-relaxed">{event.body}</p>}

            {/* Referenced location — clickable into Atlas, resolving to a real pin if one
                exists nearby or offering to add one if not (mirrors Feed's post locations). */}
            {event.event_location && (
              <button
                onClick={() => openLocationInAtlas(event.event_location!, event.event_lat, event.event_lng, onNavigate, currentHub?.location)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border cn-border bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-white" />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium cn-text-2 truncate">{event.event_location}</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] font-semibold cn-text-2 shrink-0">
                  Open in Atlas
                </span>
              </button>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs cn-text-3">Hosted by <span className="font-semibold cn-text-1">{event.author_username}</span></span>
              {event.reply_count > 0 && (
                <span className="text-xs cn-text-4">{event.reply_count} comment{event.reply_count === 1 ? '' : 's'}</span>
              )}
            </div>

            {/* Attendees — real, shared RSVPs; click an avatar to open that person's profile */}
            {(attendeesLoading || count > 0) && (
              <div className="flex items-center gap-2.5">
                {attendeesLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin cn-text-4" />
                ) : (
                  <div className="flex -space-x-2">
                    {attendees.slice(0, 6).map(a => (
                      <AttendeeAvatar
                        key={a.user_id}
                        userId={a.user_id}
                        username={a.display_name || a.username}
                        hubSlug={hubSlug}
                        onClick={() => { onClose(); onNavigate(`profile/${a.user_id}`); }}
                      />
                    ))}
                  </div>
                )}
                {!attendeesLoading && (
                  <span className="text-xs cn-text-3">
                    {count} going{attendees.length > 6 ? ` · +${count - 6} more` : ''}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={toggleGoing}
                disabled={toggling}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${going ? 'cn-surface-2 cn-text-1 border cn-border' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
              >
                {going ? "You're going" : "I'm going"}
              </button>
              <button
                onClick={handleShare}
                title={copied ? 'Copied!' : 'Copy event details'}
                className="px-4 py-2.5 rounded-xl cn-surface-2 border cn-border cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={() => { onClose(); onNavigate(`feed/${event.id}`); }}
              className="w-full text-center text-xs font-medium text-purple-500 dark:text-purple-400 hover:text-purple-400 dark:hover:text-purple-300 transition-colors"
            >
              View full post &amp; comments →
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export function Dashboard({ userName = "Neighbor", onNavigate }: DashboardProps) {
  const { currentHub, currentUser } = useHub();
  const { status: connectionStatus } = useHubStatus();

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

  async function handleTileNavigate(screen: string, notifyFeature?: NotificationFeature) {
    let target = screen;
    if (notifyFeature && notifCounts[notifyFeature] > 0) {
      try {
        const unread = await notificationsService.getUnread(hubSlug);
        if (screen === 'messages') {
          // Deep-link to the most recent unread conversation.
          // Don't mark all read here — MessagesScreen marks per-conversation
          // as each one is opened, so the badge decrements as you read them.
          const msgNotifs = unread.filter(n => n.type === 'message' && n.ref_id);
          if (msgNotifs[0]?.ref_id) sessionStorage.setItem('citinet-deeplink-message-conv', msgNotifs[0].ref_id);
        } else if (screen === 'feed') {
          // Feed is linear — mark all read immediately and route straight to the triggering post.
          const hit = unread.find(n => n.type === 'reply' && n.ref_id);
          if (hit?.ref_id) target = `feed/${hit.ref_id}`;
          clearBadge('feed');
          notificationsService.markRead(hubSlug, 'feed').catch(() => {});
        }
      } catch { /* navigation still proceeds even if fetch fails */ }
    }
    onNavigate(target);
  }

  async function handleFeaturedPostClick(postId: string) {
    try {
      const post = await hubService.getPost(hubSlug, postId);
      setFeaturedPost(post);
    } catch {
      // ignore — fall through silently
    }
  }

  // Feature request modal — triggered from the mobile launchpad's "Suggest" tile
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Use hub context for real data, fall back to props/defaults
  const displayName = currentUser?.displayName || userName;
  // isAdmin: explicit flag (new sessions) OR effectively-local hub (Mission 1).
  // 'https://' is the malformed URL stored by the old empty-URL bug; treat it as local too.
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);
  const tunnelHost = !isLocalHub
    ? (() => { try { return new URL(tunnelUrl).host; } catch { return currentHub?.slug ?? 'local'; } })()
    : (currentHub?.slug ?? 'local');
  const resolvedCurrentUserAvatarUrl = currentHub?.slug && currentUser?.hubUserId
    ? hubService.getAvatarUrl(currentHub.slug, currentUser.hubUserId)
    : (currentUser?.avatarUrl ?? null);
  const vendorLogoUrl = myVendor?.logo_file_name
    ? marketplaceService.getVendorLogoUrl(hubSlug, myVendor.logo_file_name)
    : null;

  const nodeStatus = {
    activeMembers: currentHub?.meta?.activeMembers ?? 0,
    onlineNow: currentHub?.meta?.onlineNow ?? 0,
  };

  // ── Live events ─────────────────────────────────────────
  const [upcomingEvents, setUpcomingEvents] = useState<HubPost[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<HubPost | null>(null);

  useEffect(() => {
    if (!hubSlug || !isConnected) return;
    setEventsLoading(true);
    hubService.getUpcomingEvents(hubSlug, 3)
      .then(setUpcomingEvents)
      .finally(() => setEventsLoading(false));
  }, [hubSlug, isConnected]);

  // enabledApps: null = all enabled (existing hubs), array = restrict to those IDs
  const enabledSet = currentHub?.enabledApps ?? null;
  const AI_TILE = { Icon: Bot, label: 'Assistant', screen: 'assistant', gradient: 'bg-gradient-to-br from-violet-500 to-purple-600' };
  const baseTiles = enabledSet ? APP_TILES.filter(t => enabledSet.includes(t.screen)) : APP_TILES;
  const visibleTiles = aiEnabled ? [...baseTiles, AI_TILE] : baseTiles;

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

  return (
    <div className="min-h-screen">
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
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-8 items-start">
            {/* Left: Recent Activity */}
            <div>
            {/* Quick post prompt */}
            <button
              onClick={() => { sessionStorage.setItem('citinet-deeplink-compose', '1'); onNavigate('feed'); }}
              className="w-full flex items-center gap-3 mb-4 rounded-2xl p-3 cn-glass hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {resolvedCurrentUserAvatarUrl
                  ? <img src={resolvedCurrentUserAvatarUrl} alt={displayName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : displayName.charAt(0).toUpperCase()
                }
              </div>
              <span className="text-sm cn-text-3 flex-1">Share something with your neighbors…</span>
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
                  <div key={i} className="cn-glass rounded-2xl overflow-hidden">
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/3" />
                      <div className="h-4 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-2/3" />
                      <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityItems.length === 0 ? (
              <div className="cn-glass rounded-2xl p-8 text-center">
                <Activity className="w-8 h-8 cn-text-4 mx-auto mb-2" />
                <p className="text-sm cn-text-3">No activity yet — be the first to post!</p>
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

            {/* Right: Events + Node Status */}
            <div className="flex flex-col gap-6">
              {/* Upcoming Events */}
          <div className="relative overflow-hidden rounded-2xl p-4 cn-glass">
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-base font-semibold cn-text-1 tracking-tight">Upcoming events</h2>
              <button
                onClick={() => { sessionStorage.setItem('citinet-deeplink-feed-category', 'EVENT'); onNavigate('feed'); }}
                className="text-xs font-semibold text-purple-300 hover:text-purple-200 transition-colors"
              >
                See all
              </button>
            </div>

            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm cn-text-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading…</span>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="text-center py-3">
                <Calendar className="w-7 h-7 cn-text-4 mx-auto mb-2" />
                <p className="text-sm cn-text-3">No upcoming events yet</p>
                <button
                  onClick={() => onNavigate('feed')}
                  className="mt-2 text-xs font-semibold text-purple-300 hover:underline"
                >
                  Post one in the Feed →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map(event => {
                  const d = event.event_date ? new Date(event.event_date) : null;
                  const weekdayStr = d ? d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() : '—';
                  const dayOfMonth = d ? d.getDate() : '–';
                  const timeStr = d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;
                  return (
                    <button
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className="w-full text-left flex gap-3 items-center rounded-xl p-1.5 -mx-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                    >
                      <div className="w-11 text-center rounded-lg cn-surface-2 border cn-border py-1.5 shrink-0">
                        <div className="text-[9px] font-bold tracking-wider text-purple-400">{weekdayStr}</div>
                        <div className="font-mono text-lg font-bold leading-tight cn-text-1">{dayOfMonth}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm cn-text-1 truncate">{event.title}</h3>
                        <div className="flex items-center gap-1.5 text-xs cn-text-3 truncate">
                          {timeStr && <span>{timeStr}</span>}
                          {timeStr && event.event_location && <span>·</span>}
                          {event.event_location && <span className="truncate">{event.event_location}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 cn-text-4 group-hover:text-purple-400 transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Node Status */}
          <div className="relative overflow-hidden rounded-2xl p-4 cn-glass">
            <div className="flex items-center gap-2 mb-3.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-wide cn-text-3">Node status</h2>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <div className="text-[11px] cn-text-3 mb-0.5">Active members</div>
                <div className="font-mono text-2xl font-bold cn-text-1">{nodeStatus.activeMembers}</div>
              </div>
              <div>
                <div className="text-[11px] cn-text-3 mb-0.5">Online now</div>
                <div className="font-mono text-2xl font-bold cn-text-1">{nodeStatus.onlineNow}</div>
              </div>
            </div>

            <div className="mt-3.5 h-px cn-border border-t" />
            <div className="mt-3.5 flex items-center justify-between">
              <span className="text-[11px] cn-text-3">Tunnel</span>
              <span className="font-mono text-[11px] cn-text-2 truncate">{tunnelHost}</span>
            </div>
          </div>
            </div>
          </div>

          {/* Mobile launcher — apps after community content */}
          {SHOW_MOBILE_LAUNCHPAD && (
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
                          className={`w-full max-w-[72px] flex flex-col items-center gap-1.5 rounded-2xl p-2.5 shadow-sm active:scale-95 transition-transform ${
                            isSuggest
                              ? 'bg-indigo-950/60 border border-indigo-500/30'
                              : 'cn-glass'
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
                          <span className={`text-[10px] font-medium text-center leading-tight ${isSuggest ? 'text-indigo-300' : 'cn-text-2'}`}>
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
          )}

        {/* Bottom padding so last content clears the tab bar */}
        <div className="md:hidden h-20" />
        </div>

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

      {/* ── Event Detail — compact RSVP overlay; "View full post" deep-links into Feed's own post view ── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          hubSlug={hubSlug}
          onClose={() => setSelectedEvent(null)}
          onNavigate={onNavigate}
        />
      )}
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
  discover:    'in Discover',
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
      className="w-full relative overflow-hidden rounded-2xl p-4 cn-glass hover:shadow-md hover:-translate-y-0.5 transition-all text-left group flex"
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
            {location && <><span className="text-xs cn-text-4">·</span><span className="text-xs cn-text-3">{location}</span></>}
            <span className="text-xs cn-text-4">·</span>
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

        {/* Type icon */}
        <span className={`w-8 h-8 rounded-lg ${cfg.iconBg} flex items-center justify-center text-white shrink-0`}>
          <cfg.Icon className="w-4 h-4" />
        </span>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 cn-text-4 group-hover:text-purple-400 transition-colors shrink-0 mt-0.5" />
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

