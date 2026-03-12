import { useState, useEffect } from 'react';
import {
  MapPin, Shield, Calendar, MessageCircle,
  Loader2, AlertCircle, Tag, X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import { PostDetailModal } from './PostDetailModal';
import type { HubMember, HubPost } from '../types/hub';

// Shared avatar helpers (same palette as NeighborsScreen)
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

function formatJoinDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function formatTimestamp(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
};

interface ProfileScreenProps {
  userId: string;
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

export function ProfileScreen({ userId, onBack, onNavigate }: ProfileScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug ?? '';

  const [member, setMember] = useState<HubMember | null>(null);
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);

  const isAdmin = currentUser?.isAdmin === true ||
    (!!currentUser?.username && (currentHub?.tunnelUrl ?? '').includes('localhost'));

  useEffect(() => {
    if (!slug || !userId) return;
    setLoading(true);
    setError('');

    Promise.allSettled([
      hubService.getMember(slug, userId),
      hubService.listPosts(slug),
    ]).then(([memberRes, postsRes]) => {
      if (memberRes.status === 'fulfilled') {
        setMember(memberRes.value);
      } else {
        setError('Could not load profile.');
      }
      if (postsRes.status === 'fulfilled') {
        // Filter to this user's posts only
        setPosts(postsRes.value.filter(p => p.author_id === userId).slice(0, 10));
      }
      setLoading(false);
    });
  }, [slug, userId]);

  const avatarUrl = member ? hubService.getAvatarUrl(slug, member.user_id) : null;
  const displayName = member?.display_name || member?.username || '';

  const handleMessage = () => {
    sessionStorage.setItem('citinet-dm-userId', userId);
    sessionStorage.setItem('citinet-dm-username', member?.username ?? '');
    onNavigate('messages');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm">{error || 'Profile not found'}</p>
        <button onClick={onBack} className="text-sm text-purple-600 hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="profile-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#profile-dots)" opacity="0.07"/>
        </svg>
      </div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-lg font-bold text-slate-900 dark:text-white truncate flex-1">
            {displayName || member.username}
          </span>
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Hero card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
        >
          {/* Top accent gradient strip */}
          <div className={`h-2 bg-gradient-to-r ${avatarColor(member.username)}`} />

          <div className="p-6">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              {member.avatar_url && avatarUrl
                ? <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-20 h-20 rounded-2xl object-cover shrink-0 shadow-md"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                : <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${avatarColor(member.username)} flex items-center justify-center text-white font-bold text-3xl shrink-0 shadow-md`}>
                    {(displayName || member.username).charAt(0).toUpperCase()}
                  </div>
              }

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    {displayName && displayName !== member.username && (
                      <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                        {displayName}
                      </h1>
                    )}
                    <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                      @{member.username}
                    </p>
                  </div>
                  {member.is_admin && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="mt-2 space-y-1">
                  {member.location && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{member.location}</span>
                    </div>
                  )}
                  {member.created_at && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Member since {formatJoinDate(member.created_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bio */}
            {member.bio && (
              <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {member.bio}
              </p>
            )}

            {/* Tags */}
            {(member.tags?.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {member.tags!.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      sessionStorage.setItem('citinet-filter-tag', tag);
                      onNavigate('discover');
                    }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:border-purple-400 transition-colors"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleMessage}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-semibold shadow-sm transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                Message
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Recent Posts ── */}
        {posts.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
              Recent Posts
            </h2>
            <div className="space-y-2">
              {posts.map((post, i) => (
                <motion.button
                  key={post.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setSelectedPost(post)}
                  className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-3 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.DISCUSSION}`}>
                          {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(post.created_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                        {post.title}
                      </p>
                      {post.body && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {post.body}
                        </p>
                      )}
                    </div>
                    {post.reply_count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 shrink-0 mt-0.5">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {post.reply_count}
                      </div>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {posts.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-8 text-center">
            <MessageCircle className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No posts yet</p>
          </div>
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
          currentUserId={currentUser?.hubUserId}
          currentUserAvatarUrl={currentUser?.avatarUrl}
          isAdmin={isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(slug, name) ?? ''}
          onDeleted={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
