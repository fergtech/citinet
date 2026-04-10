import type { HubSpace, HubSpaceMember, HubPost } from '../types/hub';
import { hubService } from './hubService';

class SpacesService {
  private getAuth(hubSlug: string): { headers: Record<string, string>; baseUrl: string } {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn) throw new Error('Hub not found');
    const headers: Record<string, string> = {};
    if (conn.user?.authToken) headers['Authorization'] = `Bearer ${conn.user.authToken}`;
    return { headers, baseUrl: conn.hub.tunnelUrl };
  }

  async listAll(hubSlug: string): Promise<HubSpace[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces`, { headers });
    if (!res.ok) throw new Error(`Failed to load spaces (${res.status})`);
    return res.json();
  }

  async listMine(hubSlug: string): Promise<HubSpace[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/mine`, { headers });
    if (!res.ok) throw new Error(`Failed to load your spaces (${res.status})`);
    return res.json();
  }

  async get(hubSlug: string, spaceSlug: string): Promise<HubSpace> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}`, { headers });
    if (!res.ok) throw new Error(`Space not found`);
    return res.json();
  }

  async create(hubSlug: string, data: { name: string; slug: string; description?: string; visibility?: string }): Promise<HubSpace> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to create space (${res.status})`);
    }
    return res.json();
  }

  async update(hubSlug: string, spaceSlug: string, data: Partial<{ name: string; description: string; visibility: string }>): Promise<HubSpace> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to update space (${res.status})`);
    }
    return res.json();
  }

  async join(hubSlug: string, spaceSlug: string): Promise<{ status: string }> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/join`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to join space`);
    }
    return res.json();
  }

  async leave(hubSlug: string, spaceSlug: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/leave`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to leave space`);
    }
  }

  async getMembers(hubSlug: string, spaceSlug: string): Promise<HubSpaceMember[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/members`, { headers });
    if (!res.ok) throw new Error(`Failed to load members`);
    return res.json();
  }

  async updateMember(hubSlug: string, spaceSlug: string, userId: string, data: { role?: string; status?: string }): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/members/${userId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to update member`);
    }
  }

  async removeMember(hubSlug: string, spaceSlug: string, userId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/members/${userId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to remove member`);
    }
  }

  async invite(hubSlug: string, spaceSlug: string, userId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/invite`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to send invite`);
    }
  }

  async acceptInvite(hubSlug: string, spaceSlug: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/invite/accept`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error(`Failed to accept invite`);
  }

  async getPosts(hubSlug: string, spaceSlug: string): Promise<HubPost[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/posts`, { headers });
    if (!res.ok) throw new Error(`Failed to load posts`);
    return res.json();
  }

  async createPost(hubSlug: string, spaceSlug: string, data: { title: string; body?: string; category?: string }): Promise<HubPost> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/posts`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to create post`);
    }
    return res.json();
  }

  async shareToFeed(hubSlug: string, postId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/posts/${postId}/share-to-feed`, {
      method: 'PATCH',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to share post`);
    }
  }
}

export const spacesService = new SpacesService();
