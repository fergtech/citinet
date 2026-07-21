import { MapPin, AlertTriangle, Ban, Building2, Star, HandHeart, Sprout, type LucideIcon } from 'lucide-react';

export type AtlasPinCategory = 'meetup' | 'safety' | 'avoid' | 'infrastructure' | 'poi' | 'aid' | 'green';

export interface AtlasPin {
  id: string;
  hubSlug: string;
  authorUsername: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  category: AtlasPinCategory;
  imageFileName?: string;
  createdAt: string;
}

export const ATLAS_CATEGORIES: Record<AtlasPinCategory, {
  label: string;
  emoji: string;
  markerColor: string;
  badgeClass: string;
  /** Gradient (Tailwind `bg-gradient-to-br` stops) used by the Atlas card/detail chrome. */
  gradient: string;
  /** Same gradient as a raw CSS value — used for the Leaflet map marker, which renders
   * outside Tailwind's stylesheet scope so utility classes there can't be relied on. */
  gradientCss: string;
  Icon: LucideIcon;
}> = {
  meetup:         { label: 'Meetup Spot',      emoji: '📍', markerColor: '#3b82f6', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',     gradient: 'from-blue-500 to-blue-600',     gradientCss: 'linear-gradient(135deg, #3b82f6, #2563eb)', Icon: MapPin },
  safety:         { label: 'Safety Alert',     emoji: '⚠️', markerColor: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', gradient: 'from-amber-500 to-orange-600',  gradientCss: 'linear-gradient(135deg, #f59e0b, #ea580c)', Icon: AlertTriangle },
  avoid:          { label: 'Avoid Area',       emoji: '🚧', markerColor: '#ef4444', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',         gradient: 'from-red-500 to-rose-600',      gradientCss: 'linear-gradient(135deg, #ef4444, #e11d48)', Icon: Ban },
  infrastructure: { label: 'Community Space',  emoji: '🏛️', markerColor: '#7c3aed', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', gradient: 'from-violet-500 to-purple-600', gradientCss: 'linear-gradient(135deg, #8b5cf6, #9333ea)', Icon: Building2 },
  poi:            { label: 'Point of Interest', emoji: '⭐', markerColor: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', gradient: 'from-emerald-500 to-teal-600', gradientCss: 'linear-gradient(135deg, #10b981, #0d9488)', Icon: Star },
  aid:            { label: 'Mutual Aid',       emoji: '🤝', markerColor: '#db2777', badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',     gradient: 'from-rose-500 to-pink-600',     gradientCss: 'linear-gradient(135deg, #f43f5e, #db2777)', Icon: HandHeart },
  green:          { label: 'Green Space',      emoji: '🌱', markerColor: '#16a34a', badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', gradient: 'from-green-500 to-emerald-600', gradientCss: 'linear-gradient(135deg, #22c55e, #059669)', Icon: Sprout },
};
