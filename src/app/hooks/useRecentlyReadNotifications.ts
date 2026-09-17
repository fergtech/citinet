import { useCallback, useSyncExternalStore } from 'react';
import type { UnreadNotification } from '../services/notificationsService';

// How long a notification keeps showing in the Notifications screen after
// being read, and the max number of read-but-still-visible items kept at
// once — whichever limit is hit first prunes it. GET /api/notifications/unread
// only ever returns unread rows, so a tapped notification would otherwise
// vanish from the very next load — this is what keeps it visible a while
// longer instead of making a tap feel like it deleted the notification.
// Ported from citinet-mobile's lib/notifications/read-retention.ts (same
// product behavior, localStorage here instead of AsyncStorage).
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_RETAINED = 25;

export interface RetainedNotification {
  notification: UnreadNotification;
  // Epoch ms this device marked it read — not a server timestamp (the
  // server's `read` column is a plain boolean with no read_at of its own).
  readAt: number;
}

function storageKey(hubSlug: string): string {
  return `citinet-notifications-recently-read.${hubSlug}`;
}

const EMPTY: RetainedNotification[] = [];
const cache = new Map<string, RetainedNotification[]>();
const listeners = new Map<string, Set<() => void>>();

function getListeners(hubSlug: string): Set<() => void> {
  let set = listeners.get(hubSlug);
  if (!set) {
    set = new Set();
    listeners.set(hubSlug, set);
  }
  return set;
}

function notify(hubSlug: string) {
  getListeners(hubSlug).forEach(fn => fn());
}

// Drops anything past RETENTION_MS old, then — if still over MAX_RETAINED —
// the oldest-read of what's left.
function prune(entries: RetainedNotification[]): RetainedNotification[] {
  const now = Date.now();
  const fresh = entries.filter(e => now - e.readAt <= RETENTION_MS);
  fresh.sort((a, b) => b.readAt - a.readAt);
  return fresh.slice(0, MAX_RETAINED);
}

function persist(hubSlug: string, entries: RetainedNotification[]) {
  cache.set(hubSlug, entries);
  notify(hubSlug);
  try {
    localStorage.setItem(storageKey(hubSlug), JSON.stringify(entries));
  } catch { /* private-window/quota — in-memory cache still works this session */ }
}

function ensureLoaded(hubSlug: string) {
  if (cache.has(hubSlug)) return;
  try {
    const raw = localStorage.getItem(storageKey(hubSlug));
    const parsed = raw ? (JSON.parse(raw) as RetainedNotification[]) : [];
    cache.set(hubSlug, prune(parsed));
  } catch {
    cache.set(hubSlug, []);
  }
}

export function useRecentlyReadNotifications(hubSlug: string): {
  recentlyRead: RetainedNotification[];
  markRead: (notification: UnreadNotification) => void;
} {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!hubSlug) return () => {};
      const set = getListeners(hubSlug);
      set.add(callback);
      ensureLoaded(hubSlug);
      return () => set.delete(callback);
    },
    [hubSlug],
  );

  const getSnapshot = useCallback(() => (hubSlug ? (cache.get(hubSlug) ?? EMPTY) : EMPTY), [hubSlug]);

  const recentlyRead = useSyncExternalStore(subscribe, getSnapshot);

  const markRead = useCallback(
    (notification: UnreadNotification) => {
      if (!hubSlug) return;
      const current = cache.get(hubSlug) ?? [];
      // Upsert, not append — replacing rather than duplicating is cheap
      // insurance against a double-tap or a re-render racing the server call.
      const withoutExisting = current.filter(e => e.notification.id !== notification.id);
      persist(hubSlug, prune([...withoutExisting, { notification, readAt: Date.now() }]));
    },
    [hubSlug],
  );

  return { recentlyRead, markRead };
}
