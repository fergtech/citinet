import type { HubPostReply } from '../types/hub';

// Ported from citinet-mobile's app/post/[id].tsx — same flat replies array
// (with reply_to_reply_id as the parent pointer) turned into a real tree,
// so citinet-web can render actual nested/indented comment threads instead
// of a flat chronological list with a "@mention" jump-link.
export type ReplyNode = HubPostReply & { children: ReplyNode[] };

export function buildReplyTree(replies: HubPostReply[]): ReplyNode[] {
  const nodes = new Map<string, ReplyNode>();
  replies.forEach(r => nodes.set(r.id, { ...r, children: [] }));

  const roots: ReplyNode[] = [];
  nodes.forEach(node => {
    const parent = node.reply_to_reply_id ? nodes.get(node.reply_to_reply_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      // Top-level, or an orphaned reply-to-id we don't have — surface it
      // rather than silently drop it.
      roots.push(node);
    }
  });
  return roots;
}

export function countDescendants(node: ReplyNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

// Beyond this nesting level, a reply's own children default to collapsed
// behind a "Show N more replies" toggle — deep threads otherwise turn into
// an unreadable wall. Matches citinet-mobile's threshold.
export const AUTO_COLLAPSE_DEPTH = 3;
