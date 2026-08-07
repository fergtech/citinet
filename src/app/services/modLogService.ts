import { hubService } from './hubService';

export interface ModLogEntry {
  id:               string;
  action_type:      string;
  target_type:      string | null;
  target_id:        string | null;
  target_name:      string | null;
  reason:           string | null;
  meta:             Record<string, unknown> | null;
  created_at:       string;
  actor_id:         string | null;
  actor_username:   string | null;
  actor_avatar_url: string | null;
}

class ModLogService {
  private getConn(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return { baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090', token: conn.user.authToken };
  }

  async list(hubSlug: string, offset = 0, limit = 50): Promise<{ entries: ModLogEntry[]; total: number }> {
    const conn = this.getConn(hubSlug);
    if (!conn) return { entries: [], total: 0 };
    try {
      const res = await fetch(`${conn.baseUrl}/api/mod-log?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return { entries: [], total: 0 };
      return await res.json();
    } catch {
      return { entries: [], total: 0 };
    }
  }

  /** Member-visible subset: vote (poll) actions only, no mod/admin required. */
  async listDecisions(hubSlug: string, offset = 0, limit = 50): Promise<{ entries: ModLogEntry[]; total: number }> {
    const conn = this.getConn(hubSlug);
    if (!conn) return { entries: [], total: 0 };
    try {
      const res = await fetch(`${conn.baseUrl}/api/decisions?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return { entries: [], total: 0 };
      return await res.json();
    } catch {
      return { entries: [], total: 0 };
    }
  }
}

export const modLogService = new ModLogService();
