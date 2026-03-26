import { hubService } from './hubService';

export type NotificationFeature = 'feed' | 'messages';
export interface NotificationCounts { feed: number; messages: number }

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

  async markRead(hubSlug: string, feature: NotificationFeature): Promise<void> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return;
    await fetch(`${auth.baseUrl}/api/notifications/mark-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature }),
    }).catch(() => {});
  }
}

export const notificationsService = new NotificationsService();
