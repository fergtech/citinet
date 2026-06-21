import { hubService } from './hubService';

export type NotificationFeature = 'feed' | 'messages';
export interface NotificationCounts { feed: number; messages: number }
export interface UnreadNotification {
  id: number;
  type: string;
  actor_id: string | null;
  actor_username: string | null;
  ref_id: string | null;
  created_at: string;
}

class NotificationsService {
  private getAuth(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.hub?.tunnelUrl) return null;
    return { baseUrl: conn.hub.tunnelUrl, token: conn.user?.authToken };
  }

  async getCounts(hubSlug: string): Promise<NotificationCounts> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return { feed: 0, messages: 0 };
    const res = await fetch(`${auth.baseUrl}/api/notifications/counts`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) return { feed: 0, messages: 0 };
    return res.json();
  }

  /** Returns individual unread notifications with ref_ids for deep-linking. */
  async getUnread(hubSlug: string): Promise<UnreadNotification[]> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return [];
    const res = await fetch(`${auth.baseUrl}/api/notifications/unread`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) return [];
    return res.json();
  }

  async markRead(hubSlug: string, feature: NotificationFeature): Promise<void> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return;
    await fetch(`${auth.baseUrl}/api/notifications/mark-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature }),
    }).catch(() => {});
  }

  async markReadByRef(hubSlug: string, refId: string): Promise<void> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return;
    await fetch(`${auth.baseUrl}/api/notifications/mark-read-by-ref`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref_id: refId }),
    }).catch(() => {});
  }
}

export const notificationsService = new NotificationsService();
