import type { AtlasPin, AtlasPinCategory } from '../types/atlas';
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
    return {
      id:            row.id as string,
      hubSlug,
      authorUsername: row.author_username as string,
      latitude:      row.latitude as number,
      longitude:     row.longitude as number,
      title:         row.title as string,
      description:   row.description as string | undefined,
      category:      row.category as AtlasPinCategory,
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
    }
  ): Promise<AtlasPin> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/atlas/pins`, {
      method: 'POST',
      headers: this.headers(conn.token),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add pin' }));
      throw new Error(err.error ?? 'Failed to add pin');
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
}

export const atlasService = new AtlasService();
