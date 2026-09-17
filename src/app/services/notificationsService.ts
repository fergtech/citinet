import { hubService } from './hubService';

export type NotificationFeature = 'feed' | 'messages' | 'hub_management';
export interface NotificationCounts { feed: number; messages: number; hub_management: number }

// hub_notifications.type is a plain VARCHAR(50), not a DB-enforced enum, so a
// value outside these 6 is a real possibility (not just a type-checker
// formality) — every consumer must fall back gracefully, never assume one of
// these. Mirrors citinet-mobile's own NotificationType (lib/api/types.ts) —
// same shared backend, same 6 types.
export type NotificationType = 'message' | 'reply' | 'space_invite' | 'initiative_invite' | 'account_approved' | 'join_request';

export interface UnreadNotification {
  id: number;
  type: NotificationType;
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
    if (!auth?.token) return { feed: 0, messages: 0, hub_management: 0 };
    const res = await fetch(`${auth.baseUrl}/api/notifications/counts`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) return { feed: 0, messages: 0, hub_management: 0 };
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

  /** Marks a single notification row read by id — used by the Notifications
   * screen, where each row is dismissible on its own tap rather than only in
   * bulk per feature (unlike markRead above). Same endpoint citinet-mobile's
   * notifications screen already calls. */
  async markById(hubSlug: string, id: number): Promise<void> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return;
    await fetch(`${auth.baseUrl}/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
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
