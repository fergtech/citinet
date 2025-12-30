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
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Media Section */}
      {variant !== 'text' && mediaUrl && (
        <div className="relative w-full aspect-video bg-slate-200 dark:bg-slate-700">
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
          <span className="px-2 py-1 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs uppercase tracking-wide">
            {category}
          </span>
        </div>
        <h3 className="text-card-foreground mb-1">{title}</h3>
        <p className="text-muted-foreground text-sm mb-3">
          {author} · {timestamp}
        </p>
        {content && (
          <p className="text-card-foreground/80 text-sm">{content}</p>
        )}
      </div>
    </div>
  );
}
