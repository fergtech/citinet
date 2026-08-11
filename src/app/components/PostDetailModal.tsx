import { X, MessageCircle, Clock, Send, Loader2, Trash2, Edit2, MoreVertical, Check, CornerDownRight, Calendar, MapPin, Image, Film, Globe, Users, Lock, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { hubService } from '../services/hubService';
import type { HubPost, HubPostReply } from '../types/hub';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface PostDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: HubPost;
  hubSlug: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  isAdmin?: boolean;
  categoryColors: Record<string, string>;
  publicFileUrl: (name: string) => string;
  onDeleted: (postId: string) => void;
  sourceBrandInfo?: { name: string; faviconUrl?: string; websiteUrl?: string };
  onNavigateToProfile?: (userId: string) => void;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function AvatarCircle({ authorId, authorUsername, authorAvatarUrl, currentUserId, currentUserAvatarUrl, size = 'md' }: {
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  size?: 'sm' | 'md';
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
  const preferredAvatarUrl = authorId === currentUserId
    ? (currentUserAvatarUrl || authorAvatarUrl)
    : authorAvatarUrl;

  useEffect(() => {
    setImageFailed(false);
  }, [preferredAvatarUrl]);

  if (preferredAvatarUrl && !imageFailed) {
    return (
      <img
        src={preferredAvatarUrl}
        alt={authorUsername}
        className={`${dim} rounded-full object-cover flex-shrink-0`}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${avatarColor(authorUsername)} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {getInitials(authorUsername)}
    </div>
  );
}

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function isExternalSourcePost(post: HubPost): boolean {
  const authorUsername = (post.author_username || '').trim().toLowerCase();
  return Boolean(
    post.source
    || post.platform
    || post.origin
    || post.source_app
    || post.source_name
    || post.app_name
    || post.platform_name
    || authorUsername === 'email'
    || authorUsername.includes('@')
    || !post.author_id
  );
}

/** Render plain text with URLs converted to clickable links. */
function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const url = m[0];
    nodes.push(
      <a key={m.index} href={url} target="_blank" rel="noopener noreferrer"
        className="text-blue-500 dark:text-blue-400 hover:underline break-all"
        onClick={e => e.stopPropagation()}
      >{url}</a>
    );
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type PostVisibility = 'inherit' | 'hub' | 'private';

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: ReactNode; desc: string }[] = [
  { value: 'inherit', label: 'Default',   icon: <Globe className="w-3.5 h-3.5" />, desc: 'Follows your profile visibility' },
  { value: 'hub',     label: 'Hub only',  icon: <Users className="w-3.5 h-3.5" />, desc: 'Members only, even if profile is public' },
  { value: 'private', label: 'Only me',   icon: <Lock className="w-3.5 h-3.5" />,  desc: 'Visible only to you' },
];

function getSourceBranding(post: HubPost): { name: string; logoUrl: string | null } {
  return {
    name: post.source_name || post.app_name || post.platform_name || post.source || post.platform || 'Society+',
    logoUrl: post.source_logo_url || post.logo_url || post.source_favicon_url || post.favicon_url || null,
  };
}

export function PostDetailModal({
  isOpen, onClose, post, hubSlug, currentUserId, currentUserAvatarUrl, isAdmin,
  publicFileUrl, onDeleted, sourceBrandInfo, onNavigateToProfile,
}: PostDetailModalProps) {
  const [replies, setReplies] = useState<HubPostReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [, setEditTitle] = useState(post.title);
  const [editBody, setEditBody] = useState(post.body || '');
  const [editMediaFile, setEditMediaFile] = useState<File | null>(null);
  const [editMediaPreview, setEditMediaPreview] = useState<string | null>(null);
  const [editRemoveMedia, setEditRemoveMedia] = useState(false);
  const [editEventDate, setEditEventDate] = useState('');
  const [editEventLocation, setEditEventLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [editVisibility, setEditVisibility] = useState<PostVisibility>((post.visibility as PostVisibility) ?? 'inherit');
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [replyingTo, setReplyingTo] = useState<{ replyId: string; userId: string; username: string } | null>(null);
  const [highlightedReplyId, setHighlightedReplyId] = useState<string | null>(null);

  const loadReplies = useCallback(async (silent = false) => {
    if (!silent) setLoadingReplies(true);
    try {
      const data = await hubService.listReplies(hubSlug, post.id);
      setReplies(data);
    } catch {
      // non-critical
    } finally {
      setLoadingReplies(false);
    }
  }, [hubSlug, post.id]);

  useEffect(() => {
    if (!isOpen) return;
    loadReplies();
    const id = setInterval(() => loadReplies(true), 15_000);
    return () => clearInterval(id);
  }, [isOpen, loadReplies]);

  useEffect(() => {
    if (!isOpen) setIsEditing(false);
    setEditTitle(post.title);
    setEditBody(post.body || '');
    setEditMediaFile(null);
    setEditMediaPreview(null);
    setEditRemoveMedia(false);
    setEditEventDate(post.event_date ? toDatetimeLocal(post.event_date) : '');
    setEditEventLocation(post.event_location || '');
    setEditVisibility((post.visibility as PostVisibility) ?? 'inherit');
  }, [isOpen, post.title, post.body, post.event_date, post.event_location, post.visibility]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  function scrollToReply(replyId: string) {
    const el = document.getElementById(`reply-${replyId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedReplyId(replyId);
    setTimeout(() => setHighlightedReplyId(null), 1500);
  }

  function handleClickReply(reply: { id: string; author_id: string; author_username: string }) {
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
      const reply = await hubService.createReply(
        hubSlug, post.id, replyText.trim(),
        replyingTo?.replyId ?? null,
        replyingTo?.userId ?? null,
      );
      setReplies(prev => [...prev, reply]);
      setReplyText('');
      setReplyingTo(null);
      setTimeout(() => repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSending(false);
    }
  }

  async function handleDeletePost() {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await hubService.deletePost(hubSlug, post.id);
      onDeleted(post.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  }

  function handleEditFileChange(file: File) {
    setEditRemoveMedia(false);
    setEditMediaFile(file);
    setEditMediaPreview(URL.createObjectURL(file));
  }

  function handleEditClearMedia() {
    if (editMediaPreview) {
      URL.revokeObjectURL(editMediaPreview);
      setEditMediaFile(null);
      setEditMediaPreview(null);
    } else {
      setEditRemoveMedia(true);
    }
  }

  async function handleSaveEdit() {
    if (post.category === 'EVENT' && !editEventDate) {
      alert('Event date is required');
      return;
    }
    setSaving(true);
    try {
      const updated = await hubService.updatePost(hubSlug, post.id, {
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
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setEditTitle(post.title);
    setEditBody(post.body || '');
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
    ? (['mp4','webm','mov'].includes(post.media_file_name.split('.').pop()?.toLowerCase() ?? '') ? 'video' : 'image')
    : 'text';
  const externalSourcePost = isExternalSourcePost(post) || !!sourceBrandInfo;
  const sourceBrand = sourceBrandInfo
    ? { name: sourceBrandInfo.name, logoUrl: sourceBrandInfo.faviconUrl ?? null, websiteUrl: sourceBrandInfo.websiteUrl }
    : { ...getSourceBranding(post), websiteUrl: undefined };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50"
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-end px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {(canEdit || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          title="Options"
                          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => setIsEditing(true)}>
                            <Edit2 className="w-4 h-4" />
                            <span>Edit post</span>
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem variant="destructive" onClick={handleDeletePost} disabled={deleting}>
                            {deleting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            <span>Delete post</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <button
                    onClick={onClose}
                    className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">

                {/* Media */}
                {variant === 'image' && mediaUrl && (
                  <div className="relative w-full aspect-video bg-zinc-900 overflow-hidden">
                    <div
                      className="absolute inset-0 scale-110 blur-xl opacity-60"
                      style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    />
                    <img src={mediaUrl} alt={post.title ?? ''} className="relative w-full h-full object-contain" />
                  </div>
                )}
                {variant === 'video' && mediaUrl && (
                  <div className="relative w-full aspect-video bg-black overflow-hidden">
                    <video src={mediaUrl} controls preload="auto" className="w-full h-full object-contain" />
                  </div>
                )}

                {/* Post content */}
                <div className="p-6 border-b border-slate-100 dark:border-zinc-800">
                  {isEditing ? (
                    <div className="space-y-4">
                      {/* Caption */}
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Caption</label>
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          rows={4}
                          className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          placeholder="Caption (optional)"
                        />
                      </div>

                      {/* Media — replace/add/remove */}
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Media</label>
                        {(() => {
                          const showCurrent = mediaUrl && !editRemoveMedia && !editMediaPreview;
                          const showNew = !!editMediaPreview;
                          if (showCurrent || showNew) {
                            const src = showNew ? editMediaPreview! : mediaUrl!;
                            const isVid = showNew
                              ? editMediaFile?.type.startsWith('video/')
                              : variant === 'video';
                            return (
                              <div className="relative rounded-xl overflow-hidden bg-black">
                                {isVid
                                  ? <video src={src} controls className="w-full max-h-48 object-contain" />
                                  : <img src={src} alt="" className="w-full max-h-48 object-cover" />
                                }
                                <button
                                  type="button"
                                  onClick={handleEditClearMedia}
                                  className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                                >
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
                            <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-sm text-slate-500 dark:text-slate-400">
                              <Image className="w-4 h-4" /><Film className="w-4 h-4" />
                              <span>Add an image or video</span>
                              <input type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleEditFileChange(e.target.files[0]); }} />
                            </label>
                          );
                        })()}
                      </div>

                      {/* Event fields */}
                      {post.category === 'EVENT' && (
                        <div className="space-y-3 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/50">
                          <div>
                            <label className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" /> Date & Time <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={editEventDate}
                              onChange={e => setEditEventDate(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-800 border border-purple-200 dark:border-purple-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" /> Location <span className="text-slate-400">(optional)</span>
                            </label>
                            <input
                              type="text"
                              value={editEventLocation}
                              onChange={e => setEditEventLocation(e.target.value)}
                              placeholder="e.g. Community Center…"
                              className="w-full bg-white dark:bg-zinc-800 border border-purple-200 dark:border-purple-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                          </div>
                        </div>
                      )}

                      {/* Visibility picker */}
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Visibility</label>
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setVisibilityOpen(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ring-1 transition-all ${
                              editVisibility !== 'inherit'
                                ? 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-500/20'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-zinc-700'
                            }`}
                          >
                            {VISIBILITY_OPTIONS.find(o => o.value === editVisibility)?.icon}
                            {VISIBILITY_OPTIONS.find(o => o.value === editVisibility)?.label}
                            <ChevronDown className={`w-3 h-3 transition-transform ${visibilityOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {visibilityOpen && (
                            <div className="absolute left-0 mt-1 z-10 flex flex-col gap-1 p-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-xl w-56">
                              {VISIBILITY_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => { setEditVisibility(opt.value); setVisibilityOpen(false); }}
                                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                                    editVisibility === opt.value
                                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
                                  }`}
                                >
                                  <span className="mt-0.5 shrink-0">{opt.icon}</span>
                                  <span>
                                    <span className="block text-xs font-medium">{opt.label}</span>
                                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={handleCancelEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-2">
                          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving…</span></> : <><Check className="w-4 h-4" /><span>Save</span></>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mb-4">
                        {externalSourcePost ? (
                          <a
                            href={sourceBrand.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 transition-colors"
                          >
                            {sourceBrand.logoUrl
                              ? <img src={sourceBrand.logoUrl} className="w-3.5 h-3.5 rounded-sm object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <div className="w-3.5 h-3.5 rounded-sm bg-slate-300 dark:bg-zinc-700 text-[8px] font-bold text-slate-700 dark:text-zinc-200 flex items-center justify-center">SP</div>
                            }
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Shared from</span>
                            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 leading-none">{sourceBrand.name}</span>
                          </a>
                        ) : (
                          <>
                            <button
                              onClick={() => onNavigateToProfile && post.author_id && (onClose(), onNavigateToProfile(post.author_id))}
                              disabled={!onNavigateToProfile || !post.author_id}
                              className="flex items-center gap-1.5 group/author disabled:pointer-events-none"
                            >
                              <AvatarCircle
                                authorId={post.author_id}
                                authorUsername={post.author_username}
                                authorAvatarUrl={hubService.getAvatarUrl(hubSlug, post.author_id) ?? undefined}
                                currentUserId={currentUserId}
                                currentUserAvatarUrl={currentUserAvatarUrl}
                                size="sm"
                              />
                              <span className="group-hover/author:text-slate-900 dark:group-hover/author:text-white transition-colors">
                                {post.author_username}
                              </span>
                            </button>
                          </>
                        )}
                        <div className="flex items-center gap-1.5 ml-auto">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatTimestamp(post.created_at)}</span>
                        </div>
                      </div>
                      {/* Event metadata strip */}
                      {post.category === 'EVENT' && post.event_date && (
                        <div className="flex flex-wrap gap-2 mt-3 mb-1">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 text-xs font-medium text-purple-700 dark:text-purple-300">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {new Date(post.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                              {' · '}
                              {new Date(post.event_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          {post.event_location && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 text-xs font-medium text-purple-700 dark:text-purple-300">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span>{post.event_location}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {post.body && (
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">
                          {linkifyText(post.body)}
                        </p>
                      )}

                      {/* Visibility indicator — author-only, shown in view mode */}
                      {canEdit && (
                        <div className="relative mt-3">
                          <button
                            type="button"
                            onClick={() => setVisibilityOpen(v => !v)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ring-1 transition-all ${
                              (post.visibility ?? 'inherit') !== 'inherit'
                                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-200 dark:ring-indigo-500/20'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 ring-transparent hover:bg-slate-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {VISIBILITY_OPTIONS.find(o => o.value === (post.visibility ?? 'inherit'))?.icon}
                            {VISIBILITY_OPTIONS.find(o => o.value === (post.visibility ?? 'inherit'))?.label}
                            <ChevronDown className={`w-3 h-3 transition-transform ${visibilityOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {visibilityOpen && (
                            <div className="absolute left-0 mt-1 z-10 flex flex-col gap-1 p-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-xl w-56">
                              {VISIBILITY_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={async () => {
                                    setVisibilityOpen(false);
                                    if (opt.value === (post.visibility ?? 'inherit')) return;
                                    try {
                                      await hubService.updatePostVisibility(hubSlug, post.id, opt.value);
                                      post.visibility = opt.value;
                                      setEditVisibility(opt.value);
                                    } catch { /* non-critical */ }
                                  }}
                                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                                    (post.visibility ?? 'inherit') === opt.value
                                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
                                  }`}
                                >
                                  <span className="mt-0.5 shrink-0">{opt.icon}</span>
                                  <span>
                                    <span className="block text-xs font-medium">{opt.label}</span>
                                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Replies */}
                <div className="p-6">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 mb-4">
                    <MessageCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {replies.length === 0 ? 'No replies yet' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                    </span>
                  </div>

                  {loadingReplies && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                  )}

                  {!loadingReplies && replies.map(reply => (
                    <div
                      key={reply.id}
                      id={`reply-${reply.id}`}
                      className={`flex gap-3 mb-4 rounded-xl px-2 py-1 -mx-2 transition-colors duration-300 ${highlightedReplyId === reply.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
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
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{reply.author_username}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(reply.created_at)}</span>
                        </div>
                        {/* @mention reference — click to jump to that reply */}
                        {reply.reply_to_username && reply.reply_to_reply_id && (
                          <button
                            type="button"
                            onClick={() => scrollToReply(reply.reply_to_reply_id!)}
                            className="flex items-center gap-1 mb-1 text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                          >
                            <CornerDownRight className="w-3 h-3 shrink-0" />
                            @{reply.reply_to_username}
                          </button>
                        )}
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                        {/* Reply button */}
                        <button
                          type="button"
                          onClick={() => handleClickReply(reply)}
                          className="mt-1.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                        >
                          <CornerDownRight className="w-3 h-3" /> Reply
                        </button>
                      </div>
                    </div>
                  ))}

                  <div ref={repliesEndRef} />
                </div>
              </div>

              {/* Reply input */}
              <div className="flex-shrink-0 border-t border-slate-200 dark:border-zinc-800 p-4">
                {/* Replying-to chip */}
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/25 border border-blue-200 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400">
                      <CornerDownRight className="w-3 h-3 shrink-0" />
                      <span>Replying to <span className="font-semibold">@{replyingTo.username}</span></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      aria-label="Cancel reply"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {sendError && (
                  <p className="text-xs text-rose-500 mb-2">{sendError}</p>
                )}
                <form onSubmit={handleSendReply} className="flex gap-3">
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(e); } }}
                    placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : 'Write a reply… (Enter to send)'}
                    rows={2}
                    className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="w-11 h-11 self-end rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
                  >
                    {sending
                      ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : <Send className="w-4 h-4 text-white" />
                    }
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
