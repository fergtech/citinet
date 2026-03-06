import { useState, useEffect, useCallback } from 'react';
import { hubService } from '../services/hubService';
import { atlasService } from '../services/atlasService';

export type ActivityType =
  | 'discussion'
  | 'announcement'
  | 'project'
  | 'request'
  | 'file_shared'
  | 'neighbor_joined'
  | 'pin_added';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actor: string;
  summary: string;
  title: string;
  timestamp: Date;
  navigateTo: string;
  /** Raw ID of the underlying item (post UUID, file name, pin ID) */
  itemId?: string;
  /** If present, render a CTA button with this label */
  cta?: string;
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

const POST_CATEGORY_MAP: Record<string, ActivityType> = {
  DISCUSSION: 'discussion',
  ANNOUNCEMENT: 'announcement',
  PROJECT: 'project',
  REQUEST: 'request',
};

export function useActivityFeed(hubSlug: string) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!hubSlug) return;
    setLoading(true);

    const [postsResult, filesResult, membersResult, pinsResult] = await Promise.allSettled([
      hubService.listPosts(hubSlug),
      hubService.listFiles(hubSlug),
      hubService.listMembers(hubSlug),
      atlasService.getPins(hubSlug),
    ]);

    const raw: ActivityItem[] = [];

    // ── Posts → discussions / announcements / projects / requests
    if (postsResult.status === 'fulfilled') {
      for (const post of postsResult.value.slice(0, 5)) {
        const type: ActivityType = POST_CATEGORY_MAP[post.category?.toUpperCase()] ?? 'discussion';
        raw.push({
          id: `post-${post.id}`,
          type,
          actor: (post as any).author_username || 'A neighbor',
          summary: 'posted',
          title: post.title,
          timestamp: new Date(post.created_at),
          navigateTo: 'feed',
          itemId: post.id,
        });
      }
    }

    // ── Public files → file_shared
    if (filesResult.status === 'fulfilled') {
      // Build userId→username map from members if available
      const usernameMap: Record<string, string> = {};
      if (membersResult.status === 'fulfilled') {
        for (const m of membersResult.value) usernameMap[m.user_id] = m.username;
      }

      const publicFiles = filesResult.value
        .filter(f => f.is_public && f.uploaded_at)
        .slice(0, 3);

      for (const file of publicFiles) {
        const actor = (file.owner_id && usernameMap[file.owner_id]) || 'A neighbor';
        raw.push({
          id: `file-${file.id}`,
          type: 'file_shared',
          actor,
          summary: 'shared a file',
          title: file.name,
          timestamp: new Date(file.uploaded_at!),
          navigateTo: 'files',
          itemId: file.name,
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
          summary: 'joined the community',
          title: `@${member.username} is a new neighbor`,
          timestamp: new Date(member.created_at),
          navigateTo: 'neighbors',
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
        raw.push({
          id: `pin-${pin.id}`,
          type: 'pin_added',
          actor: pin.authorUsername || 'A neighbor',
          summary: 'pinned to Atlas',
          title: pin.title,
          timestamp: new Date(pin.createdAt),
          navigateTo: 'atlas',
          itemId: pin.id,
        });
      }
    }

    // Sort newest first, cap at 10
    raw.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setItems(raw.slice(0, 10));
    setLoading(false);
  }, [hubSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, refresh };
}
