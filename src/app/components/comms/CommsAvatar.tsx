import { useEffect, useState } from 'react';
import { hubService } from '../../services/hubService';

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

/** Small avatar-or-monogram circle shared by the call/broadcast overlays. */
export function CommsAvatar({
  slug,
  userId,
  name,
  size = 96,
}: {
  slug: string;
  userId?: string | null;
  name: string;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarUrl = userId ? hubService.getAvatarUrl(slug, userId) : null;

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-white/15 flex items-center justify-center text-white font-semibold"
    >
      {getInitial(name)}
    </div>
  );
}
