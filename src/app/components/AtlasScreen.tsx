import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, MapPin,
  Navigation, Bookmark, Share2, Check, Pencil,
  Paperclip, File as FileIcon, Play,
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from 'next-themes';
import { useHub, useHubStatus } from '../context/HubContext';
import { useSavedIds } from '../hooks/useSavedIds';
import { hubService } from '../services/hubService';
import { AvatarFallback } from './icons';
import { AutoplayVideo } from './AutoplayVideo';
import { atlasService } from '../services/atlasService';
import { ATLAS_CATEGORIES, type AtlasPin, type AtlasPinAttachment, type AtlasPinCategory } from '../types/atlas';
import { LocationSearchInput } from './LocationSearchInput';
import { geocodeLocation, reverseGeocode, distanceMeters } from '../utils/geocoding';
import { getAtlasMapStyle } from '../utils/atlasMapStyle';
import { fetchPlacePhoto, type PlacePhoto } from '../utils/placePhoto';
import { findNearestPanoramaxImage, panoramaxWebViewerUrl, type PanoramaxImage } from '../utils/panoramax';
import { AtlasGlyph } from './icons';
import { EventDetailModal } from './EventDetailModal';
import type { HubPost } from '../types/hub';
import { Calendar } from 'lucide-react';

// ── Pin marker HTML (cached) ─────────────────────────────────────────────
// Teardrop-from-rotated-square marker matching the design system: a category-
// gradient diamond with the counter-rotated lucide icon centered inside it.
// Returns an HTML string (not a DOM element) since MapLibre markers each need
// their own element instance — AtlasMap below clones this into a fresh <div>
// per marker rather than sharing one node.

const _pinHtmlCache = new Map<string, string>();

function getPinHtml(category: AtlasPinCategory, selected: boolean): string {
  const key = `${category}-${selected}`;
  const cached = _pinHtmlCache.get(key);
  if (cached) return cached;
  const cat = ATLAS_CATEGORIES[category];
  const s = selected ? 34 : 28;
  const iconPx = selected ? 16 : 13;
  const svg = renderToStaticMarkup(<cat.Icon size={iconPx} color="#fff" strokeWidth={2.5} />);
  const ring = selected
    ? 'box-shadow:0 0 0 3px #fff,0 3px 10px rgba(0,0,0,0.4);'
    : 'box-shadow:0 2px 8px rgba(0,0,0,0.35);';
  const html = `<div style="width:${s}px;height:${s}px;border-radius:50% 50% 50% 0;background:${cat.gradientCss};transform:rotate(45deg);${ring}border:2px solid rgba(255,255,255,${selected ? '1' : '0.55'});display:flex;align-items:center;justify-content:center;cursor:pointer;">` +
    `<span style="transform:rotate(-45deg);display:flex">${svg}</span></div>`;
  _pinHtmlCache.set(key, html);
  return html;
}

// Same amber pulsing-dot treatment NetworkMap.tsx already uses for "you" among
// members, reused here so "this is me" reads consistently across both maps.
const MY_LOCATION_HTML = `
  <div style="position:relative;width:22px;height:22px;">
    <div class="animate-ping" style="position:absolute;inset:0;border-radius:9999px;background:#f59e0b;opacity:0.45;"></div>
    <div style="position:absolute;inset:5px;border-radius:9999px;background:#f59e0b;border:2.5px solid #fff;box-shadow:0 2px 10px rgba(245,158,11,0.7);"></div>
  </div>
`;

// Same teardrop treatment as getPinHtml() above, but a fixed indigo gradient —
// a color no ATLAS_CATEGORIES entry uses — so EVENT-post markers read as a
// distinct, non-AtlasPin layer at a glance rather than looking like an
// additional pin category.
const EVENT_PIN_SVG = renderToStaticMarkup(<Calendar size={13} color="#fff" strokeWidth={2.5} />);
const EVENT_PIN_HTML = `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:linear-gradient(135deg, #6366f1, #4338ca);transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.55);display:flex;align-items:center;justify-content:center;cursor:pointer;">` +
  `<span style="transform:rotate(-45deg);display:flex">${EVENT_PIN_SVG}</span></div>`;

// ── Map (MapLibre GL, vector) ────────────────────────────────────────────
// Atlas used to be Leaflet + a raster OSM tile layer whose pixels got
// recolored client-side (see the removed atlasTileRecolor.ts) — that could
// only ever repaint OSM's own picture, still inheriting every OSM decision
// about label density, building outlines, and visual hierarchy. This renders
// real OSM vector data through a from-scratch Atlas style (see
// ../utils/atlasMapStyle.ts): OSM supplies geographic truth, Atlas fully
// owns the visual language. All the surrounding UI (search, filters, the
// pin list/detail panel, every overlay button below) is unchanged — this
// component is a drop-in replacement for the old <MapContainer> tree, not a
// rewrite of Atlas itself.
interface AtlasMapProps {
  center: [number, number];
  zoom: number;
  fitPoints: [number, number][] | null;
  dark: boolean;
  placingPin: boolean;
  pins: AtlasPin[];
  selectedPinId: string | null;
  onPinSelect: (pin: AtlasPin) => void;
  pendingPosition: [number, number] | null;
  createCategory: AtlasPinCategory;
  myLocation: [number, number] | null;
  onDropHereCenterChange: (c: [number, number]) => void;
  eventPins: HubPost[];
  onEventPinSelect: (event: HubPost) => void;
}

// Imperative escape hatch for one-shot camera moves ("recenter on me",
// "reset to overview") that should NOT be modeled as ongoing React state —
// see the recenterOnMe/resetToOverview comment below for why that was
// actually a real bug, not just an architecture preference.
export interface AtlasMapHandle {
  flyTo: (center: [number, number], zoom: number) => void;
  fitAll: (points: [number, number][], maxZoom?: number) => void;
}

