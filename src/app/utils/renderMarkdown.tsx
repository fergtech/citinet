import React from 'react';

// Renders inline markdown tokens within a single text segment.
// Handles **bold**, *italic*, `code`.
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Pattern order matters: bold before italic
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));

    if (match[2] !== undefined) {
      nodes.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-700 text-xs font-mono">
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface Block {
  type: 'p' | 'ul' | 'ol' | 'h1' | 'h2' | 'h3' | 'hr';
  items?: string[];   // for lists
  text?: string;      // for p / headings
}

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line → skip (paragraph breaks handled by grouping below)
    if (trimmed === '') { i++; continue; }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headings
    const h3 = trimmed.match(/^###\s+(.+)/);
    const h2 = trimmed.match(/^##\s+(.+)/);
    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h3) { blocks.push({ type: 'h3', text: h3[1] }); i++; continue; }
    if (h2) { blocks.push({ type: 'h2', text: h2[1] }); i++; continue; }
    if (h1) { blocks.push({ type: 'h1', text: h1[1] }); i++; continue; }

    // Unordered list (*, -, +)
    if (/^[\*\-\+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[\*\-\+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\*\-\+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list (1., 2., etc.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Regular paragraph — accumulate consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^[\*\-\+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^#{1,3}\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) blocks.push({ type: 'p', text: paraLines.join(' ') });
  }

  return blocks;
}

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  const blocks = parseBlocks(content);

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {blocks.map((block, bi) => {
        switch (block.type) {
          case 'h1':
            return <p key={bi} className="text-base font-bold text-slate-900 dark:text-white">{renderInline(block.text!)}</p>;
          case 'h2':
            return <p key={bi} className="text-sm font-bold text-slate-900 dark:text-white">{renderInline(block.text!)}</p>;
          case 'h3':
            return <p key={bi} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{renderInline(block.text!)}</p>;
          case 'hr':
            return <hr key={bi} className="border-slate-200 dark:border-zinc-700" />;
          case 'ul':
            return (
              <ul key={bi} className="space-y-1 pl-1">
                {block.items!.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={bi} className="space-y-1 pl-1">
                {block.items!.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-2">
                    <span className="shrink-0 text-slate-400 dark:text-slate-500 text-xs font-medium mt-0.5 min-w-[1.1rem] text-right">{ii + 1}.</span>
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ol>
            );
          default:
            return <p key={bi}>{renderInline(block.text!)}</p>;
        }
      })}
    </div>
  );
}
