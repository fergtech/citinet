import { useEffect, useState } from 'react';
import { useHub } from '../context/HubContext';
import { geocodeLocation } from '../utils/geocoding';

/**
 * Real lat/lng center for the current hub, for bounding a
 * <LocationSearchInput>/searchGeocode call to the hub's own area — the same
 * fallback AtlasScreen and NetworkMap already use, pulled out here so a third
 * copy didn't have to be written for Feed's composer (which was missing it
 * entirely, and so had fully unbounded, worldwide place-search results).
 *
 * A hub's `lat`/`lng` are only ever set if an admin ran it through the
 * LocationPicker — most hubs only have the free-text `location` string
 * entered once at creation (e.g. "Aberdeen, Maryland"), which is the common
 * case, not the exception. This geocodes that string once and caches it in
 * sessionStorage under the same key Atlas uses, so switching between screens
 * in one session doesn't cost a repeat Nominatim call.
 */
export function useHubGeoCenter(): [number, number] | null {
  const { currentHub } = useHub();
  const [center, setCenter] = useState<[number, number] | null>(
    currentHub?.lat && currentHub?.lng ? [currentHub.lat, currentHub.lng] : null
  );

  useEffect(() => {
    if (!currentHub) return;
    if (currentHub.lat && currentHub.lng) {
      setCenter([currentHub.lat, currentHub.lng]);
      return;
    }
    if (!currentHub.location) { setCenter(null); return; }
    const cacheKey = `citinet-geo:${currentHub.location}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { setCenter(JSON.parse(cached) as [number, number]); return; } catch { /* fall through to re-geocode */ }
    }

    let cancelled = false;
    // One retry after a beat: this fires at page-mount time, alongside a burst
    // of other bootstrap requests (hub status, activity feed, notifications…),
    // and a single unretried attempt here means one transient network hiccup
    // leaves the whole session unbounded until the next full reload — silently
    // reproducing the exact "results from across the world" bug this exists
    // to prevent. AtlasScreen/NetworkMap have this same single-shot gap; not
    // touched here since fixing it there wasn't asked for.
    const attempt = (isRetry: boolean) => geocodeLocation(currentHub.location).then(coords => {
      if (cancelled) return;
      if (coords) {
        sessionStorage.setItem(cacheKey, JSON.stringify(coords));
        setCenter(coords);
      } else if (!isRetry) {
        setTimeout(() => attempt(true), 2000);
      }
    });
    attempt(false);
    return () => { cancelled = true; };
  }, [currentHub?.lat, currentHub?.lng, currentHub?.location]);

  return center;
}
