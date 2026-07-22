/**
 * Maps a hub-mode pathname to the short label a "‹ Back" button should show
 * for it — used so back buttons can say where they're actually going
 * (derived from HubContext's tracked previous pathname) instead of always
 * claiming the hub dashboard, which is misleading when the user arrived
 * from Feed, Neighbors, another profile, etc.
 */
const ROUTE_LABELS: { test: RegExp; label: string }[] = [
  { test: /^\/feed/, label: 'Feed' },
  { test: /^\/neighbors/, label: 'Neighbors' },
  { test: /^\/files/, label: 'Files' },
  { test: /^\/messages/, label: 'Messages' },
  { test: /^\/network/, label: 'Network' },
  { test: /^\/marketplace/, label: 'Exchange' },
  { test: /^\/vendor\//, label: 'Exchange' },
  { test: /^\/toolkit/, label: 'Resources' },
  { test: /^\/atlas/, label: 'Atlas' },
  { test: /^\/initiatives/, label: 'Initiatives' },
  { test: /^\/account/, label: 'Account' },
  { test: /^\/profile\//, label: 'Profile' },
  { test: /^\/hub-management/, label: 'Hub Management' },
  { test: /^\/discover/, label: 'Discover' },
  { test: /^\/mod-log/, label: 'Mod Log' },
  { test: /^\/spaces/, label: 'Spaces' },
  { test: /^\/notes/, label: 'Notes' },
  { test: /^\/assistant/, label: 'Assistant' },
];

/**
 * Resolves the previous pathname to a display label. Falls back to
 * `hubName` when the previous path is the hub root ("/") or unknown
 * (e.g. no tracked history yet, such as a hard refresh) — matching the
 * previous static behavior in that uncertain case only.
 */
export function getBackLabel(previousPath: string | null, hubName: string): string {
  if (!previousPath || previousPath === '/') return hubName;
  const match = ROUTE_LABELS.find(({ test }) => test.test(previousPath));
  return match ? match.label : hubName;
}
