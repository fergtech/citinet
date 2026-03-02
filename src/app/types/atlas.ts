export type AtlasPinCategory = 'meetup' | 'safety' | 'avoid' | 'infrastructure' | 'poi';

export interface AtlasPin {
  id: string;
  hubSlug: string;
  authorUsername: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  category: AtlasPinCategory;
  createdAt: string;
}

export const ATLAS_CATEGORIES: Record<AtlasPinCategory, {
  label: string;
  emoji: string;
  markerColor: string;
  badgeClass: string;
}> = {
  meetup:         { label: 'Meetup Spot',       emoji: '📍', markerColor: '#3b82f6', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  safety:         { label: 'Safety Alert',       emoji: '⚠️', markerColor: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  avoid:          { label: 'Avoid Area',         emoji: '🚧', markerColor: '#ef4444', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  infrastructure: { label: 'Community Space',    emoji: '🏛️', markerColor: '#7c3aed', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  poi:            { label: 'Point of Interest',  emoji: '⭐', markerColor: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};
