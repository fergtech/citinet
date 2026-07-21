import {
  Hexagon, Network, Globe, Wifi, Radio, Share2, Users, MapPin,
  Building2, Home, Waypoints, Antenna, Signal, CircuitBoard,
  type LucideIcon,
} from 'lucide-react';
import type { HubIconFields } from '../types/hub';

/** Pulls just the icon fields off a Hub, for spreading into a registry-sync payload
 * (registryService.registerHub) so the public directory shows the same custom icon. */
export function hubIconRegistryFields(hub: HubIconFields | null | undefined): HubIconFields {
  return {
    hub_icon_mode: hub?.hub_icon_mode,
    hub_icon_symbol: hub?.hub_icon_symbol,
    hub_icon_bg_mode: hub?.hub_icon_bg_mode,
    hub_icon_gradient_from: hub?.hub_icon_gradient_from,
    hub_icon_gradient_to: hub?.hub_icon_gradient_to,
    hub_icon_solid_color: hub?.hub_icon_solid_color,
    hub_icon_image_file_name: hub?.hub_icon_image_file_name,
  };
}

/** Curated hub/network-relevant symbols — deliberately not the full lucide catalog. */
export const HUB_ICON_SYMBOLS: Record<string, LucideIcon> = {
  hexagon: Hexagon,
  network: Network,
  globe: Globe,
  wifi: Wifi,
  radio: Radio,
  share: Share2,
  users: Users,
  'map-pin': MapPin,
  building: Building2,
  home: Home,
  waypoints: Waypoints,
  antenna: Antenna,
  signal: Signal,
  'circuit-board': CircuitBoard,
};

export const HUB_ICON_SOLID_COLORS = ['#0f766e', '#0369a1', '#1d4ed8', '#6d28d9', '#be123c', '#b45309', '#374151'];
export const HUB_ICON_GRADIENTS = [
  { from: '#2563eb', to: '#9333ea' }, // default
  { from: '#0f766e', to: '#2563eb' },
  { from: '#be123c', to: '#7c2d12' },
  { from: '#1d4ed8', to: '#0f766e' },
  { from: '#c2410c', to: '#be123c' },
  { from: '#374151', to: '#111827' },
];

interface HubIconProps {
  /** Accepts either a post-join Hub or a pre-join HubInfoResponse — both carry the same fields. */
  hub: HubIconFields | null | undefined;
  /** The hub's tunnel base URL (e.g. `https://hub1.tailxxx.ts.net`), used to build the
   * public-file URL for image mode. A raw URL rather than a hub slug + connection lookup
   * because this needs to work on the login/signup form too, before any connection is
   * stored (there's nothing to look up yet — the caller already has the probed URL). */
  baseUrl: string;
  size: number;
  /** "badge" = icon centered in a rounded background square (login form, About modal).
   *  "inline" = bare glyph, no background — for the two top-bar spots where the icon
   *  sits inline with text at a size too small for a badge to read. */
  variant: 'badge' | 'inline';
  className?: string;
}

/** Renders a hub's identity icon — a custom image, or a symbol-on-background preset,
 * falling back to today's hardcoded look (white Hexagon on a blue→purple gradient,
 * or a plain purple Hexagon for the inline variant) when nothing's configured. */
export function HubIcon({ hub, baseUrl, size, variant, className = '' }: HubIconProps) {
  if (hub?.hub_icon_mode === 'image' && hub.hub_icon_image_file_name && baseUrl) {
    const url = `${baseUrl.replace(/\/$/, '')}/api/public/files/${encodeURIComponent(hub.hub_icon_image_file_name)}`;
    const radius = variant === 'badge' ? 'rounded-xl' : 'rounded';
    return (
      <img
        src={url}
        alt=""
        className={`${radius} object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const symbolId = hub?.hub_icon_symbol ?? 'hexagon';
  const Symbol = HUB_ICON_SYMBOLS[symbolId] ?? Hexagon;
  // Hexagon is a solid shape and reads best filled — that's the current hardcoded
  // look this component must reproduce by default. The rest of the curated set are
  // stroke-based icons (wifi, users, circuit-board, ...) that look wrong force-filled,
  // so they render with lucide's normal stroke style instead.
  const solidFillProps = symbolId === 'hexagon' ? { fill: 'currentColor', strokeWidth: 0 } : {};

  if (variant === 'inline') {
    return <Symbol className={`text-purple-500 dark:text-purple-400 shrink-0 ${className}`} style={{ width: size, height: size }} {...solidFillProps} />;
  }

  const bgMode = hub?.hub_icon_bg_mode ?? 'gradient';
  const background = bgMode === 'solid' && hub?.hub_icon_solid_color
    ? hub.hub_icon_solid_color
    : `linear-gradient(135deg, ${hub?.hub_icon_gradient_from || '#2563eb'}, ${hub?.hub_icon_gradient_to || '#9333ea'})`;

  return (
    <span
      className={`rounded-xl flex items-center justify-center shrink-0 shadow-md ${className}`}
      style={{ width: size, height: size, background }}
    >
      <Symbol className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} {...solidFillProps} />
    </span>
  );
}
