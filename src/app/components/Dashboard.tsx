import { useState, useEffect, useMemo, useRef, useCallback, type ComponentType } from 'react';
import {
  Search, Plus, Calendar, MapPin, Store, Users, Sparkles, ArrowRight,
  MessageSquare, Layers, NotebookPen, Radio, FileText, Newspaper,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { aiService } from '../services/aiService';
import { AvatarFallback } from './icons';
import { useActivityFeed, timeAgo, type ActivityItem, type ActivityType } from '../hooks/useActivityFeed';
import type { SearchResults } from '../types/hub';

interface DashboardProps {
  onNavigate?: (screen: string) => void;
}

// Rotated once per page load (Section 2 of the redesign) — makes the homepage
// feel alive instead of showing the same static line every visit.
const PROMPTS = [
  'Discover nearby places.',
  'Create a community event.',
  'Share an update.',
  'Find your neighbors.',
  'Explore the Atlas.',
  'Start a marketplace listing.',
];

type Command = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  keywords: string;
  run: (nav: (screen: string) => void) => void;
};

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Same activity → destination mapping the old dashboard used, and the same
// sessionStorage deep-link keys Feed/FilesScreen/AtlasScreen already consume
// today (they outlived the dashboard that used to be their only producer).
function navigateToActivity(item: ActivityItem, nav: (screen: string) => void) {
  if (item.type === 'pin_added' && item.itemId) {
    sessionStorage.setItem('citinet-deeplink-pin', item.itemId);
    nav('atlas');
    return;
  }
  if (item.type === 'file_shared' && item.itemId) {
    sessionStorage.setItem('citinet-deeplink-file', item.itemId);
    nav('files');
    return;
  }
  const postTypes: ActivityType[] = ['discussion', 'announcement', 'project', 'request', 'event'];
  if (postTypes.includes(item.type) && item.itemId) {
    nav(`feed/${item.itemId}`);
    return;
  }
  nav(item.navigateTo);
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const displayName = (currentUser?.displayName || currentUser?.username || 'Neighbor').split(' ')[0];

  const nav = useCallback((screen: string) => onNavigate?.(screen), [onNavigate]);

  const { items: activity } = useActivityFeed(hubSlug);

  const [now] = useState(() => new Date());
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    if (!hubSlug) return;
    aiService.getStatus(hubSlug).then(s => setAiEnabled(s.enabled)).catch(() => {});
  }, [hubSlug]);

  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // ── Universal intent search: a command palette (static actions, matched by
  // keyword) layered over the hub's real relevance-ranked search endpoint. ──
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const searchReqId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: 'create-post', icon: Plus, label: 'Create Post', keywords: 'create post new write share update', run: n => { sessionStorage.setItem('citinet-deeplink-compose', '1'); n('feed'); } },
      { id: 'create-event', icon: Calendar, label: 'Create Event', keywords: 'create event new meetup schedule calendar', run: n => { sessionStorage.setItem('citinet-deeplink-compose', '1'); sessionStorage.setItem('citinet-deeplink-feed-category', 'EVENT'); n('feed'); } },
      { id: 'add-pin', icon: MapPin, label: 'Add Atlas Pin', keywords: 'add pin atlas map location place new', run: n => n('atlas') },
      { id: 'new-listing', icon: Store, label: 'New Marketplace Listing', keywords: 'sell listing marketplace exchange vendor new', run: n => n('marketplace') },
      { id: 'find-people', icon: Users, label: 'Find People', keywords: 'find people neighbors members discover', run: n => n('discover') },
      { id: 'open-messages', icon: MessageSquare, label: 'Open Messages', keywords: 'messages chat comms', run: n => n('messages') },
      { id: 'open-spaces', icon: Layers, label: 'Open Spaces', keywords: 'spaces groups', run: n => n('spaces') },
      { id: 'open-notes', icon: NotebookPen, label: 'Open Notes', keywords: 'notes write', run: n => n('notes') },
    ];
    if (aiEnabled) {
      list.push({ id: 'ask-assistant', icon: Sparkles, label: 'Ask Assistant', keywords: 'ai assistant ask help question', run: n => n('assistant') });
    }
    return list;
  }, [aiEnabled]);

  const matchedCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.keywords.includes(q)).slice(0, 5);
  }, [commands, query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !hubSlug) { setSearchResults(null); return; }
    const myReq = ++searchReqId.current;
    const t = setTimeout(() => {
      hubService.search(hubSlug, q)
        .then(r => { if (searchReqId.current === myReq) setSearchResults(r); })
        .catch(() => { if (searchReqId.current === myReq) setSearchResults(null); });
    }, 200);
    return () => clearTimeout(t);
  }, [query, hubSlug]);

  const liveResults = query.trim().length >= 2 && searchResults?.query === query.trim() ? searchResults : null;
  const resultMembers = liveResults?.members.slice(0, 3) ?? [];
  const resultPosts = liveResults?.posts.slice(0, 3) ?? [];
  const resultSpaces = liveResults?.spaces.slice(0, 2) ?? [];
  const hasDropdown = query.trim().length > 0
    && (matchedCommands.length > 0 || resultMembers.length > 0 || resultPosts.length > 0 || resultSpaces.length > 0);

  const runCommand = (cmd: Command) => { cmd.run(nav); setQuery(''); };
  const goToMember = (userId: string) => { nav(`profile/${userId}`); setQuery(''); };
  const goToPost = (postId: string) => { nav(`feed/${postId}`); setQuery(''); };
  const goToSpace = (slug: string) => { nav(`spaces/${slug}`); setQuery(''); };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchedCommands[0]) { runCommand(matchedCommands[0]); return; }
      const q = query.trim();
      if (!q) return;
      sessionStorage.setItem('citinet-deeplink-search', q);
      nav('discover');
      setQuery('');
    } else if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const quickActionIds = ['create-post', 'create-event', 'add-pin', 'new-listing', 'find-people'];
  const quickActions = quickActionIds
    .map(id => commands.find(c => c.id === id))
    .filter((c): c is Command => !!c);

  // ── Featured cards: whatever's freshest per category, out of the same
  // activity feed the "Recent Activity" list below already fetches. ──
  const cards = useMemo(() => {
    const findByTypes = (types: ActivityType[]) => activity.find(i => types.includes(i.type));
    const out: { key: string; label: string; icon: ComponentType<{ className?: string }>; item: ActivityItem }[] = [];

    const pin = findByTypes(['pin_added']);
    if (pin) out.push({ key: 'pin', label: 'Latest Atlas Pin', icon: MapPin, item: pin });

    const post = findByTypes(['discussion', 'announcement', 'project', 'request']);
    if (post) out.push({ key: 'post', label: 'Newest Community Post', icon: Newspaper, item: post });

    const event = findByTypes(['event']);
    if (event) out.push({ key: 'event', label: 'Recent Event', icon: Calendar, item: event });

    const other = findByTypes(['neighbor_joined', 'space_created', 'live_broadcast', 'file_shared']);
    if (other) {
      const labelByType: Partial<Record<ActivityType, string>> = {
        neighbor_joined: 'New Neighbor',
        space_created: 'New Space',
        live_broadcast: 'Live Now',
        file_shared: 'Newly Shared File',
      };
      const iconByType: Partial<Record<ActivityType, ComponentType<{ className?: string }>>> = {
        neighbor_joined: Users,
        space_created: Layers,
        live_broadcast: Radio,
        file_shared: FileText,
      };
      out.push({ key: 'other', label: labelByType[other.type] ?? 'Recent Activity', icon: iconByType[other.type] ?? FileText, item: other });
    }

    return out.slice(0, 4);
  }, [activity]);

  return (
    <div className="min-h-full px-4 md:px-8 pt-6 md:pt-12 pb-24 max-w-3xl mx-auto">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">{greetingForHour(now.getHours())}, {displayName}</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{dateStr} · {timeStr}</p>
      </div>

      {/* Action prompt */}
      <div className="mb-3">
        <p className="text-lg font-medium text-slate-700 dark:text-zinc-200">What would you like to do today?</p>
        <p className="text-sm text-slate-400 dark:text-zinc-500">{prompt}</p>
      </div>

      {/* Universal intent search / command palette */}
      <div className="relative mb-3">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder='Search CitiNet, or type a command… ("create event", "john", "coffee")'
          className="w-full h-12 pl-11 pr-4 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-shadow"
        />

        {hasDropdown && (
          <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
            {matchedCommands.length > 0 && (
              <div className="py-1">
                {matchedCommands.map(cmd => (
                  <button
                    key={cmd.id}
                    onClick={() => runCommand(cmd)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <cmd.icon className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-sm text-slate-800 dark:text-zinc-100">{cmd.label}</span>
                  </button>
                ))}
              </div>
            )}
            {resultMembers.length > 0 && (
              <div className="border-t border-slate-100 dark:border-zinc-800 py-1">
                {resultMembers.map(m => (
                  <button
                    key={m.user_id}
                    onClick={() => goToMember(m.user_id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                      <AvatarFallback className="w-full h-full" name={m.username} />
                    </div>
                    <span className="text-sm text-slate-800 dark:text-zinc-100">@{m.username}</span>
                  </button>
                ))}
              </div>
            )}
            {resultPosts.length > 0 && (
              <div className="border-t border-slate-100 dark:border-zinc-800 py-1">
                {resultPosts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => goToPost(p.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-800 dark:text-zinc-100 truncate">{p.title || p.body?.slice(0, 60) || 'Untitled post'}</span>
                  </button>
                ))}
              </div>
            )}
            {resultSpaces.length > 0 && (
              <div className="border-t border-slate-100 dark:border-zinc-800 py-1">
                {resultSpaces.map(s => (
                  <button
                    key={s.id}
                    onClick={() => goToSpace(s.slug)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left"
                  >
                    <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-800 dark:text-zinc-100">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suggested actions */}
      <div className="flex flex-wrap gap-2 mb-10">
        {quickActions.map(cmd => (
          <button
            key={cmd.id}
            onClick={() => runCommand(cmd)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          >
            <cmd.icon className="w-3.5 h-3.5" />
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Featured cards */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {cards.map(card => (
            <button
              key={card.key}
              onClick={() => navigateToActivity(card.item, nav)}
              className="text-left p-4 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <card.icon className="w-4 h-4 text-blue-500 mb-2" />
              <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">{card.item.title}</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">{timeAgo(card.item.timestamp)} · View →</p>
            </button>
          ))}
        </div>
      )}

      {/* Recent activity */}
      {activity.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Recent Activity</h2>
          <div className="space-y-1">
            {activity.slice(0, 5).map(item => (
              <button
                key={item.id}
                onClick={() => navigateToActivity(item, nav)}
                className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                  {item.actorAvatarUrl
                    ? <img src={item.actorAvatarUrl} alt={item.actor} className="w-full h-full object-cover" />
                    : <AvatarFallback className="w-full h-full" name={item.actor} />
                  }
                </div>
                <p className="text-sm text-slate-600 dark:text-zinc-300 truncate">
                  <span className="font-medium text-slate-900 dark:text-white">{item.actor}</span>{' '}
                  {item.summary}{' '}
                  <span className="text-slate-400 dark:text-zinc-500">· {timeAgo(item.timestamp)}</span>
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <a
        href="https://github.com/fergtech/citinet/issues/new/choose"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Help shape Citinet <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
