import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Compass, Layers, Target, Wrench, Calendar, Users, Hexagon,
  ChevronLeft, ChevronRight, MessageCircle, Loader2,
  type LucideIcon,
} from 'lucide-react';
import { hubService } from '../services/hubService';
import { spacesService } from '../services/spacesService';
import { registryService, type RegistryHub } from '../services/registryService';
import { toolkitService } from '../services/toolkitService';
import { useHub } from '../context/HubContext';
import { PostDetailModal } from './PostDetailModal';
import { HubIcon } from './HubIcon';
import type { HubPost, HubMember, HubSpace, SearchResults } from '../types/hub';
import type { Tool } from '../types/toolkit';

type FilterId = 'all' | 'spaces' | 'initiatives' | 'resources' | 'events' | 'people' | 'hubs';

interface DiscoverScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
  onViewProfile?: (userId: string) => void;
}

const SECTIONS: { value: FilterId; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'All', icon: Compass },
  { value: 'spaces', label: 'Spaces', icon: Layers },
  { value: 'initiatives', label: 'Initiatives', icon: Target },
  { value: 'resources', label: 'Resources', icon: Wrench },
  { value: 'events', label: 'Events', icon: Calendar },
  { value: 'people', label: 'People', icon: Users },
  { value: 'hubs', label: 'Other hubs', icon: Hexagon },
];

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
};

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500', 'from-violet-500 to-purple-500',
  'from-sky-500 to-blue-500', 'from-lime-500 to-green-500',
];
function avatarColor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Minimal local shape + status styling for initiatives — the full Initiative
// type and its color/status maps live in InitiativesScreen.tsx and aren't
// exported, so only the fields Discover actually renders are mirrored here.
interface DiscoverInitiative {
  id: string;
  title: string;
  status: 'planning' | 'active' | 'completed';
  progress: number;
}
const INI_STATUS_LABEL: Record<DiscoverInitiative['status'], string> = { active: 'In progress', planning: 'Planning', completed: 'Completed' };
const INI_STATUS_BADGE: Record<DiscoverInitiative['status'], string> = {
  active:    'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  planning:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  completed: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400',
};

function getSpaceBanner(space: HubSpace, tunnelUrl: string): React.CSSProperties {
  if (space.banner_mode === 'image') {
    const url = space.banner_image_url ?? (space.banner_image_file_name ? spacesService.getSpaceBannerUrl(tunnelUrl, space.slug) : null);
    if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (space.banner_mode === 'solid' && space.banner_color) return { background: space.banner_color };
  if (space.banner_mode === 'gradient' && space.banner_gradient_from && space.banner_gradient_to) {
    return { background: `linear-gradient(135deg, ${space.banner_gradient_from}, ${space.banner_gradient_to})` };
  }
  return { background: 'var(--cn-grad-spaces)' };
}

// ── shared rail bits ────────────────────────────────────────────────────────

function SectionHeading({ title, sub, onSeeAll }: { title: string; sub?: string; onSeeAll?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-[17px] font-bold cn-text-1">{title}</h2>
        {sub && <p className="text-xs cn-text-3 mt-0.5">{sub}</p>}
      </div>
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline shrink-0">
          See all
        </button>
      )}
    </div>
  );
}

const RAIL_CARD = 'cn-glass rounded-xl text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5';

function TrendingRow({ icon: Icon, gradient, title, meta, onClick }: { icon: LucideIcon; gradient: string; title: string; meta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${RAIL_CARD} p-3 flex items-center gap-3`}>
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: gradient }}>
        <Icon className="w-4 h-4 text-white" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold cn-text-1 truncate">{title}</div>
        <div className="text-[11.5px] cn-text-4 mt-0.5 truncate">{meta}</div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 cn-text-4 shrink-0" />
    </button>
  );
}

function SpaceCard({ space, tunnelUrl, onClick }: { space: HubSpace; tunnelUrl: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${RAIL_CARD} p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg shrink-0" style={getSpaceBanner(space, tunnelUrl)} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold cn-text-1 truncate">{space.name}</div>
          <div className="text-[10.5px] cn-text-4 font-mono">{space.member_count ?? 0} members</div>
        </div>
      </div>
      {space.description && (
        <p className="text-[11.5px] leading-relaxed cn-text-3 line-clamp-2">{space.description}</p>
      )}
    </button>
  );
}

function InitiativeCard({ ini, onClick }: { ini: DiscoverInitiative; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${RAIL_CARD} p-3 flex flex-col gap-2`}>
      <div className="text-[13px] font-semibold cn-text-1 line-clamp-1">{ini.title}</div>
      <div className="text-[11px] cn-text-3">{ini.progress}% complete</div>
      <span className={`self-start text-[11px] font-semibold px-2 py-0.5 rounded-full ${INI_STATUS_BADGE[ini.status]}`}>
        {INI_STATUS_LABEL[ini.status]}
      </span>
    </button>
  );
}

