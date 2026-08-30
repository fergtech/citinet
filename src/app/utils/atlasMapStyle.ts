// ── Atlas map style (MapLibre GL, vector) ────────────────────────────────────
// Replaces the earlier raster-tile-recoloring approach entirely. That approach
// could only ever repaint OSM's own pixels — Atlas still inherited every
// decision OSM's cartographers made about label density, building outlines,
// POI clutter, and visual hierarchy, because a raster tile is a picture, not
// data. This renders real OSM vector data (via OpenFreeMap's free, keyless
// "planet" vector source, OpenMapTiles schema) through a from-scratch style
// authored by Atlas: a small, deliberate set of layers instead of the
// hundred-plus a general-purpose basemap ships with, so OSM supplies
// geographic truth (coordinates, road geometry, water/park shapes, place
// names) and Atlas fully owns the visual language — background, palette,
// what's visible at which zoom, and how much the map "speaks" versus staying
// quiet context behind the pins.
//
// Colors are pulled from citinet-tokens.css's own hexes, same principle as
// the (now-removed) raster recolor:
//   #10b981 (--cn-grad-exchange teal)  → parks/vegetation
//   #3b82f6 (--cn-grad-feed blue)      → water
//   #f59e0b (--cn-grad-files amber)    → major roads/highways (kept from the
//     raster version's own tuning pass — "modern trendy yellow or orange",
//     not reverted back to a plain neutral just because the render pipeline
//     changed underneath it)
//   #64748b (--cn-text-3 slate)        → minor roads, boundaries
// A future rebrand only has to touch these constants.

import type { StyleSpecification } from 'maplibre-gl';

export const OPENFREEMAP_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
export const OPENFREEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const COLOR = {
  teal: '#10b981',
  blue: '#3b82f6',
  amber: '#f59e0b',
  slate: '#64748b',
};

/** Mixes a brand hex toward black (dark<0.5 → toward white) so a vivid brand
 * color reads as a muted map fill/line instead of a neon accent, while still
 * being a literal function of the token rather than a hand-picked hex. */
