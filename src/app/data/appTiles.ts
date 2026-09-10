import {
  Store, Newspaper,
  Package, Radio, ScrollText, NotebookPen,
} from 'lucide-react';
import { AtlasGlyph, FilesGlyph, MessagesGlyph, InitiativesGlyph, SpacesGlyph, SearchGlyph } from '../components/icons';
import type { NotificationFeature } from '../services/notificationsService';

// Tile colors are a small, coordinated palette in the brand's blue/indigo/teal
// family (see src/styles/citinet-tokens.css) rather than one arbitrary
// saturated hue per app — enough variation to scan the grid at a glance
// without it reading as a rainbow. Reuses the CN_TILE_* gradient classes below
// so this stays the single place tile color is decided.
const CN_TILE_BLUE   = 'bg-gradient-to-br from-blue-500 to-blue-600';
const CN_TILE_INDIGO = 'bg-gradient-to-br from-indigo-500 to-indigo-600';
const CN_TILE_TEAL   = 'bg-gradient-to-br from-teal-500 to-teal-600';
const CN_TILE_SKY    = 'bg-gradient-to-br from-sky-500 to-sky-600';
const CN_TILE_SLATE  = 'bg-gradient-to-br from-slate-500 to-slate-600';

export const APP_TILES: { Icon: React.ElementType; label: string; screen: string; gradient: string; notifyFeature?: NotificationFeature }[] = [
  { Icon: SpacesGlyph,   label: 'Spaces',      screen: 'spaces',      gradient: CN_TILE_INDIGO },
  { Icon: Newspaper,     label: 'Feed',        screen: 'feed',        gradient: CN_TILE_BLUE,     notifyFeature: 'feed' },
  { Icon: SearchGlyph,   label: 'Discover',    screen: 'discover',    gradient: CN_TILE_SKY },
  { Icon: AtlasGlyph,    label: 'Atlas',       screen: 'atlas',       gradient: CN_TILE_TEAL },
  { Icon: Store,         label: 'Exchange',    screen: 'marketplace', gradient: CN_TILE_INDIGO },
  { Icon: FilesGlyph,    label: 'Files',       screen: 'files',       gradient: CN_TILE_SLATE },
  { Icon: InitiativesGlyph, label: 'Initiatives', screen: 'initiatives', gradient: CN_TILE_BLUE },
  { Icon: Package,       label: 'Resources',   screen: 'toolkit',     gradient: CN_TILE_TEAL },
  { Icon: Radio,         label: 'Network',     screen: 'network',     gradient: CN_TILE_SKY },
  { Icon: MessagesGlyph, label: 'Communications', screen: 'messages',    gradient: CN_TILE_INDIGO, notifyFeature: 'messages' },
  { Icon: ScrollText,    label: 'Decisions',   screen: 'mod-log',     gradient: CN_TILE_SLATE },
  { Icon: NotebookPen,   label: 'Notes',       screen: 'notes',       gradient: CN_TILE_BLUE },
];

// Ad-hoc tiles appended outside APP_TILES (Dashboard.tsx, HubLayout.tsx) should
// draw from this same palette rather than inventing their own hue.
export const CN_TILE_AI = CN_TILE_INDIGO;
export const CN_TILE_VENDOR = CN_TILE_TEAL;
export const CN_TILE_SUGGEST = CN_TILE_SKY;

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
