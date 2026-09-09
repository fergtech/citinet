import { useState, useEffect, useCallback, useRef } from 'react';
import { hubService } from '../services/hubService';
import { atlasService } from '../services/atlasService';
import { spacesService } from '../services/spacesService';
import { readCache, writeCache } from '../utils/dataCache';
import type { LiveCommsItem } from '../types/hub';

const CACHE_KEY = 'activity-feed';

export type ActivityType =
  | 'discussion'
  | 'announcement'
  | 'event'
  | 'project'
  | 'request'
  | 'file_shared'
  | 'neighbor_joined'
  | 'pin_added'
  | 'space_created'
  | 'live_broadcast';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actor: string;
  /** Uploaded avatar URL for the actor, if available */
  actorAvatarUrl?: string;
  /** Actor's last presence heartbeat — powers the "who's online" dot, same field/threshold as the hub-wide online count and the Messages screen */
  actorLastSeenAt?: string | null;
  summary: string;
  title: string;
  timestamp: Date;
  navigateTo: string;
  /** Raw ID of the underlying item (post UUID, file name, pin ID) */
  itemId?: string;
  /** If present, render a CTA button with this label */
  cta?: string;
  /** Reply count for post-type activities */
  replyCount?: number;
  /** Resolved image/video URL — post media or an image-type file share. Card
   *  renders this as a thumbnail/banner instead of the plain type icon. */
  mediaUrl?: string;
  mediaKind?: 'image' | 'video';
  /** Non-image file shares: extension + byte size for the document-card preview */
  fileExt?: string;
  fileSize?: number;
  /** A body snippet distinct from `title`, shown as a quoted excerpt for
   *  text-only posts that have both a title and body. */
  excerpt?: string;
  /** EVENT-only fields, mirrored from HubPost */
  eventDate?: string | null;
  eventLocation?: string | null;
  rsvpCount?: number;
  /** LIVE_BROADCAST-only: the raw LiveKit room item, carried through so the
   *  click handler can join it directly (BroadcastContext.joinAsViewer)
   *  instead of just navigating to a screen that happens to show it too. */
  liveBroadcast?: LiveCommsItem;
}

function mediaKindForName(name: string): 'image' | 'video' {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) ? 'video' : 'image';
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function friendlyFileLabel(mimeType?: string, fileName?: string): string {
  const mime = mimeType?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'Shared an Image';
  if (mime.startsWith('video/')) return 'Shared a Video';
  if (mime.startsWith('audio/')) return 'Shared an Audio File';
  if (mime === 'application/pdf') return 'Shared a PDF';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.endsWith('.sheet')) return 'Shared a Spreadsheet';
  if (mime.includes('document') || mime.includes('word')) return 'Shared a Document';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'Shared a Presentation';
  if (mime.startsWith('text/')) return 'Shared a Text File';
  // Fallback: infer from extension
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','avif','svg'].includes(ext)) return 'Shared an Image';
  if (['mp4','webm','mov','avi','mkv'].includes(ext)) return 'Shared a Video';
  if (['mp3','wav','ogg','flac','aac'].includes(ext)) return 'Shared an Audio File';
  if (ext === 'pdf') return 'Shared a PDF';
  if (['doc','docx'].includes(ext)) return 'Shared a Document';
  if (['xls','xlsx','csv'].includes(ext)) return 'Shared a Spreadsheet';
  if (['zip','rar','7z','tar'].includes(ext)) return 'Shared an Archive';
  return 'Shared a File';
}

const POST_CATEGORY_MAP: Record<string, ActivityType> = {
  DISCUSSION: 'discussion',
  ANNOUNCEMENT: 'announcement',
  EVENT: 'event',
  PROJECT: 'project',
  REQUEST: 'request',
};

// `timestamp` round-trips through JSON as a string, not a real Date — revive
// it back on the way out of the cache.
function reviveActivityItem(item: ActivityItem): ActivityItem {
  return { ...item, timestamp: new Date(item.timestamp) };
}

// Shared by the full refresh() and the lightweight live-only poll below, so
// the two never drift on how a live_broadcast item gets built.
function buildLiveBroadcastItem(
  hubSlug: string,
  item: LiveCommsItem,
  memberByUserId: Record<string, { username: string; last_seen_at?: string | null }>,
): ActivityItem {
  const actor = item.host_username || 'A neighbor';
  return {
    id: `live-${item.room_name}`,
    type: 'live_broadcast',
    actor,
    actorAvatarUrl: hubService.getAvatarUrl(hubSlug, item.host_id) ?? undefined,
    actorLastSeenAt: memberByUserId[item.host_id]?.last_seen_at,
    summary: 'is live now',
    title: item.title || 'Live broadcast',
    // LiveKit's room creation time — falls back to "now" (sorts to the top)
    // on the off chance an older room predates this field.
    timestamp: item.started_at ? new Date(item.started_at) : new Date(),
    navigateTo: 'messages',
    itemId: item.room_name,
    cta: 'Watch Live',
    liveBroadcast: item,
  };
}

