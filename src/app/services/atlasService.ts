import type { AtlasPin, AtlasPinAttachment, AtlasPinCategory, AtlasPinReply } from '../types/atlas';
import { hubService } from './hubService';

class AtlasService {
  private getConn(hubSlug: string): { baseUrl: string; token: string } | null {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    const baseUrl = conn.hub.tunnelUrl || 'http://localhost:9090';
    return { baseUrl, token: conn.user.authToken };
  }

  private headers(token: string): HeadersInit {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  private rowToPin(row: Record<string, unknown>, hubSlug: string): AtlasPin {
    const rawAttachments = row.attachments as Record<string, unknown>[] | undefined;
    return {
      id:            row.id as string,
      hubSlug,
      authorId:      row.author_id as string,
      authorUsername: row.author_username as string,
      latitude:      row.latitude as number,
      longitude:     row.longitude as number,
      title:         row.title as string,
      description:   row.description as string | undefined,
      category:      row.category as AtlasPinCategory,
      imageFileName: row.image_file_name as string | undefined,
      eventPostId:   row.event_post_id as string | undefined,
      replyCount:    row.reply_count as number | undefined,
      attachments:   rawAttachments?.length
        ? rawAttachments.map((a): AtlasPinAttachment => ({
            fileId:   a.file_id as string,
            fileName: a.file_name as string,
            mimeType: a.mime_type as string | undefined,
            size:     a.size as number,
          }))
        : undefined,
      createdAt:     row.created_at as string,
    };
  }

  async getPins(hubSlug: string): Promise<AtlasPin[]> {
    const conn = this.getConn(hubSlug);
    if (!conn) return [];
    try {
      const res = await fetch(`${conn.baseUrl}/api/atlas/pins`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.pins as Record<string, unknown>[]).map(r => this.rowToPin(r, hubSlug));
    } catch {
      return [];
    }
  }

  async addPin(
    hubSlug: string,
    _authorUsername: string,
    data: {
      latitude: number;
      longitude: number;
      title: string;
      description?: string;
      category: AtlasPinCategory;
      imageFileName?: string;
      attachmentIds?: string[];
      eventPostId?: string;
    }
  ): Promise<AtlasPin> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const { imageFileName, attachmentIds, eventPostId, ...rest } = data;
    const res = await fetch(`${conn.baseUrl}/api/atlas/pins`, {
      method: 'POST',
      headers: this.headers(conn.token),
      body: JSON.stringify({ ...rest, image_file_name: imageFileName, attachment_ids: attachmentIds, event_post_id: eventPostId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add pin' }));
      throw new Error(err.error ?? 'Failed to add pin');
    }
    return this.rowToPin(await res.json(), hubSlug);
  }

  async updatePin(
    hubSlug: string,
    pinId: string,
    data: {
      title: string;
      description?: string;
      category: AtlasPinCategory;
      imageFileName?: string;
      attachmentIds?: string[];
    }
  ): Promise<AtlasPin> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const { imageFileName, attachmentIds, ...rest } = data;
    const res = await fetch(`${conn.baseUrl}/api/atlas/pins/${pinId}`, {
      method: 'PATCH',
      headers: this.headers(conn.token),
      body: JSON.stringify({ ...rest, image_file_name: imageFileName, attachment_ids: attachmentIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update pin' }));
      throw new Error(err.error ?? 'Failed to update pin');
    }
    return this.rowToPin(await res.json(), hubSlug);
  }

  async deletePin(hubSlug: string, pinId: string): Promise<void> {
    const conn = this.getConn(hubSlug);
    if (!conn) return;
    await fetch(`${conn.baseUrl}/api/atlas/pins/${pinId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${conn.token}` },
    });
  }

  async listReplies(hubSlug: string, pinId: string): Promise<AtlasPinReply[]> {
    const conn = this.getConn(hubSlug);
    if (!conn) return [];
    try {
      const res = await fetch(`${conn.baseUrl}/api/atlas/pins/${pinId}/replies`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.replies as AtlasPinReply[];
    } catch {
      return [];
    }
  }

  async addReply(
    hubSlug: string,
    pinId: string,
    body: string,
    replyToReplyId?: string | null,
    replyToUserId?: string | null,
  ): Promise<AtlasPinReply> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/atlas/pins/${pinId}/replies`, {
      method: 'POST',
      headers: this.headers(conn.token),
      body: JSON.stringify({ body, reply_to_reply_id: replyToReplyId ?? null, reply_to_user_id: replyToUserId ?? null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to post comment' }));
      throw new Error(err.error ?? 'Failed to post comment');
    }
    return res.json();
  }
}

export const atlasService = new AtlasService();
