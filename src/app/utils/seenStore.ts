import { useSyncExternalStore } from 'react';

/**
 * Small persisted "ids this member has opened in THIS browser" store, for the
 * things the server keeps no per-viewer record of (Atlas pins, marketplace
 * listings, initiative updates). Posts have a server-side record instead
 * (hub_post_views → `my_viewed`), plus a local set here so a view that hasn't
 * reached the server yet — or that failed and is being retried — still counts
 * as seen the moment the member navigates back to Home.
 *
 * Backs the Home feed's "seen" rule: unseen items are preferred, and once
 * everything eligible has been seen the rule switches itself off, so a card
 * never goes empty just because the member is caught up.
 *
 * Local-only: something opened in another browser/device still reads as unseen
 * here. Not hub-scoped — ids are UUIDs, so mixing hubs in one set can't collide.
 * The oldest entries fall off first once past MAX_PERSISTED (a Set keeps
 * insertion order).
 */
const MAX_PERSISTED = 300;

export function createSeenStore(storageKey: string) {
  let seen: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();

  const publish = (next: Set<string>) => {
    seen = next;
    listeners.forEach((l) => l());
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const ids = JSON.parse(raw) as string[];
      // Merge, don't overwrite — an id could have been marked before this read ran.
      publish(new Set([...ids, ...seen]));
    } catch { /* storage unavailable or damaged — start empty */ }
  };
  load();

  // Another tab marking something seen should be reflected here too.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => { if (e.key === storageKey) load(); });
  }

  function markSeen(id: string): void {
    if (!id || seen.has(id)) return;
    const next = new Set(seen);
    next.add(id);
    publish(next);
    try { localStorage.setItem(storageKey, JSON.stringify([...next].slice(-MAX_PERSISTED))); } catch { /* quota/private mode */ }
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  function useSeenIds(): ReadonlySet<string> {
    return useSyncExternalStore(subscribe, () => seen);
  }

  return { markSeen, useSeenIds };
}

export const seenPins = createSeenStore('citinet-seen-pins');
export const seenListings = createSeenStore('citinet-seen-listings');
export const seenInitiativeUpdates = createSeenStore('citinet-seen-initiative-updates');
export const seenPosts = createSeenStore('citinet-seen-posts');
