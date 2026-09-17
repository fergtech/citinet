import type { HubPostReply } from '../types/hub';

// Ported from citinet-mobile's app/post/[id].tsx — same flat replies array
// (with reply_to_reply_id as the parent pointer) turned into a real tree,
// so citinet-web can render actual nested/indented comment threads instead
// of a flat chronological list with a "@mention" jump-link.
//
// Generic over any flat reply shape with an id + reply_to_reply_id parent
// pointer — originally just HubPostReply (Feed comments), now also used by
// Atlas pin comments (AtlasPinReply), which share the same threading shape
// but aren't tied to a hub_posts row.
export interface BaseReply {
  id: string;
  reply_to_reply_id?: string | null;
}

export type ReplyNode<T extends BaseReply = HubPostReply> = T & { children: ReplyNode<T>[] };

export function buildReplyTree<T extends BaseReply>(replies: T[]): ReplyNode<T>[] {
  const nodes = new Map<string, ReplyNode<T>>();
  replies.forEach(r => nodes.set(r.id, { ...r, children: [] }));

  const roots: ReplyNode<T>[] = [];
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

export function countDescendants<T extends BaseReply>(node: ReplyNode<T>): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

// Beyond this nesting level, a reply's own children default to collapsed
// behind a "Show N more replies" toggle — deep threads otherwise turn into
// an unreadable wall. Matches citinet-mobile's threshold.
export const AUTO_COLLAPSE_DEPTH = 3;
