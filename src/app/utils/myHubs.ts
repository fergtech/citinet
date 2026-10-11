/**
 * "My Hubs" — the shell's own list of hubs this browser has opened.
 *
 * Lives in the shell origin's localStorage (citinet.cloud has no accounts, by
 * design) and holds only public facts: the hub's name and URL plus a coarse
 * state. It never holds tokens or keys — those travel to the hub's own origin
 * via utils/hubHandoff.ts.
 *
 * Registration happens at CLICK time, because the shell can't observe a sign-in
 * that happens on another origin. 'signed-in' is only recorded when the shell
 * itself saw the sign-in succeed (or, later, via the hub UI's return portal).
 */

const MY_HUBS_KEY = 'citinet-my-hubs';

export type MyHubState = 'opened' | 'signed-in';

export interface MyHubEntry {
  slug: string;
  name: string;
  tunnelUrl: string;
  state: MyHubState;
  addedAt: string;
  lastOpenedAt: string;
}

function read(): Record<string, MyHubEntry> {
  try {
    const raw = localStorage.getItem(MY_HUBS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MyHubEntry>) : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, MyHubEntry>): void {
  try {
    localStorage.setItem(MY_HUBS_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked/full — My Hubs is a convenience, never fail a join over it.
  }
}

/** Records (or refreshes) a hub in My Hubs. A hub already 'signed-in' is never downgraded to 'opened'. */
export function rememberHub(
  hub: { slug: string; name: string; tunnelUrl: string },
  state: MyHubState = 'opened',
): void {
  if (!hub.slug) return;
  const all = read();
  const now = new Date().toISOString();
  const prev = all[hub.slug];
  all[hub.slug] = {
    slug: hub.slug,
    name: hub.name || prev?.name || hub.slug,
    tunnelUrl: hub.tunnelUrl || prev?.tunnelUrl || '',
    state: prev?.state === 'signed-in' ? 'signed-in' : state,
    addedAt: prev?.addedAt ?? now,
    lastOpenedAt: now,
  };
  write(all);
}

/** All remembered hubs, most recently opened first. */
export function listMyHubs(): MyHubEntry[] {
  return Object.values(read()).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export function forgetHub(slug: string): void {
  const all = read();
  if (all[slug]) {
    delete all[slug];
    write(all);
  }
}
