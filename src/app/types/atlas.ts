import { MapPin, AlertTriangle, Ban, Building2, Star, HandHeart, Sprout, Calendar, type LucideIcon } from 'lucide-react';

export type AtlasPinCategory = 'meetup' | 'safety' | 'avoid' | 'infrastructure' | 'poi' | 'aid' | 'green' | 'event';

export interface AtlasPinAttachment {
  fileId: string;
  fileName: string;
  mimeType?: string;
  size: number;
}

export interface AtlasPin {
  id: string;
  hubSlug: string;
  authorId: string;
  authorUsername: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  category: AtlasPinCategory;
  imageFileName?: string;
  /** Extra media/files attached at creation or edit time — photos, videos, or
   * other documents beyond the single cover photo in `imageFileName`. */
  attachments?: AtlasPinAttachment[];
  /** Set only for pins created alongside a "Create an event" hub_posts EVENT
   * row — lets the pin detail view offer a real, shared RSVP against that
   * post instead of just showing this as a plain pin. */
  eventPostId?: string;
  /** Comment count (hub_atlas_pin_replies), included on list fetches so the
   * detail view's comment header doesn't need an extra round trip to show
   * an initial count. */
  replyCount?: number;
  createdAt: string;
}

/** A comment on a pin, or a threaded reply to one — same flat shape (with
 * reply_to_reply_id as the parent pointer) as HubPostReply, just scoped to a
 * pin instead of a hub_posts row. Shares utils/replyTree's generic
 * buildReplyTree/ReplyNode with Feed's own comments. */
export interface AtlasPinReply {
  id: string;
  pin_id: string;
  body: string;
  author_id: string;
  author_username: string;
  created_at: string;
  reply_to_reply_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_username?: string | null;
}

export const ATLAS_CATEGORIES: Record<AtlasPinCategory, {
  label: string;
  emoji: string;
  markerColor: string;
  badgeClass: string;
  /** Gradient (Tailwind `bg-gradient-to-br` stops) used by the Atlas card/detail chrome. */
  gradient: string;
  /** Same gradient as a raw CSS value — used for the Leaflet map marker, which renders
   * outside Tailwind's stylesheet scope so utility classes there can't be relied on. */
  gradientCss: string;
  Icon: LucideIcon;
}> = {
  meetup:         { label: 'Meetup Spot',      emoji: '📍', markerColor: '#3b82f6', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',     gradient: 'from-blue-500 to-blue-600',     gradientCss: 'linear-gradient(135deg, #3b82f6, #2563eb)', Icon: MapPin },
  safety:         { label: 'Safety Alert',     emoji: '⚠️', markerColor: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', gradient: 'from-amber-500 to-orange-600',  gradientCss: 'linear-gradient(135deg, #f59e0b, #ea580c)', Icon: AlertTriangle },
  avoid:          { label: 'Avoid Area',       emoji: '🚧', markerColor: '#ef4444', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',         gradient: 'from-red-500 to-rose-600',      gradientCss: 'linear-gradient(135deg, #ef4444, #e11d48)', Icon: Ban },
  infrastructure: { label: 'Community Space',  emoji: '🏛️', markerColor: '#7c3aed', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', gradient: 'from-violet-500 to-blue-600', gradientCss: 'linear-gradient(135deg, #8b5cf6, #9333ea)', Icon: Building2 },
  poi:            { label: 'Point of Interest', emoji: '⭐', markerColor: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', gradient: 'from-emerald-500 to-teal-600', gradientCss: 'linear-gradient(135deg, #10b981, #0d9488)', Icon: Star },
  aid:            { label: 'Mutual Aid',       emoji: '🤝', markerColor: '#db2777', badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',     gradient: 'from-rose-500 to-pink-600',     gradientCss: 'linear-gradient(135deg, #f43f5e, #db2777)', Icon: HandHeart },
  green:          { label: 'Green Space',      emoji: '🌱', markerColor: '#16a34a', badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', gradient: 'from-green-500 to-emerald-600', gradientCss: 'linear-gradient(135deg, #22c55e, #059669)', Icon: Sprout },
  // Same indigo the old standalone event-marker layer used before events
  // became a real pin category — kept for visual continuity now that it's
  // just another entry here instead of a separate marker type.
  event:          { label: 'Event',            emoji: '📅', markerColor: '#6366f1', badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', gradient: 'from-indigo-500 to-blue-700', gradientCss: 'linear-gradient(135deg, #6366f1, #4338ca)', Icon: Calendar },
};
