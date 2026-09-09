/** True when the Web Share API is available (mobile browsers, some desktop browsers).
 *  Gate any "Share" UI on this so desktop-only browsers fall back to copy-link. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

/** Opens the OS share sheet (Facebook, Messages, WhatsApp, Discord, email, etc.
 *  all appear automatically — no per-platform integration needed). Callers should
 *  check canNativeShare() first and fall back to copy-to-clipboard otherwise. */
export async function nativeShare(opts: { url: string; title?: string; text?: string }): Promise<ShareResult> {
  if (!canNativeShare()) return 'unsupported';
  try {
    await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    return 'shared';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
