/**
 * Which items the Home feed shows — pure logic, no React, no network.
 *
 * One card per feature area: Feed posts, Events, Atlas, Marketplace, Initiatives
 * (Files and Notes are deliberately left out). Per area:
 *
 *  1. Nothing the signed-in member made themselves.
 *  2. Default: the latest item in that area.
 *  2b. Unseen first: items the member hasn't opened are preferred; once EVERYTHING
 *      eligible has been seen the rule switches itself off and the whole pool is
 *      used again, so a card never goes empty just because they're caught up.
 *  3. Exception: for items that can take likes/comments, any with likes OR comments
 *     >= 5% of the hub's member count (at least 1) takes precedence over "latest",
 *     and among those the latest wins. (Atlas pins only have comments; listings and
 *     initiative updates have neither, so they're always just the latest.)
 *
 * An area with nothing eligible is skipped; cards are ordered by recency across areas.
 */

import { postCategoryLabel } from './postCategory';
import type { AtlasPin } from '../types/atlas';
import type { HubListing, HubPost } from '../types/hub';
import type { InitiativeActivityEntry } from '../services/initiativesService';
import type { ExternalItem } from '../services/externalFeedService';

export type HomeCardAction =
  | { type: 'post'; id: string }
  | { type: 'pin'; id: string }
  | { type: 'listing'; id: string }
  | { type: 'initiative'; initiativeId: string; updateId: string; kind: string; taskId?: string }
  /** Public-web item: opens `url` in a new browser tab (never inside Citinet). */
  | { type: 'external'; id: string; url: string };

export interface InitiativeUpdateRow {
  entry: InitiativeActivityEntry;
  initiativeId: string;
  initiativeTitle: string;
  initiativeCategory: string;
  initiativeColor: 'purple' | 'emerald' | 'blue' | 'amber';
  bannerMode: 'image' | 'gradient' | 'solid' | null;
  hasBannerImage: boolean;
  gradientFrom: string | null;
  gradientTo: string | null;
  /** Resolved from the activity text when it names a specific task (see the hook). */
  taskId?: string;
}

export interface HomeCardData {
  key: string;
  /** Brand-colored eyebrow, e.g. "EVENT" / "DISCUSSION". */
  label: string;
  /** Why this was chosen, shown only when the engagement boost beat plain "latest". */
  highlight?: string | null;
  title: string;
  caption?: string | null;
  authorUsername?: string | null;
  authorId?: string | null;
  mediaFileName?: string | null;
  listing?: { category: string; vendor: { id: string; name: string; logoFileName: string | null } };
  initiative?: Pick<InitiativeUpdateRow, 'initiativeId' | 'initiativeCategory' | 'initiativeColor' | 'bannerMode' | 'hasBannerImage' | 'gradientFrom' | 'gradientTo'>;
  atlasPin?: AtlasPin;
  /** Where an Outside card points, so the card can say "opens bbc.com" before the click. */
  external?: { sourceLabel: string; host: string };
  event?: { location: string | null; lat: number | null; lng: number | null; pin: AtlasPin | null };
  action: HomeCardAction;
  timestamp: number;
}

export interface HomeFeedInput {
  posts: HubPost[];
  events: HubPost[];
  pins: AtlasPin[];
  listings: HubListing[];
  initiativeUpdates: InitiativeUpdateRow[];
  memberCount: number;
  myVendorId: string | null;
  /** Already ranked for this member by the hub (their topics/mutes applied server-side). */
  externalItems?: ExternalItem[];
}

export interface HomeFeedViewer {
  userId?: string;
  /** Lower-cased username/display name — initiative activity rows only carry a free-text actor name. */
  names: string[];
  seenPostIds: ReadonlySet<string>;
  seenPinIds: ReadonlySet<string>;
  seenListingIds: ReadonlySet<string>;
  seenUpdateIds: ReadonlySet<string>;
  seenExternalIds?: ReadonlySet<string>;
}

