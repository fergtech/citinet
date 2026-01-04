import { X, MessageCircle, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect } from 'react';

interface PostDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  title: string;
  author: string;
  timestamp: string;
  content?: string;
  mediaUrl?: string;
  variant: 'image' | 'video' | 'text';
}

export function PostDetailModal({
  isOpen,
  onClose,
  category,
  title,
  author,
  timestamp,
  content,
  mediaUrl,
  variant
}: PostDetailModalProps) {
  // Handle ESC key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-medium uppercase tracking-wide">
                    {category}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Media */}
                {variant !== 'text' && mediaUrl && (
                  <div className="w-full">
                    <img src={mediaUrl} alt={title} className="w-full object-cover" />
                  </div>
                )}

                {/* Post Content */}
                <div className="p-6">
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4 tracking-tight">
                    {title}
                  </h2>

                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-6">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span>{author}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{timestamp}</span>
                    </div>
                  </div>

                  {content && (
                    <div className="prose dark:prose-invert max-w-none">
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {content}
                      </p>
                    </div>
                  )}

                  {/* Placeholder for future features */}
                  <div className="mt-8 pt-8 border-t border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-4">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Discussion</span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                      Comments and replies coming soon. This is a chronological feed — 
                      responses will appear in the order they're posted.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
