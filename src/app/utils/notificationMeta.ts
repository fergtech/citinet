import { Send, MessageCircle, Building2, Target, UserPlus, CheckCircle2, Bell, type LucideIcon } from 'lucide-react';
import type { NotificationType, UnreadNotification } from '../services/notificationsService';

// Same icon-tile-with-colored-background convention every other list in this
// app uses (Recent Activity's ACTIVITY_CONFIG, Atlas's category pins) —
// colors are just visually distinct per type, not meaningful beyond that.
// Mirrors citinet-mobile's lib/notifications/meta.ts (same 6 types, SF
// Symbols there swapped for lucide here).
const NOTIFICATION_ICON: Record<NotificationType, { Icon: LucideIcon; className: string }> = {
  message:            { Icon: Send,          className: 'bg-blue-500' },
  reply:               { Icon: MessageCircle, className: 'bg-violet-500' },
  space_invite:        { Icon: Building2,     className: 'bg-teal-500' },
  initiative_invite:   { Icon: Target,        className: 'bg-amber-500' },
  join_request:        { Icon: UserPlus,      className: 'bg-rose-500' },
  account_approved:    { Icon: CheckCircle2,  className: 'bg-emerald-500' },
};

export function notificationIcon(type: NotificationType): { Icon: LucideIcon; className: string } {
  return NOTIFICATION_ICON[type] ?? { Icon: Bell, className: 'bg-slate-500' };
}

// Copy mirrors api/server.js's own emailCopyForNotification (same 6 types,
// same substance) but trimmed for a compact list row.
export function notificationCopy(n: UnreadNotification, hubName: string): { title: string; subtitle?: string } {
  const actor = n.actor_username ? `@${n.actor_username}` : 'Someone';
  switch (n.type) {
    case 'message':
      return { title: `${actor} sent you a message` };
    case 'reply':
      return { title: `${actor} replied to your post` };
    case 'space_invite':
      return { title: `${actor} invited you to a Space` };
    case 'initiative_invite':
      return { title: `${actor} invited you to a project` };
    case 'join_request':
      return { title: `${actor} wants to join ${hubName}`, subtitle: 'Review in Hub Management → Requests' };
    case 'account_approved':
      return { title: `You're in — welcome to ${hubName}`, subtitle: 'You can log in and use the hub now.' };
    default:
      return { title: 'New notification' };
  }
}

// null means "nothing to navigate to" — tapping the row still dismisses it,
// it just doesn't also navigate. Screen strings match onNavigate's existing
// contract used across the app (App.tsx's hubPath(`/${screen}`)).
export function notificationTarget(n: UnreadNotification): string | null {
  switch (n.type) {
    case 'message':
      // ref_id is the conversation id — MessagesScreen already reads this
      // exact sessionStorage key (see Dashboard's old featured/activity
      // deep-link and MessagesScreen.tsx's own mount effect).
      if (!n.ref_id) return null;
      sessionStorage.setItem('citinet-deeplink-message-conv', n.ref_id);
      return 'messages';
    case 'reply':
      return n.ref_id ? `feed/${n.ref_id}` : null;
    case 'space_invite':
      // ref_id is the space's slug, not an id.
      return n.ref_id ? `spaces/${n.ref_id}` : null;
    case 'initiative_invite':
      return n.ref_id ? `initiatives/${n.ref_id}` : null;
    case 'join_request':
      // Routes to Hub Management's Requests tab (see HubManagementScreen's
      // own deep-link read of this same sessionStorage key).
      sessionStorage.setItem('citinet-deeplink-hub-tab', 'requests');
      return 'hub-management';
    case 'account_approved':
    default:
      return null;
  }
}
