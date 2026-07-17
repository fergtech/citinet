import { MessageCircle, Megaphone, Target, HelpCircle, Calendar, MapPin, Play, MoreHorizontal, Bookmark, Heart, ArrowUpRight } from 'lucide-react';

interface CatConfig {
  label: string;
  Icon: React.ElementType;
  iconColor: string;
  avatarGrad: string;
}

const CAT_CONFIG: Record<string, CatConfig> = {
  DISCUSSION:   { label: 'Discussion',   Icon: MessageCircle, iconColor: 'text-blue-400',    avatarGrad: 'from-blue-500 to-blue-600' },
  ANNOUNCEMENT: { label: 'Announcement', Icon: Megaphone,     iconColor: 'text-rose-400',    avatarGrad: 'from-rose-500 to-pink-600' },
  PROJECT:      { label: 'Project',      Icon: Target,        iconColor: 'text-emerald-400', avatarGrad: 'from-emerald-500 to-teal-600' },
  REQUEST:      { label: 'Request',      Icon: HelpCircle,    iconColor: 'text-orange-400',  avatarGrad: 'from-orange-500 to-amber-600' },
  EVENT:        { label: 'Event',        Icon: Calendar,      iconColor: 'text-purple-400',  avatarGrad: 'from-purple-500 to-violet-600' },
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
  categoryColors?: Record<string, string>;
  eventDate?: string | null;
  eventLocation?: string | null;
  /** Shown only when a location is present — fires the deep-link to Atlas, resolving to a
   * real pin nearby if one exists, or offering to add one if not. */
  onOpenInAtlas?: () => void;
  autoPlay?: boolean;
}

export function PostCard({
  variant, category, author, timestamp, content,
  mediaUrl, replyCount, eventDate, eventLocation, onOpenInAtlas, autoPlay,
}: PostCardProps) {
  const cat = CAT_CONFIG[category] ?? CAT_CONFIG.DISCUSSION;
  const { Icon, label, iconColor, avatarGrad } = cat;

  return (
    <div className="cn-glass rounded-2xl overflow-hidden hover:border-black/15 dark:hover:border-white/15 transition-all duration-200">
      <div className="p-4">
        {/* Header: avatar + author + category + time */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white font-semibold text-sm shrink-0 select-none`}>
            {author.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold cn-text-1">{author}</span>
              <span className="cn-mono text-[11px] cn-text-4">· {timestamp}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Icon className={`w-3 h-3 ${iconColor}`} />
              <span className="text-[11px] cn-text-3">{label}</span>
            </div>
          </div>
          <button
            onClick={e => e.stopPropagation()}
            className="w-8 h-8 rounded-lg flex items-center justify-center cn-text-4 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors shrink-0"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
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
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-text-4 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold">
          <Heart className="w-3.5 h-3.5" />
        </button>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-text-4 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold">
          <MessageCircle className="w-3.5 h-3.5" />
          {typeof replyCount === 'number' && replyCount > 0 && (
            <span className="cn-mono">{replyCount}</span>
          )}
        </button>
        <div className="flex-1" />
        <button className="w-8 h-8 rounded-lg flex items-center justify-center cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <Bookmark className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
