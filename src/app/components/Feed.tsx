import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PostCard } from './PostCard';
import { PollFeedCard } from './PollFeedCard';
import { LocationSearchInput } from './LocationSearchInput';
import {
  Loader2, AlertCircle, RefreshCw, X, Image, Film,
  Calendar, MapPin, ChevronDown, Globe, Users, Lock,
  MessageCircle, Newspaper, ShieldCheck, ChevronLeft, Send, BarChart2, Vote, Plus, Link2,
  MoreVertical, Edit2, Trash2, Clock, Check, CornerDownRight, Heart, Share2, Bookmark, ArrowUpRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import { notificationsService } from '../services/notificationsService';
import { openLocationInAtlas } from '../utils/geocoding';
import { hubPath } from '../utils/subdomain';
import { pollsService } from '../services/pollsService';
import { requestsService, type HubRequest } from '../services/requestsService';
import type { HubPost, HubPostReply, HubEventAttendee } from '../types/hub';
import type { Poll } from '../types/poll';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface FeedProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
  EVENT:        'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-purple-200 dark:ring-purple-500/20',
};

const CAT_TABS = [
  { value: null,           label: 'All' },
  { value: 'ANNOUNCEMENT', label: 'Announcements' },
  { value: 'EVENT',        label: 'Events' },
  { value: 'REQUEST',      label: 'Requests' },
  { value: 'PROJECT',      label: 'Projects' },
  { value: 'DISCUSSION',   label: 'Discussions' },
  { value: 'POLL',         label: 'Polls' },
] as const;

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

function getVariant(mediaFileName?: string | null): 'text' | 'image' | 'video' {
  if (!mediaFileName) return 'text';
  const ext = mediaFileName.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  return 'text';
}

// ── Right Rail ───────────────────────────────────────────────

const RAIL_CAT_COLORS: Record<string, string> = {
  DISCUSSION:   'text-blue-400',
  ANNOUNCEMENT: 'text-rose-400',
  PROJECT:      'text-emerald-400',
  REQUEST:      'text-orange-400',
  EVENT:        'text-purple-400',
};

const RAIL_CAT_LABELS: Record<string, string> = {
  DISCUSSION: 'Discussions', ANNOUNCEMENT: 'Announcements',
  PROJECT: 'Projects', REQUEST: 'Requests', EVENT: 'Events',
};

