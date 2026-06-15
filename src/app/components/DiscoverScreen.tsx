import { useState, useEffect, useMemo } from 'react';
import { DotGrid } from './DotGrid';
import {
  Search, X, Tag, Users, MessageCircle, FolderOpen,
  Compass, Shield, FileText, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import { PostDetailModal } from './PostDetailModal';
import type { HubPost, HubMember, HubFile } from '../types/hub';

type Tab = 'all' | 'posts' | 'people' | 'files';

interface DiscoverScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
  onViewProfile?: (userId: string) => void;
}

// ── shared helpers ──────────────────────────────────────────────────────────

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

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
};

function formatRelative(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── sub-components ───────────────────────────────────────────────────────────

function PostResult({ post, onOpen }: { post: HubPost; onOpen: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-3 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.DISCUSSION}`}>
              {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
            </span>
            <span className="text-xs text-slate-400">by @{post.author_username}</span>
            <span className="text-xs text-slate-400">{formatRelative(post.created_at)}</span>
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
            {post.title}
          </p>
          {post.body && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
              {post.body}
            </p>
          )}
        </div>
        {post.reply_count > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0 mt-0.5">
            <MessageCircle className="w-3.5 h-3.5" />
            {post.reply_count}
          </div>
        )}
      </div>
    </motion.button>
  );
}

function MemberResult({
  member, slug, isYou, onViewProfile, onNavigate,
}: {
  member: HubMember;
  slug: string;
  isYou: boolean;
  onViewProfile?: (id: string) => void;
  onNavigate: (s: string) => void;
}) {
  const avatarUrl = hubService.getAvatarUrl(slug, member.user_id);
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => isYou ? onNavigate('account') : onViewProfile?.(member.user_id)}
      className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-3 hover:border-purple-300 dark:hover:border-purple-700 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor(member.username)} flex items-center justify-center text-white font-semibold text-sm shrink-0 relative overflow-hidden`}>
          {member.username.slice(0, 2).toUpperCase()}
          {avatarUrl && (
            <img src={avatarUrl} alt={member.username} className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {member.display_name || member.username}
            </span>
            {member.display_name && member.display_name !== member.username && (
              <span className="text-xs text-slate-400 font-mono">@{member.username}</span>
            )}
            {isYou && <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-medium rounded-full">You</span>}
            {member.is_admin && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium rounded-full">
                <Shield className="w-2.5 h-2.5" />Admin
              </span>
            )}
          </div>
          {member.bio && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{member.bio}</p>
          )}
          {(member.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {member.tags!.slice(0, 4).map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function FileResult({ file }: { file: HubFile }) {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => {
        sessionStorage.setItem('citinet-deeplink-file', file.name);
        // Navigate to files screen — caller handles this via onNavigate wrapper
      }}
      className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-3 hover:border-purple-300 dark:hover:border-purple-700 transition-all group cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
            {file.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 rounded font-mono">{ext}</span>
            {file.size > 0 && <span>{formatBytes(file.size)}</span>}
            {file.uploaded_at && <span>{formatRelative(file.uploaded_at)}</span>}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export function DiscoverScreen({ onBack, onNavigate, onViewProfile }: DiscoverScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug ?? '';
  const currentUserId = currentUser?.hubUserId;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('all');

  const [posts, setPosts] = useState<HubPost[]>([]);
  const [members, setMembers] = useState<HubMember[]>([]);
  const [files, setFiles] = useState<HubFile[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);

  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  // Read tag filter set by ProfileScreen or NeighborsScreen
  useEffect(() => {
    const tag = sessionStorage.getItem('citinet-filter-tag');
    if (tag) {
      setActiveTag(tag);
      sessionStorage.removeItem('citinet-filter-tag');
    }
  }, []);

  // Read search query set by the Dashboard's search bar
  useEffect(() => {
    const q = sessionStorage.getItem('citinet-deeplink-search');
    if (q) {
      setSearchQuery(q);
      sessionStorage.removeItem('citinet-deeplink-search');
    }
  }, []);

  // Fetch all data once
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.allSettled([
      hubService.listPosts(slug),
      hubService.listMembers(slug),
      hubService.listFiles(slug),
    ]).then(([postsRes, membersRes, filesRes]) => {
      if (postsRes.status === 'fulfilled') setPosts(postsRes.value);
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value);
      if (filesRes.status === 'fulfilled') setFiles(filesRes.value);
      setLoading(false);
    });
  }, [slug]);

  // userId → tags lookup for post filtering
  const memberTagMap = useMemo(() => {
    const map = new Map<string, string[]>();
    members.forEach(m => map.set(m.user_id, m.tags ?? []));
    return map;
  }, [members]);

  // Normalise query — strip leading # so #gardening and gardening are equivalent
  const query = searchQuery.toLowerCase().replace(/^#/, '').trim();

  const filteredPosts = useMemo(() => posts.filter(p => {
    const matchQ = !query ||
      p.title.toLowerCase().includes(query) ||
      p.body?.toLowerCase().includes(query) ||
      p.author_username?.toLowerCase().includes(query);
    const matchTag = !activeTag ||
      (memberTagMap.get(p.author_id)?.includes(activeTag) ?? false) ||
      p.title.toLowerCase().includes(activeTag) ||
      p.body?.toLowerCase().includes(activeTag);
    return matchQ && matchTag;
  }), [posts, query, activeTag, memberTagMap]);

  const filteredMembers = useMemo(() => members.filter(m => {
    const matchQ = !query ||
      m.username.toLowerCase().includes(query) ||
      (m.display_name?.toLowerCase().includes(query) ?? false) ||
      (m.bio?.toLowerCase().includes(query) ?? false) ||
      (m.tags?.some(t => t.includes(query)) ?? false);
    const matchTag = !activeTag || (m.tags?.includes(activeTag) ?? false);
    return matchQ && matchTag;
  }), [members, query, activeTag]);

  const filteredFiles = useMemo(() => files.filter(f => {
    const matchQ = !query || f.name.toLowerCase().includes(query);
    const matchTag = !activeTag || f.name.toLowerCase().includes(activeTag);
    return matchQ && matchTag;
  }), [files, query, activeTag]);

  const hasResults = filteredPosts.length + filteredMembers.length + filteredFiles.length > 0;
  const hasFilter = !!query || !!activeTag;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'all',    label: 'All',    icon: <Compass className="w-3.5 h-3.5" />,    count: filteredPosts.length + filteredMembers.length + filteredFiles.length },
    { id: 'posts',  label: 'Posts',  icon: <MessageCircle className="w-3.5 h-3.5" />, count: filteredPosts.length },
    { id: 'people', label: 'People', icon: <Users className="w-3.5 h-3.5" />,      count: filteredMembers.length },
    { id: 'files',  label: 'Files',  icon: <FolderOpen className="w-3.5 h-3.5" />, count: filteredFiles.length },
  ];

  const showPosts   = activeTab === 'all' || activeTab === 'posts';
  const showPeople  = activeTab === 'all' || activeTab === 'people';
  const showFiles   = activeTab === 'all' || activeTab === 'files';
  const postsSlice  = activeTab === 'all' ? filteredPosts.slice(0, 5)   : filteredPosts;
  const peopleSlice = activeTab === 'all' ? filteredMembers.slice(0, 4) : filteredMembers;
  const filesSlice  = activeTab === 'all' ? filteredFiles.slice(0, 4)   : filteredFiles;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      <DotGrid />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Discover</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Search posts, people, and files</p>
            </div>
            <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
          </div>

          {/* Search bar */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search or type #tag to filter by interest…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Active tag pill */}
          {activeTag && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Filtering by:</span>
              <button
                onClick={() => setActiveTag(null)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                <Tag className="w-3 h-3" />
                #{activeTag}
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab.icon}
                {tab.label}
                {hasFilter && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-slate-300'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading…</p>
          </div>
        )}

        {/* Empty / prompt state */}
        {!loading && !hasFilter && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Compass className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Start typing to search</p>
            <p className="text-xs mt-1 text-center max-w-xs">
              Use <span className="font-mono text-purple-500">#tag</span> to filter by interest, or type any keyword to search across posts, people, and files.
            </p>
          </div>
        )}

        {/* No results */}
        {!loading && hasFilter && !hasResults && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No results found</p>
            <p className="text-xs mt-1">Try a different keyword or tag</p>
          </div>
        )}

        {/* Posts section */}
        {!loading && showPosts && postsSlice.length > 0 && (
          <section>
            {activeTab === 'all' && (
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" /> Posts
                </h2>
                {filteredPosts.length > 5 && (
                  <button onClick={() => setActiveTab('posts')} className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
                    See all {filteredPosts.length}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {postsSlice.map(post => (
                  <PostResult key={post.id} post={post} onOpen={() => setSelectedPost(post)} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* People section */}
        {!loading && showPeople && peopleSlice.length > 0 && (
          <section>
            {activeTab === 'all' && (
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> People
                </h2>
                {filteredMembers.length > 4 && (
                  <button onClick={() => setActiveTab('people')} className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
                    See all {filteredMembers.length}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {peopleSlice.map(member => (
                  <MemberResult
                    key={member.user_id}
                    member={member}
                    slug={slug}
                    isYou={member.user_id === currentUserId}
                    onViewProfile={onViewProfile}
                    onNavigate={onNavigate}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* Files section */}
        {!loading && showFiles && filesSlice.length > 0 && (
          <section>
            {activeTab === 'all' && (
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4" /> Files
                </h2>
                {filteredFiles.length > 4 && (
                  <button onClick={() => setActiveTab('files')} className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
                    See all {filteredFiles.length}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filesSlice.map(file => (
                  <FileResult
                    key={file.id}
                    file={file}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        <div className="h-8" />
      </div>

      {/* Post detail modal */}
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