const newest = <T,>(items: T[], at: (item: T) => string): T | undefined =>
  [...items].sort((a, b) => new Date(at(b)).getTime() - new Date(at(a)).getTime())[0];

/** Filled in by `pick`: true when the engagement boost chose something other than the plain newest eligible item. */
export interface PickInfo { boosted?: boolean }

export const POPULAR_LABEL = 'Popular in your hub';

/** `engagement` omitted → this item type can't take likes/comments. `seen` omitted → no seen rule. */
export function pick<T>(
  items: T[],
  at: (item: T) => string,
  threshold: number,
  engagement?: (item: T) => number[],
  seen?: (item: T) => boolean,
  info?: PickInfo,
): T | undefined {
  const unseen = seen ? items.filter((item) => !seen(item)) : items;
  const pool = unseen.length > 0 ? unseen : items;
  const popular = engagement ? pool.filter((item) => engagement(item).some((n) => n >= threshold)) : [];
  const chosen = newest(popular.length > 0 ? popular : pool, at);
  if (info) info.boosted = chosen !== undefined && chosen !== newest(pool, at);
  return chosen;
}

/** The pin a "Create an event" flow linked to this event, else one whose title matches its location text. */
export function pinForEvent(event: HubPost, pins: AtlasPin[]): AtlasPin | null {
  const linked = pins.find((p) => p.eventPostId === event.id);
  if (linked) return linked;
  const loc = event.event_location?.trim().toLowerCase();
  return loc ? (pins.find((p) => p.title.trim().toLowerCase() === loc) ?? null) : null;
}

