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

/** Pulls a color toward its own luminance gray by `amount` (0–1): same
 * lightness, less chroma. Used so place markers read as quiet context rather
 * than competing with roads/buildings or the members' own pins. */
function desaturate(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const f = (c: number) => Math.round(c + (gray - c) * amount);
  return `#${[f(r), f(g), f(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Place-marker look — deliberately background context, not content: small,
 * muted, thin-edged, no glow. These layers are read-only (no hover/selection),
 * and optimise for the map reading as "a map with places on it" rather than
 * "icons covering a map". Members' own pins stay the prominent layer. */
const POI_MARKER = {
  // 'ring'   — colour-coded glyph + thin coloured ring, no filled background.
  // 'filled' — the earlier muted filled disc with a white hairline.
  // Compared live at street level (2026-10-10): 'ring' wins — filled discs
  // still read as icons sitting on the map, rings read as annotations.
  variant: 'ring' as 'ring' | 'filled',
  sizePx: 17,          // was 26 (~35% smaller)
  glyphPx: 9.5,        // was 14
  borderPx: 1,         // was 2
  borderAlpha: 0.55,   // was 0.92
  iconOpacity: 0.72,   // layer-level, on top of the muted fill
  textOpacity: 0.65,
  saturationCut: 0.45, // fraction of chroma removed from each category color
} as const;

/** Road ink: a soft apricot/"sandy" orange (the muted, slightly dusty orange
 * modern apps use — #f4a261 family — rather than a hazard-sign orange),
 * lightly desaturated and mixed toward the ground per road tier. Dark mode
 * uses a lighter apricot; light mode a deeper terracotta so it holds contrast
 * on the pale ground. */
const ROAD_INK_DARK = desaturate('#f4a261', 0.2);
const ROAD_INK_LIGHT = desaturate('#d9722a', 0.15);

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
  buildingOutline: string;
  buildingOpacity: number;
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
  // Hierarchy by width + brightness, not by shouting: interstates stay the
  // strongest road but at a calmer opacity/chroma so they never out-shout a
  // pin; local streets get a real ceiling (and grow with zoom, see widths
  // below) so "which street is this on" is answerable from the geometry.
  // Four clearly separate steps (lightness AND opacity AND width differ per
  // tier): highway brightest + widest, major medium, local/minor most
  // subdued. Highway is brighter than before but still a muted ochre, well
  // short of a pin's saturation.
  // Apricot ramp stepped down in lightness per tier — highway brightest,
  // local most subdued (hue stays one family, so rank reads as "less of the
  // same"). Pins stay the most saturated things on the map.
  roadMinor: mix(ROAD_INK_DARK, 'black', 0.68),
  roadMinorOpacity: [0.3, 0.75],
  roadTertiary: mix(ROAD_INK_DARK, 'black', 0.52),
  roadTertiaryOpacity: [0.3, 0.8],
  roadPrimary: mix(ROAD_INK_DARK, 'black', 0.32),
  roadPrimaryOpacity: 0.8,
  roadInterstate: mix(ROAD_INK_DARK, 'black', 0.1),
  roadInterstateOpacity: 0.88,
  building: mix(COLOR.slate, 'black', 0.58),
  buildingOutline: mix(COLOR.slate, 'black', 0.4),
  buildingOpacity: 0.6,
  boundary: mix(COLOR.slate, 'black', 0.62),
  labelMajor: mix(COLOR.slate, 'white', 0.5),
  labelMinor: mix(COLOR.slate, 'white', 0.35),
  labelStreet: mix(COLOR.slate, 'white', 0.4),
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
  // Same ramp from a deeper terracotta, stepped up toward the light ground.
  roadMinor: mix(ROAD_INK_LIGHT, 'white', 0.74),
  roadMinorOpacity: [0.35, 0.85],
  roadTertiary: mix(ROAD_INK_LIGHT, 'white', 0.6),
  roadTertiaryOpacity: [0.35, 0.85],
  roadPrimary: mix(ROAD_INK_LIGHT, 'white', 0.4),
  roadPrimaryOpacity: 0.8,
  roadInterstate: mix(ROAD_INK_LIGHT, 'white', 0.2),
  roadInterstateOpacity: 0.88,
  building: mix(COLOR.slate, 'white', 0.15),
  buildingOutline: mix(COLOR.slate, 'white', 0.0),
  buildingOpacity: 0.55,
  boundary: mix(COLOR.slate, 'white', 0.25),
  labelMajor: mix(COLOR.slate, 'black', 0.4),
  labelMinor: mix(COLOR.slate, 'black', 0.3),
  labelStreet: mix(COLOR.slate, 'black', 0.4),
  labelHalo: '#eef1f4',
};

// ── Optional "what's around" layers ──────────────────────────────────────────
// Public-interest places OSM already ships inside the `poi` source-layer of
// every tile Atlas downloads (see the layer audit) — each is just a filter on
// that layer, not a new data source or API. Off by default except parking
// (kept from before); the user turns the rest on from the Layers control.
// `classes` are OpenMapTiles `poi` class values, chosen from a live count of
// one dense area (Towson, 9 tiles): `pitch` (569 sports-field markers),
// `garden` (97) and `post` (70 mailboxes/post offices) were left out as
// pure clutter. Only appear zoomed in (minzoom) so the wide overview stays
// as sparse as ever.
export interface AtlasPoiLayer {
  id: string;
  label: string;
  hint: string;
  classes: string[];
  /** Optional narrowing by OpenMapTiles `subclass` (e.g. EV charging is
   * class `fuel`, subclass `charging_station`). */
  subclasses?: string[];
  /** Subclasses to drop from an otherwise-wanted class — OpenMapTiles files
   * some unrelated things under the same class (verified by live tile
   * decode: class `library` also holds bookshops, `grocery` department
   * stores, `park` BBQ grills). */
  excludeSubclasses?: string[];
  color: string;   // marker fill
  glyph: string;   // single character drawn on the marker
  minzoom: number;
  named: boolean;  // show the place's name under the marker at close zoom
}

export const ATLAS_POI_LAYERS: AtlasPoiLayer[] = [
  { id: 'parking',  label: 'Parking',            hint: 'Lots and garages',                   classes: ['parking'],
    color: desaturate('#2563eb', POI_MARKER.saturationCut), glyph: 'P', minzoom: 15, named: false },
  { id: 'schools',  label: 'Schools',            hint: 'K–12, colleges, daycares',           classes: ['school', 'kindergarten', 'college', 'university'],
    color: desaturate('#d97706', POI_MARKER.saturationCut), glyph: 'S', minzoom: 14, named: true },
  { id: 'health',   label: 'Health',             hint: 'Hospitals, clinics, doctors, pharmacies',        classes: ['hospital', 'clinic', 'doctors', 'pharmacy'],
    color: desaturate('#dc2626', POI_MARKER.saturationCut), glyph: '+', minzoom: 14, named: true },
  { id: 'parks',    label: 'Parks & recreation', hint: 'Parks, playgrounds, dog parks',         classes: ['park', 'playground', 'dog_park'], excludeSubclasses: ['bbq'],
    color: desaturate('#059669', POI_MARKER.saturationCut), glyph: '♣', minzoom: 15, named: true },
  { id: 'civic',    label: 'Libraries & civic',  hint: 'Libraries, town hall, police, fire', classes: ['library', 'town_hall', 'courthouse', 'police', 'fire_station', 'community_centre'], excludeSubclasses: ['books'],
    color: desaturate('#7c3aed', POI_MARKER.saturationCut), glyph: 'C', minzoom: 14, named: true },
  { id: 'transit',  label: 'Transit stops',      hint: 'Bus stops',                          classes: ['bus'],
    color: desaturate('#0891b2', POI_MARKER.saturationCut), glyph: 'B', minzoom: 16, named: false },
  { id: 'amenities', label: 'Restrooms & water', hint: 'Public restrooms, drinking water',   classes: ['toilets', 'drinking_water'],
    color: desaturate('#db2777', POI_MARKER.saturationCut), glyph: 'W', minzoom: 15, named: false },
  { id: 'recycling', label: 'Recycling',         hint: 'Drop-off points',                    classes: ['recycling'],
    color: desaturate('#65a30d', POI_MARKER.saturationCut), glyph: 'R', minzoom: 15, named: false },
  { id: 'ev',       label: 'EV charging',        hint: 'Charging stations',                  classes: ['fuel'], subclasses: ['charging_station'],
    color: desaturate('#0ea5e9', POI_MARKER.saturationCut), glyph: 'E', minzoom: 15, named: true },
  { id: 'grocery',  label: 'Grocery',            hint: 'Supermarkets and grocers',           classes: ['grocery'], excludeSubclasses: ['department_store', 'deli'],
    color: desaturate('#ca8a04', POI_MARKER.saturationCut), glyph: 'G', minzoom: 15, named: true },
  { id: 'worship',  label: 'Places of worship',  hint: 'Churches, mosques, synagogues, temples', classes: ['place_of_worship'],
    color: desaturate('#6366f1', POI_MARKER.saturationCut), glyph: '◆', minzoom: 15, named: true },
];

export const DEFAULT_POI_LAYERS: string[] = ['parking'];

export function poiImageId(layerId: string): string {
  return `atlas-poi-${layerId}`;
}

/** Marker icons are drawn on demand (canvas) the first time a layer asks for
 * one — MapLibre fires `styleimagemissing` for any icon-image the style
 * references but the map doesn't hold, which also covers theme swaps (a new
 * style starts with no images). Call once per map after construction. */
export function registerAtlasPoiImages(
  map: { on: (type: 'styleimagemissing', cb: (e: { id: string }) => void) => unknown; hasImage: (id: string) => boolean; addImage: (id: string, img: ImageData, opts?: { pixelRatio?: number }) => void },
  isDark: () => boolean,
): void {
  map.on('styleimagemissing', (e) => {
    const layer = ATLAS_POI_LAYERS.find(l => poiImageId(l.id) === e.id);
    if (!layer || map.hasImage(e.id)) return;
    const dark = isDark();
    const size = POI_MARKER.sizePx, ratio = 3, px = size * ratio;
    const canvas = document.createElement('canvas');
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    const r = size / 2 - POI_MARKER.borderPx;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    if (POI_MARKER.variant === 'ring') {
      // Thin coloured ring + coloured glyph. A faint ground-coloured fill
      // (not a colour block) keeps the glyph readable over road lines.
      const ink = dark ? mix(layer.color, 'white', 0.25) : mix(layer.color, 'black', 0.1);
      ctx.fillStyle = dark ? 'rgba(11,13,16,0.72)' : 'rgba(238,241,244,0.78)';
      ctx.fill();
      ctx.lineWidth = POI_MARKER.borderPx;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.fillStyle = ink;
    } else {
      ctx.fillStyle = layer.color;
      ctx.fill();
      ctx.lineWidth = POI_MARKER.borderPx;
      ctx.strokeStyle = `rgba(255,255,255,${POI_MARKER.borderAlpha})`;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
    }
    ctx.font = `700 ${POI_MARKER.glyphPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layer.glyph, size / 2, size / 2 + 0.5);
    map.addImage(e.id, ctx.getImageData(0, 0, px, px), { pixelRatio: ratio });
  });
}

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
export function getAtlasMapStyle(dark: boolean, enabledPoiLayers: readonly string[] = DEFAULT_POI_LAYERS): StyleSpecification {
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
        paint: { 'fill-color': t.building, 'fill-opacity': t.buildingOpacity, 'fill-outline-color': t.buildingOutline } },

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
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 15, 1.2, 19, 4.5],
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 17, 1.5, 19, 3.5],
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 2, 19, 8],
          'line-opacity': t.roadPrimaryOpacity,
        } },

      // Interstates/trunk roads — the most prominent road tier, but still
      // capped short of full opacity so pins stay the map's brightest thing.
      { id: 'roads-interstate', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        minzoom: 5,
        filter: ['in', 'class', 'motorway', 'trunk'],
        paint: {
          'line-color': t.roadInterstate,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 14, 3.2, 19, 12],
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 17],
        },
        paint: { 'text-color': t.labelMajor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.6 } },
      { id: 'place-labels-minor', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        minzoom: 14,
        filter: ['in', 'class', 'village', 'suburb', 'neighbourhood'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': t.labelMinor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5 } },

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
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 19, 14],
          'symbol-placement': 'line',
        },
        paint: { 'text-color': t.labelStreet, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.6 } },

      // Optional public-interest layers (parking, schools, health, parks,
      // civic) — one symbol layer per category over the `poi` source-layer,
      // filtered by class. All always present in the style; visibility is
      // driven by the Layers control (also toggled live via
      // setLayoutProperty, see AtlasScreen). Same zoomed-in-only tier as
      // buildings/street names.
      ...ATLAS_POI_LAYERS.map((l) => ({
        id: `poi-${l.id}`,
        type: 'symbol' as const,
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: l.minzoom,
        filter: ['all',
          ['in', ['get', 'class'], ['literal', l.classes]],
          ...(l.subclasses ? [['in', ['get', 'subclass'], ['literal', l.subclasses]]] : []),
          ...(l.excludeSubclasses ? [['!', ['in', ['get', 'subclass'], ['literal', l.excludeSubclasses]]]] : []),
        ] as unknown as import('maplibre-gl').FilterSpecification,
        layout: {
          visibility: (enabledPoiLayers.includes(l.id) ? 'visible' : 'none') as 'visible' | 'none',
          'icon-image': poiImageId(l.id),
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': 1,
          ...(l.named ? {
            // Name under the marker once close enough to read it.
            'text-field': ['step', ['zoom'], '', 16, ['coalesce', ['get', 'name'], '']] as unknown as import('maplibre-gl').ExpressionSpecification,
            'text-font': ['Noto Sans Regular'],
            'text-size': 9,
            'text-anchor': 'top' as const,
            'text-offset': [0, 0.8] as [number, number],
            'text-optional': true,
            'text-max-width': 8,
          } : {}),
        },
        paint: {
          'icon-opacity': POI_MARKER.variant === 'ring' ? 0.9 : POI_MARKER.iconOpacity,
          ...(l.named
            ? { 'text-color': t.labelStreet, 'text-halo-color': t.labelHalo, 'text-halo-width': 1, 'text-opacity': POI_MARKER.textOpacity }
            : {}),
        },
      })),
    ],
  };
}

// Re-exported so callers don't need their own reference to the brand hexes
// this file derives its palette from.
export const ATLAS_STYLE_BRAND_COLORS = COLOR;
