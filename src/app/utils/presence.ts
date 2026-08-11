/** Matches the hub's own "N online" threshold — server.js computes it as
 *  `last_seen_at > NOW() - INTERVAL '5 minutes'`. Every UI surface that shows
 *  a per-member online indicator (Network map, Messages, Dashboard's "Who's
 *  Active") should read presence through this single helper so they can't
 *  drift out of sync with each other or with the server's own count. */
export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

/** Whether a member is currently online, based on their last presence heartbeat
 *  (`last_seen_at`, updated on every authenticated API request). */
export function isOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}
