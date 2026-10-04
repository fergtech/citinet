import { hubService } from './hubService';

/** Fired after anything here marks notifications read, so the bell/tile badge hooks can refetch. */
export const NOTIFICATIONS_CHANGED_EVENT = 'citinet:notifications-changed';

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

  /** Marks unread notifications for one ref_id (a conversation id, post id…)
   * read, optionally scoped to a single `type` — pass 'message' when only
   * the messages themselves have been seen, so an unrelated reaction
   * notification sharing that conversation id isn't silently dismissed.
   * Announces the change so badge hooks refresh right away instead of
   * waiting out their poll interval. */
  async markReadByRef(hubSlug: string, refId: string, type?: NotificationType): Promise<void> {
    const auth = this.getAuth(hubSlug);
    if (!auth?.token) return;
    await fetch(`${auth.baseUrl}/api/notifications/mark-read-by-ref`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(type ? { ref_id: refId, type } : { ref_id: refId }),
    }).catch(() => {});
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }
}

export const notificationsService = new NotificationsService();
