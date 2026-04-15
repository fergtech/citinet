import { X, Pin, Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { HubNote } from '../types/hub';

interface NoteDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: HubNote;
  isOwnNote?: boolean;
  onEdit?: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch { return ''; }
}

// Convert TipTap JSON to HTML
function renderTipTapContent(content: any): React.ReactNode {
  if (!content || !content.content) return null;

  const renderTextWithMarks = (textNode: any): React.ReactNode => {
    let text: React.ReactNode = textNode.text;
    let href: string | null = null;

    // First, extract href if link mark exists
    if (textNode.marks) {
      textNode.marks.forEach((mark: any) => {
        if (mark.type === 'link') {
          href = mark.attrs?.href;
        }
      });
    }

    // Apply marks (bold, italic, underline, strikethrough, etc.)
    if (textNode.marks) {
      textNode.marks.forEach((mark: any) => {
        if (mark.type === 'bold') {
          text = <strong key={`${mark.type}-${textNode.text}`}>{text}</strong>;
        } else if (mark.type === 'italic') {
          text = <em key={`${mark.type}-${textNode.text}`}>{text}</em>;
        } else if (mark.type === 'underline') {
          text = <u key={`${mark.type}-${textNode.text}`}>{text}</u>;
        } else if (mark.type === 'strike') {
          text = <s key={`${mark.type}-${textNode.text}`}>{text}</s>;
        }
      });
    }

    // Wrap in link if href exists
    if (href) {
      text = (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
          key={`link-${href}-${textNode.text}`}
        >
          {text}
        </a>
      );
    }

    return text;
  };

  return content.content.map((node: any, idx: number) => {
    if (node.type === 'paragraph') {
      return (
        <p key={idx} className="mb-4">
          {node.content?.map((child: any, childIdx: number) => (
            <span key={childIdx}>{renderTextWithMarks(child)}</span>
          )) || '\u00A0'}
        </p>
      );
    }
    if (node.type === 'bulletList') {
      return (
        <ul key={idx} className="list-disc list-inside mb-4 space-y-1">
          {node.content?.map((item: any, itemIdx: number) => (
            <li key={itemIdx} className="text-slate-800 dark:text-slate-200">
              {item.content?.[0]?.content?.map((child: any, childIdx: number) => (
                <span key={childIdx}>{renderTextWithMarks(child)}</span>
              ))}
            </li>
          ))}
        </ul>
      );
    }
    if (node.type === 'orderedList') {
      return (
        <ol key={idx} className="list-decimal list-inside mb-4 space-y-1">
          {node.content?.map((item: any, itemIdx: number) => (
            <li key={itemIdx} className="text-slate-800 dark:text-slate-200">
              {item.content?.[0]?.content?.map((child: any, childIdx: number) => (
                <span key={childIdx}>{renderTextWithMarks(child)}</span>
              ))}
            </li>
          ))}
        </ol>
      );
    }
    return null;
  });
}

export function NoteDetailModal({
  isOpen, onClose, note, isOwnNote, onEdit,
}: NoteDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(note.body_plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between p-5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {note.is_pinned && (
              <Pin className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
              {note.title || 'Untitled'}
            </h2>
            {note.color && (
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: note.color }}
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Updated {formatTimestamp(note.updated_at)}</span>
            {note.is_public && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                Public
              </span>
            )}
          </div>

          {/* Body */}
          <div className="text-slate-800 dark:text-slate-200 space-y-2">
            {note.body_rich ? (
              renderTipTapContent(note.body_rich)
            ) : (
              <p className="leading-relaxed whitespace-pre-wrap">{note.body_plain}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy
                </>
              )}
            </button>
            {isOwnNote && onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
