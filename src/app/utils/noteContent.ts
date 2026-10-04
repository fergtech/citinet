import type { HubNote } from '../types/hub';

/** Node types that count as real content even though they carry no `text`. */
const NON_TEXT_CONTENT = new Set(['image', 'video', 'youtube', 'linkPreview', 'horizontalRule', 'taskItem', 'listItem']);

/** True when a TipTap JSON doc is missing or holds nothing a reader would see. */
export function isRichEmpty(rich: unknown): boolean {
  if (!rich || typeof rich !== 'object') return true;
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === 'string' && n.text.length > 0) return true;
    if (n.type && NON_TEXT_CONTENT.has(n.type)) return true;
    return Array.isArray(n.content) && n.content.some(visit);
  };
  return !visit(rich);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * What the rich-text editor should open with for a note.
 *
 * Notes written by a plain-text client (the mobile app) are saved with
 * `body_rich: null` and the text only in `body_plain`. The list preview reads
 * `body_plain`, so it looked fine while an editor that read only `body_rich`
 * opened blank — and a blank editor is one keystroke away from autosaving over
 * the real text. So: use the rich doc when it has content, otherwise rebuild
 * paragraphs from the plain text.
 */
export function editorContentForNote(note: Pick<HubNote, 'body_rich' | 'body_plain' | 'decryptFailed'>): object | string {
  if (!isRichEmpty(note.body_rich)) return note.body_rich as object;
  return plainTextToHtml(note);
}

/** Paragraph HTML rebuilt from body_plain, or '' when there is no real text to show. */
export function plainTextToHtml(note: Pick<HubNote, 'body_plain' | 'decryptFailed'>): string {
  if (note.decryptFailed || !note.body_plain?.trim()) return '';
  return note.body_plain
    .split(/\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}
