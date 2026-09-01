import { useEffect, useRef, useState } from 'react';
import { useHub } from '../context/HubContext';
import type { UserPreferences } from '../services/preferencesService';

type SavedIdsPrefKey = 'saved_atlas_pins' | 'saved_listings' | 'saved_vendors';

/**
 * Account-synced list of saved/bookmarked ids (Atlas pins, Exchange
 * listings, Exchange vendors, ...) — backed by hub_user_preferences via
 * HubContext's userPreferences/updateUserPreferences, with localStorage
 * only as a fast local cache for first paint before the account's real
 * value loads. Previously each of these lived in localStorage alone, so a
 * save never followed the account across devices/browsers and looked lost
 * after clearing site data.
 *
 * Safe to call from multiple simultaneously-mounted instances (e.g. one per
 * grid card) — they all read the same shared `userPreferences` context
 * value, and each only cares whether its own id is in the list.
 */
export function useSavedIds(prefKey: SavedIdsPrefKey, localStorageKey: string) {
  const { userPreferences, updateUserPreferences } = useHub();
  const [ids, setIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(localStorageKey) || '[]'); } catch { return []; }
  });

  // Reconcile once the account's real value loads. Runs once per mount (not
  // on every userPreferences change) so a local toggle's own optimistic
  // update — which also flows through userPreferences — never clobbers a
  // newer local edit made before the fetch resolved. Same pattern as
  // HubLayout's nav_pinned reconciliation.
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current) return;
    const raw = userPreferences[prefKey];
    if (raw === undefined) return;
    reconciledRef.current = true;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setIds(parsed);
        localStorage.setItem(localStorageKey, JSON.stringify(parsed));
      }
    } catch { /* malformed value — keep the local default */ }
  }, [userPreferences, prefKey, localStorageKey]);

  const toggle = (id: string) => {
    setIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(localStorageKey, JSON.stringify(next));
      updateUserPreferences({ [prefKey]: JSON.stringify(next) } as Partial<UserPreferences>).catch(err =>
        console.error(`Failed to sync ${prefKey} to hub`, err),
      );
      return next;
    });
  };

  return { ids, toggle };
}
