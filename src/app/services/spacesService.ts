import type { HubSpace, HubSpaceMember, HubPost, HubSpaceFile } from '../types/hub';
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

  async update(hubSlug: string, spaceSlug: string, data: Partial<{ name: string; description: string; visibility: string; web_public: boolean; banner_mode: string; banner_color: string; banner_gradient_from: string; banner_gradient_to: string }>): Promise<HubSpace> {
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

  async createPost(hubSlug: string, spaceSlug: string, data: { title: string; body?: string; category?: string; mediaFile?: File }): Promise<HubPost> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const formData = new FormData();
    formData.append('title', data.title);
    if (data.body) formData.append('body', data.body);
    if (data.category) formData.append('category', data.category);
    if (data.mediaFile) formData.append('media', data.mediaFile);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/posts`, {
      method: 'POST',
      headers, // no Content-Type — let browser set multipart boundary
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to create post`);
    }
    return res.json();
  }

  async getFiles(hubSlug: string, spaceSlug: string): Promise<HubSpaceFile[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/files`, { headers });
    if (!res.ok) throw new Error(`Failed to load files`);
    return res.json();
  }

  async uploadBanner(hubSlug: string, spaceSlug: string, file: File): Promise<{ file_name: string }> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const formData = new FormData();
    formData.append('banner', file);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}/banner`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to upload banner`);
    }
    return res.json();
  }

  getSpaceFileUrl(_hubSlug: string, spaceSlug: string, fileName: string, conn: { tunnelUrl: string; authToken?: string }): string {
    return `${conn.tunnelUrl}/api/spaces/${spaceSlug}/files/${encodeURIComponent(fileName)}`;
  }

  getSpaceBannerUrl(tunnelUrl: string, spaceSlug: string): string {
    return `${tunnelUrl}/api/spaces/${spaceSlug}/banner`;
  }

  getPublicSpaceLink(hubSlug: string, spaceSlug: string): string {
    const conn = hubService.getHubConnection(hubSlug);
    const publicUrl = conn?.hub?.publicTunnelUrl;
    if (publicUrl) {
      const base = import.meta.env.VITE_APP_URL ?? 'https://citinet.cloud';
      return `${base}/share-space/${hubSlug}/${spaceSlug}?src=${encodeURIComponent(publicUrl)}`;
    }
    const lanIp = conn?.hub?.lanIp;
    const swapLocal = (url: string) =>
      lanIp ? url.replace(/localhost|127\.0\.0\.1/, lanIp) : url;
    const srcUrl = swapLocal(conn?.hub?.tunnelUrl ?? '');
    const base = swapLocal(window.location.origin);
    const src = srcUrl ? `?src=${encodeURIComponent(srcUrl)}` : '';
    return `${base}/share-space/${hubSlug}/${spaceSlug}${src}`;
  }

  async deleteSpace(hubSlug: string, spaceSlug: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/spaces/${spaceSlug}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to delete space`);
    }
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
