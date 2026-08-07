import {
  Layers, Newspaper, MessageCircle, Compass, Map, Store, FolderOpen,
  Target, Package, Radio, ScrollText, NotebookPen,
} from 'lucide-react';
import type { NotificationFeature } from '../services/notificationsService';

export const APP_TILES: { Icon: React.ElementType; label: string; screen: string; gradient: string; notifyFeature?: NotificationFeature }[] = [
  { Icon: Layers,        label: 'Spaces',      screen: 'spaces',      gradient: 'bg-gradient-to-br from-purple-500 to-violet-600' },
  { Icon: Newspaper,     label: 'Feed',        screen: 'feed',        gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',     notifyFeature: 'feed' },
  { Icon: Compass,       label: 'Discover',    screen: 'discover',    gradient: 'bg-gradient-to-br from-cyan-500 to-sky-600' },
  { Icon: Map,           label: 'Atlas',       screen: 'atlas',       gradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600' },
  { Icon: Store,         label: 'Exchange',    screen: 'marketplace', gradient: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
  { Icon: FolderOpen,    label: 'Files',       screen: 'files',       gradient: 'bg-gradient-to-br from-amber-500 to-orange-600' },
  { Icon: Target,        label: 'Initiatives', screen: 'initiatives', gradient: 'bg-gradient-to-br from-rose-500 to-pink-600' },
  { Icon: Package,       label: 'Resources',   screen: 'toolkit',     gradient: 'bg-gradient-to-br from-orange-500 to-amber-600' },
  { Icon: Radio,         label: 'Network',     screen: 'network',     gradient: 'bg-gradient-to-br from-teal-500 to-cyan-600' },
  { Icon: MessageCircle, label: 'Messages',    screen: 'messages',    gradient: 'bg-gradient-to-br from-fuchsia-500 to-violet-600', notifyFeature: 'messages' },
  { Icon: ScrollText,    label: 'Decisions',   screen: 'mod-log',     gradient: 'bg-gradient-to-br from-slate-600 to-slate-700' },
  { Icon: NotebookPen,   label: 'Notes',       screen: 'notes',       gradient: 'bg-gradient-to-br from-amber-500 to-yellow-500' },
];

// Priority-ordered screen IDs for the mobile bottom dock.
// Derived from visibleTiles so icons, labels, badges, and feature-gating
// all stay in sync with the launchpad automatically. Home/Search/Apps/Profile
// are fixed slots rendered around these in the dock, not app tiles themselves.
export const DOCK_PRIORITY_SCREENS = ['feed'];

// Apps enabled on a fresh hub with no admin configuration yet.
// null enabledApps on the Hub object means "all apps" (backward compat).
export const DEFAULT_ENABLED_APPS: string[] = [
  'feed', 'messages', 'atlas', 'notes',
];
