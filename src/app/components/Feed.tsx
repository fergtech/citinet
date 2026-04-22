import { useState, useEffect, useCallback } from 'react';
import { PostCard } from './PostCard';
import { PostDetailModal } from './PostDetailModal';
import { Plus, Loader2, AlertCircle, RefreshCw, X, Image, Film, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubPost } from '../types/hub';

interface FeedProps {
  onBack: () => void;
}

// const POST_CATEGORIES = ['All', 'Discussion', 'Announcement', 'Project', 'Request'];

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function getVariant(mediaFileName?: string | null): 'text' | 'image' | 'video' {
  if (!mediaFileName) return 'text';
  const ext = mediaFileName.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  return 'text';
}

// ── Compose Modal ─────────────────────────────────────────

interface ComposeModalProps {
  hubSlug: string;
  onClose: () => void;
  onCreated: (post: HubPost) => void;
  initialTitle?: string;
  initialBody?: string;
}

function ComposeModal({ hubSlug, onClose, onCreated, initialBody = '' }: ComposeModalProps) {
  const [category, setCategory] = useState('DISCUSSION');
  // const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const isVideoFile = mediaFile?.type.startsWith('video/') ?? false;

  function handleFile(file: File) {
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreview(url);
  }

  function removeMedia() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !mediaFile) { setError('Add a caption or media'); return; }
    setError('');
    setSubmitting(true);
    try {
      const post = await hubService.createPost(hubSlug, {
        category,
        title: body.trim().split('\n')[0].substring(0, 100) || 'Untitled',
        body: body.trim(),
        mediaFile: mediaFile ?? undefined,
      });
      onCreated(post);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl pointer-events-auto flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-slate-900 dark:text-white font-semibold text-lg">New Post</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 overflow-y-auto max-h-[70vh]">

            {/* Category */}
            <div className="flex flex-wrap gap-2">
              {['DISCUSSION', 'ANNOUNCEMENT', 'PROJECT', 'REQUEST'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wide ring-1 transition-all ${
                    category === cat
                      ? CATEGORY_COLORS[cat] + ' ring-1'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 ring-transparent hover:bg-slate-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Body / Caption */}
            <div>
              <textarea
                placeholder="What's on your mind? (optional)"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Media upload */}
            {mediaPreview ? (
              <div className="relative rounded-xl overflow-hidden bg-black">
                {isVideoFile ? (
                  <video src={mediaPreview} controls className="w-full max-h-48 object-contain" />
                ) : (
                  <img src={mediaPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                )}
                <button
                  type="button"
                  onClick={removeMedia}
                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-sm text-slate-500 dark:text-slate-400">
                <Image className="w-4 h-4" />
                <Film className="w-4 h-4" />
                <span>Attach an image or video (optional)</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
              </label>
            )}

            {error && (
              <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
            )}
          </form>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (!body.trim() && !mediaFile)}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-opacity"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ── Feed ──────────────────────────────────────────────────

export function Feed({ onBack }: FeedProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeInitial, setComposeInitial] = useState<{ title: string; body: string } | null>(null);

  // Deep-link: open compose with pre-filled welcome message
  useEffect(() => {
    const raw = sessionStorage.getItem('citinet-deeplink-welcome');
    if (!raw) return;
    sessionStorage.removeItem('citinet-deeplink-welcome');
    try {
      const { username } = JSON.parse(raw) as { username: string };
      setComposeInitial({
        title: `Welcome to the community, @${username}!`,
        body: `Hey @${username}, glad you're here! Welcome to the neighborhood.`,
      });
      setComposing(true);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!hubSlug) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const cat = activeCategory === 'All' ? undefined : activeCategory.toUpperCase();
      const data = await hubService.listPosts(hubSlug, cat);
      setPosts(data);
    } catch (err) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : 'Could not load posts';
        if (!msg.includes('Failed to fetch')) setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [hubSlug, activeCategory]);

  useEffect(() => { load(); }, [load]);

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const filteredPosts = searchQuery.trim()
    ? posts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.author_username?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : posts;

  function handleCreated(post: HubPost) {
    setPosts(prev => [post, ...prev]);
  }

  function handlePostDeleted(postId: string) {
    setPosts(prev => prev.filter(p => p.id !== postId));
    if (selectedPost?.id === postId) setSelectedPost(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-purple-50/20 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 pb-6">
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="feed-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#feed-dots)" opacity="0.07"/>
        </svg>
      </div>

      {/* Header */}
      <div className="sticky top-0 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 z-10">
        <div className="max-w-4xl mx-auto p-4">
          {/* Title + Search + Buttons */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0">
              <h2 className="text-slate-900 dark:text-white font-semibold text-xl tracking-tight">Discussions</h2>
              
            </div>

            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search discussions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setComposing(true)}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md hover:opacity-90 transition-opacity flex-shrink-0"
                title="New post"
              >
                <Plus className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={onBack}
                className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* No-algorithm notice */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-blue-200/50 dark:border-blue-700/50 mb-6">
          <p className="text-sm text-slate-700 dark:text-slate-300 font-light">
            <strong className="font-semibold">No algorithms here.</strong>{' '}
            All discussions appear in the order they were posted. Nothing is hidden, ranked, or optimized for engagement.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 max-w-4xl mx-auto">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-slate-600 dark:text-slate-400 text-sm">{error}</p>
            <button
              onClick={() => load()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}

        {!loading && !error && filteredPosts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">
              {searchQuery
                ? `No posts matching "${searchQuery}"`
                : `No ${activeCategory === 'All' ? '' : activeCategory.toLowerCase() + ' '}posts yet.`}
            </p>
            {searchQuery
              ? <button onClick={() => setSearchQuery('')} className="text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors">Clear search</button>
              : <button onClick={() => setComposing(true)} className="text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors">Be the first to post →</button>
            }
          </div>
        )}

        {!loading && !error && filteredPosts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPosts.map(post => {
              const mediaUrl = post.media_file_name
                ? hubService.getPublicFileUrl(hubSlug, post.media_file_name) ?? undefined
                : undefined;
              return (
                <div key={post.id} onClick={() => setSelectedPost(post)} className="cursor-pointer">
                  <PostCard
                    id={post.id}
                    variant={getVariant(post.media_file_name)}
                    category={post.category}
                    title={post.title}
                    author={post.author_username}
                    timestamp={formatTimestamp(post.created_at)}
                    content={post.body}
                    mediaUrl={mediaUrl}
                    replyCount={post.reply_count}
                    categoryColors={CATEGORY_COLORS}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <PostDetailModal
          isOpen={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
          hubSlug={hubSlug}
          currentUserId={currentUser?.hubUserId}
          currentUserAvatarUrl={currentUser?.avatarUrl}
          isAdmin={currentUser?.isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(hubSlug, name) ?? ''}
          onDeleted={handlePostDeleted}
        />
      )}

      {/* Compose modal */}
      {composing && (
        <ComposeModal
          hubSlug={hubSlug}
          onClose={() => { setComposing(false); setComposeInitial(null); }}
          onCreated={handleCreated}
          initialTitle={composeInitial?.title}
          initialBody={composeInitial?.body}
        />
      )}
    </div>
  );
}