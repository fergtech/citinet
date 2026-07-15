// ── Geocoding (OpenStreetMap Nominatim, no API key) ─────────────────────────

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export async function geocodeLocation(location: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {}
  return null;
}

// ~100 km radius box around hub center; bounded=1 keeps results local
export async function searchGeocode(query: string, hubCenter?: [number, number]): Promise<NominatimResult[]> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
    if (hubCenter) {
      const [lat, lng] = hubCenter;
      const d = 1.0; // ~100 km in mid-latitudes
      url += `&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}&bounded=1`;
    }
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    return await res.json();
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

/** Great-circle distance in meters between two lat/lng points (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
