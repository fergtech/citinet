import type { FeaturedItem } from '../types/featured';
import { hubService } from './hubService';

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);

function resolveMediaType(row: Record<string, unknown>): 'image' | 'video' | 'gradient' {
  const fn = row.media_file_name as string | null;
  if (fn) {
    const ext = fn.split('.').pop()?.toLowerCase() ?? '';
    if (VIDEO_EXTS.has(ext)) return 'video';
    if (IMAGE_EXTS.has(ext)) return 'image';
  }
  if (row.image_url) return 'image';
  return 'gradient';
}

function rowToItem(row: Record<string, unknown>): FeaturedItem {
  return {
    id:            row.id as string,
    type:          row.type as 'post' | 'custom',
    refId:         (row.ref_id as string | null) ?? undefined,
    title:         row.title as string,
    caption:       (row.caption as string | null) ?? undefined,
    categoryLabel: (row.category_label as string | null) ?? undefined,
    imageUrl:      (row.image_url as string | null) ?? undefined,
    mediaFileName: (row.media_file_name as string | null) ?? undefined,
    mediaType:     resolveMediaType(row),
    displayOrder:  row.display_order as number,
    createdAt:     row.created_at as string,
    authorUsername: (row.author_username as string | null) ?? undefined,
  };
}

class FeaturedService {
  private getConn(hubSlug: string): { baseUrl: string; token: string } | null {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return { baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090', token: conn.user.authToken };
  }

  async getFeatured(hubSlug: string): Promise<FeaturedItem[]> {
    const conn = this.getConn(hubSlug);
    if (!conn) return [];
    try {
      const res = await fetch(`${conn.baseUrl}/api/featured`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items as Record<string, unknown>[]).map(rowToItem);
    } catch {
      return [];
    }
  }

  async pinPost(
    hubSlug: string,
    postId: string,
    overrides?: { title?: string; caption?: string; categoryLabel?: string },
  ): Promise<FeaturedItem> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/featured`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:           'post',
        ref_id:         postId,
        title:          overrides?.title,
        caption:        overrides?.caption,
        category_label: overrides?.categoryLabel,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to pin post' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to pin post');
    }
    return rowToItem(await res.json());
  }

  async addCustom(
    hubSlug: string,
    data: { title: string; caption?: string; categoryLabel?: string; imageUrl?: string },
  ): Promise<FeaturedItem> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/featured`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:           'custom',
        title:          data.title,
        caption:        data.caption,
        category_label: data.categoryLabel,
        image_url:      data.imageUrl,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add card' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to add card');
    }
    return rowToItem(await res.json());
  }

  async remove(hubSlug: string, id: string): Promise<void> {
    const conn = this.getConn(hubSlug);
    if (!conn) return;
    await fetch(`${conn.baseUrl}/api/featured/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${conn.token}` },
    });
  }
}

export const featuredService = new FeaturedService();