const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(function AtlasMap({
  center, zoom, fitPoints, dark, placingPin, pins, selectedPinId, onPinSelect,
  pendingPosition, createCategory, myLocation, onDropHereCenterChange,
  eventPins, onEventPinSelect,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; sig: string }>>(new Map());
  const eventMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Refs for values read inside event handlers registered once at map-init
  // time, so those handlers always see the latest prop without needing to
  // be torn down and re-attached on every change.
  const placingPinRef = useRef(placingPin);
  placingPinRef.current = placingPin;
  const onDropHereCenterChangeRef = useRef(onDropHereCenterChange);
  onDropHereCenterChangeRef.current = onDropHereCenterChange;
  const onPinSelectRef = useRef(onPinSelect);
  onPinSelectRef.current = onPinSelect;
  const onEventPinSelectRef = useRef(onEventPinSelect);
  onEventPinSelectRef.current = onEventPinSelect;

  useImperativeHandle(ref, () => ({
    flyTo: (c, z) => { mapRef.current?.flyTo({ center: [c[1], c[0]], zoom: z }); },
    fitAll: (points, maxZoom = MAX_ZOOM) => {
      const map = mapRef.current;
      if (!map || points.length === 0) return;
      if (points.length === 1) { map.flyTo({ center: [points[0][1], points[0][0]], zoom: PIN_ZOOM }); return; }
      const bounds = points.reduce(
        (b, p) => b.extend([p[1], p[0]] as [number, number]),
        new maplibregl.LngLatBounds([points[0][1], points[0][0]], [points[0][1], points[0][0]])
      );
      map.fitBounds(bounds, { padding: 32, maxZoom, animate: true });
    },
  }), []);

  // Init once — the map instance itself is imperative, not React-managed.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getAtlasMapStyle(dark),
      center: [center[1], center[0]],
      zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    // MapLibre's "compact" attribution is a native <details open> element —
    // despite the name, it actually starts fully expanded (the full "©
    // OpenStreetMap contributors" text sitting in the corner) regardless of
    // the compact option, and only collapses once the *user* manually
    // toggles it. Worse, it doesn't just start open once — something in the
    // map's own lifecycle (attribution content gets recomputed as more tiles
    // load in, each time apparently resetting to its default-open state)
    // re-opens it again well after initial load too, so a one-time or even a
    // few-seconds-timeboxed fix isn't reliable. This keeps enforcing "closed"
    // for the whole life of the map, but only until a real click on the
    // control itself is observed — from that point on the user's own choice
    // is left alone, forever, even if they close it again later. Attribution
    // is still one click away (OSM's ODbL requires it stay reachable, not
    // permanently visible) — it's just not sitting in the corner as clutter
    // by default, no matter how many times MapLibre tries to reopen it.
    let attribUserInteracted = false;
    const closeAttribution = () => {
      if (attribUserInteracted) return;
      const attribEl = containerRef.current?.querySelector('details.maplibregl-ctrl-attrib');
      if (attribEl) (attribEl as HTMLDetailsElement).open = false;
    };
    closeAttribution();
    const attribCloseInterval = setInterval(closeAttribution, 200);
    const attribSummary = containerRef.current.querySelector('details.maplibregl-ctrl-attrib summary');
    const markAttribInteracted = () => { attribUserInteracted = true; };
    attribSummary?.addEventListener('click', markAttribInteracted);
    map.on('move', () => {
      if (!placingPinRef.current) return;
      const c = map.getCenter();
      onDropHereCenterChangeRef.current([c.lat, c.lng]);
    });
    mapRef.current = map;
    return () => {
      clearInterval(attribCloseInterval);
      attribSummary?.removeEventListener('click', markAttribInteracted);
      map.remove();
      mapRef.current = null;
    };
  // Deliberately mount-only — center/zoom/dark are all handled by their own
  // effects below so this doesn't tear down and rebuild the whole map
  // instance (and every marker on it) on every prop change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme swap — setStyle only touches the vector layers/paint; markers are
  // plain DOM overlays outside the style system, so they survive untouched
  // (no per-tile reprocessing or marker re-add needed, unlike the old
  // raster recolor's per-theme cache). Skips the first run: the map's own
  // constructor above already loaded the correct initial style, and calling
  // setStyle again immediately interrupts that in-progress load (MapLibre
  // logs "Style is not done loading.. Rebuilding from scratch" and the
  // source never actually finishes fetching) rather than genuinely swapping
  // a *finished* one.
  const isFirstStyleRef = useRef(true);
  useEffect(() => {
    if (isFirstStyleRef.current) { isFirstStyleRef.current = false; return; }
    mapRef.current?.setStyle(getAtlasMapStyle(dark));
  }, [dark]);

  // Hides the zoom control while placing a pin, matching the old
  // zoomControl={!placingPin} — keeps the drop-here reticle uncluttered.
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>('.maplibregl-ctrl-top-left');
    if (el) el.style.display = placingPin ? 'none' : '';
  }, [placingPin]);

  // Center/zoom/fit — same priority the old MapCenterController used:
  // fitPoints (the all-pins overview) wins over a fixed center+zoom pair
  // whenever given, since it computes both center *and* the tightest zoom
  // that keeps every point on screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (fitPoints && fitPoints.length > 1) {
      const bounds = fitPoints.reduce(
        (b, p) => b.extend([p[1], p[0]] as [number, number]),
        new maplibregl.LngLatBounds([fitPoints[0][1], fitPoints[0][0]], [fitPoints[0][1], fitPoints[0][0]])
      );
      map.fitBounds(bounds, { padding: 32, maxZoom: MAX_ZOOM, animate: true });
      return;
    }
    if (fitPoints && fitPoints.length === 1) {
      map.flyTo({ center: [fitPoints[0][1], fitPoints[0][0]], zoom: PIN_ZOOM });
      return;
    }
    map.flyTo({ center: [center[1], center[0]], zoom });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom, fitPoints]);

  // Pin markers — diffed by id + a "category-selected" signature so an
  // unrelated re-render (e.g. selecting a *different* pin) only recreates
  // the one or two markers whose look actually changed, not the whole set.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = pinMarkersRef.current;
    const seen = new Set<string>();
    for (const pin of pins) {
      seen.add(pin.id);
      const sig = `${pin.category}-${selectedPinId === pin.id}`;
      let entry = existing.get(pin.id);
      if (!entry || entry.sig !== sig) {
        entry?.marker.remove();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = getPinHtml(pin.category, selectedPinId === pin.id);
        const el = wrapper.firstElementChild as HTMLElement;
        el.addEventListener('click', e => { e.stopPropagation(); onPinSelectRef.current(pin); });
        // setLngLat before addTo — maplibregl.Marker.addTo() triggers an immediate
        // internal _update() that reads the (still-unset) position otherwise.
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map);
        entry = { marker, sig };
        existing.set(pin.id, entry);
      } else {
        entry.marker.setLngLat([pin.longitude, pin.latitude]);
      }
    }
    for (const [id, entry] of existing) {
      if (!seen.has(id)) { entry.marker.remove(); existing.delete(id); }
    }
  }, [pins, selectedPinId]);

  // Pending (unsaved) pin position — drop-here / search-create preview.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pendingPosition) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = getPinHtml(createCategory, true);
    const el = wrapper.firstElementChild as HTMLElement;
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([pendingPosition[1], pendingPosition[0]])
      .addTo(map);
    return () => { marker.remove(); };
  }, [pendingPosition, createCategory]);

  // The user's own live position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !myLocation) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = MY_LOCATION_HTML;
    const el = wrapper.firstElementChild as HTMLElement;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([myLocation[1], myLocation[0]])
      .addTo(map);
    return () => { marker.remove(); };
  }, [myLocation]);

  // EVENT-post markers — a layer independent of AtlasPin (own ref, own diffing,
  // own HTML template), same shape as the myLocation effect above. Not mixed
  // into the `pins` array/category-filter system since events aren't AtlasPins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = eventMarkersRef.current;
    const seen = new Set<string>();
    for (const ev of eventPins) {
      if (ev.event_lat == null || ev.event_lng == null) continue;
      seen.add(ev.id);
      const marker = existing.get(ev.id);
      if (!marker) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = EVENT_PIN_HTML;
        const el = wrapper.firstElementChild as HTMLElement;
        el.addEventListener('click', e => { e.stopPropagation(); onEventPinSelectRef.current(ev); });
        const newMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([ev.event_lng, ev.event_lat])
          .addTo(map);
        existing.set(ev.id, newMarker);
      } else {
        marker.setLngLat([ev.event_lng, ev.event_lat]);
      }
    }
    for (const [id, marker] of existing) {
      if (!seen.has(id)) { marker.remove(); existing.delete(id); }
    }
  }, [eventPins]);

  return <div ref={containerRef} className="w-full h-full" />;
});

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(isoDate));
}

