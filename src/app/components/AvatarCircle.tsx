import { useEffect, useState } from 'react';
import { AvatarFallback } from './icons';

/** Shared author avatar — real photo when the author has one, otherwise
 * citinet-mobile's default "no profile pic yet" glyph (see icons.tsx's
 * AvatarFallback). Identity chrome, so it's deliberately the same everywhere
 * regardless of post category (poll, event, plain text, etc.). */
export function AvatarCircle({ authorId, authorUsername, authorAvatarUrl, currentUserId, currentUserAvatarUrl, size = 'md' }: {
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
  const url = authorId === currentUserId ? (currentUserAvatarUrl || authorAvatarUrl) : authorAvatarUrl;
  useEffect(() => { setFailed(false); }, [url]);
  if (url && !failed) return <img src={url} alt={authorUsername} className={`${dim} rounded-full object-cover shrink-0`} onError={() => setFailed(true)} />;
  return <AvatarFallback className={`${dim} rounded-full shrink-0`} name={authorUsername} />;
}
