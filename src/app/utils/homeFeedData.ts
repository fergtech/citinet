import { hubService } from '../services/hubService';
import { atlasService } from '../services/atlasService';
import { marketplaceService } from '../services/marketplaceService';
import { initiativesService, type InitiativeResource, type InitiativeTask } from '../services/initiativesService';
import { externalFeedService } from '../services/externalFeedService';
import type { HomeFeedInput, InitiativeUpdateRow } from './homeFeedSelection';

export type HomeSnapshot = HomeFeedInput;

export const EMPTY_SNAPSHOT: HomeSnapshot = { posts: [], events: [], pins: [], listings: [], initiativeUpdates: [], memberCount: 0, myVendorId: null, externalItems: [] };

/** Number of independently-loaded sections (see loadHomeSnapshot). */
export const SECTION_COUNT = 7;

/**
 * There's no hub-wide "recent activity across all initiatives" endpoint — activity is
 * per-initiative — so this fetches the initiative list, then each one's own small
 * activity slice in parallel, and ranks client-side. Fine for a hub's realistic
 * initiative count; would need a real aggregate route if that ever stopped being true.
 *
 * Only 'task' / 'team' / 'resource' activity is surfaced (tasks, roles, resources);
 * general wall posts ('update') and 'member' rows are deliberately excluded.
 *
 * The activity feed is an immutable log, not a live status: "Completed X" stays
 * exactly as written even if the task is later reopened, and "provided X" stays
 * even if the pledge is undone. Activity rows carry no id of what they're about,
 * only a rendered sentence, so a task/resource row is trusted only while the
 * sentence still matches a task that IS done / a resource that IS provided right now
 * (substring match — exact quoting isn't guaranteed). Team rows are left unvalidated.
 */
export async function fetchInitiativeUpdates(hubSlug: string): Promise<InitiativeUpdateRow[]> {
  const initiatives = await initiativesService.listAll(hubSlug); // a failure must propagate: [] would blank the last-known updates
  const perInitiative = await Promise.all(
    initiatives.map((ini) =>
      initiativesService
        .getActivity(hubSlug, ini.id, 3)
        .then((entries) =>
          entries.map((entry): InitiativeUpdateRow => ({
            entry,
            initiativeId: ini.id,
            initiativeTitle: ini.title,
            initiativeCategory: ini.category,
            initiativeColor: ini.color,
            bannerMode: ini.banner_mode ?? null,
            hasBannerImage: ini.banner_mode === 'image' && !!ini.banner_image_file_name,
            gradientFrom: ini.banner_gradient_from ?? null,
            gradientTo: ini.banner_gradient_to ?? null,
          })),
        )
        .catch(() => [] as InitiativeUpdateRow[]),
    ),
  );
  const candidates = perInitiative
    .flat()
    .filter((r) => r.entry.kind === 'task' || r.entry.kind === 'team' || r.entry.kind === 'resource')
    .sort((a, b) => new Date(b.entry.created_at).getTime() - new Date(a.entry.created_at).getTime());

  const ids = (kind: string) => [...new Set(candidates.filter((r) => r.entry.kind === kind).map((r) => r.initiativeId))];
  const [tasksBy, resourcesBy] = await Promise.all([
    Promise.all(ids('task').map((id) =>
      initiativesService.get(hubSlug, id).then((i): [string, InitiativeTask[]] => [id, i.tasks ?? []]).catch((): [string, InitiativeTask[]] => [id, []]),
    )).then((e) => new Map(e)),
    Promise.all(ids('resource').map((id) =>
      initiativesService.getResources(hubSlug, id).then((r): [string, InitiativeResource[]] => [id, r]).catch((): [string, InitiativeResource[]] => [id, []]),
    )).then((e) => new Map(e)),
  ]);

  const resolved = candidates
    .map((row): InitiativeUpdateRow | null => {
      if (row.entry.kind === 'task') {
        const task = (tasksBy.get(row.initiativeId) ?? []).find((t) => row.entry.text.includes(t.title));
        if (!task || task.status !== 'done') return null;
        return { ...row, taskId: task.id };
      }
      if (row.entry.kind === 'resource') {
        const res = (resourcesBy.get(row.initiativeId) ?? []).find((r) => row.entry.text.includes(r.item));
        if (!res || !res.provided) return null;
      }
      return row;
    })
    .filter((r): r is InitiativeUpdateRow => r !== null);

  // At most one per initiative (newest first survives the map/filter above), so one busy
  // initiative can't crowd out the others.
  const seen = new Set<string>();
  return resolved.filter((r) => (seen.has(r.initiativeId) ? false : (seen.add(r.initiativeId), true))).slice(0, 3);
}


/**
 * Loads everything Home's feed needs. Each section loads independently: a failure keeps THAT
 * section's previous value (so one slow or failing area never blanks the rest, and a failed
 * section is never overwritten with nothing) and is reported in `failures`.
 */
export async function loadHomeSnapshot(hubSlug: string, prev: HomeSnapshot): Promise<{ snapshot: HomeSnapshot; failures: string[] }> {
  const failures: string[] = [];
  const section = async <T,>(name: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await run(); } catch { failures.push(name); return fallback; }
  };
  const [posts, events, pins, listings, initiativeUpdates, memberCount, myVendorId] = await Promise.all([
    section('posts', () => hubService.listPosts(hubSlug, undefined, { limit: 60 }), prev.posts),
    section('events', () => hubService.getUpcomingEvents(hubSlug, 10, { strict: true }), prev.events),
    section('pins', () => atlasService.getPins(hubSlug, { strict: true }), prev.pins),
    section('listings', () => marketplaceService.getListings(hubSlug), prev.listings),
    section('initiatives', () => fetchInitiativeUpdates(hubSlug), prev.initiativeUpdates),
    section('members', async () => (await hubService.listMembers(hubSlug)).length, prev.memberCount),
    section('vendor', async () => (await marketplaceService.getMyVendor(hubSlug))?.id ?? null, prev.myVendorId),
  ]);
  // Outside is a bonus feed: it never counts as a failure (an older hub without it, or a source
  // being down, must not make Home look broken) — it just keeps its previous items.
  let externalItems = prev.externalItems ?? [];
  try { externalItems = (await externalFeedService.getItems(hubSlug)).items; } catch { /* keep previous */ }
  return { snapshot: { posts, events, pins, listings, initiativeUpdates, memberCount, myVendorId, externalItems }, failures };
}
