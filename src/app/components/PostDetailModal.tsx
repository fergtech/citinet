import { X, MessageCircle, Users, Clock, Send, Loader2, Trash2, Edit2, MoreVertical, Check, CornerDownRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState, useRef, useCallback } from 'react';
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

export function PostDetailModal({
  isOpen, onClose, post, hubSlug, currentUserId, currentUserAvatarUrl, isAdmin,
  categoryColors, publicFileUrl, onDeleted,
}: PostDetailModalProps) {
  const [replies, setReplies] = useState<HubPostReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editBody, setEditBody] = useState(post.body || '');
  const [saving, setSaving] = useState(false);
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
    // Reset edit state when post changes or modal closes
    if (!isOpen) {
      setIsEditing(false);
    }
    setEditTitle(post.title);
    setEditBody(post.body || '');
  }, [isOpen, post.title, post.body]);

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

  async function handleSaveEdit() {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await hubService.updatePost(hubSlug, post.id, {
        title: editTitle.trim(),
        body: editBody.trim(),
      });
      // Update the local post object
      post.title = updated.title;
      post.body = updated.body;
      setIsEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update post');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setEditTitle(post.title);
    setEditBody(post.body || '');
    setIsEditing(false);
  }

  const badgeClass = (categoryColors[post.category] ?? 'bg-purple-100 text-purple-600 ring-purple-200') + ' ring-1';
  const canDelete = isAdmin || currentUserId === post.author_id;
  const mediaUrl = post.media_file_name ? publicFileUrl(post.media_file_name) : null;
  const variant = post.media_file_name
    ? (['mp4','webm','mov'].includes(post.media_file_name.split('.').pop()?.toLowerCase() ?? '') ? 'video' : 'image')
    : 'text';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
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
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
                <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${badgeClass}`}>
                  {post.category}
                </span>
                <div className="flex items-center gap-2">
                  {canDelete && (
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
                        <DropdownMenuItem onClick={() => setIsEditing(true)}>
                          <Edit2 className="w-4 h-4" />
                          <span>Edit post</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={handleDeletePost} disabled={deleting}>
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          <span>Delete post</span>
                        </DropdownMenuItem>
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
                  <div className="w-full">
                    <img src={mediaUrl} alt={post.title} className="w-full object-cover max-h-72" />
                  </div>
                )}
                {variant === 'video' && mediaUrl && (
                  <div className="w-full bg-black">
                    <video src={mediaUrl} controls className="w-full max-h-72 object-contain" />
                  </div>
                )}

                {/* Post content */}
                <div className="p-6 border-b border-slate-100 dark:border-zinc-800">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                          Title
                        </label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          placeholder="Post title"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                          Body
                        </label>
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          rows={5}
                          className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          placeholder="Post body (optional)"
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving || !editTitle.trim()}
                          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
                        {post.title}
                      </h2>
                      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mb-4">
                        <AvatarCircle
                          authorId={post.author_id}
                          authorUsername={post.author_username}
                          authorAvatarUrl={hubService.getAvatarUrl(hubSlug, post.author_id) ?? undefined}
                          currentUserId={currentUserId}
                          currentUserAvatarUrl={currentUserAvatarUrl}
                          size="sm"
                        />
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>{post.author_username}</span>
                        </div>
                        <span>·</span>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatTimestamp(post.created_at)}</span>
                        </div>
                      </div>
                      {post.body && (
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">
                          {post.body}
                        </p>
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
