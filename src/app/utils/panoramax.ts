// Panoramax (panoramax.fr) — an open, federated street-level-imagery project
// (IGN-backed, crowdsourced). Its public instance exposes a plain STAC
// /search endpoint with no auth required for reading public pictures, and
// serves it with an open CORS policy (confirmed live: a browser `fetch`
// against `api.panoramax.xyz/api/search` from this app's own origin gets
// `access-control-allow-origin` back, no key needed). Ported near-verbatim
// from citinet-mobile's lib/atlas/panoramax.ts — same API, same shape.
// Coverage is real (confirmed live coverage near a real hub's own location
// during development, not just France as the project's origin might
// suggest) but inherently patchy — most pins anywhere won't have a nearby
// match, which is the expected, common case, not an error.
const PANORAMAX_API_ENDPOINT = 'https://api.panoramax.xyz/api';

// ~150m search box, then reject anything the bbox happened to catch that's
// still further than this from the pin — a bbox corner can be much farther
// from center than the box's nominal "radius" suggests.
const SEARCH_BOX_DEGREES = 0.0015;
const MAX_DISTANCE_METERS = 150;

/** Great-circle distance in meters — same formula as geocoding.ts's own, not
 * re-imported to keep this module standalone/dependency-free. */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Opens the real picture in Panoramax's own hosted web viewer (their actual
// production site, not something embedded here) — confirmed URL syntax:
// `#focus=pic&pic=<uuid>` on the same host.
export function panoramaxWebViewerUrl(pictureId: string): string {
  return `https://api.panoramax.xyz/#focus=pic&pic=${pictureId}`;
}

export type PanoramaxImage = { thumbnailUrl: string; imageUrl: string; pictureId: string; distanceMeters: number };

export async function findNearestPanoramaxImage(lat: number, lng: number): Promise<PanoramaxImage | null> {
  const bbox = [lng - SEARCH_BOX_DEGREES, lat - SEARCH_BOX_DEGREES, lng + SEARCH_BOX_DEGREES, lat + SEARCH_BOX_DEGREES].join(',');
  try {
    const res = await fetch(`${PANORAMAX_API_ENDPOINT}/search?bbox=${bbox}&limit=10`);
    if (!res.ok) return null;
    const data = await res.json();
    const features: unknown[] = Array.isArray(data?.features) ? data.features : [];

    let nearest: PanoramaxImage | null = null;
    for (const raw of features) {
      const feature = raw as {
        id?: string;
        geometry?: { coordinates?: [number, number] };
        assets?: { thumb?: { href?: string }; sd?: { href?: string } };
      };
      const coords = feature.geometry?.coordinates;
      const thumb = feature.assets?.thumb?.href;
      const sd = feature.assets?.sd?.href;
      if (!coords || typeof coords[0] !== 'number' || typeof coords[1] !== 'number' || !thumb || !sd || !feature.id) continue;
      const [flng, flat] = coords;
      const d = distanceMeters(lat, lng, flat, flng);
      if (!nearest || d < nearest.distanceMeters) {
        nearest = { thumbnailUrl: thumb, imageUrl: sd, pictureId: feature.id, distanceMeters: d };
      }
    }
    return nearest && nearest.distanceMeters <= MAX_DISTANCE_METERS ? nearest : null;
  } catch {
    // No network, no coverage, or a malformed response — all mean the same
    // thing to a caller: fall back to whatever comes next.
    return null;
  }
}
