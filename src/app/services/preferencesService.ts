import { hubService } from './hubService';

export interface UserPreferences {
  /** 'default' (or unset) is the true default — the classic Citinet dot-grid
   *  wallpaper. 'solid' names the theme-aware plain color, kept as an explicit
   *  "Classic" opt-in rather than the fallback. */
  background_type?: 'solid' | 'default' | 'color' | 'image' | 'preset';
  background_value?: string;
  background_brightness?: string;
  /** Absence means enabled — mirrors the server's opt-out default. */
  email_notifications?: 'true' | 'false';
}

class PreferencesService {
  private getAuth(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    return { baseUrl: conn.hub.tunnelUrl, token: (conn as any).user?.authToken };
  }

  async getPreferences(hubSlug: string): Promise<UserPreferences> {
    try {
      const { baseUrl, token } = this.getAuth(hubSlug);
      const res = await fetch(`${baseUrl}/api/me/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  async updatePreferences(hubSlug: string, prefs: Partial<UserPreferences>): Promise<void> {
    const { baseUrl, token } = this.getAuth(hubSlug);
    await fetch(`${baseUrl}/api/me/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(prefs),
    });
  }

  async uploadBackgroundImage(hubSlug: string, file: File): Promise<string> {
    const { baseUrl, token } = this.getAuth(hubSlug);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${baseUrl}/api/me/preferences/background-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const text = await res.text();
    let data: { name?: string; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.status === 404 ? 'Hub needs an update — rebuild required' : `Server error (${res.status})`);
    }
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.name as string;
  }

  getBackgroundImageUrl(hubSlug: string, fileName: string): string | null {
    return hubService.getPublicFileUrl(hubSlug, fileName);
  }
}

export const preferencesService = new PreferencesService();