export function useActivityFeed(hubSlug: string) {
  // `loading` starts false right along with any cache-seeded items — the
  // caller (Dashboard) hides the real list behind a loading skeleton while
  // this is true, so if it stayed true here the cached items would sit
  // hidden until the very first refresh() settles, defeating the seed.
  const [items, setItems] = useState<ActivityItem[]>(() => {
    const cached = readCache<ActivityItem[]>(hubSlug, CACHE_KEY);
    return cached ? cached.data.map(reviveActivityItem) : [];
  });
  const [loading, setLoading] = useState(() => !readCache<ActivityItem[]>(hubSlug, CACHE_KEY));

  // Populated at the end of each full refresh() — reused by the lightweight
  // live-only poll below so it doesn't need to re-fetch the member list just
  // to resolve a broadcast host's avatar/presence.
  const memberByUserIdRef = useRef<Record<string, { username: string; last_seen_at?: string | null }>>({});

  const refresh = useCallback(async (silent = false) => {
    if (!hubSlug) return;
    if (!silent) setLoading(true);

    const settled = await Promise.allSettled([
      hubService.listPosts(hubSlug),
      hubService.listFiles(hubSlug),
      hubService.listMembers(hubSlug),
      atlasService.getPins(hubSlug),
      spacesService.listAll(hubSlug),
      // No spaceSlug arg — GET /api/comms/live already excludes space-scoped
      // broadcasts/rooms in that case, leaving only hub-wide ones.
      hubService.listLiveComms(hubSlug),
    ]);
    const [postsResult, filesResult, membersResult, pinsResult, spacesResult, liveResult] = settled;

    // Every source failed — almost certainly the hub itself is briefly
    // unreachable (e.g. an admin restarting it), not "there's no activity."
    // Leave whatever's already on screen (fresh or cache-seeded) alone
    // rather than blanking it out with an empty result.
    if (settled.every(r => r.status === 'rejected')) {
      setLoading(false);
      return;
    }

    const raw: ActivityItem[] = [];

    // Build lookup maps from members list
    const memberByUsername: Record<string, { user_id: string; last_seen_at?: string | null }> = {};
    const memberByUserId: Record<string, { username: string; last_seen_at?: string | null }> = {};
    if (membersResult.status === 'fulfilled') {
      for (const m of membersResult.value) {
        memberByUsername[m.username] = m;
        memberByUserId[m.user_id] = m;
      }
      memberByUserIdRef.current = memberByUserId;
    }

    // Helper: build avatar URL via the API endpoint (same as sidebar)
    const avatarUrl = (userId: string): string | undefined => {
      const url = hubService.getAvatarUrl(hubSlug, userId);
      return url ?? undefined;
    };
    const avatarUrlForUsername = (username: string): string | undefined => {
      const member = memberByUsername[username];
      return member ? avatarUrl(member.user_id) : undefined;
    };

    // ── Posts → discussions / announcements / projects / requests
    if (postsResult.status === 'fulfilled') {
      for (const post of postsResult.value.slice(0, 5)) {
        const type: ActivityType = POST_CATEGORY_MAP[post.category?.toUpperCase()] ?? 'discussion';
        const actor = (post as any).author_username || 'A neighbor';
        const mediaUrl = post.media_file_name
          ? (hubService.getPublicFileUrl(hubSlug, post.media_file_name) ?? undefined)
          : (post.media_url ?? undefined);
        const mediaKind = mediaUrl
          ? mediaKindForName(post.media_file_name || post.media_url || '')
          : undefined;
        const hasTitle = !!post.title;
        raw.push({
          id: `post-${post.id}`,
          type,
          actor,
          actorAvatarUrl: avatarUrlForUsername(actor),
          actorLastSeenAt: memberByUsername[actor]?.last_seen_at,
          summary: 'posted',
          title: post.title || post.body?.slice(0, 80) || 'Untitled',
          timestamp: new Date(post.created_at),
          navigateTo: 'feed',
          itemId: post.id,
          replyCount: (post as any).reply_count ?? 0,
          mediaUrl,
          mediaKind,
          // Only shown when there's a real title so this doesn't just repeat it.
          excerpt: hasTitle && post.body ? post.body.slice(0, 160) : undefined,
          eventDate: type === 'event' ? post.event_date : undefined,
          eventLocation: type === 'event' ? post.event_location : undefined,
          rsvpCount: type === 'event' ? post.rsvp_count : undefined,
        });
      }
    }

    // ── Public files → file_shared
    if (filesResult.status === 'fulfilled') {
      const publicFiles = filesResult.value
        .filter(f => f.is_public && f.uploaded_at && !f.name.startsWith('bg-'))
        .slice(0, 3);

      for (const file of publicFiles) {
        const member = file.owner_id ? memberByUserId[file.owner_id] : undefined;
        const actor = member?.username || 'A neighbor';
        const isImage = (file.mime_type ?? '').startsWith('image/')
          || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(file.name.split('.').pop()?.toLowerCase() ?? '');
        raw.push({
          id: `file-${file.id}`,
          type: 'file_shared',
          actor,
          actorAvatarUrl: file.owner_id ? avatarUrl(file.owner_id) : undefined,
          actorLastSeenAt: member?.last_seen_at,
          summary: 'shared a file',
          title: friendlyFileLabel(file.mime_type, file.name),
          timestamp: new Date(file.uploaded_at!),
          navigateTo: 'files',
          itemId: file.name,
          mediaUrl: isImage ? (hubService.getPublicFileUrl(hubSlug, file.name) ?? undefined) : undefined,
          mediaKind: isImage ? 'image' : undefined,
          fileExt: isImage ? undefined : (file.name.split('.').pop()?.toLowerCase() || undefined),
          fileSize: isImage ? undefined : file.size,
        });
      }
    }

    // ── Newest members → neighbor_joined
    if (membersResult.status === 'fulfilled') {
      const sorted = [...membersResult.value]
        .filter(m => m.created_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

      for (const member of sorted) {
        raw.push({
          id: `member-${member.user_id}`,
          type: 'neighbor_joined',
          actor: member.username,
          actorAvatarUrl: avatarUrl(member.user_id),
          actorLastSeenAt: member.last_seen_at,
          summary: 'joined the community',
          title: `@${member.username} is a new neighbor`,
          timestamp: new Date(member.created_at),
          navigateTo: 'discover',
          cta: 'Say Welcome',
        });
      }
    }

    // ── Atlas pins → pin_added
    if (pinsResult.status === 'fulfilled') {
      const recentPins = [...pinsResult.value]
        .filter(p => p.createdAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3);

      for (const pin of recentPins) {
        const actor = pin.authorUsername || 'A neighbor';
        raw.push({
          id: `pin-${pin.id}`,
          type: 'pin_added',
          actor,
          actorAvatarUrl: avatarUrlForUsername(actor),
          actorLastSeenAt: memberByUsername[actor]?.last_seen_at,
          summary: 'pinned to Atlas',
          title: pin.title,
          timestamp: new Date(pin.createdAt),
          navigateTo: 'atlas',
          itemId: pin.id,
        });
      }
    }

    // ── Spaces → space_created
    if (spacesResult.status === 'fulfilled') {
      const recentSpaces = [...spacesResult.value]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

      for (const space of recentSpaces) {
        const creatorId = space.created_by;
        const actor = creatorId ? (memberByUserId[creatorId]?.username ?? 'A neighbor') : 'A neighbor';
        raw.push({
          id: `space-${space.id}`,
          type: 'space_created',
          actor,
          actorAvatarUrl: creatorId ? avatarUrl(creatorId) : undefined,
          actorLastSeenAt: creatorId ? memberByUserId[creatorId]?.last_seen_at : undefined,
          summary: 'created a space',
          title: space.name,
          timestamp: new Date(space.created_at),
          navigateTo: 'spaces',
          cta: 'View Space',
        });
      }
    }

    // ── Hub-wide live broadcasts → live_broadcast
    // Rooms (kind === 'room', open hangouts) are excluded — this is
    // specifically "someone went live", not any open comms session.
    if (liveResult.status === 'fulfilled') {
      for (const item of liveResult.value.filter(i => i.kind === 'broadcast')) {
        raw.push(buildLiveBroadcastItem(hubSlug, item, memberByUserId));
      }
    }

    // Sort newest first, cap at 10
    raw.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const sliced = raw.slice(0, 10);
    setItems(sliced);
    writeCache(hubSlug, CACHE_KEY, sliced);
    setLoading(false);
  }, [hubSlug]);

  useEffect(() => {
    // Silent (no loading skeleton) when cache already seeded `items` above —
    // a background revalidation, not a first paint. A genuinely first-ever
    // visit (no cache yet) still shows the normal loading state.
    refresh(!!readCache<ActivityItem[]>(hubSlug, CACHE_KEY));
  }, [refresh]);

  // Live broadcasts need fresher-than-everything-else treatment: the full
  // refresh() above only runs on mount and manual refresh, so without this a
  // card can keep saying "is live now" for as long as this screen sits open
  // after the broadcast actually ends. Re-checks just the live list (one
  // cheap call, not the full posts/files/members/pins/spaces fan-out) on the
  // same 10s cadence Messages already polls its own "Live now" strip at, and
  // replaces only the live_broadcast entries — everything else is untouched.
  const refreshLive = useCallback(async () => {
    if (!hubSlug) return;
    try {
      const liveComms = await hubService.listLiveComms(hubSlug);
      const liveItems = liveComms
        .filter(i => i.kind === 'broadcast')
        .map(item => buildLiveBroadcastItem(hubSlug, item, memberByUserIdRef.current));
      setItems(prev => {
        const merged = [...prev.filter(i => i.type !== 'live_broadcast'), ...liveItems]
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, 10);
        writeCache(hubSlug, CACHE_KEY, merged);
        return merged;
      });
    } catch {
      // Transient failure — leave whatever's on screen alone, next tick retries.
    }
  }, [hubSlug]);

  useEffect(() => {
    if (!hubSlug) return;
    const t = setInterval(refreshLive, 10_000);
    return () => clearInterval(t);
  }, [hubSlug, refreshLive]);

  return { items, loading, refresh };
}