export function selectHomeCards(input: HomeFeedInput, viewer: HomeFeedViewer): HomeCardData[] {
  const { posts, events, pins, listings, initiativeUpdates, memberCount, myVendorId } = input;
  const me = viewer.userId;
  // Min 1 so zero-engagement items never count as "popular" in a tiny hub.
  const threshold = Math.max(1, Math.ceil(memberCount * 0.05));
  const cards: HomeCardData[] = [];

  const postInfo: PickInfo = {};
  const post = pick(
    posts.filter((p) => p.category !== 'EVENT' && p.author_id !== me),
    (p) => p.created_at,
    threshold,
    (p) => [p.like_count ?? 0, p.reply_count ?? 0],
    // Server flag OR this browser's own record: Home refetches when it regains focus, and a
    // quick trip back from a post can outrun the view request — the local set is already current.
    (p) => !!p.my_viewed || viewer.seenPostIds.has(p.id),
    postInfo,
  );
  if (post) {
    cards.push({
      key: `post-${post.id}`,
      label: postCategoryLabel(post.category),
      highlight: postInfo.boosted ? POPULAR_LABEL : null,
      title: post.title || post.body?.slice(0, 60) || 'Untitled',
      caption: post.title ? post.body : null,
      authorUsername: post.author_username,
      authorId: post.author_id,
      mediaFileName: post.media_file_name,
      action: { type: 'post', id: post.id },
      timestamp: new Date(post.created_at).getTime(),
    });
  }

  // `events` (upcoming) ∪ EVENT-category `posts` not already in it.
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const eventIds = new Set(events.map((e) => e.id));
  const eventInfo: PickInfo = {};
  const event = pick(
    [...events, ...posts.filter((p) => p.category === 'EVENT' && !eventIds.has(p.id))].filter((e) => e.author_id !== me),
    (e) => e.created_at,
    threshold,
    (e) => [e.like_count ?? 0, e.reply_count ?? 0],
    // The upcoming-events endpoint doesn't return my_viewed (only the posts list does), so also look
    // the event up among `posts` for the server's flag, plus this browser's own record.
    (e) => !!e.my_viewed || !!postsById.get(e.id)?.my_viewed || viewer.seenPostIds.has(e.id),
    eventInfo,
  );
  if (event) {
    cards.push({
      key: `event-${event.id}`,
      label: 'Event',
      highlight: eventInfo.boosted ? POPULAR_LABEL : null,
      title: event.title ?? 'Event',
      caption: event.body,
      authorUsername: event.author_username,
      authorId: event.author_id,
      mediaFileName: event.media_file_name,
      event: {
        location: event.event_location ?? null,
        lat: event.event_lat ?? null,
        lng: event.event_lng ?? null,
        pin: pinForEvent(event, pins),
      },
      action: { type: 'post', id: event.id },
      timestamp: new Date(event.created_at).getTime(),
    });
  }

  const pinInfo: PickInfo = {};
  const pin = pick(
    pins.filter((p) => p.authorId !== me),
    (p) => p.createdAt,
    threshold,
    (p) => [p.replyCount ?? 0],
    (p) => viewer.seenPinIds.has(p.id),
    pinInfo,
  );
  if (pin) {
    cards.push({
      key: `pin-${pin.id}`,
      label: 'Atlas Pin',
      highlight: pinInfo.boosted ? POPULAR_LABEL : null,
      title: pin.title,
      caption: pin.description,
      authorUsername: pin.authorUsername,
      authorId: pin.authorId,
      mediaFileName: pin.imageFileName,
      atlasPin: pin,
      action: { type: 'pin', id: pin.id },
      timestamp: new Date(pin.createdAt).getTime(),
    });
  }

  const listing = pick(
    listings.filter((l) => l.is_active !== false && (!myVendorId || l.vendor_id !== myVendorId)),
    (l) => l.created_at,
    threshold,
    undefined,
    (l) => viewer.seenListingIds.has(l.id),
  );
  if (listing) {
    cards.push({
      key: `listing-${listing.id}`,
      label: 'Marketplace',
      title: listing.title,
      caption: listing.description,
      authorUsername: null,
      mediaFileName: listing.image_file_name,
      listing: {
        category: listing.category,
        vendor: { id: listing.vendor_id, name: listing.vendor_name ?? 'Vendor', logoFileName: listing.vendor_logo_file_name ?? null },
      },
      action: { type: 'listing', id: listing.id },
      timestamp: new Date(listing.created_at).getTime(),
    });
  }

  // Initiative activity rows only carry a free-text actor name (no user id), so "mine" is a
  // best-effort match on username/display name.
  const update = pick(
    initiativeUpdates.filter((u) => !u.entry.actor_name || !viewer.names.includes(u.entry.actor_name.trim().toLowerCase())),
    (u) => u.entry.created_at,
    threshold,
    undefined,
    (u) => viewer.seenUpdateIds.has(u.entry.id),
  );
  if (update) {
    cards.push({
      key: `initiative-${update.entry.id}`,
      label: 'Project',
      title: update.entry.text,
      caption: update.initiativeTitle,
      // Every activity entry has someone responsible for it — show them, like the other cards show their author.
      authorUsername: update.entry.actor_name || null,
      authorId: update.entry.actor_id ?? null,
      initiative: update,
      action: { type: 'initiative', initiativeId: update.initiativeId, updateId: update.entry.id, kind: update.entry.kind, taskId: update.taskId },
      timestamp: new Date(update.entry.created_at).getTime(),
    });
  }

  // Outside: the hub already ranked these for this member, so "best" = first, not newest. Prefer
  // one they haven't opened; once they've opened them all the rule switches off (never empty).
  const outsideItems = input.externalItems ?? [];
  const seenExternal = viewer.seenExternalIds;
  const outside = outsideItems.find((i) => !seenExternal?.has(i.id)) ?? outsideItems[0];
  if (outside) {
    let host = '';
    try { host = new URL(outside.url).hostname.replace(/^www\./, ''); } catch { /* url was validated server-side; leave blank */ }
    cards.push({
      key: `external-${outside.id}`,
      label: `Outside · ${outside.source.label}`,
      title: outside.title,
      caption: outside.excerpt || null,
      authorUsername: null,
      external: { sourceLabel: outside.source.label, host },
      action: { type: 'external', id: outside.id, url: outside.url },
      timestamp: outside.published_at ? new Date(outside.published_at).getTime() : Date.now(),
    });
  }

  return cards.sort((a, b) => b.timestamp - a.timestamp);
}
