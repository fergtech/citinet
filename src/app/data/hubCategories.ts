import {
  Zap, Home, Users, ShieldAlert, Store, Heart, LayoutGrid, type LucideIcon,
} from 'lucide-react';

/**
 * Hub creation wizard, Step 4 ("Choose your apps") categories.
 *
 * Each category is a starting-point app preset tied to what the hub is
 * actually *for* -- not a generic feature bundle. Picking one sets both
 * `enabledApps` and `hubFocus`; `hubFocus` is what persists (Hub.hubFocus /
 * HUB_FOCUS env var) and drives downstream focus behavior in HubLayout
 * (pinned nav order) and Feed (default tab). Members can always repin nav
 * and change enabled apps later regardless of which category was picked.
 */
export interface HubCategory {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  apps: string[];
  /** Persisted as Hub.hubFocus / HUB_FOCUS env. Undefined for the two
   *  general-purpose presets (Essentials, Full Community) that don't need
   *  any downstream focus behavior.
   *  NOTE: 'group' is the original (pre-split) "HOA / Group" preset value --
   *  kept on the HOA category, not the new standalone Group category, so
   *  hubs already deployed with HUB_FOCUS=group keep their current pinned
   *  nav and Decisions-first feed behavior unchanged. */
  hubFocus?: string;
  /** Overrides HubLayout's default pinned sidebar/dock order for hubs
   *  created with this category. */
  pinnedNav?: string[];
  /** Feed tab active by default for this category (e.g. lead with Decisions
   *  for governance-focused hubs) instead of the general feed. */
  feedDefaultFilter?: string;
}

export const HUB_CATEGORIES: HubCategory[] = [
  {
    id: 'essentials',
    label: 'Essentials',
    description: 'A lightweight starting point — chat, a map, and a place to post. Add more any time.',
    Icon: Zap,
    apps: ['feed', 'messages', 'atlas', 'notes'],
  },
  {
    id: 'hoa',
    label: 'HOA',
    description: 'Leads with announcements, documents, and a public record of what’s been voted on.',
    Icon: Home,
    apps: ['feed', 'files', 'mod-log', 'initiatives', 'messages'],
    hubFocus: 'group',
    pinnedNav: ['feed', 'files', 'mod-log', 'initiatives', 'messages'],
    feedDefaultFilter: 'POLL',
  },
  {
    id: 'group',
    label: 'Group',
    description: 'For churches, co-ops, tenant unions, and clubs that organize around shared projects.',
    Icon: Users,
    apps: ['feed', 'messages', 'spaces', 'files', 'initiatives'],
    hubFocus: 'assoc',
    pinnedNav: ['feed', 'spaces', 'initiatives', 'files', 'messages'],
  },
  {
    id: 'watch',
    label: 'Neighborhood Watch',
    description: 'Safety and mutual aid focused — the map leads, with resources and updates close behind.',
    Icon: ShieldAlert,
    apps: ['feed', 'atlas', 'messages', 'initiatives', 'toolkit'],
    hubFocus: 'watch',
    pinnedNav: ['feed', 'atlas', 'initiatives', 'toolkit', 'messages'],
  },
  {
    id: 'marketplace',
    label: 'Local Marketplace',
    description: 'Built around buying, selling, and trading locally, with a feed and map to back it up.',
    Icon: Store,
    apps: ['marketplace', 'feed', 'discover', 'messages', 'atlas'],
    hubFocus: 'marketplace',
    pinnedNav: ['marketplace', 'feed', 'discover', 'atlas', 'messages'],
  },
  {
    id: 'club',
    label: 'Interest Club',
    description: 'Social and hobby groups — Spaces for sub-topics, plus a feed and easy discovery.',
    Icon: Heart,
    apps: ['spaces', 'feed', 'messages', 'discover'],
    hubFocus: 'club',
    pinnedNav: ['spaces', 'feed', 'discover', 'messages'],
  },
  {
    id: 'full',
    label: 'Full Community',
    description: 'Every app enabled — dial it back any time from Hub Management.',
    Icon: LayoutGrid,
    apps: [
      'feed', 'messages', 'atlas', 'notes', 'spaces', 'marketplace',
      'files', 'discover', 'toolkit', 'initiatives', 'network', 'mod-log',
    ],
  },
];
