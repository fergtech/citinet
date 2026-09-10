import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, User as UserIcon, X, Loader2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { AvatarFallback } from './icons';
import { hubService } from '../services/hubService';
import { hubPath } from '../utils/subdomain';
import type { HubMember } from '../types/hub';

// Same anchored-popover member card as SpacesScreen's Members tab (see its
// own MemberPreviewCard/MemberPopoverRow) — pulled out into a shared
// component so it can also anchor off a comment thread's avatar/username,
// which only ever has author_id/author_username on hand (no headline/role/
// avatar), unlike Spaces' already-fetched member list. Any field left
// undefined here triggers a one-time lazy hubService.getMember() fetch the
// first time the popover opens.
export interface MemberPreviewSummary {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  profile_headline?: string | null;
  role?: string | null;
}

function MemberPreviewAvatar({ member, hubSlug, size }: { member: MemberPreviewSummary; hubSlug: string; size: 'row' | 'popover' }) {
  const avatarUrl = hubService.getAvatarUrl(hubSlug, member.user_id);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [avatarUrl]);
  const dim = size === 'row' ? 'w-7 h-7' : 'w-14 h-14 mb-2.5';
  if (avatarUrl && !failed) {
    return <img src={avatarUrl} alt="" className={`${dim} rounded-full object-cover shrink-0`} onError={() => setFailed(true)} />;
  }
  return <AvatarFallback className={`${dim} rounded-full shrink-0`} name={member.username} />;
}

function MemberPreviewCardBody({ member, hubSlug, myUserId, onClose }: {
  member: MemberPreviewSummary; hubSlug: string; myUserId?: string; onClose: () => void;
}) {
  const navigate = useNavigate();
  const isSelf = member.user_id === myUserId;

  function viewProfile() {
    onClose();
    navigate(hubPath(`/profile/${member.user_id}`));
  }
  function message() {
    sessionStorage.setItem('citinet-deeplink-message-peer', JSON.stringify({ userId: member.user_id, username: member.username }));
    onClose();
    navigate(hubPath('/messages'));
  }

  return (
    <div className="flex flex-col items-center text-center">
      <button onClick={onClose} title="Close" aria-label="Close" className="self-end -mt-1 -mr-1 mb-1 w-6 h-6 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center">
        <X className="w-3.5 h-3.5 cn-text-4" />
      </button>
      <MemberPreviewAvatar member={member} hubSlug={hubSlug} size="popover" />
      <p className="text-sm font-semibold cn-text-1">{member.display_name || member.username}</p>
      <p className="text-xs cn-text-4">@{member.username}</p>
      {member.profile_headline && (
        <p className="text-xs cn-text-3 mt-1.5">{member.profile_headline}</p>
      )}
      {member.role && (
        <span className="mt-2 inline-block text-[10.5px] font-medium capitalize px-2 py-0.5 rounded-full cn-surface-3 cn-text-3">
          {member.role}
        </span>
      )}

      <div className="flex gap-2 w-full mt-4">
        {!isSelf && (
          <button onClick={message}
            className="flex-1 py-2 rounded-xl cn-surface-3 text-xs font-medium cn-text-2 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> Message
          </button>
        )}
        <button onClick={viewProfile}
          className="flex-1 py-2 cn-action bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5">
          <UserIcon className="w-3.5 h-3.5" /> View Profile
        </button>
      </div>
    </div>
  );
}

/** Wraps a trigger (an avatar, a username, ...) so clicking it pops this
 * member's preview card anchored right where it was clicked. */
export function MemberPreviewPopover({
  member, hubSlug, myUserId, align = 'start', children,
}: {
  member: MemberPreviewSummary;
  hubSlug: string;
  myUserId?: string;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<MemberPreviewSummary>(member);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const needsFetch = member.profile_headline === undefined || member.role === undefined || member.avatar_url === undefined;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && needsFetch && !fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      hubService.getMember(hubSlug, member.user_id)
        .then((m: HubMember) => setFull(prev => ({ ...prev, ...m })))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-4 cn-surface border cn-border">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin cn-text-4" />
          </div>
        ) : (
          <MemberPreviewCardBody member={full} hubSlug={hubSlug} myUserId={myUserId} onClose={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  );
}
