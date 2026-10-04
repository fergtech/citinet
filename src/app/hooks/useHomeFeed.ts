import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readCache, writeCache } from '../utils/dataCache';
import { seenInitiativeUpdates, seenListings, seenPins, seenPosts } from '../utils/seenStore';
import { selectHomeCards, type HomeCardData } from '../utils/homeFeedSelection';
import { EMPTY_SNAPSHOT, SECTION_COUNT, loadHomeSnapshot, type HomeSnapshot } from '../utils/homeFeedData';

const CACHE_KEY = 'home-feed';
/** Don't refetch more often than this when the tab merely regains focus. */
const REFOCUS_MIN_MS = 60_000;

type Snapshot = HomeSnapshot;
const EMPTY = EMPTY_SNAPSHOT;

/**
 * Data + selection behind Home's activity feed (see utils/homeFeedSelection.ts for the rules).
 *
 * Stale-while-revalidate: seeds instantly from the last good snapshot (per hub, in
 * localStorage) so Home isn't blank while the hub answers — or if it is briefly
 * unreachable mid-restart — then refreshes in the background. Each section loads
 * independently: one slow or failing area (say, initiatives) no longer blanks the
 * rest, and a failed section keeps its previous data instead of being overwritten
 * with nothing.
 */
export function useHomeFeed(hubSlug: string, viewer: { userId?: string; names: string[] }): {
  cards: HomeCardData[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [snap, setSnap] = useState<Snapshot>(() => (hubSlug ? readCache<Snapshot>(hubSlug, CACHE_KEY)?.data : null) ?? EMPTY);
  const hasContent = useRef(!!(hubSlug && readCache(hubSlug, CACHE_KEY)));
  const [loading, setLoading] = useState(!hasContent.current);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastLoad = useRef(0);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // Hub switch: reseed from that hub's own cache.
  useEffect(() => {
    if (!hubSlug) return;
    const cached = readCache<Snapshot>(hubSlug, CACHE_KEY);
    hasContent.current = !!cached;
    setSnap(cached?.data ?? EMPTY);
    setLoading(!cached);
  }, [hubSlug]);

  const load = useCallback(async (silent: boolean) => {
    if (!hubSlug || inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    setError(null);
    const { snapshot: next, failures } = await loadHomeSnapshot(hubSlug, snapRef.current);
    setSnap(next);
    lastLoad.current = Date.now();
    hasContent.current = true;
    // Persist only if at least the core content loaded — never snapshot an all-failed round.
    const allFailed = failures.length >= SECTION_COUNT - 2; // core content unreachable
    if (!allFailed) writeCache(hubSlug, CACHE_KEY, next);
    if (allFailed && !silent) setError("Couldn't reach the hub. Showing what was last seen.");
    setLoading(false);
    inFlight.current = false;
  }, [hubSlug]);

  useEffect(() => { void load(hasContent.current); }, [load]);

  // Quietly refresh when the tab regains focus (a like/comment/save made elsewhere, or new activity).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > REFOCUS_MIN_MS) void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const seenPostIds = seenPosts.useSeenIds();
  const seenPinIds = seenPins.useSeenIds();
  const seenListingIds = seenListings.useSeenIds();
  const seenUpdateIds = seenInitiativeUpdates.useSeenIds();

  const namesKey = viewer.names.join('|');
  const cards = useMemo(
    () => selectHomeCards(snap, { userId: viewer.userId, names: viewer.names, seenPostIds, seenPinIds, seenListingIds, seenUpdateIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey stands in for the names array identity.
    [snap, viewer.userId, namesKey, seenPostIds, seenPinIds, seenListingIds, seenUpdateIds],
  );

  return { cards, loading, error, refresh: () => void load(false) };
}