function ResourceCard({ tool, onClick }: { tool: Tool; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${RAIL_CARD} p-3 flex items-center gap-2.5`}>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
        style={!tool.icon ? { background: 'var(--cn-grad-files)' } : undefined}
      >
        {tool.icon ? <img src={tool.icon} alt="" className="w-full h-full object-cover" /> : <Wrench className="w-4 h-4 text-white" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold cn-text-1 truncate">{tool.name}</div>
        <div className="text-[11px] cn-text-4 truncate">{tool.shortDescription}</div>
      </div>
    </button>
  );
}

function EventCard({ post, onClick }: { post: HubPost; onClick: () => void }) {
  const d = post.event_date ? new Date(post.event_date) : null;
  const day = d ? d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() : '';
  const date = d ? d.getDate() : '';
  const time = d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <button onClick={onClick} className={`${RAIL_CARD} p-3 flex items-center gap-3`}>
      <div className="w-11 text-center shrink-0 rounded-lg cn-surface-2 border cn-border py-1.5">
        <div className="text-[9px] font-bold tracking-wider text-purple-500 dark:text-purple-400">{day}</div>
        <div className="text-[17px] font-bold cn-text-1 font-mono">{date}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold cn-text-1 truncate">{post.title}</div>
        <div className="text-[11.5px] cn-text-3 truncate">{[time, post.event_location].filter(Boolean).join(' · ')}</div>
      </div>
    </button>
  );
}

function PersonCard({ member, slug, isYou, onClick }: { member: HubMember; slug: string; isYou: boolean; onClick: () => void }) {
  const avatarUrl = hubService.getAvatarUrl(slug, member.user_id);
  return (
    <button onClick={onClick} className={`${RAIL_CARD} p-3 flex items-center gap-2.5`}>
      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor(member.username)} flex items-center justify-center text-white font-semibold text-xs shrink-0 relative overflow-hidden`}>
        {member.username.slice(0, 2).toUpperCase()}
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold cn-text-1 truncate">
          {member.display_name || member.username}
          {isYou && <span className="ml-1.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">(you)</span>}
        </div>
        {member.bio && <p className="text-[11.5px] cn-text-3 line-clamp-2 leading-snug mt-0.5">{member.bio}</p>}
      </div>
    </button>
  );
}

