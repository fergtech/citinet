import { Play, MessageCircle, Calendar, MapPin } from 'lucide-react';

interface PostCardProps {
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
  autoPlay?: boolean;
}


export function PostCard({ variant, category, title, author, timestamp, content, mediaUrl, replyCount, eventDate, eventLocation, autoPlay }: PostCardProps) {
  const isAnnouncement = category === 'ANNOUNCEMENT';
  const isEvent = category === 'EVENT';

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border overflow-hidden transition-all duration-200 hover:shadow-xl hover:scale-[1.01] ${
      isAnnouncement
        ? 'border-amber-300 dark:border-amber-600/50 hover:border-amber-400 dark:hover:border-amber-500/70'
        : isEvent
        ? 'border-purple-300 dark:border-purple-700/50 hover:border-purple-400 dark:hover:border-purple-600/70'
        : 'border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600'
    }`}>

      {/* Accent bar */}
      {isAnnouncement && (
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-amber-500" />
      )}
      {isEvent && (
        <div className="h-1 w-full bg-gradient-to-r from-purple-500 to-indigo-500" />
      )}

      {/* Media */}
      {variant === 'image' && mediaUrl && (
        <div className="relative w-full aspect-video bg-zinc-900 overflow-hidden">
          {/* Blurred fill — covers letterbox bars for non-16:9 images */}
          <div
            className="absolute inset-0 scale-110 blur-xl opacity-60"
            style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          <img src={mediaUrl} alt={title} className="relative w-full h-full object-contain" />
        </div>
      )}
      {variant === 'video' && mediaUrl && (
        <div className="relative w-full aspect-video bg-black">
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
              <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-7 h-7 text-white fill-white" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">{author} · {timestamp}</p>
        {isEvent && eventDate && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 text-[11px] font-medium text-purple-700 dark:text-purple-300">
              <Calendar className="w-3 h-3 shrink-0" />
              {new Date(eventDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(eventDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </span>
            {eventLocation && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 text-[11px] font-medium text-purple-700 dark:text-purple-300">
                <MapPin className="w-3 h-3 shrink-0" />
                {eventLocation}
              </span>
            )}
          </div>
        )}
        {content && (
          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed line-clamp-3">{content}</p>
        )}
        {typeof replyCount === 'number' && (
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <MessageCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {replyCount === 0 ? 'No replies yet' : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