function mix(hex: string, toward: 'black' | 'white', amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = toward === 'black' ? 0 : 255;
  const blend = (c: number) => Math.round(c + (target - c) * amount);
  return `#${[blend(r), blend(g), blend(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

interface AtlasStyleTokens {
  background: string;
  land: string;
  landOpacity: number;
  water: string;
  park: string;
  parkOpacity: number;
  roadMinor: string;
  roadMinorOpacity: [number, number]; // [at fade-in zoom, at full zoom]
  roadTertiary: string;
  roadTertiaryOpacity: [number, number];
  roadPrimary: string; // primary/secondary
  roadPrimaryOpacity: number;
  roadInterstate: string; // motorway/trunk
  roadInterstateOpacity: number;
  building: string;
  buildingOpacity: number;
  parkingDot: string;
  parkingText: string;
  boundary: string;
  labelMajor: string;
  labelMinor: string;
  labelStreet: string;
  labelHalo: string;
}

// First pass made roads read as the map's dominant feature ("ORANGE ORANGE
// ORANGE before Atlas markers") — per direct feedback, fixed by (a) muting
// the hue further (more black mixed in — "muted amber/golden slate/warm
// bronze," not bright amber) and (b) giving each road class its own opacity
// ceiling instead of one flat full-opacity treatment, so there's an actual
// hierarchy: interstate ~90%, primary/secondary ~70%, local streets capped
// around 40% even at max zoom. Water's mix ratio was pulled back too — it
// was reading as barely brighter than the background; the Chesapeake should
// help users orient themselves, not disappear into it.
//
// Tertiary/minor were briefly a totally different hue family (cool slate)
// while interstate/primary stayed amber — per feedback, that breaks the
// visual logic of "same feature type, lower rank" (why would a local street
// suddenly be a different color family than the primary road one step up?).
// All four road tiers now come from the *same* mix(amber, 'black', N) ramp,
// just with N increasing tier by tier — darkening preserves hue+saturation
// exactly (it's a uniform RGB scale-down, not a desaturating blend toward
// gray), so "lesser degree" reads as a dimmer, more muted bronze at every
// step rather than a jump to an unrelated color.
const DARK_TOKENS: AtlasStyleTokens = {
  background: '#0b0d10',
  land: '#111418',
  landOpacity: 0.6,
  water: mix(COLOR.blue, 'black', 0.68),
  park: mix(COLOR.teal, 'black', 0.85),
  parkOpacity: 0.55,
  roadMinor: mix(COLOR.amber, 'black', 0.78),
  roadMinorOpacity: [0.2, 0.5],
  roadTertiary: mix(COLOR.amber, 'black', 0.68),
  roadTertiaryOpacity: [0.2, 0.55],
  roadPrimary: mix(COLOR.amber, 'black', 0.55),
  roadPrimaryOpacity: 0.7,
  roadInterstate: mix(COLOR.amber, 'black', 0.42),
  roadInterstateOpacity: 0.9,
  building: mix(COLOR.slate, 'black', 0.72),
  buildingOpacity: 0.35,
  parkingDot: mix(COLOR.blue, 'black', 0.2),
  parkingText: '#ffffff',
  boundary: mix(COLOR.slate, 'black', 0.62),
  labelMajor: mix(COLOR.slate, 'white', 0.28),
  labelMinor: mix(COLOR.slate, 'black', 0.18),
  labelStreet: mix(COLOR.slate, 'black', 0.05),
  labelHalo: '#0b0d10',
};

const LIGHT_TOKENS: AtlasStyleTokens = {
  background: '#eef1f4',
  land: '#e4e8ed',
  landOpacity: 0.7,
  water: mix(COLOR.blue, 'white', 0.22),
  park: mix(COLOR.teal, 'white', 0.45),
  parkOpacity: 0.7,
  // Same "one hue family, increasing mix" ramp as dark mode, but mixed
  // toward white instead of black — on a light background, a fainter tier
  // needs to move toward the background's own lightness, not away from it.
  roadMinor: mix(COLOR.amber, 'white', 0.55),
  roadMinorOpacity: [0.25, 0.55],
  roadTertiary: mix(COLOR.amber, 'white', 0.4),
  roadTertiaryOpacity: [0.25, 0.6],
  roadPrimary: mix(COLOR.amber, 'black', 0.28),
  roadPrimaryOpacity: 0.7,
  roadInterstate: mix(COLOR.amber, 'black', 0.12),
  roadInterstateOpacity: 0.9,
  building: mix(COLOR.slate, 'white', 0.25),
  buildingOpacity: 0.4,
  parkingDot: mix(COLOR.blue, 'black', 0.05),
  parkingText: '#ffffff',
  boundary: mix(COLOR.slate, 'white', 0.25),
  labelMajor: mix(COLOR.slate, 'black', 0.15),
  labelMinor: COLOR.slate,
  labelStreet: mix(COLOR.slate, 'black', 0.25),
  labelHalo: '#eef1f4',
};

/** Builds the full MapLibre style spec for Atlas, in either theme. A small,
 * deliberate layer list instead of a general-purpose basemap's 100+ — every
 * layer here is a conscious call about what Atlas wants to show, not an
 * inherited default. No POIs, no business labels, no road shields, no
 * aeroway/landuse texture. Buildings and street names DO appear, but only
 * once zoomed in close enough to matter (a pin's own detail view) — at the
 * wide overview they'd just be noise; at street level, "just a couple of
 * gray lines and a pin" reads as broken/unfinished, and OSM has the real
 * data to answer "which street is this" and "is there a building here" once
 * that's actually the question being asked. */
export function getAtlasMapStyle(dark: boolean): StyleSpecification {
  const t = dark ? DARK_TOKENS : LIGHT_TOKENS;
  return {
    version: 8,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: OPENFREEMAP_SOURCE_URL,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    glyphs: OPENFREEMAP_GLYPHS_URL,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.background } },

      { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
        paint: { 'fill-color': t.land, 'fill-opacity': t.landOpacity } },

      { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park',
        paint: { 'fill-color': t.park, 'fill-opacity': t.parkOpacity } },

      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
        paint: { 'fill-color': t.water } },

      // Building footprints — flat fill, no stroke, no height/3D extrusion,
      // and only once you're zoomed in on a specific place: gives "there's
      // a real building here" context without the citywide texture the
      // original decluttering pass explicitly removed.
      { id: 'buildings', type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
        minzoom: 16,
        paint: { 'fill-color': t.building, 'fill-opacity': t.buildingOpacity } },

      // Tertiary streets fade in first, at low opacity; residential/service
      // streets (the bulk of a dense city grid) only appear once you're
      // zoomed in close enough that they're actually useful, and even then
      // stay thin, low-contrast, and capped well under full opacity —
      // "the map should breathe," local streets are context, not content.
      { id: 'roads-tertiary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        minzoom: 12,
        filter: ['==', 'class', 'tertiary'],
        paint: {
          'line-color': t.roadTertiary,
          'line-width': 1,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, t.roadTertiaryOpacity[0], 15, t.roadTertiaryOpacity[1]],
        } },
      // Explicit allowlist, not a "!in" catch-all — this OpenMapTiles source
      // also tags parking-lot/driveway lanes as class "service", every
      // sidewalk/cycleway/staircase as "path" (with a subclass), and short
      // bridge-deck segments as their own class "bridge" with no other road
      // info. A catch-all swept all of those in: service/path lattices
      // inside apartment/retail complexes read as a stray diagonal grid of
      // "unfinished" gray lines, and lone "bridge" segments (no connecting
      // classification) looked like roads that just stop mid-air. "minor" is
      // this schema's actual class for ordinary local/residential streets —
      // targeting it explicitly excludes all of the above by construction.
      { id: 'roads-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        minzoom: 14,
        filter: ['==', 'class', 'minor'],
        paint: {
          'line-color': t.roadMinor,
          'line-width': 1,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, t.roadMinorOpacity[0], 17, t.roadMinorOpacity[1]],
        } },

      // Primary/secondary — a clear step down from interstates, still
      // visible from a wide zoom range so the area's "skeleton" reads at a
      // glance, but deliberately less prominent than the tier above it.
      { id: 'roads-primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', 'class', 'primary', 'secondary'],
        paint: {
          'line-color': t.roadPrimary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 1.6],
          'line-opacity': t.roadPrimaryOpacity,
        } },

      // Interstates/trunk roads — the most prominent road tier, but still
      // capped short of full opacity so pins stay the map's brightest thing.
      { id: 'roads-interstate', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        minzoom: 5,
        filter: ['in', 'class', 'motorway', 'trunk'],
        paint: {
          'line-color': t.roadInterstate,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 14, 2.4],
          'line-opacity': t.roadInterstateOpacity,
        } },

      { id: 'boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
        filter: ['<=', 'admin_level', 6],
        paint: { 'line-color': t.boundary, 'line-width': 0.6, 'line-dasharray': [2, 2] } },

      // Labels — only place names. No POIs, no business names, no building
      // labels, no road shields: the things a passerby would recognize a
      // place by, nothing that competes with Atlas's own pins for attention.
      { id: 'place-labels-major', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        filter: ['in', 'class', 'city', 'town'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 14, 16],
        },
        paint: { 'text-color': t.labelMajor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.2 } },
      { id: 'place-labels-minor', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        minzoom: 14,
        filter: ['in', 'class', 'village', 'suburb', 'neighbourhood'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: { 'text-color': t.labelMinor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1 } },

      // Street names — only once zoomed in close enough that the roads
      // themselves are visible (see roads-minor's minzoom 14); a "which
      // street is this" answer is exactly the missing piece at a pin's own
      // detail view, which forces max zoom. `has "name"` skips unnamed
      // junction-only features this source-layer also carries.
      { id: 'street-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name',
        minzoom: 15,
        filter: ['has', 'name'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'symbol-placement': 'line',
        },
        paint: { 'text-color': t.labelStreet, 'text-halo-color': t.labelHalo, 'text-halo-width': 1 } },

      // Parking — lots, garages, and public parking are all the same
      // underlying `poi` class "parking" in this data source (no sub-type
      // tag distinguishes them; only some names informally hint "Garage" vs
      // "Lot"), so this renders all of them as one small "P" marker rather
      // than guessing a category split the data doesn't actually support.
      // Same zoomed-in-only tier as buildings/street names — this is
      // "where do I park to visit this pin" context, not overview clutter.
      { id: 'poi-parking-dot', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi',
        minzoom: 15,
        filter: ['==', 'class', 'parking'],
        paint: {
          'circle-radius': 7,
          'circle-color': t.parkingDot,
          'circle-stroke-width': 1,
          'circle-stroke-color': t.labelHalo,
        } },
      { id: 'poi-parking-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi',
        minzoom: 15,
        filter: ['==', 'class', 'parking'],
        layout: {
          'text-field': 'P',
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': t.parkingText } },
    ],
  };
}

// Re-exported so callers don't need their own reference to the brand hexes
// this file derives its palette from.
export const ATLAS_STYLE_BRAND_COLORS = COLOR;
