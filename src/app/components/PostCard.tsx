import { MessageCircle, Megaphone, Target, HelpCircle, Calendar, MapPin, Play, MoreVertical, Bookmark, Heart, ArrowUpRight, Trash2, Loader2, Edit2, Share2, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { AvatarCircle } from './AvatarCircle';

interface CatConfig {
  label: string;
  Icon: React.ElementType;
  iconColor: string;
}

const CAT_CONFIG: Record<string, CatConfig> = {
  DISCUSSION:   { label: 'Discussion',   Icon: MessageCircle, iconColor: 'text-blue-400' },
  ANNOUNCEMENT: { label: 'Announcement', Icon: Megaphone,     iconColor: 'text-rose-400' },
  PROJECT:      { label: 'Project',      Icon: Target,        iconColor: 'text-emerald-400' },
  REQUEST:      { label: 'Request',      Icon: HelpCircle,    iconColor: 'text-orange-400' },
  EVENT:        { label: 'Event',        Icon: Calendar,      iconColor: 'text-purple-400' },
};

export interface PostCardProps {
  id: string;
  variant: 'image' | 'video' | 'text';
  category: string;
  title: string;
  author: string;
  timestamp: string;
  content?: string;
  mediaUrl?: string;
  replyCount?: number;
  likeCount?: number;
  myLiked?: boolean;
  /** Toggles the caller's like on this post. */
  onLike?: () => void;
  /** Opens the post and focuses its reply box — distinct from the card's own
   * open-on-click so it can additionally signal "I came here to comment." */
  onCommentClick?: () => void;
  categoryColors?: Record<string, string>;
  eventDate?: string | null;
  eventLocation?: string | null;
  /** Shown only when a location is present — fires the deep-link to Atlas, resolving to a
   * real pin nearby if one exists, or offering to add one if not. */
  onOpenInAtlas?: () => void;
  autoPlay?: boolean;
  /** Present only when the author has a real hub account — external/imported posts
   * (email, other platforms) have no profile to navigate to. */
  authorId?: string;
  onNavigateToProfile?: () => void;
  /** Real avatar photo support — same AvatarCircle used by the detail view and polls. */
  authorAvatarUrl?: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  /** Whether the caller (author or mod) can delete this post directly from the card. */
  canDelete?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  /** Whether the caller (author) can edit this post directly from the card. */
  canEdit?: boolean;
  onEdit?: () => void;
  /** Copies a real permalink to this post — same behavior as PollFeedCard's Share button. */
  onShare?: () => void;
  shareCopied?: boolean;
}

export function PostCard({
  variant, category, author, timestamp, content,
  mediaUrl, replyCount, likeCount, myLiked, onLike, onCommentClick,
  eventDate, eventLocation, onOpenInAtlas, autoPlay,
  authorId, onNavigateToProfile, canDelete, onDelete, deleting, canEdit, onEdit, onShare, shareCopied,
  authorAvatarUrl, currentUserId, currentUserAvatarUrl,
}: PostCardProps) {
  const cat = CAT_CONFIG[category] ?? CAT_CONFIG.DISCUSSION;
  const { Icon, label, iconColor } = cat;

  return (
    <div className="cn-glass rounded-2xl overflow-hidden hover:border-black/15 dark:hover:border-white/15 transition-all duration-200">
      <div className="p-4">
        {/* Header: avatar + author + category + time */}
        <div className="flex items-start gap-3 mb-3">
          <button
            onClick={e => { if (authorId && onNavigateToProfile) { e.stopPropagation(); onNavigateToProfile(); } }}
            disabled={!authorId || !onNavigateToProfile}
            className="shrink-0 select-none disabled:cursor-default"
          >
            <AvatarCircle
              authorId={authorId ?? ''}
              authorUsername={author}
              authorAvatarUrl={authorAvatarUrl}
              currentUserId={currentUserId}
              currentUserAvatarUrl={currentUserAvatarUrl}
            />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={e => { if (authorId && onNavigateToProfile) { e.stopPropagation(); onNavigateToProfile(); } }}
                disabled={!authorId || !onNavigateToProfile}
                className="text-sm font-semibold cn-text-1 hover:text-purple-600 dark:hover:text-purple-400 disabled:hover:text-inherit transition-colors"
              >
                {author}
              </button>
              <span className="cn-mono text-[11px] cn-text-4">· {timestamp}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Icon className={`w-3 h-3 ${iconColor}`} />
              <span className="text-[11px] cn-text-3">{label}</span>
            </div>
          </div>
          {canEdit || canDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={e => e.stopPropagation()}
                  title="Post actions"
                  aria-label="Post actions"
                  className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                >
                  <MoreVertical className="w-4 h-4 cn-text-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36" onClick={e => e.stopPropagation()}>
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="w-4 h-4" />
                    <span>Edit post</span>
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={deleting}>
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span>Delete post</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              onClick={e => e.stopPropagation()}
              title="Post actions"
              aria-label="Post actions"
              className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center transition-colors shrink-0 opacity-0 pointer-events-none"
            >
              <MoreVertical className="w-4 h-4 cn-text-3" />
            </button>
          )}
        </div>

        {/* Event metadata */}
        {category === 'EVENT' && eventDate && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-500/15 border border-purple-300 dark:border-purple-500/30 text-[11px] font-medium text-purple-700 dark:text-purple-300">
              <Calendar className="w-3 h-3 shrink-0" />
              {new Date(eventDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(eventDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* Body */}
        {content && (
          <p className="text-sm cn-text-2 leading-relaxed line-clamp-4">{content}</p>
        )}

        {/* Media */}
        {variant === 'image' && mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden aspect-video cn-surface relative">
            <div
              className="absolute inset-0 scale-110 blur-xl opacity-50"
              style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <img src={mediaUrl} alt="" className="relative w-full h-full object-contain" />
          </div>
        )}
        {variant === 'video' && mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden aspect-video bg-black relative">
            <video
              src={mediaUrl}
              preload={autoPlay ? 'auto' : 'metadata'}
              autoPlay={autoPlay}
              muted={autoPlay}
              loop={autoPlay}
              playsInline
              className="w-full h-full object-contain"
            />
            {!autoPlay && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Referenced location — always clickable when present, whether or not a pin exists yet */}
        {eventLocation && (
          <button
            onClick={e => { e.stopPropagation(); onOpenInAtlas?.(); }}
            className="mt-3 w-full flex items-center gap-2.5 p-2.5 rounded-xl border cn-border bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors text-left"
          >
            <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-white" />
            </span>
            <span className="flex-1 min-w-0 text-xs font-medium cn-text-2 truncate">{eventLocation}</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] font-semibold cn-text-2 shrink-0">
              Open in Atlas
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </button>
        )}
      </div>

      {/* Reaction bar */}
      <div
        className="flex items-center gap-1 px-3 pb-3 pt-2 border-t cn-border"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onLike?.()}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
            myLiked
              ? 'text-rose-500 hover:text-rose-600'
              : 'cn-text-4 hover:text-rose-500 dark:hover:text-rose-400'
          } hover:bg-black/5 dark:hover:bg-white/5`}
        >
          <Heart className={`w-3.5 h-3.5 ${myLiked ? 'fill-rose-500' : ''}`} />
          {typeof likeCount === 'number' && likeCount > 0 && (
            <span className="cn-mono">{likeCount}</span>
          )}
        </button>
        <button
          onClick={() => onCommentClick?.()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-text-4 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {typeof replyCount === 'number' && replyCount > 0 && (
            <span className="cn-mono">{replyCount}</span>
          )}
        </button>
        <button
          onClick={() => onShare?.()}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
            shareCopied ? 'text-emerald-500' : 'cn-text-4 hover:text-emerald-500 dark:hover:text-emerald-400'
          } hover:bg-black/5 dark:hover:bg-white/5`}
        >
          {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{shareCopied ? 'Copied' : 'Share'}</span>
        </button>
        <div className="flex-1" />
        <button className="w-8 h-8 rounded-lg flex items-center justify-center cn-text-4 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <Bookmark className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