function OtherHubCard({ hub }: { hub: RegistryHub }) {
  return (
    <div className="cn-glass rounded-xl p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <HubIcon hub={hub} baseUrl={hub.tunnel_url} size={32} variant="badge" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold cn-text-1 truncate">{hub.name}</div>
          <div className="text-[11px] cn-text-4 truncate">
            {[hub.location, hub.member_count !== undefined ? `${hub.member_count.toLocaleString()} members` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <button
        onClick={() => window.open(`${window.location.origin}/join?url=${encodeURIComponent(hub.tunnel_url)}`, '_blank', 'noopener')}
        className="self-start text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 transition-colors"
      >
        Join this hub
      </button>
    </div>
  );
}

// ── main screen ──────────────────────────────────────────────────────────────

export function DiscoverScreen({ onBack, onNavigate, onViewProfile }: DiscoverScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug ?? '';
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const currentUserId = currentUser?.hubUserId;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');

  const [posts, setPosts] = useState<HubPost[]>([]);
  const [members, setMembers] = useState<HubMember[]>([]);
  const [spaces, setSpaces] = useState<HubSpace[]>([]);
  const [initiatives, setInitiatives] = useState<DiscoverInitiative[]>([]);
  const [otherHubs, setOtherHubs] = useState<RegistryHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const searchRequestId = useRef(0);

  const tools = useMemo(() => toolkitService.getAllTools(), []);

  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  // Search query deep-linked from the Dashboard's search bar
  useEffect(() => {
    const q = sessionStorage.getItem('citinet-deeplink-search');
    if (q) {
      setQuery(q);
      sessionStorage.removeItem('citinet-deeplink-search');
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.allSettled([
      hubService.listPosts(slug),
      hubService.listMembers(slug),
      spacesService.listAll(slug),
      registryService.getHubs(),
      tunnelUrl
        ? fetch(`${tunnelUrl}/api/initiatives`, {
            headers: { 'Content-Type': 'application/json', ...(currentUser?.authToken ? { Authorization: `Bearer ${currentUser.authToken}` } : {}) },
          }).then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        : Promise.reject(new Error('no tunnel url')),
    ]).then(([postsRes, membersRes, spacesRes, hubsRes, iniRes]) => {
      if (postsRes.status === 'fulfilled') setPosts(postsRes.value);
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value);
      if (spacesRes.status === 'fulfilled') setSpaces(spacesRes.value);
      if (hubsRes.status === 'fulfilled') setOtherHubs(hubsRes.value.filter(h => h.slug !== slug));
      if (iniRes.status === 'fulfilled') {
        const raw = iniRes.value as unknown;
        const list: Array<Record<string, unknown>> = Array.isArray(raw)
          ? raw
          : (raw as { initiatives?: Array<Record<string, unknown>> })?.initiatives ?? [];
        setInitiatives(list.map((i): DiscoverInitiative => ({
          id: String(i.id ?? ''),
          title: typeof i.title === 'string' ? i.title : 'Untitled',
          status: (i.status as DiscoverInitiative['status']) ?? 'planning',
          progress: typeof i.progress === 'number' ? i.progress : 0,
        })));
      }
      setLoading(false);
    });
  }, [slug, tunnelUrl, currentUser?.authToken]);

  const needle = query.trim().toLowerCase();
  // Real backend relevance-ranked search kicks in at 2+ chars (see GET /api/search) —
  // below that, English stemming makes results unreliable anyway, so we fall back to
  // today's local substring filtering, unchanged, exactly as before this feature.
  const searching = needle.length >= 2 && searchResults != null && searchResults.query === needle;

  useEffect(() => {
    if (!slug || needle.length < 2) {
      setSearchResults(null);
      return;
    }
    const myRequestId = ++searchRequestId.current;
    const timer = setTimeout(() => {
      hubService.search(slug, needle)
        .then(results => {
          if (searchRequestId.current === myRequestId) setSearchResults(results);
        })
        .catch(() => {
          if (searchRequestId.current === myRequestId) setSearchResults(null);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [slug, needle]);

  // Spaces/members/events: once a real search is active (2+ chars, backend responded),
  // source from GET /api/search's relevance-ranked results instead of local substring
  // filtering. Below that threshold, behavior is unchanged from before this feature.
  const filteredSpaces = useMemo(() => {
    if (searching) return searchResults!.spaces;
    return spaces.filter(s => s.my_status !== 'active' && (!needle || s.name.toLowerCase().includes(needle)));
  }, [spaces, needle, searching, searchResults]);
  // Initiatives/Toolkit/Other-hubs have no local Postgres table to search (proxied to
  // an external service, a separate central registry, and static/localStorage data,
  // respectively) — they keep their existing client-side filtering, unchanged.
  const filteredInitiatives = useMemo(
    () => initiatives.filter(i => !needle || i.title.toLowerCase().includes(needle)),
    [initiatives, needle]
  );
  const filteredTools = useMemo(
    () => [...tools].filter(t => !needle || t.name.toLowerCase().includes(needle)).sort((a, b) => (b.recommendedScore ?? 0) - (a.recommendedScore ?? 0)),
    [tools, needle]
  );
  const filteredEvents = useMemo(() => {
    if (searching) return searchResults!.posts.filter(p => p.category === 'EVENT');
    const cutoff = Date.now() - 86400000;
    return posts
      .filter(p => !!p.event_date && new Date(p.event_date!).getTime() >= cutoff && (!needle || (p.title ?? p.body).toLowerCase().includes(needle)))
      .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime());
  }, [posts, needle, searching, searchResults]);
  const filteredMembers = useMemo(() => {
    if (searching) return searchResults!.members;
    return members.filter(m => !needle
      || m.username.toLowerCase().includes(needle)
      || (m.display_name?.toLowerCase().includes(needle) ?? false)
      || (m.tags?.some(t => t.toLowerCase().includes(needle)) ?? false));
  }, [members, needle, searching, searchResults]);
  const filteredHubs = useMemo(
    () => otherHubs.filter(h => !needle || h.name.toLowerCase().includes(needle)),
    [otherHubs, needle]
  );

  // Self is excluded from passive "people you might know" browsing, but an active
  // search term is a real query — if it matches your own handle, you should see
  // yourself in the results, same as searching your own @handle on any other app.
  const visibleMembers = useMemo(
    () => (needle ? filteredMembers : filteredMembers.filter(m => m.user_id !== currentUserId)),
    [filteredMembers, needle, currentUserId]
  );

  // "Active neighbors" — members who authored something in the recent posts
  // list (a real activity signal), backfilled with the most recently joined
  // members when there aren't enough active ones to fill the rail. During an
  // active search, `visibleMembers` is already relevance-ranked by the backend —
  // re-sorting by activity here would throw that ranking away, so just take it as-is.
  const activeNeighbors = useMemo(() => {
    if (searching) return visibleMembers.slice(0, 4);
    const activeIds = new Set(posts.map(p => p.author_id));
    const active = visibleMembers.filter(m => activeIds.has(m.user_id));
    const rest = visibleMembers
      .filter(m => !activeIds.has(m.user_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return [...active, ...rest].slice(0, 4);
  }, [visibleMembers, posts, searching]);

  // Same reasoning as activeNeighbors — preserve real search ranking instead of
  // re-sorting by member_count once a search is active.
  const suggestedSpaces = useMemo(() => {
    if (searching) return filteredSpaces.slice(0, 4);
    return [...filteredSpaces].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)).slice(0, 4);
  }, [filteredSpaces, searching]);
  const featuredInitiatives = useMemo(
    () => [...filteredInitiatives].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')).slice(0, 3),
    [filteredInitiatives]
  );
  const popularResources = useMemo(() => filteredTools.slice(0, 4), [filteredTools]);
  const upcomingEvents = useMemo(() => filteredEvents.slice(0, 3), [filteredEvents]);
  const otherHubsSlice = useMemo(() => [...filteredHubs].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)).slice(0, 4), [filteredHubs]);

  // "Trending" mirrors one item per content kind — post, space, initiative,
  // resource — the same cross-type mix the design reference uses, backed by
  // real engagement/size/progress/recommendation signals per kind.
  const trending = useMemo(() => {
    const items: { id: string; title: string; meta: string; gradient: string; icon: LucideIcon; onClick: () => void }[] = [];

    const topPost = [...posts].sort((a, b) => ((b.reply_count ?? 0) + (b.like_count ?? 0)) - ((a.reply_count ?? 0) + (a.like_count ?? 0)))[0];
    if (topPost) {
      items.push({
        id: `p-${topPost.id}`, title: topPost.title || topPost.body.slice(0, 60) || 'Untitled',
        meta: `Feed · ${topPost.reply_count} ${topPost.reply_count === 1 ? 'reply' : 'replies'}`,
        gradient: 'var(--cn-grad-feed)', icon: MessageCircle, onClick: () => setSelectedPost(topPost),
      });
    }
    const topSpace = [...spaces].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))[0];
    if (topSpace) {
      items.push({
        id: `s-${topSpace.id}`, title: topSpace.name, meta: `Spaces · ${topSpace.member_count ?? 0} members`,
        gradient: 'var(--cn-grad-spaces)', icon: Layers, onClick: () => onNavigate('spaces'),
      });
    }
    const topIni = [...initiatives].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.progress - a.progress)[0];
    if (topIni) {
      items.push({
        id: `i-${topIni.id}`, title: topIni.title, meta: `Initiatives · ${topIni.progress}% complete`,
        gradient: 'var(--cn-grad-initiatives)', icon: Target, onClick: () => onNavigate('initiatives'),
      });
    }
    const topTool = [...tools].sort((a, b) => (b.recommendedScore ?? 0) - (a.recommendedScore ?? 0))[0];
    if (topTool) {
      items.push({
        id: `t-${topTool.id}`, title: topTool.name, meta: `Resources · ${topTool.shortDescription}`,
        gradient: 'var(--cn-grad-files)', icon: Wrench, onClick: () => onNavigate('toolkit'),
      });
    }
    return needle ? items.filter(i => i.title.toLowerCase().includes(needle)) : items;
  }, [posts, spaces, initiatives, tools, needle, onNavigate]);

  // Real, cross-type relevance-ranked results — one interleaved list ordered by
  // `score`, replacing "Trending" (a browse-mode recommendation concept) once an
  // actual search is active. This is the single ranked list real search engines
  // return, built from GET /api/search's already-scored posts/members/spaces.
  const unifiedResults = useMemo(() => {
    if (!searching) return [];
    type Row = { key: string; title: string; meta: string; gradient: string; icon: LucideIcon; score: number; onClick: () => void };
    const rows: Row[] = [];
    for (const p of searchResults!.posts) {
      rows.push({
        key: `p-${p.id}`, title: p.title || p.body?.slice(0, 60) || 'Untitled',
        meta: `${p.category.charAt(0)}${p.category.slice(1).toLowerCase()} · ${p.author_username ?? 'Unknown'}`,
        gradient: p.category === 'EVENT' ? 'var(--cn-grad-atlas)' : 'var(--cn-grad-feed)',
        icon: p.category === 'EVENT' ? Calendar : MessageCircle,
        score: p.score, onClick: () => setSelectedPost(p),
      });
    }
    for (const m of searchResults!.members) {
      rows.push({
        key: `m-${m.user_id}`, title: m.display_name || m.username,
        meta: m.bio ? `Person · ${m.bio}` : 'Person',
        gradient: 'var(--cn-grad-identity)', icon: Users, score: m.score,
        onClick: () => (m.user_id === currentUserId ? onNavigate('account') : onViewProfile?.(m.user_id)),
      });
    }
    for (const s of searchResults!.spaces) {
      rows.push({
        key: `sp-${s.id}`, title: s.name, meta: `Space · ${s.member_count ?? 0} members`,
        gradient: 'var(--cn-grad-spaces)', icon: Layers, score: s.score, onClick: () => onNavigate('spaces'),
      });
    }
    return rows.sort((a, b) => b.score - a.score);
  }, [searching, searchResults, currentUserId, onNavigate, onViewProfile]);

  const showAll = filter === 'all';
  const hasAnyResults = trending.length > 0 || unifiedResults.length > 0 || suggestedSpaces.length > 0 || featuredInitiatives.length > 0
    || popularResources.length > 0 || upcomingEvents.length > 0 || activeNeighbors.length > 0 || otherHubsSlice.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-0">
        <button onClick={onBack} className="flex items-center gap-0.5 mb-2 group">
          <ChevronLeft className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300 transition-colors" />
          <span className="text-sm font-medium text-purple-400 group-hover:text-purple-300 transition-colors">
            {currentHub?.name ?? 'Hub'}
          </span>
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center" style={{ background: 'var(--cn-grad-discover)' }}>
            <Compass className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold cn-text-1 tracking-tight leading-none">Discover</h1>
            <p className="text-sm cn-text-3 mt-0.5">Explore what's happening in your hub — and beyond</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search spaces, initiatives, resources, people, hubs…"
            className="w-full h-[46px] pl-10 pr-4 rounded-xl border cn-border cn-surface-2 cn-text-1 text-sm placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = filter === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setFilter(s.value)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-transparent'
                    : 'cn-surface-2 cn-text-2 cn-border hover:border-purple-300 dark:hover:border-purple-700'
                }`}
              >
                <Icon className="w-3 h-3" />{s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 flex flex-col gap-7">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 cn-text-4">
            <Loader2 className="w-7 h-7 animate-spin mb-3" />
            <p className="text-sm">Loading…</p>
          </div>
        )}

        {!loading && needle && !hasAnyResults && (
          <div className="cn-glass rounded-2xl py-14 text-center cn-text-3">
            Nothing found for "{query}" — try another search.
          </div>
        )}

        {!loading && showAll && !searching && trending.length > 0 && (
          <section>
            <SectionHeading title="Trending in your hub" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {trending.map(t => (
                <TrendingRow key={t.id} icon={t.icon} gradient={t.gradient} title={t.title} meta={t.meta} onClick={t.onClick} />
              ))}
            </div>
          </section>
        )}

        {!loading && showAll && searching && unifiedResults.length > 0 && (
          <section>
            <SectionHeading title="Search results" sub={`Ranked by relevance to "${query}"`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {unifiedResults.map(r => (
                <TrendingRow key={r.key} icon={r.icon} gradient={r.gradient} title={r.title} meta={r.meta} onClick={r.onClick} />
              ))}
            </div>
          </section>
        )}

        {/* In showAll mode, an active search already shows spaces inside the unified
            "Search results" list above — this section would just duplicate them, so
            it only appears here in browse mode or on the dedicated Spaces tab. */}
        {!loading && (filter === 'spaces' || (showAll && !searching)) && suggestedSpaces.length > 0 && (
          <section>
            <SectionHeading title={searching ? `Spaces matching "${query}"` : 'Spaces you might like'} sub={searching ? undefined : 'Based on activity across your hub'} onSeeAll={showAll ? () => setFilter('spaces') : undefined} />
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {(showAll ? suggestedSpaces : filteredSpaces).map(s => (
                <SpaceCard key={s.id} space={s} tunnelUrl={tunnelUrl} onClick={() => onNavigate('spaces')} />
              ))}
            </div>
          </section>
        )}

        {!loading && (showAll || filter === 'initiatives') && featuredInitiatives.length > 0 && (
          <section>
            <SectionHeading title="Featured initiatives" sub="Community projects residents are building" onSeeAll={showAll ? () => setFilter('initiatives') : undefined} />
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {(showAll ? featuredInitiatives : filteredInitiatives).map(i => (
                <InitiativeCard key={i.id} ini={i} onClick={() => onNavigate('initiatives')} />
              ))}
            </div>
          </section>
        )}

        {!loading && (showAll || filter === 'resources') && popularResources.length > 0 && (
          <section>
            <SectionHeading title="Popular resources" sub="Most recommended tools and open-source picks" onSeeAll={showAll ? () => setFilter('resources') : undefined} />
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {(showAll ? popularResources : filteredTools).map(t => (
                <ResourceCard key={t.id} tool={t} onClick={() => onNavigate('toolkit')} />
              ))}
            </div>
          </section>
        )}

        {!loading && (filter === 'events' || (showAll && !searching)) && upcomingEvents.length > 0 && (
          <section>
            <SectionHeading title={searching ? `Events matching "${query}"` : 'Upcoming events'} />
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {(showAll ? upcomingEvents : filteredEvents).map(e => (
                <EventCard key={e.id} post={e} onClick={() => setSelectedPost(e)} />
              ))}
            </div>
          </section>
        )}

        {!loading && (filter === 'people' || (showAll && !searching)) && (showAll ? activeNeighbors : visibleMembers).length > 0 && (
          <section>
            <SectionHeading title={searching ? `People matching "${query}"` : 'Active neighbors'} sub={searching ? undefined : 'People to know in your hub'} />
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {(showAll ? activeNeighbors : visibleMembers).map(m => (
                <PersonCard
                  key={m.user_id}
                  member={m}
                  slug={slug}
                  isYou={m.user_id === currentUserId}
                  onClick={() => (m.user_id === currentUserId ? onNavigate('account') : onViewProfile?.(m.user_id))}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && (showAll || filter === 'hubs') && otherHubsSlice.length > 0 && (
          <section>
            <SectionHeading title="Other communities" sub="Hubs beyond your own you could explore" />
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {(showAll ? otherHubsSlice : filteredHubs).map(h => (
                <OtherHubCard key={h.id} hub={h} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Post detail modal (used by Trending posts + Events) */}
      {selectedPost && (
        <PostDetailModal
          isOpen
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
          hubSlug={slug}
          currentUserId={currentUserId}
          currentUserAvatarUrl={currentUser?.avatarUrl}
          isAdmin={isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={name => hubService.getPublicFileUrl(slug, name) ?? ''}
          onDeleted={() => setSelectedPost(null)}
          onNavigateToProfile={(userId) => { setSelectedPost(null); onNavigate(`profile/${userId}`); }}
        />
      )}
    </div>
  );
}
