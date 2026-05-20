import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ExternalLink } from 'lucide-react';

export function LinkPreviewView({ node }: NodeViewProps) {
  const { url, title, description, image, siteName } = node.attrs;

  return (
    <NodeViewWrapper contentEditable={false}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block my-3 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden no-underline hover:border-violet-400 dark:hover:border-violet-500 transition-colors bg-white dark:bg-zinc-900 shadow-sm"
      >
        {image && (
          <img
            src={image}
            alt={title}
            className="w-full h-40 object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="p-3.5">
          {siteName && (
            <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wide mb-1">
              {siteName}
            </p>
          )}
          <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">
            {title || url}
          </p>
          {description && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <ExternalLink className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{url}</span>
          </div>
        </div>
      </a>
    </NodeViewWrapper>
  );
}
