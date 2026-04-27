import { Play, MessageCircle } from 'lucide-react';

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
}


export function PostCard({ variant, category, title, author, timestamp, content, mediaUrl, replyCount }: PostCardProps) {
  const isAnnouncement = category === 'ANNOUNCEMENT';

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.01] hover:border-slate-300 dark:hover:border-zinc-700 ${
      isAnnouncement
        ? 'border-amber-300 dark:border-amber-600/50'
        : 'border-slate-200 dark:border-zinc-800'
    }`}>

      {/* Announcement accent bar */}
      {isAnnouncement && (
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-amber-500" />
      )}

      {/* Media */}
      {variant === 'image' && mediaUrl && (
        <div className="w-full aspect-video bg-slate-200 dark:bg-zinc-700">
          <img src={mediaUrl} alt={title} className="w-full h-full object-cover" />
        </div>
      )}
      {variant === 'video' && mediaUrl && (
        <div className="relative w-full aspect-video bg-black">
          <video src={mediaUrl} preload="metadata" className="w-full h-full object-contain" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">{author} · {timestamp}</p>
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
