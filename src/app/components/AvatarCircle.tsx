import { useEffect, useState } from 'react';

export function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
];

export function avatarColorClass(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Shared author avatar — real photo when the author has one, otherwise a stable
 * name-hash-colored initials fallback. Identity chrome, so it's deliberately the
 * same everywhere regardless of post category (poll, event, plain text, etc.). */
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
  return <div className={`${dim} rounded-full bg-gradient-to-br ${avatarColorClass(authorUsername)} flex items-center justify-center text-white font-semibold shrink-0`}>{getInitials(authorUsername)}</div>;
}