function formatDistanceMiles(meters: number): string {
  const mi = meters / 1609.34;
  if (mi < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${mi.toFixed(1)} mi`;
}

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 14;
// Safety cap for fitBounds around multiple points (e.g. Reset) — not the
// zoom actually used to focus on one pin, see PIN_ZOOM below. OpenFreeMap's
// vector tiles render cleanly up to 19; this is rarely hit in practice since
// spreading across multiple points already keeps the fit well under it.
const MAX_ZOOM = 19;
// The zoom used to focus on a single pin (selecting one, or a filtered/search
// result narrowing to exactly one place) — pulled back halfway from MAX_ZOOM
// toward DEFAULT_ZOOM per user feedback that a flat MAX_ZOOM (19), then a 25%
// pull-back (17.75), both still read as too tight on pin select; still a
// clear close-up, just not the ceiling.
const PIN_ZOOM = MAX_ZOOM - (MAX_ZOOM - DEFAULT_ZOOM) * 0.5;
// Recentering on the user's own location zooms to "see nearby pins" range —
// tighter than the all-pins overview, but not all the way to a single
// building the way a specific pin's detail view does.
const MY_LOCATION_ZOOM = 15;
const SEARCH_HISTORY_KEY = 'citinet-atlas-search-history';
const SAVED_PINS_KEY = 'citinet-saved-atlas-pins';

// ── Place row (list) ────────────────────────────────────────────────────────

/** Full-bleed, horizontally-scrollable strip of a pin's image/video attachments —
 * tiles `grow` to fill the row when there's only 1-2, and fall back to a scroll
 * (plus desktop-only chevrons, same "only show the side(s) there's still more to
 * scroll toward" pattern as Feed's category tab row) once there are too many to
 * fit. Shared by the pin list row and the pin detail view so both preview a
 * pin's media identically — pass `rounded` to clip the corners when the caller
 * doesn't already provide an overflow-hidden container (the list card does).
 * Video tiles never carry native `controls` here (so a click always reaches
 * either the list card's own onClick or `onTileClick` below, instead of being
 * eaten by the scrubber/play button) — a static muted frame with a play badge
 * stands in for it. Without `onTileClick`, a tile click simply bubbles up (the
 * list row uses this so tapping a thumbnail opens the pin like tapping
 * anywhere else on the card); with it (the detail view), the click is
 * intercepted to open the lightbox instead. Only the scroll chevrons always
 * stop propagation, since scrolling the strip should never trigger either. */
function MediaScrollRow({ attachments, hubSlug, altText, rounded, onTileClick }: {
  attachments: { att: AtlasPinAttachment; kind: 'image' | 'video' | 'file' }[];
  hubSlug: string;
  altText: string;
  rounded?: boolean;
  onTileClick?: (kind: 'image' | 'video', url: string) => void;
}) {
  const mediaRowElRef = useRef<HTMLDivElement | null>(null);
  const mediaContentRef = useRef<HTMLDivElement | null>(null);
  const mediaRowCleanupRef = useRef<() => void>(() => {});
  const [mediaScroll, setMediaScroll] = useState({ canLeft: false, canRight: false });

  const updateMediaScroll = useCallback(() => {
    const el = mediaRowElRef.current;
    if (!el) return;
    const scrollLeft = Math.round(el.scrollLeft);
    setMediaScroll({
      canLeft: scrollLeft > 1,
      canRight: scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  const mediaRowRef = useCallback((el: HTMLDivElement | null) => {
    mediaRowCleanupRef.current();
    mediaRowCleanupRef.current = () => {};
    mediaRowElRef.current = el;
    if (!el) return;
    const raf = requestAnimationFrame(updateMediaScroll);
    el.addEventListener('scroll', updateMediaScroll, { passive: true });
    const ro = new ResizeObserver(updateMediaScroll);
    ro.observe(el);
    if (mediaContentRef.current) ro.observe(mediaContentRef.current);
    mediaRowCleanupRef.current = () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', updateMediaScroll);
      ro.disconnect();
    };
  }, [updateMediaScroll]);

  const scrollMedia = (dir: 'left' | 'right') => {
    mediaRowElRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  };

  if (attachments.length === 0) return null;

  // Only the first video in the strip actually autoplays — AutoplayVideo has no
  // built-in cross-instance coordination, so with 2+ videos side by side (easy
  // to hit here, unlike FilesScreen's sparser grid) every visible one would
  // otherwise loop at once. The rest sit on their first frame (still muted,
  // still clickable into the lightbox) until picked.
  const firstVideoFileId = attachments.find(a => a.kind === 'video')?.att.fileId;

  return (
    <div className={`relative ${rounded ? 'rounded-2xl overflow-hidden shadow-md' : ''}`}>
      {mediaScroll.canLeft && (
        <button
          onClick={event => { event.stopPropagation(); scrollMedia('left'); }}
          aria-label="Scroll media left"
          className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full cn-surface border cn-border items-center justify-center shadow-sm"
        >
          <ChevronLeft className="w-3.5 h-3.5 cn-text-2" />
        </button>
      )}
      {mediaScroll.canRight && (
        <button
          onClick={event => { event.stopPropagation(); scrollMedia('right'); }}
          aria-label="Scroll media right"
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full cn-surface border cn-border items-center justify-center shadow-sm"
        >
          <ChevronRight className="w-3.5 h-3.5 cn-text-2" />
        </button>
      )}
      <div
        ref={mediaRowRef}
        className="flex flex-nowrap gap-0.5 overflow-x-auto no-scrollbar scroll-smooth"
      >
        {/* min-w-full (rather than the default shrink-to-fit) makes this row claim
            the full available width even when there's only 1-2 attachments — each
            tile below then `grow`s to split that space instead of leaving it blank.
            Once enough tiles are added that their basis no longer fits, they stop
            growing and this wrapper naturally exceeds the outer scroll container's
            width, which is exactly what makes the horizontal scroll (and chevrons)
            kick in. */}
        <div ref={mediaContentRef} className="flex flex-nowrap gap-0.5 min-w-full">
          {attachments.map(({ att, kind }) => {
            const url = hubService.getPublicFileUrl(hubSlug, att.fileName);
            if (!url || (kind !== 'image' && kind !== 'video')) return null;
            return (
              <div
                key={att.fileId}
                onClick={onTileClick ? event => { event.stopPropagation(); onTileClick(kind, url); } : undefined}
                className={`relative grow shrink-0 basis-[160px] max-w-full h-40 ${onTileClick ? 'cursor-pointer' : ''}`}
              >
                {kind === 'video' ? (
                  <>
                    {att.fileId === firstVideoFileId ? (
                      <AutoplayVideo src={url} preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <video src={url} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                        <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                      </span>
                    </span>
                  </>
                ) : (
                  <img src={url} alt={altText} className="w-full h-full object-cover" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlaceRow({ pin, hubSlug, distanceLabel, onSelect }: {
  pin: AtlasPin;
  hubSlug: string;
  distanceLabel: string | null;
  onSelect: () => void;
}) {
  const cat = ATLAS_CATEGORIES[pin.category];
  const mediaAttachments = (pin.attachments ?? [])
    .map(att => ({ att, kind: classifyAttachment(att.mimeType, att.fileName) }))
    .filter(m => m.kind === 'image' || m.kind === 'video');

  return (
    <div
      onClick={onSelect}
      className="group rounded-xl border cn-border cn-glass hover:border-black/15 dark:hover:border-white/15 cursor-pointer transition-all overflow-hidden"
    >
      {/* Author row — avatar + username lead the card, same as a Feed post; the
          pin type is folded into the small metadata line under the username
          (icon shrunk down) instead of standing alone as a big leading badge. */}
      <div className="flex items-center gap-2.5 p-3 pb-2">
        <AvatarFallback className="w-7 h-7 rounded-full shrink-0" name={pin.authorUsername} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold cn-text-1 truncate">@{pin.authorUsername}</div>
          <div className="flex items-center gap-1 text-[11px] cn-text-4 mt-0.5 min-w-0">
            <cat.Icon className="w-3 h-3 shrink-0" />
            <span className="truncate">{cat.label}</span>
            {distanceLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="cn-mono shrink-0">{distanceLabel}</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 cn-text-4 shrink-0" />
      </div>

      <div className="px-3 pb-2.5">
        <div className="text-sm font-semibold cn-text-1 truncate">{pin.title}</div>
        {pin.description && (
          <p className="text-xs leading-relaxed cn-text-3 mt-1 line-clamp-2">{pin.description}</p>
        )}
      </div>

      {/* Full-bleed media strip — same idea as Feed's post cards, whose media
          spans the card's true edge-to-edge width instead of living inside the
          padded text column (which is what was leaving it starved for room). */}
      {mediaAttachments.length > 0 && (
        <div className="mb-3">
          <MediaScrollRow attachments={mediaAttachments} hubSlug={hubSlug} altText={pin.title} />
        </div>
      )}
    </div>
  );
}

// ── Place detail panel ───────────────────────────────────────────────────────

function PlaceDetailPanel({ pin, hubSlug, distanceLabel, canDelete, canEdit, saved, onBack, onDelete, onToggleSave, onEdit }: {
  pin: AtlasPin;
  hubSlug: string;
  distanceLabel: string | null;
  canDelete: boolean;
  canEdit: boolean;
  saved: boolean;
  onBack: () => void;
  onDelete: () => void;
  onToggleSave: () => void;
  onEdit: () => void;
}) {
  const cat = ATLAS_CATEGORIES[pin.category];
  const [copied, setCopied] = useState(false);
  const [photo, setPhoto] = useState<PlacePhoto | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [userPhotoFailed, setUserPhotoFailed] = useState(false);
  const [panoramax, setPanoramax] = useState<PanoramaxImage | null>(null);
  const [panoramaxFailed, setPanoramaxFailed] = useState(false);
  const [lightbox, setLightbox] = useState<{ kind: 'image' | 'video'; url: string } | null>(null);

  // A user-uploaded photo (set at pin creation) is authoritative — only fall back
  // to the Wikidata/Wikimedia lookup when the pin has none of its own.
  const userPhotoUrl = pin.imageFileName ? hubService.getPublicFileUrl(hubSlug, pin.imageFileName) : null;

  useEffect(() => {
    if (userPhotoUrl) return;
    let cancelled = false;
    setPhoto(null);
    setPhotoFailed(false);
    fetchPlacePhoto(pin.latitude, pin.longitude, pin.title).then(p => {
      if (!cancelled) setPhoto(p);
    });
    return () => { cancelled = true; };
  }, [pin.latitude, pin.longitude, pin.title, userPhotoUrl]);

  // Same "check it, but never make the pin wait on it" approach as
  // citinet-mobile's PinDetailScreen: only checked without a user photo, and
  // the map fallback below renders immediately either way — this silently
  // swaps in ahead of the map if it resolves with a real nearby match. Runs
  // independently of (and possibly in parallel with) the Wikidata lookup
  // above; render order below is what actually decides priority when both
  // resolve, not which fetch finishes first.
  useEffect(() => {
    if (userPhotoUrl) return;
    let cancelled = false;
    setPanoramax(null);
    setPanoramaxFailed(false);
    findNearestPanoramaxImage(pin.latitude, pin.longitude).then(match => {
      if (!cancelled) setPanoramax(match);
    });
    return () => { cancelled = true; };
  }, [pin.latitude, pin.longitude, userPhotoUrl]);

  const classifiedAttachments = (pin.attachments ?? []).map(att => ({ att, kind: classifyAttachment(att.mimeType, att.fileName) }));
  const detailMediaAttachments = classifiedAttachments.filter(m => m.kind === 'image' || m.kind === 'video');
  const detailFileAttachments = classifiedAttachments.filter(m => m.kind === 'file');

  const handleShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('pin', pin.id);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDirections = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors self-start">
        <ChevronLeft className="w-3.5 h-3.5" />All places
      </button>

      {userPhotoUrl && !userPhotoFailed ? (
        <div className="relative h-32 sm:h-36 rounded-2xl overflow-hidden shadow-md">
          <img
            src={userPhotoUrl}
            alt={pin.title}
            className="w-full h-full object-cover"
            onError={() => setUserPhotoFailed(true)}
          />
        </div>
      ) : photo && !photoFailed ? (
        <div className="relative h-32 sm:h-36 rounded-2xl overflow-hidden shadow-md">
          <img
            src={photo.url}
            alt={pin.title}
            className="w-full h-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
          {photo.sourceUrl && (
            <a
              href={photo.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded-md bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              {photo.attribution}
            </a>
          )}
        </div>
      ) : panoramax && !panoramaxFailed ? (
        <a
          href={panoramaxWebViewerUrl(panoramax.pictureId)}
          target="_blank"
          rel="noopener noreferrer"
          className="relative h-32 sm:h-36 rounded-2xl overflow-hidden shadow-md block"
        >
          <img
            src={panoramax.thumbnailUrl}
            alt={pin.title}
            className="w-full h-full object-cover"
            onError={() => setPanoramaxFailed(true)}
          />
          <div className="absolute top-1.5 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold backdrop-blur-sm">
            Explore street view
          </div>
          <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded-md bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm">
            Street view via Panoramax
          </div>
        </a>
      ) : null}

      <div>
        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/5 dark:bg-white/8 cn-text-2 mb-2">
          {cat.label}
        </span>
        <h1 className="text-xl font-bold cn-text-1 tracking-tight">{pin.title}</h1>
        <div className="text-xs cn-text-3 mt-1.5">
          {distanceLabel ? `${distanceLabel} away · ` : ''}pinned {formatRelativeTime(pin.createdAt)}
        </div>
      </div>

      {pin.description && (
        <p className="text-sm leading-relaxed cn-text-2">{pin.description}</p>
      )}

      {/* Image/video attachments preview exactly like the pin list row — same
          full-bleed grow-to-fill/scroll strip, just rounded here since this
          panel (unlike the list card) has no enclosing overflow-hidden card
          of its own to clip it. Non-media files (PDFs, docs, …) still fall
          back to plain download chips below, same as before. */}
      <MediaScrollRow
        attachments={detailMediaAttachments}
        hubSlug={hubSlug}
        altText={pin.title}
        rounded
        onTileClick={(kind, url) => setLightbox({ kind, url })}
      />

      {detailFileAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {detailFileAttachments.map(({ att, kind }) => (
            <AttachmentChip
              key={att.fileId}
              src={hubService.getPublicFileUrl(hubSlug, att.fileName) ?? ''}
              kind={kind}
              fileName={att.fileName}
            />
          ))}
        </div>
      )}

      <div className="cn-glass rounded-xl p-3 flex items-center gap-3">
        <AvatarFallback className="w-8 h-8 rounded-full shrink-0" name={pin.authorUsername} />
        <div className="min-w-0">
          <div className="text-xs font-semibold cn-text-1 truncate">@{pin.authorUsername}</div>
          <div className="text-[11px] cn-text-4">Added this pin</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleDirections}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 cn-action bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <Navigation className="w-3.5 h-3.5" />
          Directions
        </button>
        <button
          onClick={onToggleSave}
          title={saved ? 'Remove from saved' : 'Save'}
          className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-2 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
        >
          <Bookmark className={`w-4 h-4 ${saved ? 'fill-blue-300 text-blue-300' : ''}`} />
        </button>
        <button
          onClick={handleShare}
          title={copied ? 'Copied!' : 'Share'}
          className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-2 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
        </button>
        {canEdit && (
          <button
            onClick={onEdit}
            title="Edit pin"
            className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-2 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            title="Remove pin"
            className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-3 hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lightbox — same full-screen preview pattern as clicking an image in a
          Messages chat bubble (portaled to <body> so it can outrank HubLayout's
          chrome, which starts its own z-10 stacking context), extended to cover
          video too since attachments here aren't blob-fetched auth-gated files —
          they're already public URLs, so there's nothing to await before opening. */}
      {createPortal(
        <AnimatePresence>
          {lightbox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setLightbox(null)}
            >
              {lightbox.kind === 'video' ? (
                <video
                  src={lightbox.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <img
                  src={lightbox.url}
                  alt={pin.title}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={e => e.stopPropagation()}
                />
              )}
              <button
                onClick={() => setLightbox(null)}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors"
                title="Close preview"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

// ── Create-pin flow (details → review → success) ────────────────────────────
// Location is chosen beforehand via the real map's drop-here mode, so unlike the
// design mock this panel skips straight to details — no separate location step.

const CATEGORY_KEYWORDS: Record<AtlasPinCategory, string[]> = {
  meetup:         ['meet', 'meetup', 'hangout', 'gathering', 'bench', 'plaza', 'square', 'spot'],
  safety:         ['warning', 'alert', 'caution', 'flood', 'hazard', 'unsafe', 'broken', 'incident', 'crime', 'accident'],
  avoid:          ['avoid', 'danger', 'closed', 'blocked', 'abandoned', 'sketchy', 'stay away'],
  infrastructure: ['community center', 'hall', 'library', 'school', 'church', 'facility', 'clinic', 'station'],
  poi:            ['coffee', 'cafe', 'café', 'restaurant', 'food', 'shop', 'store', 'market', 'bar',
                   'trail', 'fountain', 'museum', 'gallery', 'starbucks', 'landmark', 'monument'],
  aid:            ['fridge', 'pantry', 'food bank', 'free food', 'mutual aid', 'donation', 'giveaway', 'tool library', 'clothing swap'],
  green:          ['garden', 'park', 'green space', 'community garden', 'orchard', 'planter', 'meadow', 'trees'],
};

function suggestCategory(title: string): AtlasPinCategory | null {
  if (!title.trim()) return null;
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [AtlasPinCategory, string[]][]) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

// ── Pin attachments (media/files beyond the single cover photo) ────────────
// Mirrors Messages' attachment conventions (same size cap, same combined
// image/video/document accept string) rather than inventing new limits.

const PIN_ATTACHMENT_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx';
const MAX_PIN_ATTACHMENTS = 10;
const MAX_PIN_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB

const ATTACHMENT_VIDEO_EXTS = new Set(['mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv', 'ogv', '3gp']);
const ATTACHMENT_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);

function classifyAttachment(mimeType: string | undefined, fileName: string): 'image' | 'video' | 'file' {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && ATTACHMENT_IMAGE_EXTS.has(ext)) return 'image';
  if (ext && ATTACHMENT_VIDEO_EXTS.has(ext)) return 'video';
  return 'file';
}

/** A single attachment thumbnail/chip — used both while composing (with a
 * remove button) and read-only in the pin detail view. */
function AttachmentChip({ src, kind, fileName, onRemove, large = false }: {
  src: string;
  kind: 'image' | 'video' | 'file';
  fileName: string;
  onRemove?: () => void;
  large?: boolean;
}) {
  const sizeClass = large ? 'w-[120px] h-[120px]' : 'w-16 h-16';
  return (
    <div className="relative">
      {kind === 'image' ? (
        <img src={src} alt="" className={`${sizeClass} rounded-lg object-cover cn-glass`} />
      ) : kind === 'video' ? (
        <video src={src} controls playsInline className={`${sizeClass} rounded-lg object-cover cn-glass`} />
      ) : (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          title={fileName}
          className={`${sizeClass} rounded-lg cn-glass flex flex-col items-center justify-center gap-1 px-1`}
        >
          <FileIcon className="w-4 h-4 cn-text-4" />
          <span className="text-[9px] cn-text-4 truncate max-w-full">{fileName}</span>
        </a>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove ${fileName}`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

type CreateStep = 'details' | 'review' | 'success';

/** Handles both "drop a new pin" and "edit an existing pin" — pass `editingPin`
 * for the latter. Editing skips the review/success steps (it's a quick correction,
 * not a new-place ceremony) and saves straight from the single details form. */
function PinFormPanel({ position, hubSlug, editingPin, suggestedTitle, category, onCategoryChange, onPublish, onCancel, onDone }: {
  position: [number, number];
  hubSlug: string;
  editingPin?: AtlasPin;
  suggestedTitle: string | null;
  category: AtlasPinCategory;
  onCategoryChange: (c: AtlasPinCategory) => void;
  onPublish: (data: { title: string; description?: string; category: AtlasPinCategory; imageFileName?: string; attachmentIds?: string[] }) => Promise<AtlasPin>;
  onCancel: () => void;
  onDone: (pin: AtlasPin) => void;
}) {
  const isEditing = !!editingPin;
  const [step, setStep] = useState<CreateStep>('details');
  const [title, setTitle] = useState(editingPin?.title ?? suggestedTitle ?? '');
  const [description, setDescription] = useState(editingPin?.description ?? '');
  const imagePreview = editingPin?.imageFileName ? hubService.getPublicFileUrl(hubSlug, editingPin.imageFileName) : null;
  const [keptAttachments, setKeptAttachments] = useState<AtlasPinAttachment[]>(editingPin?.attachments ?? []);
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; url: string; kind: 'image' | 'video' | 'file' }[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedPin, setPublishedPin] = useState<AtlasPin | null>(null);

  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;
  useEffect(() => () => { pendingAttachmentsRef.current.forEach(a => URL.revokeObjectURL(a.url)); }, []);

  const attachmentCount = keptAttachments.length + pendingAttachments.length;

  const handleAttachmentsSelect = (files: FileList) => {
    setAttachmentError(null);
    const room = MAX_PIN_ATTACHMENTS - attachmentCount;
    if (room <= 0) {
      setAttachmentError(`Up to ${MAX_PIN_ATTACHMENTS} files per pin`);
      return;
    }
    const accepted: { file: File; url: string; kind: 'image' | 'video' | 'file' }[] = [];
    for (const file of Array.from(files)) {
      if (accepted.length >= room) {
        setAttachmentError(`Up to ${MAX_PIN_ATTACHMENTS} files per pin`);
        break;
      }
      if (file.size > MAX_PIN_ATTACHMENT_SIZE) {
        setAttachmentError(`${file.name} is over the 50MB limit`);
        continue;
      }
      accepted.push({ file, url: URL.createObjectURL(file), kind: classifyAttachment(file.type, file.name) });
    }
    if (accepted.length) setPendingAttachments(prev => [...prev, ...accepted]);
  };

  const removePendingAttachment = (url: string) => {
    setPendingAttachments(prev => {
      const found = prev.find(a => a.url === url);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter(a => a.url !== url);
    });
  };

  const removeKeptAttachment = (fileId: string) => {
    setKeptAttachments(prev => prev.filter(a => a.fileId !== fileId));
  };

  const cat = ATLAS_CATEGORIES[category];
  const categorySuggestion = useMemo(() => suggestCategory(title), [title]);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const imageFileName = editingPin?.imageFileName;
      let attachmentIds = keptAttachments.map(a => a.fileId);
      if (pendingAttachments.length) {
        const uploaded = await hubService.uploadFiles(hubSlug, pendingAttachments.map(a => a.file), true);
        attachmentIds = [...attachmentIds, ...uploaded.map(u => u.id)];
      }
      const pin = await onPublish({ title: title.trim(), description: description.trim() || undefined, category, imageFileName, attachmentIds });
      if (isEditing) {
        onDone(pin);
      } else {
        setPublishedPin(pin);
        setStep('success');
      }
    } catch {
      setError('Something went wrong — try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors"
        >
          {step === 'success' ? <X className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          {step === 'success' ? 'Close' : 'Cancel'}
        </button>
        {step !== 'success' && !isEditing && (
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 rounded-full transition-all ${step === 'details' ? 'w-4 bg-blue-500' : 'w-1.5 bg-black/10 dark:bg-white/15'}`} />
            <span className={`h-1.5 rounded-full transition-all ${step === 'review' ? 'w-4 bg-blue-500' : 'w-1.5 bg-black/10 dark:bg-white/15'}`} />
          </div>
        )}
      </div>

      {step === 'details' && (
        <>
          <div>
            <h2 className="text-lg font-bold cn-text-1">{isEditing ? 'Edit pin' : 'Add details'}</h2>
            <p className="text-xs cn-text-3 mt-1">
              {isEditing ? 'Update the details for this pin.' : 'Your pin will be placed exactly where you positioned it on the map.'}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold cn-text-3 mb-1.5">Name</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Free Little Library"
              autoFocus
              className="w-full px-3 py-2.5 cn-surface border cn-border rounded-lg text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold cn-text-3">Category</label>
              {categorySuggestion && categorySuggestion !== category && (
                <button
                  type="button"
                  onClick={() => onCategoryChange(categorySuggestion)}
                  className="text-[11px] cn-text-3 hover:cn-text-1 transition-colors"
                >
                  Suggested: {ATLAS_CATEGORIES[categorySuggestion].label}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(ATLAS_CATEGORIES) as [AtlasPinCategory, typeof ATLAS_CATEGORIES[AtlasPinCategory]][]).map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => onCategoryChange(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                    category === key
                      ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/30'
                      : 'bg-black/5 dark:bg-white/5 cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                  }`}
                >
                  <c.Icon className="w-3 h-3" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold cn-text-3 mb-1.5">
              Description <span className="font-normal cn-text-4">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="What should neighbors know about this place?"
              className="w-full px-3 py-2.5 cn-surface border cn-border rounded-lg text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold cn-text-3 mb-1.5">
              Attachments <span className="font-normal cn-text-4">(optional)</span>
            </label>
            {attachmentCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {keptAttachments.map(att => (
                  <AttachmentChip
                    key={att.fileId}
                    src={hubService.getPublicFileUrl(hubSlug, att.fileName) ?? ''}
                    kind={classifyAttachment(att.mimeType, att.fileName)}
                    fileName={att.fileName}
                    onRemove={() => removeKeptAttachment(att.fileId)}
                    large
                  />
                ))}
                {pendingAttachments.map(att => (
                  <AttachmentChip
                    key={att.url}
                    src={att.url}
                    kind={att.kind}
                    fileName={att.file.name}
                    onRemove={() => removePendingAttachment(att.url)}
                    large
                  />
                ))}
              </div>
            )}
            {attachmentCount < MAX_PIN_ATTACHMENTS && (
              <label className="flex items-center justify-center gap-2 h-11 rounded-lg border border-dashed cn-border hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-colors">
                <Paperclip className="w-3.5 h-3.5 cn-text-4" />
                <span className="text-xs cn-text-4">Add photos, videos, or files</span>
                <input
                  type="file"
                  multiple
                  accept={PIN_ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={e => { if (e.target.files?.length) handleAttachmentsSelect(e.target.files); e.target.value = ''; }}
                />
              </label>
            )}
            {attachmentError && <p className="text-[11px] text-red-400 mt-1.5">{attachmentError}</p>}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={isEditing ? handlePublish : () => setStep('review')}
            disabled={!title.trim() || publishing}
            className="w-full px-4 py-2.5 cn-action bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {isEditing ? (publishing ? 'Saving…' : 'Save changes') : 'Review pin'}
          </button>
        </>
      )}

      {step === 'review' && (
        <>
          <h2 className="text-lg font-bold cn-text-1">Review &amp; publish</h2>
          <div className="cn-glass rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center shrink-0`}>
                  <cat.Icon className="w-4 h-4 text-white" />
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold cn-text-1 truncate">{title.trim() || 'Untitled place'}</div>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/8 cn-text-2">{cat.label}</span>
              </div>
            </div>
            {description.trim() && <p className="text-xs leading-relaxed cn-text-3">{description.trim()}</p>}
            {attachmentCount > 0 && (
              <p className="text-[11px] cn-text-4">{attachmentCount} attachment{attachmentCount === 1 ? '' : 's'}</p>
            )}
            <p className="cn-mono text-[10px] cn-text-4">{position[0].toFixed(4)}, {position[1].toFixed(4)}</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setStep('details')}
              className="flex-1 px-4 py-2.5 rounded-xl border cn-border text-sm font-medium cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {publishing ? 'Publishing…' : 'Publish pin'}
            </button>
          </div>
        </>
      )}

      {step === 'success' && publishedPin && (
        <>
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <span className="w-[52px] h-[52px] rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
              <Check className="w-6 h-6 text-white" />
            </span>
            <h2 className="text-lg font-bold cn-text-1">Pin published</h2>
            <p className="text-xs cn-text-3">Neighbors nearby can see it on Atlas now.</p>
          </div>
          <div className="cn-glass rounded-xl p-3 flex items-center gap-3">
            <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center shrink-0`}>
              <cat.Icon className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold cn-text-1 truncate">{publishedPin.title}</div>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/8 cn-text-2">{cat.label}</span>
            </div>
          </div>
          <button
            onClick={() => onDone(publishedPin)}
            className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

interface AtlasScreenProps {
  // Present when reached via a deep link (e.g. "Open in Atlas" from a post
  // location) — renders the mobile back button. Absent in home mode, where
  // AtlasScreen is mounted at `/` with no "back" destination.
  onBack?: () => void;
  // Home mode only — powers the event-pin click-through into Feed and the
  // compose/profile deep links used by EventDetailModal.
  onNavigate?: (screen: string) => void;
}

export function AtlasScreen({ onBack, onNavigate }: AtlasScreenProps) {
  const { currentHub, currentUser } = useHub();
  const { status: connectionStatus } = useHubStatus();
  const hubSlug = currentHub?.slug ?? '';

  const [pins, setPins] = useState<AtlasPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [geocoded, setGeocoded] = useState(false);
  const [hubGeoCenter, setHubGeoCenter] = useState<[number, number] | null>(null);

  // Event pins (home mode) — EVENT-category posts with coordinates, rendered
  // as their own marker layer (see AtlasMap's eventPins prop). Featured
  // content moved to the Notifications screen — see notificationMeta/
  // NotificationsScreen.tsx — so it's no longer fetched here.
  const [eventPins, setEventPins] = useState<HubPost[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<HubPost | null>(null);

  useEffect(() => {
    if (!hubSlug || connectionStatus !== 'connected') return;
    hubService.getUpcomingEvents(hubSlug, 200)
      .then(events => setEventPins(events.filter(e => e.event_lat != null && e.event_lng != null)))
      .catch(() => {});
  }, [hubSlug, connectionStatus]);

  // Drop-here placement mode
  const [placingPin, setPlacingPin] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number] | null>(null);
  // Reuses the same create-flow panel/position state for editing an existing pin
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [dropHereCenter, setDropHereCenter] = useState<[number, number] | null>(null);
  const [nearbyPlace, setNearbyPlace] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [createCategory, setCreateCategory] = useState<AtlasPinCategory>('poi');

  // Location search — dropdown/results/history are owned by <LocationSearchInput>
  const [locationQuery, setLocationQuery] = useState('');

  // A location referenced elsewhere (e.g. an EVENT post) with no nearby pin yet
  const [unregisteredLocation, setUnregisteredLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);

  // Clearing the unified search box resets the map back to its normal
  // all-pins overview instead of leaving a stale placeholder around.
  useEffect(() => {
    if (!locationQuery.trim()) setUnregisteredLocation(null);
  }, [locationQuery]);

  // The user's own live position — gated behind the same "Show my location"
  // account preference (AccountScreen.tsx) that already controls whether
  // they appear on the Network map, rather than a second Atlas-only toggle.
  // This is the device's real GPS position (unlike Network map's privacy-
  // preserving fuzzed offsets), since the whole point here is literally
  // seeing where you are relative to real pins.
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  // Imperative handle onto the map for one-shot camera moves that shouldn't
  // be modeled as React state — see recenterOnMe/resetToOverview below.
  const atlasMapRef = useRef<AtlasMapHandle>(null);

  useEffect(() => {
    if (currentUser?.locationVisible === false) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {}, // denied/unavailable — no marker, no nag, same as any optional browser permission
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, [currentUser?.locationVisible]);

  // Pin list filters — the pin-title filter shares `locationQuery` with the
  // unified search field above (searching a place or an existing pin is now
  // the same box).
  const [categoryFilter, setCategoryFilter] = useState<AtlasPinCategory | 'all'>('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [listScrolled, setListScrolled] = useState(false);

  // Saved/bookmarked pins — account-level (hub_user_preferences), shared
  // between the detail panel's bookmark toggle and the "Saved" filter chip
  // in the list view. See useSavedIds for why (previously localStorage-only,
  // so a save never followed the account across devices/browsers).
  const { ids: savedPinIds, toggle: toggleSavedPin } = useSavedIds('saved_atlas_pins', SAVED_PINS_KEY);

  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPins = useCallback(async () => {
    if (hubSlug) setPins(await atlasService.getPins(hubSlug));
  }, [hubSlug]);

  useEffect(() => { loadPins(); }, [loadPins]);

  useEffect(() => {
    if (pins.length === 0) return;
    const deeplink = sessionStorage.getItem('citinet-deeplink-pin');
    if (!deeplink) return;
    sessionStorage.removeItem('citinet-deeplink-pin');
    const target = pins.find(p => p.id === deeplink);
    if (target) handlePinSelect(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  useEffect(() => {
    if (pins.length === 0) return;
    const focusPin = sessionStorage.getItem('citinet-focus-pin');
    if (!focusPin) return;
    sessionStorage.removeItem('citinet-focus-pin');
    const target = pins.find(p => p.id === focusPin);
    if (target) handlePinSelect(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // A pin shared via the detail panel's Share button — carried as a real ?pin= URL
  // param (unlike the sessionStorage deep-links above) so it survives a fresh load
  // in another tab/device. Consumed once, then stripped from the URL.
  useEffect(() => {
    if (pins.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const sharedPinId = params.get('pin');
    if (!sharedPinId) return;
    const target = pins.find(p => p.id === sharedPinId);
    if (target) handlePinSelect(target);
    params.delete('pin');
    const newSearch = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // A post (or other feature) linked to raw coordinates, not an existing pin id.
  // If something's already pinned nearby, treat it the same as a real pin deep-link;
  // otherwise center the map there and offer to add a pin — never create one silently.
  useEffect(() => {
    if (pins.length === 0) return;
    const raw = sessionStorage.getItem('citinet-deeplink-coords');
    if (!raw) return;
    sessionStorage.removeItem('citinet-deeplink-coords');
    try {
      const { lat, lng, label } = JSON.parse(raw) as { lat: number; lng: number; label: string };
      // Exact-name match takes priority over raw coordinate proximity. A geocoded
      // deep-link for a named business (e.g. an event/post location that never had
      // its own lat/lng stored, so it had to be re-geocoded from free text — see
      // openLocationInAtlas) can easily resolve to the WRONG branch of a real
      // multi-location chain (Nominatim/OSM has no way to know which one the
      // original poster meant), landing many miles from an already-pinned branch
      // with the identical name and failing the distance check even though the
      // user clearly already has "the" pin for that name in this hub. A same-hub
      // pin whose title matches exactly is a far stronger signal than "closest
      // geocode result to the hub center" ever is.
      const nameMatch = pins.find(p => p.title.trim().toLowerCase() === label.trim().toLowerCase());
      const nearby = nameMatch ?? pins.find(p => distanceMeters(lat, lng, p.latitude, p.longitude) <= 100);
      if (nearby) {
        handlePinSelect(nearby);
      } else {
        setMapCenter([lat, lng]);
        setUnregisteredLocation({ lat, lng, label });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // A location we couldn't auto-geocode (e.g. a generic venue name with no city/state
  // context) — pre-fill the search box so the user can pick the right result themselves
  // instead of the "view in Atlas" link just doing nothing.
  useEffect(() => {
    const q = sessionStorage.getItem('citinet-deeplink-atlas-search');
    if (!q) return;
    sessionStorage.removeItem('citinet-deeplink-atlas-search');
    setLocationQuery(q);
  }, []);

  useEffect(() => {
    if (!currentHub) return;
    if (currentHub.lat && currentHub.lng) {
      const c: [number, number] = [currentHub.lat, currentHub.lng];
      setMapCenter(c); setHubGeoCenter(c); setGeocoded(true);
      return;
    }
    if (!currentHub.location) return;
    const cacheKey = `citinet-geo:${currentHub.location}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { const c = JSON.parse(cached) as [number, number]; setMapCenter(c); setHubGeoCenter(c); setGeocoded(true); return; } catch {}
    }
    geocodeLocation(currentHub.location).then(coords => {
      if (coords) {
        sessionStorage.setItem(cacheKey, JSON.stringify(coords));
        setMapCenter(coords); setHubGeoCenter(coords); setGeocoded(true);
      }
    });
  }, [currentHub?.lat, currentHub?.lng, currentHub?.location]);

  const handlePinSelect = (pin: AtlasPin) => {
    setSelectedPinId(pin.id);
    setMapCenter([pin.latitude, pin.longitude]);
  };

  // Recenters the map on the user's own live location. This is a one-shot
  // imperative camera move (via atlasMapRef), deliberately NOT modeled as
  // React state the way selecting a pin or searching a location is — an
  // earlier version set a `focusOnMe` flag that fed into the declarative
  // center/zoom/fitPoints effect, and it had a real bug: any subsequent
  // state change that cleared the flag (a plain map click could trigger
  // MapLibre's own dragstart event even without an actual drag) flipped
  // isOverviewMode back on and snapped the camera to the all-pins fit,
  // undoing the recenter the moment the user tried to look around. Going
  // through the ref instead means the camera just moves once and then sits
  // wherever it lands — completely free to pan/zoom/click afterward, same
  // as any normal "locate me" button.
  const recenterOnMe = () => {
    if (!myLocation) return;
    cancelPlacement();
    setSelectedPinId(null);
    setUnregisteredLocation(null);
    atlasMapRef.current?.flyTo(myLocation, MY_LOCATION_ZOOM);
  };

  // Same one-shot-camera-move principle as recenterOnMe — resets the view to
  // the all-pins overview without needing to fight or wait on any reactive
  // state.
  const resetToOverview = () => {
    cancelPlacement();
    setSelectedPinId(null);
    setUnregisteredLocation(null);
    if (pinFitPoints) {
      atlasMapRef.current?.fitAll(pinFitPoints);
    } else {
      atlasMapRef.current?.flyTo(mapCenter, DEFAULT_ZOOM);
    }
  };

  // ── Drop-here placement ──────────────────────────────────────────────────

  const enterPlacingMode = () => {
    cancelPlacement();
    setUnregisteredLocation(null);
    setPlacingPin(true);
    setDropHereCenter(mapCenter);
    reverseGeocode(mapCenter[0], mapCenter[1]).then(n => setNearbyPlace(n));
  };

  const handleDropHereCenterChange = useCallback((center: [number, number]) => {
    setDropHereCenter(center);
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = setTimeout(async () => {
      const name = await reverseGeocode(center[0], center[1]);
      setNearbyPlace(name);
    }, 600);
  }, []);

  const handleDropHereConfirm = () => {
    if (!dropHereCenter) return;
    setPendingPosition(dropHereCenter);
    setSuggestedTitle(nearbyPlace);
    setCreateCategory('poi');
    setPlacingPin(false);
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
  };

  const cancelPlacement = () => {
    setPlacingPin(false);
    setPendingPosition(null);
    setDropHereCenter(null);
    setNearbyPlace(null);
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
  };

  // ── Location search ──────────────────────────────────────────────────────

  const handleLocationSelect = (result: { lat: number; lng: number; label: string }) => {
    setMapCenter([result.lat, result.lng]);
    // Unified search: a hit on an already-pinned spot opens that pin directly;
    // otherwise center the map there and surface a placeholder in the list
    // instead of jumping straight into the create form ("user sees
    // placeholder-esque pin instead of 'No pins match your filter'").
    const nearby = pins.find(p => distanceMeters(result.lat, result.lng, p.latitude, p.longitude) <= 100);
    if (nearby) {
      setLocationQuery('');
      setUnregisteredLocation(null);
      handlePinSelect(nearby);
    } else {
      setLocationQuery(result.label);
      setUnregisteredLocation({ lat: result.lat, lng: result.lng, label: result.label });
    }
  };

  // ── Pin CRUD ─────────────────────────────────────────────────────────────

  const startEditPin = (pin: AtlasPin) => {
    setEditingPinId(pin.id);
    setPendingPosition([pin.latitude, pin.longitude]);
    setSuggestedTitle(null);
    setCreateCategory(pin.category);
  };

  /** Creates or updates a pin (editingPinId decides which) but leaves the panel's
   * own step logic in charge of what happens next — for creation it advances to a
   * 'success' step and calls `finishCreate` once the user is done there; edits skip
   * straight to `finishCreate` themselves. */
  const handleFormSubmit = async (data: { title: string; description?: string; category: AtlasPinCategory; imageFileName?: string; attachmentIds?: string[] }): Promise<AtlasPin> => {
    if (!hubSlug) throw new Error('Not ready');
    if (editingPinId) {
      const pin = await atlasService.updatePin(hubSlug, editingPinId, data);
      await loadPins();
      return pin;
    }
    if (!pendingPosition || !currentUser?.username) throw new Error('Not ready to publish');
    const pin = await atlasService.addPin(hubSlug, currentUser.username, {
      latitude: pendingPosition[0],
      longitude: pendingPosition[1],
      ...data,
    });
    await loadPins();
    return pin;
  };

  const finishCreate = (pin: AtlasPin) => {
    setPendingPosition(null);
    setSuggestedTitle(null);
    setEditingPinId(null);
    setSelectedPinId(pin.id);
    setMapCenter([pin.latitude, pin.longitude]);
  };

  const cancelCreate = () => {
    setPendingPosition(null);
    setSuggestedTitle(null);
    setEditingPinId(null);
  };

  const handleDeletePin = async (pinId: string) => {
    if (!hubSlug) return;
    await atlasService.deletePin(hubSlug, pinId);
    if (selectedPinId === pinId) setSelectedPinId(null);
    await loadPins();
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedPin = selectedPinId ? pins.find(p => p.id === selectedPinId) ?? null : null;
  const rightPanelActive = !!selectedPin || !!pendingPosition;
  // Showing one specific pin (selected from the map, the list, or any of the
  // deep-link paths above) zooms all the way in, centered on it — browsing
  // the full map stays at the normal overview zoom. Only reacts to
  // selectedPinId itself (see MapCenterController below), so it never fights
  // a manual zoom-out afterward — "user can always zoom out if they want."
  const mapZoom = selectedPinId ? PIN_ZOOM : DEFAULT_ZOOM;
  // Genuine "just browsing" overview — not while a pin's focused, nor while
  // previewing/placing a new one (drop-here, a searched location, an
  // unresolved deep-link coordinate), all of which have their own explicit
  // "travel to this exact spot" center that fitting-to-all-pins would
  // otherwise fight. Recentering on "me" deliberately does NOT participate
  // here — it's a one-shot imperative camera move (see recenterOnMe), not a
  // mode this declarative effect needs to know about or defend.
  const isOverviewMode = !selectedPinId && !pendingPosition && !placingPin && !unregisteredLocation;
  // Every pin currently on the map (the map itself renders from the full
  // `pins` list, not the sidebar's filtered subset — fitting matches what's
  // actually plotted). Memoized so MapCenterController's effect only re-runs
  // on a real pins change (initial load, or after add/edit/delete), never on
  // an unrelated render, so idle pan/zoom around the overview is never undone.
  const pinFitPoints = useMemo<[number, number][] | null>(
    () => (pins.length > 0 ? pins.map(p => [p.latitude, p.longitude] as [number, number]) : null),
    [pins]
  );

  const filteredPins = pins
    .filter(p => !savedOnly || savedPinIds.includes(p.id))
    .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
    .filter(p => !locationQuery || p.title.toLowerCase().includes(locationQuery.toLowerCase()) || p.description?.toLowerCase().includes(locationQuery.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const distanceTo = (pin: AtlasPin) =>
    hubGeoCenter ? formatDistanceMiles(distanceMeters(hubGeoCenter[0], hubGeoCenter[1], pin.latitude, pin.longitude)) : null;

  // Moderation (delete) stays available to admins; editing someone else's pin content
  // does not — a mod can remove a bad pin, but shouldn't be able to rewrite it.
  const canDeletePin = (pin: AtlasPin) => currentUser?.username === pin.authorUsername || !!currentUser?.isAdmin;
  const canEditPin = (pin: AtlasPin) => currentUser?.username === pin.authorUsername;

  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  return (
    // lg:h-full lg:flex lg:flex-col (mobile untouched — display:block/auto,
    // exactly as before): this used to be min-h-screen, which forced this
    // div to be 100vh tall even though it renders inside HubLayout's own
    // scrollable content zone — a zone that's already shorter than the full
    // viewport (HubLayout reserves its own space above it, and a different
    // amount again depending on which desktop nav layout is active). That
    // mismatch showed up as a few px of phantom scroll on the *outer* page,
    // even though the only thing that should ever scroll is the pin list.
    // Rather than guess a corrected vh number (wrong the moment HubLayout's
    // chrome changes again) or measure it in JS, this makes height flow
    // through real CSS layout instead: h-full here resolves against
    // HubLayout's scroll zone (confirmed live — a flex item's flexed size
    // counts as "definite" for percentage resolution), flex-1/min-h-0
    // carries that real, always-correct height down to the two-column grid,
    // and the grid's own two children each get exactly their share of it
    // and manage their own internal scrolling — no vh math anywhere below
    // HubLayout, no matter what changes there.
    <div className="lg:h-full lg:flex lg:flex-col">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-7 lg:flex-1 lg:min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[500px_1fr] gap-7 items-start lg:items-stretch lg:h-full">

          {/* ── Right: map ── */}
          <div className={rightPanelActive ? 'hidden lg:block min-w-0 lg:min-h-0 lg:order-2' : 'min-w-0 lg:min-h-0 lg:order-2'}>
            <div className="relative aspect-square rounded-2xl overflow-hidden border cn-border">
              <div className="w-full h-full isolate cn-atlas-map">
                <AtlasMap
                  ref={atlasMapRef}
                  center={mapCenter}
                  zoom={mapZoom}
                  fitPoints={isOverviewMode ? pinFitPoints : null}
                  dark={isDarkMode}
                  placingPin={placingPin}
                  pins={pins}
                  selectedPinId={selectedPinId}
                  onPinSelect={handlePinSelect}
                  pendingPosition={pendingPosition}
                  createCategory={createCategory}
                  myLocation={myLocation}
                  onDropHereCenterChange={handleDropHereCenterChange}
                  eventPins={eventPins}
                  onEventPinSelect={setSelectedEvent}
                />
              </div>

              {/* Same floating legend-chip component NetworkMap.tsx uses for
                  its Hub/Members/You key (translucent+blurred pill, small
                  color dot + label per entry) — here made clickable: "You"
                  recenters on your live location, "Reset" snaps back to the
                  all-pins overview. Both are one-shot camera moves (see
                  recenterOnMe/resetToOverview) and stay clickable regardless
                  of where the map currently is — same as any normal map
                  app's "locate me" button, they don't hide themselves or
                  fight whatever you do with the map afterward. Bottom-left,
                  not bottom-right: MapLibre's own attribution control lives
                  in that corner by default. */}
              {(myLocation || pins.length > 0) && (
                <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-lg p-1 border border-slate-200 dark:border-zinc-700 shadow-lg flex items-center gap-1">
                  {myLocation && (
                    <button
                      onClick={recenterOnMe}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Recenter on my location"
                      aria-label="Recenter on my location"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span>You</span>
                    </button>
                  )}
                  {pins.length > 0 && (
                    <button
                      onClick={resetToOverview}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Reset to all pins"
                      aria-label="Reset to all pins"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              )}

              {/* Drop-here overlay */}
              {placingPin && (
                <>
                  <div
                    className="absolute left-1/2 top-1/2 z-[1000] pointer-events-none"
                    style={{ transform: 'translate(-50%, -100%)' }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#7c3aed', border: '3px solid white',
                      boxShadow: '0 0 0 4px rgba(124,58,237,0.25), 0 4px 14px rgba(0,0,0,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>📍</div>
                    <div className="w-0.5 h-3 bg-blue-600 mx-auto opacity-70" />
                  </div>

                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-[280px]">
                    <div className="px-3 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-full shadow-lg border cn-border text-xs font-medium cn-text-2 truncate">
                      {nearbyPlace ? `Near: ${nearbyPlace}` : 'Pan the map to position your pin'}
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5">
                    <button
                      onClick={cancelPlacement}
                      className="px-4 py-2.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border cn-border text-sm font-medium cn-text-2 shadow-lg hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDropHereConfirm}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg transition-colors"
                    >
                      <MapPin className="w-4 h-4" />
                      Place pin here
                    </button>
                  </div>
                </>
              )}

              {/* Referenced location with no nearby pin yet — offer to add one, never automatic */}
              {unregisteredLocation && !placingPin && (
                <>
                  <div
                    className="absolute left-1/2 top-1/2 z-[1000] pointer-events-none"
                    style={{ transform: 'translate(-50%, -100%)' }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(113,113,122,0.85)', border: '2.5px dashed white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                    }}>📍</div>
                  </div>
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-[280px]">
                    <div className="px-3 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-full shadow-lg border cn-border text-xs font-medium cn-text-2 truncate">
                      {unregisteredLocation.label} · nothing pinned here yet
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5">
                    <button
                      onClick={() => setUnregisteredLocation(null)}
                      className="px-4 py-2.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border cn-border text-sm font-medium cn-text-2 shadow-lg hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => {
                        setPendingPosition([unregisteredLocation.lat, unregisteredLocation.lng]);
                        setSuggestedTitle(unregisteredLocation.label);
                        setCreateCategory('poi');
                        setUnregisteredLocation(null);
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg transition-colors"
                    >
                      <MapPin className="w-4 h-4" />
                      Add pin here
                    </button>
                  </div>
                </>
              )}

              {/* Hub geocoding overlays */}
              {!geocoded && currentHub?.location && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm pointer-events-none">
                  <p className="text-xs cn-text-3">Locating hub…</p>
                </div>
              )}
              {!currentHub?.location && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
                  <p className="text-sm cn-text-3">Set a hub location to center the map</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Left: back + header + search + pin list or place detail ── */}
          {/* The column owns its scroll on lg+; the header stays pinned while
              the pin list or detail content moves underneath it. */}
          <div className="flex flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-hidden lg:pr-1 no-scrollbar lg:order-1">
            <div className="py-1 shrink-0">
              <div className="flex flex-col gap-5">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="md:hidden inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors self-start"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </button>
                )}

                <div className="flex items-center gap-3">
                  <span
                    className="w-11 h-11 cn-action flex items-center justify-center shadow-md shrink-0"
                    style={{ background: 'var(--cn-grad-atlas)' }}
                  >
                    <AtlasGlyph className="w-6 h-6 text-white" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight cn-text-1 leading-none">Atlas</h1>
                    <p className="text-sm cn-text-3 mt-0.5">{pins.length} {pins.length === 1 ? 'pin' : 'pins'} on the map</p>
                  </div>
                  <button
                    onClick={placingPin ? cancelPlacement : enterPlacingMode}
                    className={`hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                      placingPin ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    {placingPin ? 'Placing…' : 'Drop a pin'}
                  </button>
                </div>
                <div className="flex items-center gap-2 sm:hidden">
                  <button
                    onClick={placingPin ? cancelPlacement : enterPlacingMode}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      placingPin ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    {placingPin ? 'Placing…' : 'Drop a pin'}
                  </button>
                </div>

                <LocationSearchInput
                  value={locationQuery}
                  onChange={setLocationQuery}
                  onSelect={handleLocationSelect}
                  hubCenter={hubGeoCenter}
                  historyKey={SEARCH_HISTORY_KEY}
                  inputClassName="w-full pl-9 pr-8 py-2.5 cn-surface border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSavedOnly(s => !s)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      savedOnly
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border-blue-300 dark:border-blue-700'
                        : 'cn-surface cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                    }`}
                  >
                    <Bookmark className={`w-3 h-3 ${savedOnly ? 'fill-current' : ''}`} />
                    Saved
                    {savedPinIds.length > 0 && <span className="text-[10px] opacity-70">{savedPinIds.length}</span>}
                  </button>
                  {(Object.entries(ATLAS_CATEGORIES) as [AtlasPinCategory, typeof ATLAS_CATEGORIES[AtlasPinCategory]][]).map(([key, cat]) => {
                    const selected = categoryFilter === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setCategoryFilter(selected ? 'all' : key)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          selected
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border-blue-300 dark:border-blue-700'
                            : 'cn-surface cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs cn-text-3">
                  <b className="cn-mono cn-text-1">{filteredPins.length}</b> {filteredPins.length === 1 ? 'place' : 'places'} pinned
                </span>
              </div>
            </div>

            <div
              className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto no-scrollbar pb-6 transform-gpu"
              onScroll={event => setListScrolled(event.currentTarget.scrollTop > 0)}
              style={{
                maskImage: listScrolled
                  ? 'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)'
                  : 'linear-gradient(to bottom, black 0%, black calc(100% - 24px), transparent 100%)',
                WebkitMaskImage: listScrolled
                  ? 'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)'
                  : 'linear-gradient(to bottom, black 0%, black calc(100% - 24px), transparent 100%)',
              }}
            >
              {pendingPosition ? (
                <PinFormPanel
                position={pendingPosition}
                hubSlug={hubSlug}
                editingPin={editingPinId ? pins.find(p => p.id === editingPinId) : undefined}
                suggestedTitle={suggestedTitle}
                category={createCategory}
                onCategoryChange={setCreateCategory}
                onPublish={handleFormSubmit}
                onCancel={cancelCreate}
                onDone={finishCreate}
              />
              ) : selectedPin ? (
                <PlaceDetailPanel
                pin={selectedPin}
                hubSlug={hubSlug}
                distanceLabel={distanceTo(selectedPin)}
                canDelete={canDeletePin(selectedPin)}
                canEdit={canEditPin(selectedPin)}
                saved={savedPinIds.includes(selectedPin.id)}
                onBack={() => setSelectedPinId(null)}
                onDelete={() => handleDeletePin(selectedPin.id)}
                onToggleSave={() => toggleSavedPin(selectedPin.id)}
                onEdit={() => startEditPin(selectedPin)}
              />
              ) : (
                <div className="flex flex-col gap-4">
                {/* Place cards */}
                <div className="flex flex-col gap-2">
                  {filteredPins.length === 0 ? (
                    unregisteredLocation ? (
                      // Searched a real-world place with nothing pinned there yet —
                      // the map already centered on it; offer to create a pin
                      // instead of a dead-end "no results" message.
                      <button
                        onClick={() => {
                          setPendingPosition([unregisteredLocation.lat, unregisteredLocation.lng]);
                          setSuggestedTitle(unregisteredLocation.label);
                          setCreateCategory('poi');
                          setUnregisteredLocation(null);
                        }}
                        className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-500/40 bg-blue-50/50 dark:bg-blue-500/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium cn-text-1 truncate">{unregisteredLocation.label}</p>
                          <p className="text-xs cn-text-4">Nothing pinned here yet — tap to create a pin</p>
                        </div>
                      </button>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
                          <MapPin className="w-8 h-8 cn-text-4" />
                        </div>
                        {pins.length === 0 ? (
                          <>
                            <p className="text-sm font-medium cn-text-2 mb-1">No pins yet</p>
                            <p className="text-xs cn-text-4">
                              Search for a place above or click <strong>Drop a pin</strong> to mark a spot
                            </p>
                          </>
                        ) : savedOnly ? (
                          <>
                            <p className="text-sm font-medium cn-text-2 mb-1">No saved pins</p>
                            <p className="text-xs cn-text-4">
                              Tap the <Bookmark className="w-3 h-3 inline -mt-0.5" /> icon on a pin's detail view to save it here
                            </p>
                          </>
                        ) : (
                          <p className="text-sm cn-text-3">No pins match your filter</p>
                        )}
                      </div>
                    )
                  ) : (
                    filteredPins.map(pin => (
                      <PlaceRow
                        key={pin.id}
                        pin={pin}
                        hubSlug={hubSlug}
                        distanceLabel={distanceTo(pin)}
                        onSelect={() => handlePinSelect(pin)}
                      />
                    ))
                  )}
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          hubSlug={hubSlug}
          onClose={() => setSelectedEvent(null)}
          onNavigate={onNavigate ?? (() => {})}
        />
      )}
    </div>
  );
}