function RightRail({ hubName, posts }: { hubName: string; posts: HubPost[] }) {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach(p => { counts[p.category] = (counts[p.category] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [posts]);

  return (
    <div className="flex flex-col gap-4">
      {/* Hub info */}
      <div className="cn-glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="cn-live-dot w-1.5 h-1.5 shrink-0" />
          <span className="cn-eyebrow">{hubName}</span>
        </div>
        <p className="text-xs cn-text-3 leading-relaxed">
          Posts are visible to verified members of this hub only. No algorithms — nothing ranked or hidden.
        </p>
      </div>

      {/* Category breakdown */}
      {breakdown.length > 0 && (
        <div className="cn-glass rounded-2xl p-4">
          <span className="cn-eyebrow block mb-3">In this feed</span>
          <div className="flex flex-col gap-2">
            {breakdown.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className={`text-sm ${RAIL_CAT_COLORS[cat] ?? 'cn-text-3'}`}>
                  {RAIL_CAT_LABELS[cat] ?? cat}
                </span>
                <span className="cn-mono text-xs cn-text-4">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guidelines */}
      <div className="cn-glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-sm font-semibold cn-text-1">Community guidelines</span>
        </div>
        <p className="text-xs cn-text-3 leading-relaxed">
          Be kind, keep it local, and assume good intent. Flag anything that feels off.
        </p>
      </div>
    </div>
  );
}

// ── Post Detail Helpers ───────────────────────────────────────

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }
const AVATAR_COLORS_LIST = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
];
function avatarColorClass(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS_LIST[Math.abs(h) % AVATAR_COLORS_LIST.length];
}

function AvatarCircle({ authorId, authorUsername, authorAvatarUrl, currentUserId, currentUserAvatarUrl, size = 'md' }: {
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
  const url = authorId === currentUserId ? (currentUserAvatarUrl || authorAvatarUrl) : authorAvatarUrl;
  useEffect(() => { setFailed(false); }, [url]);
  if (url && !failed) return <img src={url} alt={authorUsername} className={`${dim} rounded-full object-cover shrink-0`} onError={() => setFailed(true)} />;
  return <div className={`${dim} rounded-full bg-gradient-to-br ${avatarColorClass(authorUsername)} flex items-center justify-center text-white font-semibold shrink-0`}>{getInitials(authorUsername)}</div>;
}

/** Real, shared RSVP row for an EVENT post — same hub_event_rsvps backend the
 * dashboard's compact event overlay uses, so "going" stays consistent everywhere. */
function EventRsvpRow({ post, hubSlug, onNavigateToProfile }: { post: HubPost; hubSlug: string; onNavigateToProfile?: (userId: string) => void }) {
  const [going, setGoing] = useState(post.my_rsvp ?? false);
  const [count, setCount] = useState(post.rsvp_count ?? 0);
  const [attendees, setAttendees] = useState<HubEventAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hubService.listRsvps(hubSlug, post.id)
      .then(data => { if (!cancelled) { setAttendees(data.attendees); setCount(data.count); setGoing(data.going); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hubSlug, post.id]);

  const toggle = async () => {
    if (toggling) return;
    setToggling(true);
    const was = going;
    setGoing(!was);
    setCount(c => was ? Math.max(0, c - 1) : c + 1);
    try {
      const result = await hubService.toggleRsvp(hubSlug, post.id);
      setGoing(result.going);
      setCount(result.count);
      const data = await hubService.listRsvps(hubSlug, post.id);
      setAttendees(data.attendees);
    } catch {
      setGoing(was);
      setCount(c => was ? c + 1 : Math.max(0, c - 1));
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl border cn-border bg-white/[0.03]">
      <div className="flex items-center gap-2.5 min-w-0">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin cn-text-4" />
        ) : attendees.length > 0 ? (
          <div className="flex -space-x-2 shrink-0">
            {attendees.slice(0, 5).map(a => (
              <button
                key={a.user_id}
                onClick={() => onNavigateToProfile?.(a.user_id)}
                title={a.display_name || a.username}
                className="rounded-full ring-2 ring-white dark:ring-zinc-900 hover:z-10 hover:scale-110 transition-transform"
              >
                <AvatarCircle authorId={a.user_id} authorUsername={a.display_name || a.username} authorAvatarUrl={hubService.getAvatarUrl(hubSlug, a.user_id) ?? undefined} size="sm" />
              </button>
            ))}
          </div>
        ) : null}
        {!loading && (
          <span className="text-xs cn-text-3 truncate">
            {count > 0 ? `${count} going${attendees.length > 5 ? ` · +${count - 5} more` : ''}` : 'No one going yet'}
          </span>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={toggling}
        className={`shrink-0 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${going ? 'cn-surface-2 cn-text-1 border cn-border' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
      >
        {going ? "You're going" : "I'm going"}
      </button>
    </div>
  );
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isExternalSourcePost(post: HubPost): boolean {
  const u = (post.author_username || '').trim().toLowerCase();
  return Boolean(post.source || post.platform || post.origin || post.source_app || post.source_name || post.app_name || post.platform_name || u === 'email' || u.includes('@') || !post.author_id);
}

function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const url = m[0];
    nodes.push(<a key={m.index} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all" onClick={e => e.stopPropagation()}>{url}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function getSourceBranding(post: HubPost) {
  return {
    name: post.source_name || post.app_name || post.platform_name || post.source || post.platform || 'Society+',
    logoUrl: post.source_logo_url || post.logo_url || post.source_favicon_url || post.favicon_url || null,
  };
}

// ── Post Detail View ──────────────────────────────────────────

type PdvVisibility = 'inherit' | 'hub' | 'private';
const PDV_VIS_OPTIONS: { value: PdvVisibility; label: string; icon: ReactNode; desc: string }[] = [
  { value: 'inherit', label: 'Default',  icon: <Globe className="w-3.5 h-3.5" />, desc: 'Follows your profile visibility' },
  { value: 'hub',     label: 'Hub only', icon: <Users className="w-3.5 h-3.5" />, desc: 'Members only, even if profile is public' },
  { value: 'private', label: 'Only me',  icon: <Lock className="w-3.5 h-3.5" />,  desc: 'Visible only to you' },
];

interface PostDetailViewProps {
  post: HubPost;
  hubSlug: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  isAdmin?: boolean;
  categoryColors: Record<string, string>;
  publicFileUrl: (name: string) => string;
  onBack: () => void;
  onDeleted: (postId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigate?: (screen: string) => void;
}

function PostDetailView({ post, hubSlug, currentUserId, currentUserAvatarUrl, isAdmin, categoryColors, publicFileUrl, onBack, onDeleted, onNavigateToProfile, onNavigate }: PostDetailViewProps) {
  const [replies, setReplies] = useState<HubPostReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body || '');
  const [, setEditTitle] = useState(post.title);
  const [editMediaFile, setEditMediaFile] = useState<File | null>(null);
  const [editMediaPreview, setEditMediaPreview] = useState<string | null>(null);
  const [editRemoveMedia, setEditRemoveMedia] = useState(false);
  const [editEventDate, setEditEventDate] = useState(post.event_date ? toDatetimeLocal(post.event_date) : '');
  const [editEventLocation, setEditEventLocation] = useState(post.event_location || '');
  const [saving, setSaving] = useState(false);
  const [editVisibility, setEditVisibility] = useState<PdvVisibility>((post.visibility as PdvVisibility) ?? 'inherit');
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ replyId: string; userId: string; username: string } | null>(null);
  const [highlightedReplyId, setHighlightedReplyId] = useState<string | null>(null);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { currentHub } = useHub();

  const loadReplies = useCallback(async (silent = false) => {
    if (!silent) setLoadingReplies(true);
    try {
      const data = await hubService.listReplies(hubSlug, post.id);
      setReplies(data);
    } catch { /* non-critical */ }
    finally { setLoadingReplies(false); }
  }, [hubSlug, post.id]);

  useEffect(() => {
    loadReplies();
    const id = setInterval(() => loadReplies(true), 15_000);
    return () => clearInterval(id);
  }, [loadReplies]);

  function scrollToReply(replyId: string) {
    const el = document.getElementById(`pdv-reply-${replyId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedReplyId(replyId);
    setTimeout(() => setHighlightedReplyId(null), 1500);
  }

  function handleClickReply(reply: HubPostReply) {
    setReplyingTo({ replyId: reply.id, userId: reply.author_id, username: reply.author_username });
    setReplyText('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSendError('');
    setSending(true);
    try {
      const reply = await hubService.createReply(hubSlug, post.id, replyText.trim(), replyingTo?.replyId ?? null, replyingTo?.userId ?? null);
      setReplies(prev => [...prev, reply]);
      setReplyText('');
      setReplyingTo(null);
      setTimeout(() => repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally { setSending(false); }
  }

  async function handleDeletePost() {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await hubService.deletePost(hubSlug, post.id);
      onDeleted(post.id);
      onBack();
    } catch { setDeleting(false); }
  }

  function handleEditFileChange(file: File) {
    setEditRemoveMedia(false);
    setEditMediaFile(file);
    setEditMediaPreview(URL.createObjectURL(file));
  }

  function handleEditClearMedia() {
    if (editMediaPreview) { URL.revokeObjectURL(editMediaPreview); setEditMediaFile(null); setEditMediaPreview(null); }
    else { setEditRemoveMedia(true); }
  }

  async function handleSaveEdit() {
    if (post.category === 'EVENT' && !editEventDate) { alert('Event date is required'); return; }
    setSaving(true);
    try {
      const updated = await hubService.updatePost(hubSlug, post.id, {
        title: editBody.trim().split('\n')[0].substring(0, 100) || post.title,
        body: editBody.trim(),
        mediaFile: editMediaFile ?? undefined,
        removeMedia: editRemoveMedia,
        eventDate: post.category === 'EVENT' && editEventDate ? new Date(editEventDate).toISOString() : undefined,
        eventLocation: post.category === 'EVENT' ? editEventLocation : undefined,
        visibility: editVisibility,
      });
      post.title = updated.title;
      post.body = updated.body ?? '';
      post.media_file_name = updated.media_file_name ?? undefined;
      post.event_date = updated.event_date;
      post.event_location = updated.event_location;
      post.visibility = updated.visibility;
      setIsEditing(false);
      setEditMediaFile(null);
      setEditMediaPreview(null);
      setEditRemoveMedia(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update post');
    } finally { setSaving(false); }
  }

  function handleCancelEdit() {
    setEditBody(post.body || '');
    setEditTitle(post.title);
    setEditMediaFile(null);
    if (editMediaPreview) URL.revokeObjectURL(editMediaPreview);
    setEditMediaPreview(null);
    setEditRemoveMedia(false);
    setEditEventDate(post.event_date ? toDatetimeLocal(post.event_date) : '');
    setEditEventLocation(post.event_location || '');
    setIsEditing(false);
  }

  const canEdit = currentUserId === post.author_id;
  const canDelete = isAdmin || currentUserId === post.author_id;
  const mediaUrl = post.media_file_name ? publicFileUrl(post.media_file_name) : null;
  const variant = post.media_file_name
    ? (['mp4', 'webm', 'mov'].includes(post.media_file_name.split('.').pop()?.toLowerCase() ?? '') ? 'video' : 'image')
    : 'text';
  const externalPost = isExternalSourcePost(post);
  const sourceBrand = getSourceBranding(post);

  return (
    <div>
      {/* Back nav */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border cn-border hover:border-zinc-500 text-sm cn-text-3 hover:text-zinc-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Feed
        </button>
      </div>

      {/* Centered content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-8">

        {/* Post card */}
        <div className="cn-glass rounded-2xl overflow-hidden mb-5">

          {/* Media */}
          {!isEditing && variant === 'image' && mediaUrl && (
            <div className="relative w-full aspect-video cn-surface overflow-hidden">
              <div className="absolute inset-0 scale-110 blur-xl opacity-60" style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <img src={mediaUrl} alt={post.title} className="relative w-full h-full object-contain" />
            </div>
          )}
          {!isEditing && variant === 'video' && mediaUrl && (
            <div className="relative w-full aspect-video bg-black overflow-hidden">
              <video src={mediaUrl} controls preload="auto" className="w-full h-full object-contain" />
            </div>
          )}

          <div className="p-5">
            {isEditing ? (
              /* ── Edit mode ── */
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium cn-text-3 mb-1 block">Caption</label>
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={4}
                    className="w-full cn-surface-2 border cn-border rounded-xl px-4 py-2.5 text-sm cn-text-1 placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                    placeholder="Caption (optional)"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium cn-text-3 mb-1 block">Media</label>
                  {(() => {
                    const showCurrent = mediaUrl && !editRemoveMedia && !editMediaPreview;
                    const showNew = !!editMediaPreview;
                    if (showCurrent || showNew) {
                      const src = showNew ? editMediaPreview! : mediaUrl!;
                      const isVid = showNew ? editMediaFile?.type.startsWith('video/') : variant === 'video';
                      return (
                        <div className="relative rounded-xl overflow-hidden bg-black">
                          {isVid ? <video src={src} controls className="w-full max-h-48 object-contain" /> : <img src={src} alt="" className="w-full max-h-48 object-cover" />}
                          <button type="button" title="Clear media" aria-label="Clear media" onClick={handleEditClearMedia} className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                          {showCurrent && (
                            <label className="absolute bottom-2 right-2 cursor-pointer px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium flex items-center gap-1.5 transition-colors">
                              <Image className="w-3 h-3" /> Replace
                              <input type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleEditFileChange(e.target.files[0]); }} />
                            </label>
                          )}
                        </div>
                      );
                    }
                    return (
                      <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-sm cn-text-4">
                        <Image className="w-4 h-4" /><Film className="w-4 h-4" />
                        <span>Add an image or video</span>
                        <input type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleEditFileChange(e.target.files[0]); }} />
                      </label>
                    );
                  })()}
                </div>
                {post.category === 'EVENT' && (
                  <div className="space-y-3 p-4 rounded-xl bg-purple-500/8 border border-purple-500/20">
                    <div>
                      <label className="text-xs font-semibold text-purple-300 mb-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date & Time <span className="text-rose-400">*</span></label>
                      <input type="datetime-local" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} className="w-full cn-surface-2 border border-purple-500/30 rounded-lg px-3 py-2 text-sm cn-text-1 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-purple-300 mb-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Location <span className="cn-text-4">(optional)</span></label>
                      <input type="text" value={editEventLocation} onChange={e => setEditEventLocation(e.target.value)} placeholder="e.g. Community Center…" className="w-full cn-surface-2 border border-purple-500/30 rounded-lg px-3 py-2 text-sm cn-text-1 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium cn-text-3 mb-1.5 block">Visibility</label>
                  <div className="relative inline-block">
                    <button type="button" onClick={() => setVisibilityOpen(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 cn-text-2 hover:bg-black/5 dark:hover:bg-white/10 transition-all">
                      {PDV_VIS_OPTIONS.find(o => o.value === editVisibility)?.icon}
                      {PDV_VIS_OPTIONS.find(o => o.value === editVisibility)?.label}
                      <ChevronDown className={`w-3 h-3 transition-transform ${visibilityOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {visibilityOpen && (
                      <div className="absolute left-0 mt-1 z-10 flex flex-col gap-1 p-1.5 rounded-xl cn-surface-2 border cn-border shadow-xl w-56">
                        {PDV_VIS_OPTIONS.map(opt => (
                          <button key={opt.value} type="button" onClick={() => { setEditVisibility(opt.value); setVisibilityOpen(false); }}
                            className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${editVisibility === opt.value ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300' : 'cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                            <span className="mt-0.5 shrink-0">{opt.icon}</span>
                            <span><span className="block text-xs font-medium">{opt.label}</span><span className="block text-[10px] cn-text-4 mt-0.5">{opt.desc}</span></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={handleCancelEdit} disabled={saving} className="px-4 py-2 text-sm font-medium cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving…</span></> : <><Check className="w-4 h-4" /><span>Save</span></>}
                  </button>
                </div>
              </div>
            ) : (
              /* ── View mode ── */
              <>
                {/* Author row */}
                <div className="flex items-center gap-3 mb-4">
                  {externalPost ? (
                    <div className="w-8 h-8 rounded-full cn-surface-3 flex items-center justify-center shrink-0 text-xs font-bold cn-text-2">
                      {(sourceBrand.name ?? 'S').charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <AvatarCircle
                      authorId={post.author_id}
                      authorUsername={post.author_username}
                      authorAvatarUrl={hubService.getAvatarUrl(hubSlug, post.author_id) ?? undefined}
                      currentUserId={currentUserId}
                      currentUserAvatarUrl={currentUserAvatarUrl}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigateToProfile && post.author_id && onNavigateToProfile(post.author_id)}
                        disabled={!onNavigateToProfile || !post.author_id || externalPost}
                        className="text-sm font-semibold cn-text-1 truncate hover:text-purple-300 transition-colors disabled:pointer-events-none"
                      >
                        {externalPost ? sourceBrand.name : post.author_username}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-xs cn-text-4 mt-0.5">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{formatTimestamp(post.created_at)}</span>
                    </div>
                  </div>
                  {(canEdit || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button title="Post actions" aria-label="Post actions" className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-colors shrink-0">
                          <MoreVertical className="w-4 h-4 cn-text-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        {canEdit && <DropdownMenuItem onClick={() => setIsEditing(true)}><Edit2 className="w-4 h-4" /><span>Edit post</span></DropdownMenuItem>}
                        {canDelete && (
                          <DropdownMenuItem variant="destructive" onClick={handleDeletePost} disabled={deleting}>
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            <span>Delete post</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Category badge */}
                {post.category && (
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ring-1 mb-3 ${categoryColors[post.category] ?? 'cn-surface-2 cn-text-3 ring-zinc-700'}`}>
                    {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
                  </span>
                )}

                {/* Title */}
                {post.title && <h2 className="text-lg font-bold cn-text-1 mb-2 leading-snug">{post.title}</h2>}

                {/* Body */}
                {post.body && <p className="cn-text-2 text-sm leading-relaxed whitespace-pre-wrap">{linkifyText(post.body)}</p>}

                {/* Event metadata */}
                {post.category === 'EVENT' && post.event_date && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 dark:bg-purple-500/15 border border-purple-300 dark:border-purple-500/20 text-xs font-medium text-purple-700 dark:text-purple-300">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {new Date(post.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {new Date(post.event_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Referenced location — always clickable when present, whether or not a pin exists yet */}
                {post.event_location && (
                  <button
                    onClick={() => openLocationInAtlas(post.event_location!, post.event_lat, post.event_lng, onNavigate, currentHub?.location)}
                    className="mt-3 w-full flex items-center gap-3 p-3 rounded-xl border cn-border bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0">
                      <MapPin className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium cn-text-2 truncate">{post.event_location}</span>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-semibold cn-text-2 shrink-0">
                      Open in Atlas
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                )}

                {/* RSVP — real, shared attendance for this event */}
                {post.category === 'EVENT' && (
                  <EventRsvpRow post={post} hubSlug={hubSlug} onNavigateToProfile={onNavigateToProfile} />
                )}

                {/* Engagement row */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t cn-border">
                  <button title="Like" aria-label="Like post" className="flex items-center gap-1.5 cn-text-4 hover:text-rose-400 transition-colors text-sm">
                    <Heart className="w-4 h-4" /><span>0</span>
                  </button>
                  <button title="Comment" aria-label={`Comment, ${post.reply_count} comments`} className="flex items-center gap-1.5 cn-text-4 hover:text-blue-400 transition-colors text-sm" onClick={() => textareaRef.current?.focus()}>
                    <MessageCircle className="w-4 h-4" /><span>{post.reply_count}</span>
                  </button>
                  <button title="Share" aria-label="Share post" className="flex items-center gap-1.5 cn-text-4 hover:text-emerald-400 transition-colors text-sm">
                    <Share2 className="w-4 h-4" /><span>Share</span>
                  </button>
                  <div className="flex-1" />
                  <button title="Bookmark" aria-label="Bookmark post" className="cn-text-4 hover:text-purple-400 transition-colors">
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Comments section */}
        <div className="cn-glass rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b cn-border">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 cn-text-4" />
              <span className="text-sm font-semibold cn-text-1">
                {loadingReplies ? 'Comments' : replies.length === 0 ? 'No comments yet' : `${replies.length} Comment${replies.length === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>

          {/* Reply input */}
          <div className="px-5 py-4 border-b cn-border">
            {replyingTo && (
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/20 text-xs text-blue-400">
                  <CornerDownRight className="w-3 h-3 shrink-0" />
                  <span>Replying to <span className="font-semibold">@{replyingTo.username}</span></span>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} className="cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {sendError && <p className="text-xs text-rose-400 mb-2">{sendError}</p>}
            <form onSubmit={handleSendReply} className="flex gap-3">
              <textarea
                ref={textareaRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(e); } }}
                placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : 'Add a comment… (Enter to send)'}
                rows={2}
                className="flex-1 cn-surface-2 border cn-border rounded-xl px-4 py-2.5 text-sm cn-text-1 placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              <button type="submit" disabled={sending || !replyText.trim()}
                className="w-10 h-10 self-end rounded-xl bg-purple-600 hover:bg-purple-700 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </form>
          </div>

          {/* Comment list */}
          <div className="px-5 py-4 flex flex-col gap-4">
            {loadingReplies && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin cn-text-4" /></div>}
            {!loadingReplies && replies.length === 0 && (
              <p className="text-center text-sm cn-text-4 py-4">Be the first to comment!</p>
            )}
            {!loadingReplies && replies.map(reply => (
              <div
                key={reply.id}
                id={`pdv-reply-${reply.id}`}
                className={`flex gap-3 rounded-xl px-2 py-1 -mx-2 transition-colors duration-300 ${highlightedReplyId === reply.id ? 'bg-blue-500/10' : ''}`}
              >
                <AvatarCircle
                  authorId={reply.author_id}
                  authorUsername={reply.author_username}
                  authorAvatarUrl={hubService.getAvatarUrl(hubSlug, reply.author_id) ?? undefined}
                  currentUserId={currentUserId}
                  currentUserAvatarUrl={currentUserAvatarUrl}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-semibold cn-text-1">{reply.author_username}</span>
                    <span className="text-xs cn-text-4">{formatTimestamp(reply.created_at)}</span>
                  </div>
                  {reply.reply_to_username && reply.reply_to_reply_id && (
                    <button type="button" onClick={() => scrollToReply(reply.reply_to_reply_id!)}
                      className="flex items-center gap-1 mb-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      <CornerDownRight className="w-3 h-3 shrink-0" />
                      @{reply.reply_to_username}
                    </button>
                  )}
                  <p className="text-sm cn-text-2 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                  <button type="button" onClick={() => handleClickReply(reply)}
                    className="mt-1.5 flex items-center gap-1 text-xs cn-text-4 hover:text-blue-400 transition-colors">
                    <CornerDownRight className="w-3 h-3" /> Reply
                  </button>
                </div>
              </div>
            ))}
            <div ref={repliesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compose Modal ─────────────────────────────────────────────

interface ComposeModalProps {
  hubSlug: string;
  hubCenter?: [number, number];
  onClose: () => void;
  onCreated: (post: HubPost) => void;
  initialTitle?: string;
  initialBody?: string;
}

type PostVisibility = 'inherit' | 'hub' | 'private';

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: ReactNode; desc: string }[] = [
  { value: 'inherit', label: 'Default',  icon: <Globe  className="w-3.5 h-3.5" />, desc: 'Follows your profile visibility' },
  { value: 'hub',     label: 'Hub only', icon: <Users  className="w-3.5 h-3.5" />, desc: 'Members only, even if profile is public' },
  { value: 'private', label: 'Only me',  icon: <Lock   className="w-3.5 h-3.5" />, desc: 'Visible only to you' },
];

function ComposeModal({ hubSlug, hubCenter, onClose, onCreated, initialBody = '' }: ComposeModalProps) {
  const [category, setCategory] = useState('DISCUSSION');
  const [labelOpen, setLabelOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>('inherit');
  const [body, setBody] = useState(initialBody);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  // Real coordinates, only set when the location was picked from search — not typed free text.
  const [eventCoords, setEventCoords] = useState<{ lat: number; lng: number } | null>(null);

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
    setMediaPreview(URL.createObjectURL(file));
  }

  function removeMedia() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !mediaFile) { setError('Add a caption or media'); return; }
    if (category === 'EVENT' && !eventDate) { setError('Pick a date and time for the event'); return; }
    setError('');
    setSubmitting(true);
    try {
      const post = await hubService.createPost(hubSlug, {
        category,
        title: body.trim().split('\n')[0].substring(0, 100) || 'Untitled',
        body: body.trim(),
        mediaFile: mediaFile ?? undefined,
        eventDate: category === 'EVENT' && eventDate ? new Date(eventDate).toISOString() : undefined,
        eventLocation: category === 'EVENT' ? eventLocation : undefined,
        eventLat: category === 'EVENT' && eventCoords ? eventCoords.lat : undefined,
        eventLng: category === 'EVENT' && eventCoords ? eventCoords.lng : undefined,
        visibility,
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
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
          className="cn-surface border cn-border rounded-2xl shadow-2xl w-full max-w-2xl pointer-events-auto flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b cn-border">
            <h2 className="cn-text-1 font-semibold text-lg">New Post</h2>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 cn-text-3" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 overflow-y-auto max-h-[70vh]">
            <textarea
              placeholder="What's on your mind? (optional)"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              className="w-full cn-surface-2 border cn-border rounded-xl px-4 py-3 cn-text-1 placeholder-zinc-500 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />

            {mediaPreview ? (
              <div className="relative rounded-xl overflow-hidden bg-black">
                {isVideoFile
                  ? <video src={mediaPreview} controls className="w-full max-h-48 object-contain" />
                  : <img src={mediaPreview} alt="Preview" className="w-full max-h-48 object-cover" />}
                <button type="button" onClick={removeMedia} className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-sm cn-text-4">
                <Image className="w-4 h-4" /><Film className="w-4 h-4" />
                <span>Attach an image or video (optional)</span>
                <input type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </label>
            )}

            {category === 'EVENT' && (
              <div className="space-y-3 p-4 rounded-xl bg-purple-500/8 border border-purple-500/20">
                <div>
                  <label className="text-xs font-semibold text-purple-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Date & Time <span className="text-rose-400">*</span>
                  </label>
                  <input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} min={new Date().toISOString().slice(0, 16)}
                    className="w-full cn-surface-2 border border-purple-500/30 rounded-lg px-3 py-2 text-sm cn-text-1 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-purple-300 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Location <span className="cn-text-4">(optional)</span>
                  </label>
                  <LocationSearchInput
                    value={eventLocation}
                    onChange={v => { setEventLocation(v); setEventCoords(null); }}
                    onSelect={r => { setEventLocation(r.label); setEventCoords({ lat: r.lat, lng: r.lng }); }}
                    hubCenter={hubCenter}
                    historyKey="citinet-feed-event-location-history"
                    placeholder="e.g. Community Center…"
                    inputClassName="w-full pl-9 pr-8 py-2 cn-surface-2 border border-purple-500/30 rounded-lg text-sm cn-text-1 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                  {eventCoords && (
                    <p className="mt-1 text-[11px] text-emerald-400">Linked to Atlas — this exact spot will be clickable on the post.</p>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}
          </form>

          <div className="px-6 py-4 border-t cn-border space-y-3">
            <div className="flex items-start gap-2 flex-wrap">
              <div>
                <button type="button" onClick={() => { setLabelOpen(v => !v); setVisibilityOpen(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 cn-text-3 hover:bg-black/5 dark:hover:bg-white/10 transition-all">
                  {category.charAt(0) + category.slice(1).toLowerCase()}
                  <ChevronDown className={`w-3 h-3 transition-transform ${labelOpen ? 'rotate-180' : ''}`} />
                </button>
                {labelOpen && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['DISCUSSION', 'ANNOUNCEMENT', 'PROJECT', 'REQUEST', 'EVENT'].map(cat => (
                      <button key={cat} type="button" onClick={() => { setCategory(cat); setLabelOpen(false); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          category === cat ? 'bg-purple-600 text-white' : 'bg-black/5 dark:bg-white/5 cn-text-3 hover:bg-black/5 dark:hover:bg-white/10'
                        }`}>
                        {cat.charAt(0) + cat.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <button type="button" onClick={() => { setVisibilityOpen(v => !v); setLabelOpen(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 cn-text-3 hover:bg-black/5 dark:hover:bg-white/10 transition-all">
                  {VISIBILITY_OPTIONS.find(o => o.value === visibility)?.icon}
                  {VISIBILITY_OPTIONS.find(o => o.value === visibility)?.label}
                  <ChevronDown className={`w-3 h-3 transition-transform ${visibilityOpen ? 'rotate-180' : ''}`} />
                </button>
                {visibilityOpen && (
                  <div className="flex flex-col gap-1 mt-2 p-1.5 rounded-xl cn-surface-2 border cn-border shadow-xl w-56">
                    {VISIBILITY_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => { setVisibility(opt.value); setVisibilityOpen(false); }}
                        className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                          visibility === opt.value ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300' : 'cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'
                        }`}>
                        <span className="mt-0.5 shrink-0">{opt.icon}</span>
                        <span>
                          <span className="block text-xs font-medium">{opt.label}</span>
                          <span className="block text-[10px] cn-text-4 mt-0.5">{opt.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting || (!body.trim() && !mediaFile)}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-opacity">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ── Compose Poll Modal ───────────────────────────────────────

interface ComposePollModalProps {
  hubSlug: string;
  onClose: () => void;
  onCreated: (poll: Poll) => void;
}

function ComposePollModal({ hubSlug, onClose, onCreated }: ComposePollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closesAt, setClosesAt] = useState('');
  const [quorumPct, setQuorumPct] = useState(0);
  const [passPct, setPassPct] = useState(50);
  const [linkedRequestId, setLinkedRequestId] = useState('');
  const [openRequests, setOpenRequests] = useState<HubRequest[]>([]);
  const [showGovernance, setShowGovernance] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    requestsService.list(hubSlug).then(reqs =>
      setOpenRequests(reqs.filter(r => !['shipped', 'declined', 'approved'].includes(r.status)))
    ).catch(() => {});
  }, [hubSlug]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  async function handleCreate() {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    setCreating(true);
    setCreateError('');
    try {
      const poll = await pollsService.create(hubSlug, {
        question: question.trim(),
        options: validOptions,
        closes_at: closesAt || undefined,
        request_id: linkedRequestId || undefined,
        quorum_pct: quorumPct,
        pass_pct: passPct,
      });
      onCreated(poll);
      onClose();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create poll');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
          className="cn-surface border cn-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b cn-border">
            <h2 className="cn-text-1 font-semibold text-lg flex items-center gap-2">
              <Vote className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> New Poll
            </h2>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 cn-text-3" />
            </button>
          </div>

          <div className="flex flex-col gap-4 p-6 overflow-y-auto max-h-[70vh]">
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1.5">Question <span className="text-indigo-500 dark:text-indigo-400">*</span></label>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
                placeholder="What should the community decide?"
                className="w-full cn-surface-2 border cn-border rounded-xl px-3 py-2.5 text-sm cn-text-1 placeholder-zinc-500 focus:outline-none focus:border-indigo-400 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1.5">Options (2–5) <span className="text-indigo-500 dark:text-indigo-400">*</span></label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={opt} onChange={e => setOptions(opts => opts.map((o, j) => j === i ? e.target.value : o))}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 cn-surface-2 border cn-border rounded-lg px-3 py-2 text-sm cn-text-1 placeholder-zinc-500 focus:outline-none focus:border-indigo-400" />
                    {options.length > 2 && (
                      <button onClick={() => setOptions(opts => opts.filter((_, j) => j !== i))} className="w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {options.length < 5 && (
                  <button onClick={() => setOptions(opts => [...opts, ''])} className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-400 font-medium transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add option
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1.5">Close date <span className="cn-text-4 font-normal">(optional)</span></label>
              <input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)}
                className="w-full cn-surface-2 border cn-border rounded-lg px-3 py-2 text-sm cn-text-1 focus:outline-none focus:border-indigo-400" />
            </div>

            {/* Governance options — quorum/pass-threshold/linked-request are formal decision-making
                controls, not something a casual poll needs; keep them out of the way by default. */}
            <div className="border-t cn-border pt-3">
              <button type="button" onClick={() => setShowGovernance(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium cn-text-3 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showGovernance ? 'rotate-180' : ''}`} />
                Governance options
              </button>
              {showGovernance && (
                <div className="flex flex-col gap-4 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium cn-text-3 mb-1.5">
                        Quorum <span className="cn-text-4 font-normal">(% of members)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} max={100} value={quorumPct}
                          onChange={e => setQuorumPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-full cn-surface-2 border cn-border rounded-lg px-3 py-2 text-sm cn-text-1 focus:outline-none focus:border-indigo-400" />
                        <span className="text-sm cn-text-4">%</span>
                      </div>
                      <p className="text-[10px] cn-text-4 mt-1">0 = no quorum</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium cn-text-3 mb-1.5">Pass threshold</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} max={100} value={passPct}
                          onChange={e => setPassPct(Math.min(100, Math.max(1, parseInt(e.target.value) || 50)))}
                          className="w-full cn-surface-2 border cn-border rounded-lg px-3 py-2 text-sm cn-text-1 focus:outline-none focus:border-indigo-400" />
                        <span className="text-sm cn-text-4">%</span>
                      </div>
                      <p className="text-[10px] cn-text-4 mt-1">of votes cast</p>
                    </div>
                  </div>

                  {openRequests.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium cn-text-3 mb-1.5">
                        <Link2 className="w-3 h-3 inline mr-1" />
                        Link to feature request (optional)
                      </label>
                      <select value={linkedRequestId} onChange={e => setLinkedRequestId(e.target.value)}
                        className="w-full cn-surface-2 border cn-border rounded-lg px-3 py-2 text-sm cn-text-1 focus:outline-none focus:border-indigo-400">
                        <option value="">— None —</option>
                        {openRequests.map(r => (
                          <option key={r.id} value={r.id}>{r.problem.slice(0, 80)}{r.problem.length > 80 ? '…' : ''}</option>
                        ))}
                      </select>
                      {linkedRequestId && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                          If this poll passes, the linked request will auto-advance to "Approved"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {createError && <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{createError}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t cn-border">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={!question.trim() || options.filter(o => o.trim()).length < 2 || creating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
              {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : 'Create Poll'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ── Feed ──────────────────────────────────────────────────────

export function Feed({ onBack, onNavigate }: FeedProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const navigate = useNavigate();
  const { postId: urlPostId } = useParams<{ postId?: string }>();

  const [posts, setPosts] = useState<HubPost[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeInitial, setComposeInitial] = useState<{ title: string; body: string } | null>(null);
  const [composingPoll, setComposingPoll] = useState(false);
  const [pollVoting, setPollVoting] = useState<string | null>(null);
  const [pollClosing, setPollClosing] = useState<string | null>(null);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | null>(null);

  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isMod = currentUser?.hubRole === 'admin' || currentUser?.hubRole === 'moderator'
    || currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  // Mark feed notifications read
  useEffect(() => {
    if (hubSlug) notificationsService.markRead(hubSlug, 'feed').catch(() => {});
  }, [hubSlug]);

  // Deep-link: welcome compose
  useEffect(() => {
    const raw = sessionStorage.getItem('citinet-deeplink-welcome');
    if (!raw) return;
    sessionStorage.removeItem('citinet-deeplink-welcome');
    try {
      const { username } = JSON.parse(raw) as { username: string };
      setComposeInitial({ title: `Welcome, @${username}!`, body: `Hey @${username}, glad you're here!` });
      setComposing(true);
    } catch { /* ignore */ }
  }, []);

  // Deep-link: open compose directly
  useEffect(() => {
    if (!sessionStorage.getItem('citinet-deeplink-compose')) return;
    sessionStorage.removeItem('citinet-deeplink-compose');
    setComposing(true);
  }, []);

  // Deep-link: preset the category filter (e.g. "See all" from the dashboard's Upcoming events)
  useEffect(() => {
    const cat = sessionStorage.getItem('citinet-deeplink-feed-category');
    if (!cat) return;
    sessionStorage.removeItem('citinet-deeplink-feed-category');
    setActiveFilter(cat);
  }, []);

  // /feed/:postId — the URL is the single source of truth for which post's detail view
  // (if any) is showing; selectedPost is only ever written here, never optimistically by
  // openPost/closePost, so there's no race between a state clear and the URL catching up.
  // useLayoutEffect (not useEffect) so this resolves before paint — no flicker of the
  // wrong content for a frame while the URL and selectedPost briefly disagree.
  useLayoutEffect(() => {
    if (!urlPostId) {
      setSelectedPost(null);
      return;
    }
    if (selectedPost?.id === urlPostId) return;
    const found = posts.find(p => p.id === urlPostId);
    if (found) {
      setSelectedPost(found);
    } else if (!loading && hubSlug) {
      hubService.getPost(hubSlug, urlPostId).then(setSelectedPost).catch(() => {});
    }
  }, [urlPostId, posts, loading, hubSlug, selectedPost]);

  const load = useCallback(async (silent = false) => {
    if (!hubSlug) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const [postData, pollData] = await Promise.all([
        hubService.listPosts(hubSlug),
        pollsService.list(hubSlug),
      ]);
      setPosts(postData);
      setPolls(pollData);
    } catch (err) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : 'Could not load posts';
        if (!msg.includes('Failed to fetch')) setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Unified, chronologically-sorted feed of posts + polls (polls are just another post type, client-side only)
  type FeedItem = { kind: 'post'; sortAt: string; post: HubPost } | { kind: 'poll'; sortAt: string; poll: Poll };
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...posts.map(post => ({ kind: 'post' as const, sortAt: post.created_at, post })),
      ...polls.map(poll => ({ kind: 'poll' as const, sortAt: poll.created_at, poll })),
    ];
    items.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
    return items;
  }, [posts, polls]);

  const filteredItems = useMemo(() => {
    if (!activeFilter) return feedItems;
    if (activeFilter === 'POLL') return feedItems.filter(i => i.kind === 'poll');
    return feedItems.filter(i => i.kind === 'post' && i.post.category === activeFilter);
  }, [feedItems, activeFilter]);

  // A post's detail view lives at /feed/:postId — real, shareable, survives refresh/back.
  // These only ever touch the URL; the effect above is solely responsible for reacting
  // to it and setting selectedPost, so there's exactly one writer and no race.
  // replace: true — opening/closing a post swaps the current history entry in place rather
  // than piling up new ones, so the feed's own "‹ HubName" breadcrumb (a literal back-one-step)
  // always lands on the dashboard instead of bouncing between /feed and /feed/:postId forever.
  function openPost(post: HubPost) {
    navigate(hubPath(`/feed/${post.id}`), { replace: true });
  }
  function closePost() {
    navigate(hubPath('/feed'), { replace: true });
  }

  function handleCreated(post: HubPost) { setPosts(prev => [post, ...prev]); }
  function handlePostDeleted(postId: string) {
    setPosts(prev => prev.filter(p => p.id !== postId));
    if (selectedPost?.id === postId) closePost();
  }
  function handlePollCreated(poll: Poll) { setPolls(prev => [poll, ...prev]); }

  async function handlePollVote(poll: Poll, optionIndex: number) {
    if (poll.closed || (poll.closes_at && new Date(poll.closes_at) < new Date())) return;
    setPollVoting(poll.id);
    const prev = polls;
    setPolls(ps => ps.map(p => {
      if (p.id !== poll.id) return p;
      const newCounts = [...p.vote_counts];
      if (p.my_vote != null) newCounts[p.my_vote] = Math.max(0, newCounts[p.my_vote] - 1);
      newCounts[optionIndex]++;
      const totalDelta = p.my_vote != null ? 0 : 1;
      return { ...p, vote_counts: newCounts, my_vote: optionIndex, total_votes: p.total_votes + totalDelta };
    }));
    try {
      await pollsService.vote(hubSlug, poll.id, optionIndex);
      load(true);
    } catch {
      setPolls(prev);
    } finally {
      setPollVoting(null);
    }
  }

  async function handlePollClose(pollId: string) {
    setPollClosing(pollId);
    try {
      await pollsService.close(hubSlug, pollId);
      load(true);
    } catch { /* non-critical */ }
    setPollClosing(null);
  }

  function handleCopyPollLink(pollId: string) {
    const link = `${window.location.href.split('#')[0]}#poll=${pollId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopyLinkFeedback(pollId);
      setTimeout(() => setCopyLinkFeedback(null), 2000);
    });
  }

  return (
    <div>
      {selectedPost ? (
        <PostDetailView
          post={selectedPost}
          hubSlug={hubSlug}
          currentUserId={currentUser?.hubUserId}
          currentUserAvatarUrl={currentUser?.avatarUrl}
          isAdmin={currentUser?.isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(hubSlug, name) ?? ''}
          onBack={closePost}
          onDeleted={handlePostDeleted}
          onNavigateToProfile={onNavigate ? (userId) => { setSelectedPost(null); onNavigate(`profile/${userId}`); } : undefined}
          onNavigate={onNavigate}
        />
      ) : (
      <>
      {/* ── Header ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-0">
          {/* Breadcrumb */}
          <button onClick={onBack} className="flex items-center gap-0.5 mb-2 group">
            <ChevronLeft className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300 transition-colors" />
            <span className="text-sm font-medium text-purple-400 group-hover:text-purple-300 transition-colors">
              {currentHub?.name ?? 'Hub'}
            </span>
          </button>

          {/* Icon + Title + Subtitle */}
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center" style={{ background: 'var(--cn-grad-feed)' }}>
              <Newspaper className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold cn-text-1 tracking-tight leading-none">Feed</h1>
              <p className="text-sm cn-text-3 mt-0.5">Community posts · members only</p>
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar -mx-1 px-1 border-b cn-border">
            {CAT_TABS.map(({ value, label }) => {
              const count = value === 'POLL' ? polls.length : value ? posts.filter(p => p.category === value).length : 0;
              return (
                <button
                  key={value ?? 'all'}
                  onClick={() => setActiveFilter(value)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeFilter === value
                      ? 'cn-text-1 border-purple-500'
                      : 'cn-text-4 border-transparent hover:text-slate-700 dark:hover:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                      activeFilter === value ? 'bg-purple-200 dark:bg-purple-500/25 text-purple-800 dark:text-purple-200' : 'cn-surface-2 cn-text-3'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      {/* ── Main content ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

            {/* Feed column */}
            <div className="flex flex-col gap-4 min-w-0">
              {/* Inline composer bar */}
              <div className="cn-glass rounded-2xl overflow-hidden">
                <button
                  onClick={() => setComposing(true)}
                  className="w-full flex items-center gap-3 px-4 pt-3.5 pb-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {currentUser?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <span className="flex-1 text-left text-sm cn-text-4">Share something with your neighbors…</span>
                </button>
                <div className="border-t cn-border px-3 py-2 flex items-center gap-1">
                  <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0">
                    {([
                      { icon: <Image className="w-3.5 h-3.5" />, label: 'Photo' },
                      { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Event' },
                      { icon: <MapPin className="w-3.5 h-3.5" />, label: 'Place' },
                    ] as const).map(({ icon, label }) => (
                      <button
                        key={label}
                        onClick={() => setComposing(true)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        {icon}{label}
                      </button>
                    ))}
                    {isMod && (
                      <button
                        onClick={() => setComposingPoll(true)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <BarChart2 className="w-3.5 h-3.5" />Poll
                      </button>
                    )}
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={() => setComposing(true)}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors"
                  >
                    <Send className="w-3 h-3" /> Post
                  </button>
                </div>
              </div>

              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <AlertCircle className="w-8 h-8 text-rose-400" />
                  <p className="cn-text-3 text-sm">{error}</p>
                  <button onClick={() => load()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-sm cn-text-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                    <RefreshCw className="w-4 h-4" /> Try again
                  </button>
                </div>
              )}

              {/* Empty */}
              {!loading && !error && filteredItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center cn-glass rounded-2xl">
                  <p className="cn-text-3 text-sm mb-3">
                    {activeFilter === 'POLL' ? 'No polls yet.' : activeFilter ? `No ${activeFilter.toLowerCase()} posts yet.` : 'No posts yet.'}
                  </p>
                  {activeFilter === 'POLL' ? (
                    isMod && (
                      <button onClick={() => setComposingPoll(true)} className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">
                        Create the first poll →
                      </button>
                    )
                  ) : (
                    <button onClick={() => setComposing(true)} className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">
                      Be the first to post →
                    </button>
                  )}
                </div>
              )}

              {/* Feed items — posts and polls, chronologically merged */}
              {!loading && !error && filteredItems.map(item => {
                if (item.kind === 'poll') {
                  const poll = item.poll;
                  return (
                    <PollFeedCard
                      key={poll.id}
                      poll={poll}
                      isMod={isMod}
                      voting={pollVoting === poll.id}
                      closing={pollClosing === poll.id}
                      onVote={idx => handlePollVote(poll, idx)}
                      onClose={() => handlePollClose(poll.id)}
                      onCopyLink={() => handleCopyPollLink(poll.id)}
                      copyLinkActive={copyLinkFeedback === poll.id}
                    />
                  );
                }
                const post = item.post;
                const mediaUrl = post.media_file_name
                  ? hubService.getPublicFileUrl(hubSlug, post.media_file_name) ?? undefined
                  : undefined;
                return (
                  <div
                    key={post.id}
                    className="cursor-pointer"
                    onClick={() => openPost(post)}
                  >
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
                      eventDate={post.event_date}
                      eventLocation={post.event_location}
                      onOpenInAtlas={post.event_location ? () => openLocationInAtlas(post.event_location!, post.event_lat, post.event_lng, onNavigate, currentHub?.location) : undefined}
                      autoPlay={false}
                    />
                  </div>
                );
              })}
            </div>

            {/* Right rail — desktop only */}
            <div className="hidden lg:block sticky top-0 self-start">
              <RightRail
                hubName={currentHub?.name ?? 'Hub'}
                posts={posts}
              />
            </div>
          </div>
        </div>
      </>
      )}

      {/* Compose modal */}
      {composing && (
        <ComposeModal
          hubSlug={hubSlug}
          hubCenter={currentHub?.lat && currentHub?.lng ? [currentHub.lat, currentHub.lng] : undefined}
          onClose={() => { setComposing(false); setComposeInitial(null); }}
          onCreated={handleCreated}
          initialTitle={composeInitial?.title}
          initialBody={composeInitial?.body}
        />
      )}

      {/* Compose poll modal */}
      {composingPoll && (
        <ComposePollModal
          hubSlug={hubSlug}
          onClose={() => setComposingPoll(false)}
          onCreated={handlePollCreated}
        />
      )}
    </div>
  );
}
