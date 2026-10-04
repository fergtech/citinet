import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from 'next-themes';
import { getAtlasMapStyle, ATLAS_STYLE_BRAND_COLORS } from '../utils/atlasMapStyle';

/** How long the map gets to report it's up before it's treated as failed (offline / tiles blocked). */
const READY_TIMEOUT_MS = 8000;

interface MiniMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  /** Called once if the map never comes up, so the card can fall back to something else. */
  onFail?: () => void;
  className?: string;
}

/**
 * A small, purely decorative map for Home feed cards (Atlas pins, events with a
 * recognised location). Not interactive at all — every pan/zoom/rotate handler is
 * off and pointer events pass straight through to the card, so a click anywhere on
 * it opens the card's target instead of fiddling with the map.
 *
 * Built lazily: the WebGL map is only created once the card is near the viewport
 * (browsers cap live WebGL contexts at ~16), and torn down when it leaves the page.
 * Uses the same OpenFreeMap vector style as the Atlas screen, so it matches the
 * app's theme.
 */
// 14.5, not 15: the Atlas style starts drawing every parking lot as a "P" marker at zoom 15, which turns a small
// decorative map into noise. Streets and names are still clearly readable here.
export function MiniMap({ lat, lng, zoom = 14.5, onFail, className }: MiniMapProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeObs: ResizeObserver | undefined;
    let loaded = false;

    const create = () => {
      if (cancelled || mapRef.current) return;
      const map = new maplibregl.Map({
        container: host,
        style: getAtlasMapStyle(darkRef.current),
        center: [lng, lat],
        zoom,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
      });
      mapRef.current = map;
      resizeObs = new ResizeObserver(() => map.resize());
      resizeObs.observe(host);

      const dot = document.createElement('div');
      dot.style.cssText = `width:16px;height:16px;border-radius:9999px;background:${ATLAS_STYLE_BRAND_COLORS.blue};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)`;
      new maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map);

      map.once('load', () => { loaded = true; if (failTimer) clearTimeout(failTimer); });
      // A hidden tab pauses animation frames, so MapLibre can't render (and never reports "load") until the
      // tab is shown again. Time spent hidden must not count as a failure — otherwise a dashboard opened in a
      // background tab would swap to the fallback sticker for good. Re-arm instead of failing while hidden.
      const arm = () => {
        failTimer = setTimeout(() => {
          if (loaded || cancelled) return;
          if (document.visibilityState !== 'visible') { arm(); return; }
          onFailRef.current?.();
        }, READY_TIMEOUT_MS);
      };
      arm();
    };

    // Only spin up WebGL when the card is actually near the viewport.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { create(); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(host);

    return () => {
      cancelled = true;
      io.disconnect();
      resizeObs?.disconnect();
      if (failTimer) clearTimeout(failTimer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, zoom]);

  // Theme swap — restyle in place rather than rebuilding the map.
  useEffect(() => {
    mapRef.current?.setStyle(getAtlasMapStyle(dark));
  }, [dark]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ''}`} aria-hidden="true">
      <div ref={hostRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {/* OSM's licence requires the attribution stay reachable; the map is decorative, so a
          small static credit rather than an interactive control. */}
      <span className="absolute right-1 bottom-0.5 text-[9px] leading-none px-1 py-0.5 rounded bg-white/70 dark:bg-black/50 text-slate-700 dark:text-zinc-200">
        © OpenStreetMap
      </span>
    </div>
  );
}
