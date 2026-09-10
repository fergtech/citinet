// ── Geocoding (OpenStreetMap Nominatim, no API key) ─────────────────────────

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// ~100km box in mid-latitudes — roughly an hour's drive, matching what makes
// sense for a hub-local project rather than a fixed distance chosen
// arbitrarily. bounded=1 only restricts the CANDIDATE set to this box.
const HUB_BOUND_DEGREES = 1.0;

function boundedViewboxParams(hubCenter?: [number, number]): string {
  if (!hubCenter) return '';
  const [lat, lng] = hubCenter;
  const d = HUB_BOUND_DEGREES;
  return `&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}&bounded=1`;
}

// Real, reported problem this fixes (same one found and fixed in
// citinet-mobile's lib/atlas/geocoding.ts): searching "walmart" near a hub in
// Aberdeen, MD never surfaced the actual Walmart a couple km away — every
// result was 70-120km out. bounded=1 only restricts the candidate set to the
// viewbox; Nominatim still orders results within it by its own "importance"
// score (roughly, how well-known/well-mapped a place is), not by distance.
// A handful of heavily-tagged big-box stores easily outrank a correctly
// tagged but lower-"importance" one right next door. Fix: overfetch (up to
// Nominatim's own ceiling), then re-rank by real distance from the hub
// ourselves, then truncate to what the UI actually shows.
const OVERFETCH_LIMIT = 40;
const DISPLAY_LIMIT = 5;

/** Ascending distance from hubCenter — "closest first, then broaden out."
 * No-op (keeps Nominatim's own order) when there's no hub center to measure
 * from. */
function sortByDistanceFromHub<T extends { lat: string; lon: string }>(results: T[], hubCenter?: [number, number]): T[] {
  if (!hubCenter) return results;
  const [lat, lng] = hubCenter;
  return [...results].sort(
    (a, b) =>
      distanceMeters(lat, lng, parseFloat(a.lat), parseFloat(a.lon)) - distanceMeters(lat, lng, parseFloat(b.lat), parseFloat(b.lon))
  );
}

// hubCenter is optional and omitted by AtlasScreen's own bootstrap call
// (geocoding the hub's own address to find hubGeoCenter in the first place —
// nothing to bound against or sort by yet there). Every other caller with a
// real hub center in scope should pass it.
export async function geocodeLocation(location: string, hubCenter?: [number, number]): Promise<[number, number] | null> {
  try {
    const limit = hubCenter ? OVERFETCH_LIMIT : 1;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=${limit}${boundedViewboxParams(hubCenter)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data.length === 0) return null;
    const [closest] = sortByDistanceFromHub(data, hubCenter);
    return [parseFloat(closest.lat), parseFloat(closest.lon)];
  } catch {}
  return null;
}

export async function searchGeocode(query: string, hubCenter?: [number, number]): Promise<NominatimResult[]> {
  try {
    const limit = hubCenter ? OVERFETCH_LIMIT : DISPLAY_LIMIT;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}${boundedViewboxParams(hubCenter)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data: NominatimResult[] = await res.json();
    return sortByDistanceFromHub(data, hubCenter).slice(0, DISPLAY_LIMIT);
  } catch { return []; }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data.name && !/^\d/.test(data.name as string)) return data.name as string;
    const a = data.address as Record<string, string> | undefined;
    return a?.road || a?.suburb || a?.neighbourhood || a?.city
      || (data.display_name as string | undefined)?.split(',')[0]
      || null;
  } catch { return null; }
}

/** Pulls a [lat, lng] tuple out of a Hub-shaped object for passing to
 * geocodeLocation/openLocationInAtlas, or undefined if the hub has no
 * geocoded center yet — the common `currentHub?.lat != null && ... ?
 * [currentHub.lat, currentHub.lng] : undefined` ternary every call site
 * otherwise needed to repeat. */
export function hubCenterOf(hub?: { lat?: number | null; lng?: number | null } | null): [number, number] | undefined {
  return hub?.lat != null && hub?.lng != null ? [hub.lat, hub.lng] : undefined;
}

/** Deep-links a location into Atlas — reuses real coordinates captured at compose
 * time when available, falling back to a one-off geocode for older posts/events
 * that only ever had free text (e.g. a location typed without picking an
 * autocomplete suggestion, which never populates event_lat/event_lng in the
 * first place). Atlas resolves this to a nearby pin if one exists, or offers
 * to add one if not — nothing is created here.
 *
 * The one-off geocode passes hubCenter straight through to geocodeLocation,
 * same as Atlas's own search box — same bounded-viewbox + re-rank-by-real-
 * distance fix as atlas_geocode_distance_ranking (see AtlasScreen's search),
 * not a last-resort fallback only tried once an *unscoped* global search
 * already came back completely empty. An unscoped search for a generic
 * business name (e.g. "THB Bagelry & Deli", a real regional chain with
 * multiple locations) reliably returns *some* global top-"importance" match
 * — often nowhere near the hub — so gating the hub-scoped attempt on "the
 * first one found literally nothing" essentially never gave it a chance to
 * run, and Atlas would then correctly fail to find an existing pin within
 * 100m of that wrong, distant point and offer to create a duplicate one
 * instead — even when the right pin already existed nearby. */
export async function openLocationInAtlas(
  location: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  onNavigate?: (screen: string) => void,
  hubLocationHint?: string,
  hubCenter?: [number, number],
) {
  let resolvedLat = lat, resolvedLng = lng;
  if (resolvedLat == null || resolvedLng == null) {
    let coords = await geocodeLocation(location, hubCenter);
    if (!coords && hubLocationHint) coords = await geocodeLocation(`${location}, ${hubLocationHint}`, hubCenter);
    if (!coords) {
      sessionStorage.setItem('citinet-deeplink-atlas-search', location);
      onNavigate?.('atlas');
      return;
    }
    [resolvedLat, resolvedLng] = coords;
  }
  sessionStorage.setItem('citinet-deeplink-coords', JSON.stringify({ lat: resolvedLat, lng: resolvedLng, label: location }));
  onNavigate?.('atlas');
}

/** Great-circle distance in meters between two lat/lng points (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
