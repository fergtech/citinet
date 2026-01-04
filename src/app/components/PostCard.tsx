import { Play } from 'lucide-react';

interface PostCardProps {
  variant: 'image' | 'video' | 'text';
  category: string;
  title: string;
  author: string;
  timestamp: string;
  content?: string;
  mediaUrl?: string;
}

export function PostCard({ variant, category, title, author, timestamp, content, mediaUrl }: PostCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.01] hover:border-slate-300 dark:hover:border-zinc-700">
      {/* Media Section */}
      {variant !== 'text' && mediaUrl && (
        <div className="relative w-full aspect-video bg-slate-200 dark:bg-zinc-700">
          <img src={mediaUrl} alt={title} className="w-full h-full object-cover" />
          {variant === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-8 h-8 text-white fill-white" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content Section */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-md bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-medium uppercase tracking-wide ring-1 ring-purple-200 dark:ring-purple-500/20">
            {category}
          </span>
        </div>
        <h3 className="text-slate-900 dark:text-white font-semibold text-base mb-1">{title}</h3>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
          {author} · {timestamp}
        </p>
        {content && (
          <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{content}</p>
        )}
      </div>
    </div>
  );
}
