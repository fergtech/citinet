import { useState, useEffect, useMemo, useRef, useCallback, type ComponentType } from 'react';
import {
  Search, Plus, Calendar, MapPin, Store, Users, Sparkles, ArrowRight,
  MessageSquare, Layers, NotebookPen, Upload, Vote,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { aiService } from '../services/aiService';
import { AvatarFallback } from './icons';
import { HomeActivityCard, HomeFeedSkeleton } from './HomeActivityCard';
import { useHomeFeed } from '../hooks/useHomeFeed';
import { seenInitiativeUpdates } from '../utils/seenStore';
import type { HomeCardData } from '../utils/homeFeedSelection';
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

// Where a Home feed card lands. Uses the same sessionStorage deep-link keys the destination
// screens already consume (Atlas pins, Marketplace listings, Initiative tabs).
const INITIATIVE_TAB: Record<string, string> = { task: 'tasks', resource: 'resources', team: 'team' };
function openHomeCard(card: HomeCardData, nav: (screen: string) => void) {
  const a = card.action;
  switch (a.type) {
    case 'post':
      nav(`feed/${a.id}`);
      return;
    case 'pin':
      sessionStorage.setItem('citinet-deeplink-pin', a.id);
      nav('atlas');
      return;
    case 'listing':
      sessionStorage.setItem('citinet-deeplink-listing', a.id);
      nav('marketplace');
      return;
    case 'initiative': {
      // Initiative updates have no per-viewer server record, so opening one is what marks it seen.
      seenInitiativeUpdates.markSeen(a.updateId);
      const tab = INITIATIVE_TAB[a.kind];
      if (tab) sessionStorage.setItem('citinet-deeplink-initiative-tab', JSON.stringify({ initiativeId: a.initiativeId, tab, taskId: a.taskId }));
      nav(`initiatives/${a.initiativeId}`);
      return;
    }
  }
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const displayName = (currentUser?.displayName || currentUser?.username || 'Neighbor').split(' ')[0];

  const nav = useCallback((screen: string) => onNavigate?.(screen), [onNavigate]);

  // "Mine" for the feed's no-self-content rule. Initiative activity rows only carry a free-text
  // actor name, so those are matched by username/display name.
  const myNames = useMemo(
    () => [currentUser?.username, currentUser?.displayName].filter(Boolean).map(n => n!.trim().toLowerCase()),
    [currentUser?.username, currentUser?.displayName],
  );
  const { cards, loading: feedLoading, error: feedError } = useHomeFeed(hubSlug, { userId: currentUser?.hubUserId, names: myNames });

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
      { id: 'create-event', icon: Calendar, label: 'Create Event', keywords: 'create event new meetup schedule calendar', run: n => { sessionStorage.setItem('citinet-deeplink-compose', '1'); sessionStorage.setItem('citinet-deeplink-feed-category', 'EVENT'); sessionStorage.setItem('citinet-deeplink-compose-mode', 'event'); n('feed'); } },
      { id: 'create-poll', icon: Vote, label: 'Create Poll', keywords: 'create poll new vote survey question', run: n => { sessionStorage.setItem('citinet-deeplink-compose', '1'); sessionStorage.setItem('citinet-deeplink-feed-category', 'POLL'); sessionStorage.setItem('citinet-deeplink-compose-mode', 'poll'); n('feed'); } },
      { id: 'add-pin', icon: MapPin, label: 'Add Atlas Pin', keywords: 'add pin atlas map location place new', run: n => { sessionStorage.setItem('citinet-deeplink-atlas-add-pin', '1'); n('atlas'); } },
      { id: 'new-listing', icon: Store, label: 'New Marketplace Listing', keywords: 'sell listing marketplace exchange vendor new', run: n => { sessionStorage.setItem('citinet-deeplink-marketplace-post', '1'); n('marketplace'); } },
      { id: 'upload-file', icon: Upload, label: 'Upload a File', keywords: 'upload file files share attach document photo picture pdf', run: n => { sessionStorage.setItem('citinet-deeplink-upload', '1'); n('files'); } },
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

  const quickActionIds = ['upload-file', 'create-post', 'create-event', 'add-pin', 'create-poll'];
  const quickActions = quickActionIds
    .map(id => commands.find(c => c.id === id))
    .filter((c): c is Command => !!c);

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-12 pb-24 max-w-3xl mx-auto">
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
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder='Search Citinet, or type a command… ("create event", "john", "coffee")'
          className="w-full h-[46px] pl-10 pr-4 rounded-xl cn-glass cn-text-1 text-sm placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
      <div className="flex flex-wrap gap-1.5 mb-6">
        {quickActions.map(cmd => (
          <button
            key={cmd.id}
            onClick={() => runCommand(cmd)}
            className="cn-pill-hover shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border cn-surface-2 cn-text-2 cn-border transition-colors"
          >
            <cmd.icon className="w-3.5 h-3.5" />
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Activity feed — one card per feature area (Feed, Events, Atlas, Marketplace, Initiatives),
          the freshest thing the member hasn't seen yet. Rules: utils/homeFeedSelection.ts */}
      <div className="mb-10">
        {feedLoading && cards.length === 0 ? (
          <HomeFeedSkeleton />
        ) : cards.length === 0 ? (
          <p className="text-sm cn-text-4 px-1">Nothing new yet — when neighbours post, add pins, list things or start projects, it shows up here.</p>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <HomeActivityCard
                key={card.key}
                card={card}
                hubSlug={hubSlug}
                currentUserId={currentUser?.hubUserId}
                currentUserAvatarUrl={currentUser?.avatarUrl}
                onOpen={() => openHomeCard(card, nav)}
                onOpenProfile={id => nav(`profile/${id}`)}
                onOpenVendor={id => nav(`vendor/${id}`)}
              />
            ))}
          </div>
        )}
        {feedError && cards.length > 0 && <p className="text-xs cn-text-4 mt-2 px-1">{feedError}</p>}
      </div>

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
