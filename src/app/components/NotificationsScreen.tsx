import { useCallback, useEffect, useState } from 'react';
import { Bell, ChevronLeft, RefreshCw, Loader2, CheckCircle2, Star } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { notificationsService, type UnreadNotification } from '../services/notificationsService';
import { featuredService } from '../services/featuredService';
import type { FeaturedItem } from '../types/featured';
import { useRecentlyReadNotifications } from '../hooks/useRecentlyReadNotifications';
import { notificationCopy, notificationIcon, notificationTarget } from '../utils/notificationMeta';
import { timeAgo } from '../hooks/useActivityFeed';

interface NotificationsScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

// citinet-web previously had no notifications screen of its own — just
// per-feature red dots on individual nav tiles (see useNotificationCounts,
// which only covers feed/messages/hub_management). This is every
// notification in one place across all 6 real types, each dismissible on
// its own tap rather than only in bulk per feature — ported from
// citinet-mobile's app/notifications.tsx (same backend, same behavior).
//
// A tapped row doesn't disappear on the spot — GET /api/notifications/unread
// only ever returns unread rows, so once markById succeeds server-side it'd
// vanish from the very next load() regardless of what this screen does
// locally. useRecentlyReadNotifications is what keeps it visible a while
// longer: a locally-persisted "read, but still showing" pool, merged below
// with the live unread pool for render — tapping through to an item
// shouldn't feel like it deleted the notification.
export function NotificationsScreen({ onBack, onNavigate }: NotificationsScreenProps) {
  const { currentHub } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const hubName = currentHub?.name || hubSlug || 'this hub';

  const [notifications, setNotifications] = useState<UnreadNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { recentlyRead, markRead } = useRecentlyReadNotifications(hubSlug);

  const load = useCallback(() => {
    if (!hubSlug) return;
    setLoading(true);
    setError(null);
    notificationsService.getUnread(hubSlug)
      .then(setNotifications)
      .catch(() => setError("Couldn't load notifications."))
      .finally(() => setLoading(false));
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);

  // Featured — admin-curated content, formerly a bell popover on the Atlas
  // home screen (see AtlasScreen.tsx's history); moved here so Atlas doesn't
  // need its own separate notification-adjacent affordance.
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
  useEffect(() => {
    if (!hubSlug) return;
    featuredService.getFeatured(hubSlug).then(setFeaturedItems).catch(() => {});
  }, [hubSlug]);

  function handleFeaturedPress(item: FeaturedItem) {
    if (item.type === 'post' && item.refId) onNavigate(`feed/${item.refId}`);
  }

  // Recently-read wins the dedupe — if a mark-read call failed server-side
  // and the item is still coming back from GET /unread, this is what stops
  // it rendering twice (once "read", once "unread") until the server
  // catches up.
  const recentlyReadIds = new Set(recentlyRead.map(r => r.notification.id));
  const rows = [
    ...notifications.filter(n => !recentlyReadIds.has(n.id)).map(n => ({ ...n, isRead: false })),
    ...recentlyRead.map(r => ({ ...r.notification, isRead: true })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  function handlePress(n: UnreadNotification) {
    markRead(n);
    notificationsService.markById(hubSlug, n.id).catch(() => {});
    const target = notificationTarget(n);
    if (target) onNavigate(target);
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="cn-glass sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="w-10 h-10 cn-action bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold cn-text-1 leading-none">Notifications</h1>
            <p className="text-xs cn-text-3 mt-1">
              {notifications.length === 0 ? 'All caught up' : `${notifications.length} unread`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="w-9 h-9 rounded-lg cn-surface-2 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 cn-text-2 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Featured — admin-curated, shown whenever there's anything, independent
            of the personal notifications list below. */}
        {featuredItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Star className="w-3.5 h-3.5 cn-text-4" />
              <h2 className="text-xs font-semibold cn-text-3 uppercase tracking-wide">Featured</h2>
            </div>
            {featuredItems.map(item => (
              <button
                key={item.id}
                onClick={() => handleFeaturedPress(item)}
                className="w-full flex flex-col gap-0.5 p-3 rounded-2xl border cn-border cn-glass text-left transition-all hover:border-black/15 dark:hover:border-white/15"
              >
                {item.title && <p className="text-sm font-semibold cn-text-1 leading-snug line-clamp-2">{item.title}</p>}
                {item.caption && <p className="text-xs cn-text-3 line-clamp-2">{item.caption}</p>}
                {/* Media indicator only — no thumbnail/icon, kept deliberately
                    plain and secondary rather than a visual preview. */}
                {(item.mediaFileName || item.imageUrl) && (
                  <p className="text-[10px] cn-text-4 mt-0.5">Includes attachment</p>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {featuredItems.length > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <Bell className="w-3.5 h-3.5 cn-text-4" />
              <h2 className="text-xs font-semibold cn-text-3 uppercase tracking-wide">Notifications</h2>
            </div>
          )}
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20 cn-text-4 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error && rows.length === 0 ? (
          <div className="cn-glass rounded-2xl text-center py-20">
            <p className="text-sm font-medium cn-text-3">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="cn-glass rounded-2xl text-center py-20">
            <CheckCircle2 className="w-10 h-10 cn-text-4 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium cn-text-3">You're all caught up</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(n => {
              const { title, subtitle } = notificationCopy(n, hubName);
              const { Icon, className } = notificationIcon(n.type);
              return (
                <button
                  key={n.id}
                  onClick={() => handlePress(n)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border cn-border cn-glass text-left transition-all hover:border-black/15 dark:hover:border-white/15 ${n.isRead ? 'opacity-55' : ''}`}
                >
                  <span className={`w-10 h-10 rounded-xl ${className} flex items-center justify-center text-white shrink-0`}>
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold cn-text-1 leading-snug line-clamp-2">{title}</p>
                    {subtitle && <p className="text-xs cn-text-3 mt-0.5 line-clamp-2">{subtitle}</p>}
                    <p className="text-[11px] cn-text-4 mt-1">{timeAgo(new Date(n.created_at))}</p>
                  </div>
                  {/* No unread dot for a lingering read row — the dimmed tile
                      above is the only visual cue distinguishing it from a
                      genuine unread one, matching citinet-mobile's rowRead. */}
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
