import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, Users, Lock, Eye, Globe,
  Loader2, AlertCircle, Settings, LogOut, UserPlus,
  Check, X, ChevronLeft, ChevronRight, MessageCircle, Share2,
  LayoutGrid, Send, Image as ImageIcon, Video, FileText,
  Download, Palette, ImagePlus, Link2, Radio, User as UserIcon,
  Landmark, Trees, Baby, Dumbbell, CheckCircle2, Package, MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useHub } from '../context/HubContext';
import { spacesService } from '../services/spacesService';
import { hubService } from '../services/hubService';
import { canNativeShare, nativeShare } from '../utils/share';
import { initiativesService, type Initiative, type InitiativeActivityEntry } from '../services/initiativesService';
import { InitiativeCard } from './InitiativeCard';
import { AvatarFallback } from './icons';
import { AvatarCircle } from './AvatarCircle';
import { BroadcastSetupModal } from './comms/BroadcastSetupModal';
import { LiveCard } from './MessagesScreen';
import { useBroadcast } from '../context/BroadcastContext';
import type { LiveCommsItem } from '../types/hub';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { hubPath } from '../utils/subdomain';
import { PostDetailModal } from './PostDetailModal';
import { SpacesGlyph } from './icons';
import { PostComposer } from './PostComposer';
import { PostCard } from './PostCard';
import { PollFeedCard } from './PollFeedCard';
import { useHubGeoCenter } from '../hooks/useHubGeoCenter';
import { useSavedIds } from '../hooks/useSavedIds';
import { voteOrQueue } from '../services/writeQueueService';
import { openLocationInAtlas } from '../utils/geocoding';
import type { HubSpace, HubSpaceMember, HubPost, HubMember, HubSpaceFile, HubSpaceCategory, HubUser } from '../types/hub';

interface SpacesScreenProps {
  onBack: () => void;
}

// ── Category taxonomy ─────────────────────────────────────
// Purely a Discover filter aid — spaces stay free-form/user-created either
// way (see HubSpaceCategory). Gradients reuse the same app-section tokens
// Feed/Dashboard already draw from, so a category badge reads as "this kind
// of thing" using colors the rest of the app has already taught people.

const SPACE_CATEGORY: Record<HubSpaceCategory, { label: string; Icon: LucideIcon; grad: string }> = {
  civic:    { label: 'Civic',     Icon: Landmark, grad: 'var(--cn-grad-initiatives)' },
  hobby:    { label: 'Hobbies',   Icon: Palette,  grad: 'var(--cn-grad-spaces)' },
  outdoors: { label: 'Outdoors',  Icon: Trees,    grad: 'var(--cn-grad-atlas)' },
  parents:  { label: 'Parenting', Icon: Baby,     grad: 'var(--cn-grad-exchange)' },
  sports:   { label: 'Sports',    Icon: Dumbbell, grad: 'var(--cn-grad-files)' },
};
const CATEGORY_FILTERS: { value: HubSpaceCategory; label: string }[] =
  (Object.keys(SPACE_CATEGORY) as HubSpaceCategory[]).map(value => ({ value, label: SPACE_CATEGORY[value].label }));
function categoryOf(space: HubSpace) {
  return space.category && space.category in SPACE_CATEGORY ? SPACE_CATEGORY[space.category as HubSpaceCategory] : null;
}

// ── Constants (same as AccountScreen) ────────────────────

const BANNER_SOLID_COLORS = ['#0f766e', '#0369a1', '#1d4ed8', '#6d28d9', '#be123c', '#b45309', '#374151'];
const BANNER_GRADIENTS = [
  { from: '#2563eb', to: '#7c3aed' },
  { from: '#0f766e', to: '#2563eb' },
  { from: '#be123c', to: '#7c2d12' },
  { from: '#1d4ed8', to: '#0f766e' },
  { from: '#c2410c', to: '#be123c' },
  { from: '#374151', to: '#111827' },
  { from: '#7c3aed', to: '#ec4899' },
  { from: '#065f46', to: '#0f766e' },
];

// ── helpers ──────────────────────────────────────────────

function visibilityIcon(v: string) {
  if (v === 'private') return <Lock className="w-3 h-3" />;
  if (v === 'invite-only') return <Eye className="w-3 h-3" />;
  return <Globe className="w-3 h-3" />;
}
function visibilityLabel(v: string) {
  if (v === 'private') return 'Private';
  if (v === 'invite-only') return 'Invite Only';
  return 'Public';
}
function canManage(role?: string | null) { return role === 'owner' || role === 'admin'; }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatBytes(b?: number) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}


function fileTypeIcon(mime?: string) {
  if (!mime) return <FileText className="w-5 h-5 cn-text-3" />;
  if (mime.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-500 dark:text-blue-400" />;
  if (mime.startsWith('video/')) return <Video className="w-5 h-5 text-blue-500 dark:text-blue-400" />;
  return <FileText className="w-5 h-5 cn-text-3" />;
}

function isImage(mime?: string) { return !!mime?.startsWith('image/'); }
function isVideo(mime?: string) { return !!mime?.startsWith('video/'); }

/** Same idea as Feed's getVariant, but from a filename/URL (space posts don't
 * carry a mime_type, just a file_name or, for proxied posts, a raw media_url). */
function postCardVariant(mediaFileName?: string | null, mediaUrl?: string | null): 'image' | 'video' | 'text' {
  const name = mediaFileName || mediaUrl || '';
  if (!name) return 'text';
  const ext = name.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  return 'text';
}

function truncateText(text: string, maxLength: number = 150): { truncated: string; isTruncated: boolean } {
  if (!text || text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }
  // Truncate at word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return {
    truncated: (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated).trim() + '…',
    isTruncated: true
  };
}

// ── Banner style ─────────────────────────────────────────

function getBannerStyle(space: HubSpace, tunnelUrl: string): React.CSSProperties {
  if (space.banner_mode === 'image') {
    const url = space.banner_image_url ?? (space.banner_image_file_name ? spacesService.getSpaceBannerUrl(tunnelUrl, space.slug) : null);
    if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (space.banner_mode === 'solid' && space.banner_color) {
    return { backgroundColor: space.banner_color };
  }
  if (space.banner_mode === 'gradient' && space.banner_gradient_from && space.banner_gradient_to) {
    return { backgroundImage: `linear-gradient(135deg, ${space.banner_gradient_from}, ${space.banner_gradient_to})` };
  }
  // deterministic default gradient per space name
  const grads = [
    ['#2563eb', '#7c3aed'], ['#0f766e', '#2563eb'], ['#7c3aed', '#ec4899'],
    ['#065f46', '#0f766e'], ['#c2410c', '#be123c'], ['#374151', '#111827'],
  ];
  let h = 0;
  for (let i = 0; i < space.name.length; i++) h = space.name.charCodeAt(i) + ((h << 5) - h);
  const [from, to] = grads[Math.abs(h) % grads.length];
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

// ── Create Space Modal ────────────────────────────────────

function CreateSpaceModal({ hubSlug, onCreated, onClose }: { hubSlug: string; onCreated: (s: HubSpace) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'invite-only'>('public');
  const [category, setCategory] = useState<HubSpaceCategory | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slugManual, setSlugManual] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugManual) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const space = await spacesService.create(hubSlug, { name, slug, description: desc, visibility, category: category || undefined });
      onCreated(space);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Create a Space</h2>
          <button onClick={onClose} title="Close" aria-label="Close" className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Space Name</label>
            <input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Neighborhood Garden Club" required
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Slug (URL)</label>
            <div className="flex items-center bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 focus-within:border-blue-500 overflow-hidden">
              <span className="text-slate-400 dark:text-zinc-500 text-sm mr-1">spaces/</span>
              <input value={slug} onChange={e => { setSlug(e.target.value); setSlugManual(true); }} placeholder="garden-club" required
                className="flex-1 bg-transparent py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-zinc-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Description <span className="text-slate-400 dark:text-zinc-600">(optional)</span></label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What is this space about?"
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-2">Visibility</label>
            <div className="grid grid-cols-3 gap-2">
              {(['public', 'private', 'invite-only'] as const).map(v => (
                <button key={v} type="button" onClick={() => setVisibility(v)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${visibility === v ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                  {visibilityLabel(v)}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5">
              {visibility === 'public' ? 'Anyone on the hub can join directly.' : visibility === 'private' ? 'Members request to join; admin approves.' : 'Members can only join via invitation.'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-2">Category <span className="text-slate-400 dark:text-zinc-600">(optional — helps neighbors find it in Discover)</span></label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setCategory('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${category === '' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                None
              </button>
              {(Object.keys(SPACE_CATEGORY) as HubSpaceCategory[]).map(c => {
                const { label, Icon } = SPACE_CATEGORY[c];
                return (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${category === c ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700">Cancel</button>
            <button type="submit" disabled={loading || !name || !slug}
              className="flex-1 py-2.5 cn-action bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create Space
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Invite Member Modal ───────────────────────────────────

function InviteMemberModal({ hubSlug, spaceSlug, onClose }: { hubSlug: string; spaceSlug: string; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<HubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    hubService.listMembers(hubSlug).then(setMembers).catch(() => {}).finally(() => setLoading(false));
  }, [hubSlug]);

  const filtered = members.filter(m => (m.username + (m.display_name || '')).toLowerCase().includes(search.toLowerCase()));

  async function invite(userId: string) {
    setInviting(userId); setError('');
    try {
      await spacesService.invite(hubSlug, spaceSlug, userId);
      setInvited(prev => new Set([...prev, userId]));
    } catch (err: any) { setError(err.message); }
    finally { setInviting(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Invite Members</h2>
          <button onClick={onClose} title="Close" aria-label="Close" className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center"><X className="w-4 h-4 text-slate-500 dark:text-zinc-400" /></button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hub members…"
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400 mb-2">{error}</p>}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {loading && <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 dark:text-zinc-500" /></div>}
            {!loading && filtered.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800">
                <AvatarFallback className="w-8 h-8 rounded-full flex-shrink-0" name={m.username} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.display_name || m.username}</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500">@{m.username}</p>
                </div>
                <button onClick={() => invite(m.user_id)} disabled={inviting === m.user_id || invited.has(m.user_id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${invited.has(m.user_id) ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                  {inviting === m.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : invited.has(m.user_id) ? <><Check className="w-3 h-3" /> Invited</> : <><UserPlus className="w-3 h-3" /> Invite</>}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700">Done</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Member Preview ────────────────────────────────────────
// A real anchored popover — not a modal — using the app's existing Radix
// Popover primitive (ui/popover.tsx), which already portals its content and
// handles anchored positioning with viewport collision avoidance, plus
// outside-click/Escape dismissal, for free. Card content (identity + a real
// handoff to the full profile, plus the same "Message" deep-link
// ProfileScreen's own Message button uses — sessionStorage flag
// MessagesScreen reads on mount) is split out so both member-row locations
// (the compact sidebar list and the full Members tab) can each wrap their
// own trigger in <MemberPopoverRow> without duplicating the card markup.

function MemberAvatar({ member, hubSlug, size }: { member: HubSpaceMember; hubSlug: string; size: 'row' | 'popover' }) {
  const avatarUrl = hubService.getAvatarUrl(hubSlug, member.user_id);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);

  if (avatarUrl && !avatarFailed) {
    return <img src={avatarUrl} alt="" className={`${size === 'row' ? 'w-7 h-7' : 'w-14 h-14'} rounded-full object-cover ${size === 'popover' ? 'mb-2.5' : ''}`} onError={() => setAvatarFailed(true)} />;
  }

  return <AvatarFallback className={`${size === 'row' ? 'w-7 h-7' : 'w-14 h-14 mb-2.5'} rounded-full flex-shrink-0`} name={member.username} />;
}

function MemberPreviewCard({ member, hubSlug, myUserId, onClose }: { member: HubSpaceMember; hubSlug: string; myUserId?: string; onClose: () => void }) {
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
      <MemberAvatar member={member} hubSlug={hubSlug} size="popover" />
      <p className="text-sm font-semibold cn-text-1">{member.display_name || member.username}</p>
      <p className="text-xs cn-text-4">@{member.username}</p>
      {member.profile_headline && (
        <p className="text-xs cn-text-3 mt-1.5">{member.profile_headline}</p>
      )}
      <span className="mt-2 inline-block text-[10.5px] font-medium capitalize px-2 py-0.5 rounded-full cn-surface-3 cn-text-3">
        {member.role}
      </span>

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

/** Wraps a member row (passed as children, e.g. a button) so clicking it
 * pops this member's preview card right where it was clicked — each row
 * owns its own open state, so no shared "which member is open" state needs
 * threading up to a parent. */
function MemberPopoverRow({ member, hubSlug, myUserId, align = 'start', children }: {
  member: HubSpaceMember; hubSlug: string; myUserId?: string; align?: 'start' | 'center' | 'end'; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-4 cn-surface border cn-border">
        <MemberPreviewCard member={member} hubSlug={hubSlug} myUserId={myUserId} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

// ── Compose Post ──────────────────────────────────────────

function ComposePost({ hubSlug, spaceSlug, onPosted }: { hubSlug: string; spaceSlug: string; onPosted: (p: HubPost) => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(f);
    setMediaPreview(URL.createObjectURL(f));
  }
  function removeMedia() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null); setMediaPreview(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !mediaFile) { setError('Add a caption or media'); return; }
    setError('');
    setLoading(true);
    try {
      const post = await spacesService.createPost(hubSlug, spaceSlug, {
        body: body.trim(),
        mediaFile: mediaFile ?? undefined
      });
      onPosted(post);
      setBody(''); removeMedia(); setOpen(false);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full max-w-2xl mx-auto flex items-center gap-3 px-4 py-3 cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5 border cn-border rounded-2xl cn-text-3 text-sm transition-colors">
        <div className="w-8 h-8 rounded-full cn-surface-3 flex items-center justify-center"><Plus className="w-4 h-4" /></div>
        <span>Share something with this space…</span>
      </button>
    );
  }

  const isVid = mediaFile?.type.startsWith('video/');

  return (
    <form onSubmit={submit} className="w-full max-w-2xl mx-auto cn-surface-2 border cn-border rounded-2xl p-4 space-y-3">
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Share something with this space…" rows={3}
        className="w-full cn-surface border cn-border rounded-xl px-3 py-2.5 text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none" />
      {mediaPreview && (
        <div className="relative rounded-xl overflow-hidden">
          {isVid ? <video src={mediaPreview} controls className="w-full max-h-48 object-contain bg-black" /> : <img src={mediaPreview} alt="Preview" className="w-full max-h-48 object-cover" />}
          <button type="button" onClick={removeMedia} title="Remove media" aria-label="Remove media" className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2 items-center">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="p-2 rounded-xl cn-surface-3 hover:bg-black/10 dark:hover:bg-white/10 cn-text-2 transition-colors" title="Attach media">
          <ImageIcon className="w-4 h-4" />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <div className="flex-1" />
        <button type="button" onClick={() => { removeMedia(); setOpen(false); }} className="px-3 py-2 rounded-xl cn-surface-3 text-sm cn-text-2 hover:bg-black/10 dark:hover:bg-white/10">Cancel</button>
        <button type="submit" disabled={loading || (!body.trim() && !mediaFile)}
          className="px-4 py-2 cn-action bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}<Send className="w-4 h-4" /> Post
        </button>
      </div>
    </form>
  );
}

// ── Highlights panel ──────────────────────────────────────

// ── Files Tab ─────────────────────────────────────────────

function FilesTab({ hubSlug, spaceSlug, tunnelUrl, authToken }: { hubSlug: string; spaceSlug: string; tunnelUrl: string; authToken?: string }) {
  const [files, setFiles] = useState<HubSpaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; mime?: string; name: string } | null>(null);

  useEffect(() => {
    spacesService.getFiles(hubSlug, spaceSlug)
      .then(setFiles).catch(() => {}).finally(() => setLoading(false));
  }, [hubSlug, spaceSlug]);

  function getFileUrl(fileName: string) {
    const base = `${tunnelUrl}/api/spaces/${spaceSlug}/files/${encodeURIComponent(fileName)}`;
    return authToken ? `${base}?token=${encodeURIComponent(authToken)}` : base;
  }

  async function handlePreview(file: HubSpaceFile) {
    setPreview({ url: getFileUrl(file.file_name), mime: file.mime_type, name: file.file_name });
  }

  return (
    <div className="p-5">
      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin cn-text-4" /></div>}
      {!loading && files.length === 0 && (
        <div className="text-center py-12 cn-text-4 text-sm">No files shared in this space yet.</div>
      )}
      <div className="space-y-2">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl cn-surface-2 border cn-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <div className="w-10 h-10 rounded-xl cn-surface-3 flex items-center justify-center flex-shrink-0">
              {fileTypeIcon(f.mime_type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium cn-text-1 truncate">{f.file_name}</p>
              <p className="text-xs cn-text-4 truncate">
                {f.uploaded_by && `@${f.uploaded_by}`}{f.post_title && ` · ${f.post_title}`} {formatBytes(f.size_bytes) && `· ${formatBytes(f.size_bytes)}`}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {(isImage(f.mime_type) || isVideo(f.mime_type)) && (
                <button onClick={() => handlePreview(f)}
                  className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cn-text-3 hover:text-slate-700 dark:hover:text-white transition-colors" title="Preview">
                  <ImageIcon className="w-4 h-4" />
                </button>
              )}
              <a href={getFileUrl(f.file_name)} download={f.file_name}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cn-text-3 hover:text-slate-700 dark:hover:text-white transition-colors" title="Download">
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Preview lightbox */}
      <AnimatePresence>
        {preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreview(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl w-full max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <button onClick={() => setPreview(null)} className="absolute -top-10 right-0 text-white/60 hover:text-white text-sm">Close</button>
              {isImage(preview.mime) ? (
                <img src={preview.url} alt={preview.name} className="w-full max-h-[80vh] object-contain rounded-2xl" />
              ) : isVideo(preview.mime) ? (
                <video src={preview.url} controls autoPlay className="w-full max-h-[80vh] rounded-2xl bg-black" />
              ) : null}
              <p className="text-center text-xs text-white/50 mt-2">{preview.name}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Space Info Sidebar ────────────────────────────────────

function SpaceInfoSidebar({ space, hubSlug, posts }: {
  space: HubSpace;
  hubSlug: string;
  posts: HubPost[];
}) {
  const topPosters = [...posts].reduce((acc, p) => {
    if (!p.author_id) return acc;
    const current = acc.get(p.author_id) ?? { username: p.author_username, count: 0 };
    current.count++;
    acc.set(p.author_id, current);
    return acc;
  }, new Map<string, { username: string; count: number }>());
  const [showBroadcastSetup, setShowBroadcastSetup] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveCommsItem[]>([]);
  const { joinAsViewer } = useBroadcast();
  const isActiveSpaceMember = space.my_status === 'active';

  // Space-scoped live list — GET /api/comms/live?space_slug=X, membership-
  // checked server-side, never includes hub-wide broadcasts/rooms. Same
  // 10s poll cadence as Messages' own hub-wide Live strip.
  useEffect(() => {
    if (!isActiveSpaceMember) return;
    let cancelled = false;
    const load = () => hubService.listLiveComms(hubSlug, space.slug).then(items => { if (!cancelled) setLiveItems(items); }).catch(() => {});
    load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [hubSlug, space.slug, isActiveSpaceMember]);

  return (
    <div className="p-4 space-y-5">
      {/* Live — same comms system Messages uses, now genuinely scoped to
          this space (2026-09-08): the backend re-checks active space
          membership on every join of a broadcast/room created with this
          space's slug, and GET /api/comms/live?space_slug=X only ever
          returns this space's own live items, never hub-wide ones (and vice
          versa — this space's broadcasts don't leak into Messages' hub-wide
          Live strip either). (No call button here — 1:1 calls don't fit a
          space's membership and group-room calling has no UI yet.) */}
      <div>
        <p className="text-[11px] font-semibold cn-text-4 uppercase tracking-widest mb-2">Live</p>
        {liveItems.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-2 -mx-1 px-1">
            {liveItems.map(item => (
              <LiveCard key={item.room_name} item={item} onClick={() => joinAsViewer(item)} />
            ))}
          </div>
        )}
        <button onClick={() => setShowBroadcastSetup(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors">
          <Radio className="w-3.5 h-3.5" /> Broadcast to space
        </button>
      </div>
      {showBroadcastSetup && (
        <BroadcastSetupModal open={showBroadcastSetup} onClose={() => setShowBroadcastSetup(false)} initialTitle={`Live from ${space.name}`} spaceSlug={space.slug} />
      )}
      
      {/* About */}
      {space.description && (
        <div>
          <p className="text-[11px] font-semibold cn-text-4 uppercase tracking-widest mb-2">About</p>
          <p className="text-sm cn-text-2 leading-relaxed">{space.description}</p>
        </div>
      )}

      

      {/* Top contributors */}
      {topPosters.size > 0 && (
        <div>
          <p className="text-[11px] font-semibold cn-text-4 uppercase tracking-widest mb-2">Top Contributors</p>
          <div className="space-y-1">
            {[...topPosters.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4).map(([authorId, contributor]) => (
              <div key={authorId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                <AvatarCircle
                  authorId={authorId}
                  authorUsername={contributor.username}
                  authorAvatarUrl={hubService.getAvatarUrl(hubSlug, authorId) ?? undefined}
                  size="sm"
                />
                <span className="text-xs cn-text-2 flex-1 truncate">{contributor.username}</span>
                <span className="text-[11px] cn-text-4">{contributor.count} post{contributor.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Space Initiatives ─────────────────────────────────────
// Projects that named this space as their home (Initiative.space_id) — real
// initiatives, pre-filtered to this space rather than a new endpoint. Reuses
// InitiativesScreen's own InitiativeCard component directly (size="compact")
// rather than a separate lookalike, so a project looks exactly like the same
// "kind of thing" here as it does on its own screen — just smaller.

function spaceInitiativeTaskCount(tasks: Initiative['tasks']) {
  return { done: tasks.filter(t => t.status === 'done').length, total: tasks.length };
}

function spaceInitiativeBannerUrl(hubSlug: string, initiative: Initiative) {
  return initiative.banner_mode === 'image' && initiative.banner_image_file_name
    ? initiativesService.getBannerUrl(hubSlug, initiative.id)
    : null;
}

// ── Initiative activity in the feed ────────────────────────
// Surfaces a space's own initiatives' activity log (task/resource/team/update
// entries) inline in the space's post feed, styled as a feed item — same
// idea as citinet-mobile's dashboard "Initiatives" strip (app/(tabs)/
// index.tsx's fetchInitiativeUpdates), merged straight into the chronological
// post list here instead of a separate carousel, matching how this screen's
// feed already reads.
//
// Deliberately simpler than the mobile version in one way: no re-validation
// against the initiative's *current* task/resource state to catch a reopened
// task or un-provided resource. That logic there assumes a 'task' row is
// only ever about completion — but the server also logs "added a new task",
// "left a note on…", and "unassigned…" under the same 'task' kind (see
// api/server.js's hub_initiative_activity inserts), so that assumption
// doesn't hold here. Entries are shown as the immutable log they are.
const ACTIVITY_ICON: Record<InitiativeActivityEntry['kind'], LucideIcon> = {
  task: CheckCircle2, resource: Package, team: Users, update: MessageSquare, member: UserPlus,
};

interface SpaceInitiativeActivityItem extends InitiativeActivityEntry {
  initiativeId: string;
  initiativeTitle: string;
}

async function fetchSpaceInitiativeActivity(hubSlug: string, spaceId: string): Promise<SpaceInitiativeActivityItem[]> {
  const initiatives = await initiativesService.listAll(hubSlug)
    .then(all => all.filter(i => i.space_id === spaceId))
    .catch(() => [] as Initiative[]);
  const perInitiative = await Promise.all(
    initiatives.map(initiative =>
      initiativesService.getActivity(hubSlug, initiative.id, 5)
        .then(entries => entries.map(entry => ({ ...entry, initiativeId: initiative.id, initiativeTitle: initiative.title })))
        .catch(() => [] as SpaceInitiativeActivityItem[])
    )
  );
  return perInitiative.flat();
}

function InitiativeActivityCard({ item, onOpen }: { item: SpaceInitiativeActivityItem; onOpen: () => void }) {
  const Icon = ACTIVITY_ICON[item.kind] ?? CheckCircle2;
  return (
    <div onClick={onOpen}
      className="max-w-2xl mx-auto cn-surface-2 border cn-border rounded-2xl p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg cn-surface-3 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 cn-text-3" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm cn-text-2 leading-snug">
          <b className="cn-text-1 font-semibold">{item.actor_name}</b> {item.text}
        </p>
        <p className="text-xs cn-text-4 mt-0.5 truncate">on {item.initiativeTitle}</p>
      </div>
      <span className="text-xs cn-text-4 shrink-0">{timeAgo(item.created_at)}</span>
    </div>
  );
}

// One full row at the grid's widest breakpoint (see grid-cols-2 sm:grid-cols-4
// below) — "latest" because the API already returns initiatives newest-first.
const INITIATIVES_PAGE_SIZE = 4;

function SpaceInitiativesSection({ hubSlug, spaceId }: { hubSlug: string; spaceId: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    initiativesService.listAll(hubSlug)
      .then(all => { if (!cancelled) { setItems(all.filter(i => i.space_id === spaceId)); setPage(0); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hubSlug, spaceId]);

  function startInitiative() {
    sessionStorage.setItem('citinet-deeplink-initiative-space', spaceId);
    navigate(hubPath('/initiatives'));
  }

  if (loading) return null; // avoids a flash of "no initiatives yet" before the real list arrives

  const pageCount = Math.ceil(items.length / INITIATIVES_PAGE_SIZE);
  const clampedPage = Math.min(page, Math.max(0, pageCount - 1));
  const pageItems = items.slice(clampedPage * INITIATIVES_PAGE_SIZE, (clampedPage + 1) * INITIATIVES_PAGE_SIZE);

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold cn-text-3">Initiatives from this space</span>
        <button onClick={startInitiative}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-surface-2 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium cn-text-2 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Start an initiative
        </button>
      </div>
      {items.length === 0 && (
        <div className="cn-surface-2 border cn-border rounded-xl px-4 py-3 text-xs cn-text-4">
          No projects started from this space yet — any member can start one.
        </div>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {pageItems.map(i => (
            <InitiativeCard
              key={i.id}
              initiative={i}
              bannerUrl={spaceInitiativeBannerUrl(hubSlug, i)}
              taskCount={spaceInitiativeTaskCount(i.tasks)}
              onOpen={() => navigate(hubPath(`/initiatives/${i.id}`))}
              size="compact"
            />
          ))}
        </div>
      )}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            aria-label="Previous initiatives"
            className="w-6 h-6 rounded-full cn-surface border cn-border flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-default hover:border-blue-300/60 dark:hover:border-blue-500/30 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 cn-text-2" />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                aria-label={`Go to page ${i + 1}`}
                className={`rounded-full transition-all ${i === clampedPage ? 'w-4 h-1.5 bg-blue-500' : 'w-1.5 h-1.5 cn-surface-3 hover:bg-blue-300/60 dark:hover:bg-blue-500/30'}`}
              />
            ))}
          </div>
          <button
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={clampedPage === pageCount - 1}
            aria-label="Next initiatives"
            className="w-6 h-6 rounded-full cn-surface border cn-border flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-default hover:border-blue-300/60 dark:hover:border-blue-500/30 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 cn-text-2" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Space Detail ──────────────────────────────────────────

type SpaceTab = 'feed' | 'initiatives' | 'members' | 'files' | 'settings';

function SpaceDetail({ hubSlug, space, myUserId, tunnelUrl, authToken, currentUser, onSpaceUpdated, onSpaceDeleted }: {
  hubSlug: string; space: HubSpace; myUserId?: string;
  tunnelUrl: string; authToken?: string;
  currentUser?: HubUser;
  onSpaceUpdated: (s: HubSpace) => void;
  onSpaceDeleted: (spaceId: string) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SpaceTab>('feed');
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [initiativeActivity, setInitiativeActivity] = useState<SpaceInitiativeActivityItem[]>([]);
  const [members, setMembers] = useState<HubSpaceMember[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [sharingPost, setSharingPost] = useState<string | null>(null);
  const [sharedPosts, setSharedPosts] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);
  // Post-card interactions — same hubService/writeQueueService calls Feed
  // uses. These work unmodified for space posts because a space post is a
  // real hub_posts row (space_id set) once created through the general
  // /api/posts endpoint (see PostComposer/hubService.createPost) — the same
  // like/delete/vote/poll routes Feed calls already handle that row.
  const [postDeleting, setPostDeleting] = useState<string | null>(null);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | null>(null);
  const [pollVoting, setPollVoting] = useState<string | null>(null);
  const [pollClosing, setPollClosing] = useState<string | null>(null);
  const [pollReopening, setPollReopening] = useState<string | null>(null);
  const [pollDeleting, setPollDeleting] = useState<string | null>(null);
  const { ids: savedPostIds, toggle: toggleSavedPost } = useSavedIds('saved_posts', 'saved_posts');
  // Settings
  const [settingsName, setSettingsName] = useState(space.name);
  const [settingsDesc, setSettingsDesc] = useState(space.description || '');
  const [settingsVis, setSettingsVis] = useState(space.visibility);
  const [settingsCategory, setSettingsCategory] = useState<HubSpaceCategory | ''>((space.category as HubSpaceCategory) || '');
  const [settingsWebPublic, setSettingsWebPublic] = useState(!!space.web_public);
  const [spaceLinkCopied, setSpaceLinkCopied] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Banner editor
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Mobile header collapse
  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const contentRef = useRef<HTMLDivElement>(null);

  const isActive = space.my_status === 'active';
  const isPending = space.my_status === 'pending';

  const [spaceAppInfo, setSpaceAppInfo] = useState<{ name: string; faviconUrl?: string; websiteUrl?: string } | null>(null);
  useEffect(() => {
    fetch(`${tunnelUrl}/api/spaces/app-info`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSpaceAppInfo(d))
      .catch(() => {});
  }, [tunnelUrl]);
  const isInvited = space.my_status === 'invited';
  const isAdmin = canManage(space.my_role);
  const isProxySocietySpace = /^c[a-z0-9]{20,}$/.test(space.slug);
  // Hub-wide moderator status (same definition Feed/ToolkitScreen use) — not
  // to be confused with `isAdmin` above, which is this SPACE's own owner/admin
  // role. Governs the PostComposer's poll-to-governance-request link, which is
  // a hub-wide governance action regardless of which space the poll posts in.
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isHubMod = currentUser?.hubRole === 'admin' || currentUser?.hubRole === 'moderator'
    || currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);
  const hubCenter = useHubGeoCenter() ?? undefined;
  const { currentHub } = useHub();

  useEffect(() => {
    setTab('feed'); setPosts([]); setMembers([]);
    setSettingsName(space.name); setSettingsDesc(space.description || ''); setSettingsVis(space.visibility);
    setSettingsCategory((space.category as HubSpaceCategory) || '');
    setSettingsWebPublic(!!space.web_public);
    setSettingsSaved(false); setShowBannerEditor(false);
    setScrollY(0);
  }, [space.id]);

  // Handle scroll for collapsing banner on mobile
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) setScrollY(contentRef.current.scrollTop);
    };
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    const el = contentRef.current;
    el?.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    return () => {
      el?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (tab === 'feed' && isActive) {
      setPostsLoading(true);
      spacesService.getPosts(hubSlug, space.slug).then(setPosts).catch(() => {}).finally(() => setPostsLoading(false));
      fetchSpaceInitiativeActivity(hubSlug, space.id).then(setInitiativeActivity).catch(() => {});
      // Also load members for the sidebar
      if (members.length === 0) {
        setMembersLoading(true);
        spacesService.getMembers(hubSlug, space.slug).then(setMembers).catch(() => {}).finally(() => setMembersLoading(false));
      }
    }
    if (tab === 'members') {
      setMembersLoading(true);
      spacesService.getMembers(hubSlug, space.slug).then(setMembers).catch(() => {}).finally(() => setMembersLoading(false));
    }
  }, [tab, space.slug, isActive]);

  async function handleJoin() {
    setActionLoading(true); setError('');
    try {
      const { status } = await spacesService.join(hubSlug, space.slug);
      onSpaceUpdated({ ...space, my_status: status as any, my_role: status === 'active' ? 'member' : null });
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(false); }
  }
  async function handleLeave() {
    setActionLoading(true); setError('');
    try {
      await spacesService.leave(hubSlug, space.slug);
      onSpaceUpdated({ ...space, my_status: null, my_role: null });
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(false); }
  }
  async function handleAcceptInvite() {
    setActionLoading(true); setError('');
    try {
      await spacesService.acceptInvite(hubSlug, space.slug);
      onSpaceUpdated({ ...space, my_status: 'active', my_role: 'member' });
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(false); }
  }
  async function handleApproveMember(userId: string) {
    try {
      await spacesService.updateMember(hubSlug, space.slug, userId, { status: 'active' });
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, status: 'active' } : m));
    } catch {}
  }
  async function handleRemoveMember(userId: string) {
    try {
      await spacesService.removeMember(hubSlug, space.slug, userId);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch {}
  }
  async function handleShareToFeed(postId: string) {
    setSharingPost(postId);
    try {
      await spacesService.shareToFeed(hubSlug, postId);
      setSharedPosts(prev => new Set([...prev, postId]));
    } catch {}
    finally { setSharingPost(null); }
  }

  async function handlePostLike(post: HubPost) {
    const wasLiked = !!post.my_liked;
    const optimistic = (p: HubPost): HubPost => ({
      ...p,
      my_liked: !wasLiked,
      like_count: Math.max(0, (p.like_count ?? 0) + (wasLiked ? -1 : 1)),
    });
    setPosts(ps => ps.map(p => (p.id === post.id ? optimistic(p) : p)));
    setSelectedPost(sp => (sp && sp.id === post.id ? optimistic(sp) : sp));
    try {
      const result = await hubService.toggleLike(hubSlug, post.id);
      const reconcile = (p: HubPost): HubPost => ({ ...p, my_liked: result.liked, like_count: result.count });
      setPosts(ps => ps.map(p => (p.id === post.id ? reconcile(p) : p)));
      setSelectedPost(sp => (sp && sp.id === post.id ? reconcile(sp) : sp));
    } catch {
      setPosts(ps => ps.map(p => (p.id === post.id ? post : p)));
      setSelectedPost(sp => (sp && sp.id === post.id ? post : sp));
    }
  }

  async function handlePostDelete(postId: string) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setPostDeleting(postId);
    try {
      await hubService.deletePost(hubSlug, postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setSelectedPost(sp => (sp?.id === postId ? null : sp));
    } catch { /* non-critical */ }
    setPostDeleting(null);
  }

  async function handlePollVote(post: HubPost, optionIndex: number) {
    const poll = post.poll;
    if (!poll || poll.closed || (poll.closes_at && new Date(poll.closes_at) < new Date())) return;
    setPollVoting(post.id);
    const prevPosts = posts;
    const optimistic = (p: HubPost): HubPost => {
      if (!p.poll) return p;
      const newCounts = [...p.poll.vote_counts];
      if (p.poll.my_vote != null) newCounts[p.poll.my_vote] = Math.max(0, newCounts[p.poll.my_vote] - 1);
      newCounts[optionIndex]++;
      const totalDelta = p.poll.my_vote != null ? 0 : 1;
      return { ...p, poll: { ...p.poll, vote_counts: newCounts, my_vote: optionIndex, total_votes: p.poll.total_votes + totalDelta } };
    };
    setPosts(ps => ps.map(p => (p.id === post.id ? optimistic(p) : p)));
    setSelectedPost(sp => (sp && sp.id === post.id ? optimistic(sp) : sp));
    try {
      await voteOrQueue(hubSlug, post.id, optionIndex);
    } catch {
      setPosts(prevPosts);
      setSelectedPost(sp => (sp && sp.id === post.id ? prevPosts.find(p => p.id === post.id) ?? sp : sp));
    } finally {
      setPollVoting(null);
    }
  }

  async function handlePollClose(postId: string) {
    setPollClosing(postId);
    try {
      const result = await hubService.closePoll(hubSlug, postId);
      setPosts(ps => ps.map(p => (p.id === postId && p.poll ? { ...p, poll: { ...p.poll, closed: true, passed: result.passed } } : p)));
    } catch { /* non-critical */ }
    setPollClosing(null);
  }

  async function handlePollReopen(postId: string) {
    setPollReopening(postId);
    try {
      await hubService.reopenPoll(hubSlug, postId);
      const refreshed = await spacesService.getPosts(hubSlug, space.slug).catch(() => null);
      if (refreshed) setPosts(refreshed);
    } catch { /* non-critical */ }
    setPollReopening(null);
  }

  async function handlePollDelete(postId: string) {
    if (!confirm('Delete this poll? This cannot be undone.')) return;
    setPollDeleting(postId);
    try {
      await hubService.deletePost(hubSlug, postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setSelectedPost(sp => (sp?.id === postId ? null : sp));
    } catch { /* non-critical */ }
    setPollDeleting(null);
  }

  function handleCopyPostLink(postId: string) {
    const link = `${window.location.origin}${hubPath(`/feed/${postId}`)}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopyLinkFeedback(postId);
      setTimeout(() => setCopyLinkFeedback(null), 2000);
    });
  }

  // Mirrors citinet-mobile's Home initiativeActivityHref() (app/(tabs)/
  // index.tsx:187): a task-kind card goes to that specific task's tracker
  // (best-effort resolved by substring-matching this entry's sentence against
  // the initiative's current task titles — the activity log carries no
  // ref_id back to the task itself), resource → the Resources tab, team →
  // the Team tab, anything else (an unresolved task match, or an
  // unrecognized activity kind) → the initiative's own overview. Unlike
  // mobile, an unresolved task match still lands on the Tasks tab rather
  // than the bare overview — this screen has a real tab to send it to.
  // InitiativesScreen has no routed sub-URL for a tab or a task (activeTab
  // is client state, not part of the path), so the destination tab/task
  // travels the same sessionStorage-flag way every other cross-screen
  // deep-link in this app already does.
  async function openInitiativeActivity(item: SpaceInitiativeActivityItem) {
    const goTo = (tab: 'tasks' | 'resources' | 'team' | 'overview', taskId?: string) => {
      if (tab !== 'overview') {
        sessionStorage.setItem('citinet-deeplink-initiative-tab', JSON.stringify({ initiativeId: item.initiativeId, tab, taskId }));
      }
      navigate(hubPath(`/initiatives/${item.initiativeId}`));
    };
    if (item.kind === 'task') {
      try {
        const initiative = await initiativesService.get(hubSlug, item.initiativeId);
        const matchedTask = initiative.tasks.find(t => item.text.includes(t.title));
        goTo('tasks', matchedTask?.id);
      } catch {
        goTo('tasks');
      }
      return;
    }
    if (item.kind === 'resource') { goTo('resources'); return; }
    if (item.kind === 'team') { goTo('team'); return; }
    goTo('overview');
  }
  async function handleDelete() {
    setDeleting(true); setSettingsError('');
    try {
      await spacesService.deleteSpace(hubSlug, space.slug);
      onSpaceDeleted(space.id);
    } catch (err: any) { setSettingsError(err.message); setDeleting(false); setConfirmDelete(false); }
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true); setSettingsError(''); setSettingsSaved(false);
    try {
      const updated = await spacesService.update(hubSlug, space.slug, { name: settingsName, description: settingsDesc, visibility: settingsVis, web_public: settingsWebPublic, category: settingsCategory });
      onSpaceUpdated(updated); setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) { setSettingsError(err.message); }
    finally { setSettingsSaving(false); }
  }
  async function saveBannerStyle(fields: { banner_mode: string; banner_color?: string; banner_gradient_from?: string; banner_gradient_to?: string }) {
    setBannerSaving(true);
    try {
      const updated = await spacesService.update(hubSlug, space.slug, fields);
      onSpaceUpdated(updated);
    } catch {}
    finally { setBannerSaving(false); }
  }
  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerSaving(true);
    try {
      await spacesService.uploadBanner(hubSlug, space.slug, file);
      const updated = await spacesService.get(hubSlug, space.slug);
      onSpaceUpdated(updated);
    } catch {}
    finally { setBannerSaving(false); }
  }

  const bannerStyle = getBannerStyle(space, tunnelUrl);
  const tabs: SpaceTab[] = ['feed', 'initiatives', 'members', 'files', ...(isAdmin ? ['settings' as SpaceTab] : [])];

  // Posts and initiative activity merged into one chronological feed list.
  type FeedItem = { kind: 'post'; createdAt: string; post: HubPost } | { kind: 'activity'; createdAt: string; activity: SpaceInitiativeActivityItem };
  const feedItems: FeedItem[] = useMemo(() => {
    const postItems: FeedItem[] = posts.map(post => ({ kind: 'post', createdAt: post.created_at, post }));
    const activityItems: FeedItem[] = initiativeActivity.map(activity => ({ kind: 'activity', createdAt: activity.created_at, activity }));
    return [...postItems, ...activityItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, initiativeActivity]);

  // Collapsing banner: on mobile shrinks from 160px → 56px as user scrolls 80px
  const BANNER_FULL = 160;
  const BANNER_MIN = 56;
  const SCROLL_RANGE = 80; // px of scroll to complete the collapse
  const collapseRatio = isMobile ? Math.min(1, scrollY / SCROLL_RANGE) : 0;
  const bannerHeight = isMobile ? Math.round(BANNER_FULL - collapseRatio * (BANNER_FULL - BANNER_MIN)) : 208;
  const bannerContentOpacity = 1 - collapseRatio * 1.6; // fades out before fully collapsed

  return (
    // Two-column at lg+ (feed/tabs on the left, About/Live/Members flush with
    // the banner's own top edge on the right); a single stacked column below
    // that, main content first then the sidebar's info — same content, just
    // reflowed, not hidden. Scroll ownership is responsive too: below lg this
    // OUTER div is the one true scrolling surface (so the sidebar stacked
    // beneath the feed is actually reachable), which is also what the mobile
    // banner-collapse effect below tracks (contentRef moved here from the
    // inner tab-content div for exactly that reason). At lg+ this div stops
    // scrolling itself (lg:overflow-hidden) and each column scrolls on its
    // own instead, like a normal two-pane layout.
    <div ref={contentRef} className="flex flex-col lg:flex-row h-full overflow-y-auto lg:overflow-hidden">
    <div className="flex flex-col flex-1 min-w-0 lg:overflow-hidden">
      {/* Banner — collapses on mobile as user scrolls */}
      <div className="relative flex-shrink-0" style={{ ...bannerStyle, height: `${bannerHeight}px`, transition: 'height 0.15s ease-out' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />
        {isAdmin && (
          <button onClick={() => setShowBannerEditor(v => !v)}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors z-10" title="Customize banner">
            {bannerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
          </button>
        )}
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 flex items-end justify-between"
          style={{ opacity: Math.max(0, bannerContentOpacity) }}>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${space.visibility === 'public' ? 'bg-emerald-900/70 text-emerald-300' : space.visibility === 'private' ? 'bg-amber-900/70 text-amber-300' : 'bg-zinc-800/70 text-zinc-400'}`}>
                {visibilityIcon(space.visibility)} {visibilityLabel(space.visibility)}
              </span>
              {(() => { const cat = categoryOf(space); return cat && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm bg-white/15 text-white">
                  <cat.Icon className="w-3 h-3" /> {cat.label}
                </span>
              ); })()}
              {space.web_public && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(spacesService.getPublicSpaceLink(hubSlug, space.slug));
                    setSpaceLinkCopied(true);
                    setTimeout(() => setSpaceLinkCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm bg-sky-900/70 text-sky-300 hover:bg-sky-800/80 transition-colors cursor-pointer">
                  {spaceLinkCopied ? <><Check className="w-3 h-3" /> Copied!</> : <><Globe className="w-3 h-3" /> Web · Copy link</>}
                </button>
              )}
              {space.my_role && <span className="text-xs text-white/60 capitalize">{space.my_role}</span>}
            </div>
            <h1 className="text-xl font-bold text-white drop-shadow leading-tight">{space.name}</h1>
            <p className="text-sm text-white/60 mt-0.5 flex items-center gap-2">
              <span>{Number(space.member_count) || 0} member{Number(space.member_count) !== 1 ? 's' : ''}</span>
              {Number(space.online_count) > 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="cn-live-dot w-1.5 h-1.5" />{space.online_count} online
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {error && <p className="text-xs text-red-400">{error}</p>}
            {isInvited && (
              <button onClick={handleAcceptInvite} disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept Invite
              </button>
            )}
            {isPending && !isInvited && <span className="px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-sm text-sm text-zinc-300">Pending Approval</span>}
            {!space.my_status && (
              <button onClick={handleJoin} disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {space.visibility === 'private' ? 'Request to Join' : 'Join Space'}
              </button>
            )}
            {isActive && space.my_role !== 'owner' && (
              <button onClick={handleLeave} disabled={actionLoading}
                className="px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-sm hover:bg-black/60 text-xs text-white/70 flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Leave
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banner editor */}
      <AnimatePresence>
        {showBannerEditor && isAdmin && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex-shrink-0 px-5 py-3 border-b cn-border cn-surface space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold cn-text-2">Banner Style</p>
              <button onClick={() => bannerInputRef.current?.click()} disabled={bannerSaving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-surface-2 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium cn-text-2 transition-colors">
                <ImagePlus className="w-3.5 h-3.5" /> Upload Image
              </button>
            </div>
            <div>
              <p className="text-[11px] cn-text-4 mb-1.5">Solid Colors</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_SOLID_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => saveBannerStyle({ banner_mode: 'solid', banner_color: color })}
                    title={`Select color ${color}`} aria-label={`Select color ${color}`}
                    className="w-7 h-7 rounded-full border-2 border-slate-300 dark:border-zinc-600 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] cn-text-4 mb-1.5">Gradients</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_GRADIENTS.map((g, i) => (
                  <button key={i} type="button" onClick={() => saveBannerStyle({ banner_mode: 'gradient', banner_gradient_from: g.from, banner_gradient_to: g.to })}
                    title={`Select gradient ${g.from} to ${g.to}`} aria-label={`Select gradient ${g.from} to ${g.to}`}
                    className="w-14 h-7 rounded-full border-2 border-slate-300 dark:border-zinc-600 hover:scale-105 transition-transform"
                    style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      {isActive && (
        <div className="flex border-b cn-border px-6 flex-shrink-0 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 px-1 mr-6 text-sm font-medium border-b-2 -mb-px capitalize whitespace-nowrap transition-colors ${tab === t ? 'border-blue-500 cn-text-1' : 'border-transparent cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300'}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Content — scrolls on its own only at lg+ (see the outer wrapper's
          comment above); below lg it's just normal block flow inside that
          outer scroll. */}
      <div className="flex-1 lg:overflow-y-auto">
        {/* Not a member */}
        {!isActive && !isPending && !isInvited && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl cn-surface-2 flex items-center justify-center mb-4"><Users className="w-7 h-7 cn-text-4" /></div>
            <h3 className="text-base font-semibold cn-text-1 mb-1">Join to participate</h3>
            <p className="text-sm cn-text-4">{space.visibility === 'invite-only' ? 'This space is invite-only. Ask an admin to invite you.' : space.visibility === 'private' ? 'Request to join — an admin will approve you.' : 'Join this space to read posts and contribute.'}</p>
          </div>
        )}
        {isPending && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-800 flex items-center justify-center mb-4"><Loader2 className="w-7 h-7 text-amber-600 dark:text-amber-400 animate-spin" /></div>
            <h3 className="text-base font-semibold cn-text-1 mb-1">Request pending</h3>
            <p className="text-sm cn-text-4">An admin will review your request to join.</p>
          </div>
        )}

        {/* Feed tab — About/Live/Members now live in the persistent right
            column below (sibling to this whole left column), not nested in
            here, so they show next to every tab, not just Feed. */}
        {isActive && tab === 'feed' && (
            <div className="p-5 space-y-4">
              {/* Same composer Feed uses (Poll/Event/Photo/Video/Place, full parity) — just
                  scoped to this space via spaceSlug. Proxied Society+ spaces keep the older,
                  plainer ComposePost below: their posts route through a different backend
                  (proxyToApp) that doesn't understand poll/event fields, and isSPSlug-shaped
                  slugs are rejected server-side if sent here regardless. */}
              {isProxySocietySpace ? (
                <ComposePost hubSlug={hubSlug} spaceSlug={space.slug} onPosted={p => setPosts(prev => [p, ...prev])} />
              ) : (
                // PostComposer has no built-in max-width of its own — in Feed it's
                // constrained by the parent grid's fixed 600px column instead. Here
                // there's no such grid, so it needs the same explicit max-w-2xl
                // mx-auto the old ComposePost and every post card below already use,
                // or it stretches to the full (much wider) unconstrained panel.
                <div className="max-w-2xl mx-auto w-full">
                  <PostComposer
                    hubSlug={hubSlug}
                    hubCenter={hubCenter}
                    isMod={isHubMod}
                    currentUserId={currentUser?.hubUserId}
                    currentUserName={currentUser?.displayName || currentUser?.username || '?'}
                    currentUserAvatarUrl={hubSlug && currentUser?.hubUserId ? hubService.getAvatarUrl(hubSlug, currentUser.hubUserId) ?? undefined : currentUser?.avatarUrl ?? undefined}
                    onPostCreated={p => setPosts(prev => [p, ...prev])}
                    onOpenFullComposer={() => {}}
                    activeFilter={null}
                    spaceSlug={space.slug}
                  />
                </div>
              )}
              {postsLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin cn-text-4" /></div>}
              {!postsLoading && feedItems.length === 0 && <div className="text-center py-12 cn-text-4 text-sm">No posts yet. Be the first to share something.</div>}
              {feedItems.map(item => {
                if (item.kind === 'activity') {
                  return (
                    <InitiativeActivityCard
                      key={`activity-${item.activity.id}`}
                      item={item.activity}
                      onOpen={() => openInitiativeActivity(item.activity)}
                    />
                  );
                }
                const post = item.post;
                // SP proxy posts carry a direct R2 URL in media_url; local posts use the auth-token space-files endpoint
                const mediaUrl = (post as any).media_url
                  ?? (post.media_file_name ? `${tunnelUrl}/api/spaces/${space.slug}/files/${encodeURIComponent(post.media_file_name)}${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}` : null);
                const isVidMedia = post.media_file_name?.match(/\.(mp4|webm|mov)$/i) || (post as any).media_url?.match(/\.(mp4|webm|mov)$/i);
                const authorUsername = (post.author_username || '').trim();
                const authorUsernameLower = authorUsername.toLowerCase();
                const externalSourceMeta = (post as any).source || (post as any).platform || (post as any).origin || (post as any).source_app;
                const isExternalProxyAuthor = isProxySocietySpace && (
                  !!externalSourceMeta
                  || authorUsernameLower === 'email'
                  || authorUsernameLower.includes('@')
                  || !post.author_id
                );
                const sourceBrandName = spaceAppInfo?.name
                  || (post as any).source_name
                  || (post as any).app_name
                  || (post as any).platform_name
                  || (post as any).source
                  || 'Society+';
                const sourceBrandLogo = spaceAppInfo?.faviconUrl
                  || (post as any).source_logo_url
                  || (post as any).source_favicon_url
                  || null;
                // Proxied Society+ posts keep the older, plainer card — they carry source
                // branding (Shared from…) PostCard/PollFeedCard have no slot for, and
                // aren't real hub_posts rows the like/vote/delete routes below understand.
                if (isExternalProxyAuthor) {
                  return (
                    <div key={post.id} onClick={() => setSelectedPost(post)}
                      className="max-w-2xl mx-auto cn-surface-2 border cn-border rounded-2xl p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-2 mb-3">
                        <a
                          href={spaceAppInfo?.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full cn-surface border cn-border hover:border-slate-400 dark:hover:border-zinc-500 transition-colors"
                        >
                          {sourceBrandLogo
                            ? <img src={sourceBrandLogo} className="w-3.5 h-3.5 rounded-sm object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <LayoutGrid className="w-3 h-3 cn-text-3" />
                          }
                          <span className="text-[10px] font-semibold uppercase tracking-wide cn-text-4">Shared from</span>
                          <span className="text-xs font-semibold cn-text-2 leading-none">{sourceBrandName}</span>
                        </a>
                        <span className="text-xs cn-text-4 ml-auto">{timeAgo(post.created_at)}</span>
                      </div>
                      {post.body && (() => {
                        const { truncated, isTruncated } = truncateText(post.body);
                        return <p className="text-sm cn-text-3 leading-relaxed">{truncated}{isTruncated && <span className="cn-text-2 font-medium"> Click to read more</span>}</p>;
                      })()}
                      {mediaUrl && (
                        <div className="mt-3 rounded-xl overflow-hidden">
                          {isVidMedia
                            ? <video src={mediaUrl} controls preload="auto" className="w-full max-h-64 object-contain bg-black rounded-xl" />
                            : <img src={mediaUrl} alt={post.title ?? ''} className="w-full max-h-64 object-cover rounded-xl" />}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t cn-border">
                        <span className="text-xs cn-text-4 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {post.reply_count}</span>
                      </div>
                    </div>
                  );
                }

                // Local space posts — same PostCard/PollFeedCard components and the
                // same hubService/writeQueueService calls Feed's own feed uses, so a
                // post looks and behaves identically whether it's viewed here or there.
                const authorAvatarUrl = post.author_id ? hubService.getAvatarUrl(hubSlug, post.author_id) ?? undefined : undefined;
                const canManagePost = isHubMod || post.author_id === myUserId;
                const shareRow = post.author_id === myUserId && !sharedPosts.has(post.id) && !(post as any).shared_to_feed && (
                  <div className="max-w-2xl mx-auto mt-1.5 flex justify-end">
                    <button onClick={() => handleShareToFeed(post.id)} disabled={sharingPost === post.id}
                      className="flex items-center gap-1.5 text-xs cn-text-3 hover:cn-text-1 transition-colors">
                      {sharingPost === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Share to hub feed
                    </button>
                  </div>
                );
                const sharedRow = (sharedPosts.has(post.id) || (post as any).shared_to_feed) && (
                  <div className="max-w-2xl mx-auto mt-1.5 flex justify-end">
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Shared to feed</span>
                  </div>
                );

                if (post.category === 'POLL') {
                  return (
                    <div key={post.id}>
                      <div className="max-w-2xl mx-auto">
                        <PollFeedCard
                          post={post}
                          canManage={canManagePost}
                          voting={pollVoting === post.id}
                          closing={pollClosing === post.id}
                          reopening={pollReopening === post.id}
                          onVote={idx => handlePollVote(post, idx)}
                          onClose={() => handlePollClose(post.id)}
                          onReopen={() => handlePollReopen(post.id)}
                          onEdit={() => setSelectedPost(post)}
                          onDelete={() => handlePollDelete(post.id)}
                          deleting={pollDeleting === post.id}
                          onCopyLink={() => handleCopyPostLink(post.id)}
                          copyLinkActive={copyLinkFeedback === post.id}
                          onNavigateToProfile={post.author_id ? () => navigate(hubPath(`/profile/${post.author_id}`)) : undefined}
                          onLike={() => handlePostLike(post)}
                          onCommentClick={() => setSelectedPost(post)}
                          likeCount={post.like_count}
                          myLiked={post.my_liked}
                          replyCount={post.reply_count}
                          authorAvatarUrl={authorAvatarUrl}
                          currentUserId={myUserId}
                          currentUserAvatarUrl={currentUser?.avatarUrl}
                          saved={savedPostIds.includes(post.id)}
                          onToggleSave={() => toggleSavedPost(post.id)}
                        />
                      </div>
                      {shareRow}
                      {sharedRow}
                    </div>
                  );
                }

                return (
                  <div key={post.id}>
                    <div className="max-w-2xl mx-auto cursor-pointer" onClick={() => setSelectedPost(post)}>
                      <PostCard
                        id={post.id}
                        variant={postCardVariant(post.media_file_name, mediaUrl)}
                        category={post.category}
                        title={post.title ?? ''}
                        author={post.author_username}
                        timestamp={timeAgo(post.created_at)}
                        content={post.body}
                        mediaUrl={mediaUrl ?? undefined}
                        replyCount={post.reply_count}
                        likeCount={post.like_count}
                        myLiked={post.my_liked}
                        onLike={() => handlePostLike(post)}
                        onCommentClick={() => setSelectedPost(post)}
                        eventDate={post.event_date}
                        eventLocation={post.event_location}
                        onOpenInAtlas={post.event_location ? () => openLocationInAtlas(post.event_location!, post.event_lat, post.event_lng, screen => navigate(hubPath(`/${screen}`)), currentHub?.location) : undefined}
                        autoPlay={false}
                        authorId={post.author_id ?? undefined}
                        onNavigateToProfile={post.author_id ? () => navigate(hubPath(`/profile/${post.author_id}`)) : undefined}
                        canDelete={currentUser?.isAdmin === true || post.author_id === myUserId}
                        onDelete={() => handlePostDelete(post.id)}
                        deleting={postDeleting === post.id}
                        canEdit={post.author_id === myUserId}
                        onEdit={() => setSelectedPost(post)}
                        onShare={() => handleCopyPostLink(post.id)}
                        shareCopied={copyLinkFeedback === post.id}
                        authorAvatarUrl={authorAvatarUrl}
                        currentUserId={myUserId}
                        currentUserAvatarUrl={currentUser?.avatarUrl}
                        saved={savedPostIds.includes(post.id)}
                        onToggleSave={() => toggleSavedPost(post.id)}
                      />
                    </div>
                    {shareRow}
                    {sharedRow}
                  </div>
                );
              })}
            </div>
        )}

        {/* Initiatives tab */}
        {isActive && tab === 'initiatives' && (
          <div className="p-5">
            <SpaceInitiativesSection hubSlug={hubSlug} spaceId={space.id} />
          </div>
        )}

        {/* Members tab */}
        {isActive && tab === 'members' && (
          <div className="p-5 max-w-2xl">
            {isAdmin && (
              <button onClick={() => setShowInvite(true)} title="Invite members" aria-label="Invite members"
                  className="w-full flex items-center gap-2 justify-center mb-4 py-2.5 rounded-xl border border-dashed cn-border hover:border-blue-600 text-sm cn-text-3 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  <UserPlus className="w-4 h-4" /> Invite hub members
                </button>
            )}
            {membersLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin cn-text-4" /></div>}
            {members.filter(m => m.status === 'pending').length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest cn-text-4 mb-2">Pending Approval</p>
                {members.filter(m => m.status === 'pending').map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5">
                    <MemberAvatar member={m} hubSlug={hubSlug} size="row" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium cn-text-1 truncate">{m.display_name || m.username}</p>
                      <p className="text-xs cn-text-4">@{m.username}</p>
                    </div>
                    {isAdmin && <button onClick={() => handleApproveMember(m.user_id)} title="Approve member" aria-label={`Approve ${m.display_name || m.username}`} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-medium text-white flex items-center gap-1"><Check className="w-3 h-3" /> Approve</button>}
                  </div>
                ))}
              </div>
            )}
            {members.filter(m => m.status === 'active').length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest cn-text-4 mb-2">Members</p>
                {members.filter(m => m.status === 'active').map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5">
                    <MemberPopoverRow member={m} hubSlug={hubSlug} myUserId={myUserId}>
                      <button className="flex-1 min-w-0 flex items-center gap-3 text-left">
                        <MemberAvatar member={m} hubSlug={hubSlug} size="row" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium cn-text-1 truncate">{m.display_name || m.username}</p>
                          <p className="text-xs cn-text-4 capitalize">{m.role}</p>
                        </div>
                      </button>
                    </MemberPopoverRow>
                    {isAdmin && m.user_id !== myUserId && m.role !== 'owner' && (
                      <button onClick={() => handleRemoveMember(m.user_id)} title={`Remove ${m.display_name || m.username}`} aria-label={`Remove ${m.display_name || m.username}`} className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cn-text-4 hover:text-red-500 dark:hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files tab */}
        {isActive && tab === 'files' && (
          <FilesTab hubSlug={hubSlug} spaceSlug={space.slug} tunnelUrl={tunnelUrl} authToken={authToken} />
        )}

        {/* Settings tab */}
        {isActive && tab === 'settings' && isAdmin && (
          <form onSubmit={saveSettings} className="p-5 space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Space Name</label>
              <input value={settingsName} onChange={e => setSettingsName(e.target.value)} required
                className="w-full cn-surface-2 border cn-border rounded-xl px-3 py-2.5 text-sm cn-text-1 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-1">Description</label>
              <textarea value={settingsDesc} onChange={e => setSettingsDesc(e.target.value)} rows={3}
                className="w-full cn-surface-2 border cn-border rounded-xl px-3 py-2.5 text-sm cn-text-1 focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-2">Visibility</label>
              <div className="grid grid-cols-3 gap-2">
                {(['public', 'private', 'invite-only'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setSettingsVis(v)}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors ${settingsVis === v ? 'bg-blue-600 border-blue-500 text-white' : 'cn-surface-2 cn-border cn-text-3 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                    {visibilityLabel(v)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium cn-text-3 mb-2">Category <span className="cn-text-4">(helps neighbors find it in Discover)</span></label>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setSettingsCategory('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${settingsCategory === '' ? 'bg-blue-600 border-blue-500 text-white' : 'cn-surface-2 cn-border cn-text-3 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                  None
                </button>
                {(Object.keys(SPACE_CATEGORY) as HubSpaceCategory[]).map(c => {
                  const { label, Icon } = SPACE_CATEGORY[c];
                  return (
                    <button key={c} type="button" onClick={() => setSettingsCategory(c)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${settingsCategory === c ? 'bg-blue-600 border-blue-500 text-white' : 'cn-surface-2 cn-border cn-text-3 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Web sharing */}
            <div className="pt-1">
              <label className="block text-xs font-medium cn-text-3 mb-2">Web Sharing</label>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl cn-surface-2 border cn-border">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span className="text-sm cn-text-2">Share to open web</span>
                </div>
                <button type="button" onClick={() => setSettingsWebPublic(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${settingsWebPublic ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-600'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settingsWebPublic ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {settingsWebPublic && !space.web_public && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Save settings to activate the share link.</p>
              )}
              {space.web_public && (
                <div className="mt-2 flex items-center gap-2">
                  <button type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(spacesService.getPublicSpaceLink(hubSlug, space.slug));
                      setSpaceLinkCopied(true);
                      setTimeout(() => setSpaceLinkCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors">
                    {spaceLinkCopied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Link2 className="w-3.5 h-3.5" /> Copy share link</>}
                  </button>
                  {canNativeShare() && (
                    <button type="button"
                      onClick={() => nativeShare({ url: spacesService.getPublicSpaceLink(hubSlug, space.slug), title: space.name })}
                      className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors">
                      <Share2 className="w-3.5 h-3.5" /> Share…
                    </button>
                  )}
                  <span className="text-xs cn-text-4">Anyone with the link can read this space.</span>
                </div>
              )}
            </div>
            {settingsError && <p className="text-xs text-red-500 dark:text-red-400">{settingsError}</p>}
            <button type="submit" disabled={settingsSaving}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
              {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : settingsSaved ? <><Check className="w-4 h-4" /> Saved</> : <><Settings className="w-4 h-4" /> Save Settings</>}
            </button>
            {space.my_role === 'owner' && (
              <div className="pt-4 mt-4 border-t cn-border">
                {!confirmDelete ? (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="w-full py-2.5 rounded-xl cn-surface-2 hover:bg-red-50 dark:hover:bg-red-950 border cn-border hover:border-red-300 dark:hover:border-red-800 text-sm cn-text-3 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                    Delete Space
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-red-500 dark:text-red-400 text-center">Permanently deletes the space and membership data. Posts are kept but detached.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl cn-surface-2 text-sm cn-text-2 hover:bg-black/10 dark:hover:bg-white/10">Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
                        {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Yes, Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </div>
    </div>

    {/* Right column — About/Live/Members. A flex sibling of the left column
        above, so at lg+ its top edge starts at the same row-start as the
        banner (the left column's own first child) with no extra gap; below
        lg it just stacks after the entire left column instead of vanishing,
        as part of the outer div's single scroll. Shown for every tab, not
        just Feed. */}
    <div className="lg:w-72 lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l cn-border lg:overflow-y-auto">
      <SpaceInfoSidebar space={space} hubSlug={hubSlug} posts={posts} />
    </div>

      <AnimatePresence>
        {showInvite && <InviteMemberModal hubSlug={hubSlug} spaceSlug={space.slug} onClose={() => setShowInvite(false)} />}
        {selectedPost && (() => {
          const spMedia = (selectedPost as any).media_url as string | undefined;
          // For SP posts inject the direct R2 URL as media_file_name so PostDetailModal can render it
          const modalPost = spMedia ? { ...selectedPost, media_file_name: spMedia } : selectedPost;
          return (
            <PostDetailModal
              isOpen={!!selectedPost}
              onClose={() => setSelectedPost(null)}
              post={modalPost}
              hubSlug={hubSlug}
              currentUserId={myUserId}
              currentUserAvatarUrl={currentUser?.avatarUrl}
              isAdmin={currentUser?.isAdmin}
              publicFileUrl={(name: string) => {
                // Full URL (SP proxy) → return as-is; filename (local) → build auth space-files URL
                if (name.startsWith('http')) return name;
                return `${tunnelUrl}/api/spaces/${space.slug}/files/${encodeURIComponent(name)}${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;
              }}
              onDeleted={(postId: string) => { setPosts(prev => prev.filter(p => p.id !== postId)); setSelectedPost(null); }}
              sourceBrandInfo={spaceAppInfo ?? undefined}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────

export function SpacesScreen({ onBack }: SpacesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const myUserId = currentUser?.hubUserId;
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const authToken = currentUser?.authToken;
  const navigate = useNavigate();
  const { spaceSlug: urlSpaceSlug } = useParams<{ spaceSlug: string }>();

  const [mySpaces, setMySpaces] = useState<HubSpace[]>([]);
  const [allSpaces, setAllSpaces] = useState<HubSpace[]>([]);
  const [selected, setSelected] = useState<HubSpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<HubSpaceCategory | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function selectSpace(space: HubSpace | null) {
    setSelected(space);
    if (space) {
      navigate(`/spaces/${encodeURIComponent(space.slug)}`, { replace: true });
    } else {
      navigate('/spaces', { replace: true });
    }
  }

  const load = useCallback(async () => {
    if (!hubSlug) return;
    setLoading(true); setError('');
    try {
      const [mine, all] = await Promise.all([spacesService.listMine(hubSlug), spacesService.listAll(hubSlug)]);
      setMySpaces(mine); setAllSpaces(all);
      // Restore selected space from URL on initial load
      if (urlSpaceSlug) {
        const match = [...mine, ...all].find(s => s.slug === decodeURIComponent(urlSpaceSlug));
        if (match) setSelected(match);
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [hubSlug]); // intentionally exclude urlSpaceSlug — only used on first load

  useEffect(() => { load(); }, [load]);

  function handleSpaceUpdated(updated: HubSpace) {
    // PATCH returns only hub_spaces columns — my_role/my_status come from a JOIN and won't be present.
    // Merge them from the existing state so the membership logic below stays correct.
    const merge = (existing: HubSpace): HubSpace => ({
      ...updated,
      my_role: updated.my_role ?? existing.my_role,
      my_status: updated.my_status ?? existing.my_status,
    });

    setSelected(prev => prev ? merge(prev) : null);
    setMySpaces(prev => {
      const existing = prev.find(s => s.id === updated.id);
      const merged = existing ? merge(existing) : updated;
      const isActive = merged.my_status === 'active';
      if (isActive && !existing) return [...prev, merged].sort((a, b) => a.name.localeCompare(b.name));
      if (!isActive && existing) return prev.filter(s => s.id !== updated.id);
      return prev.map(s => s.id === updated.id ? merged : s);
    });
    setAllSpaces(prev => prev.map(s => s.id === updated.id ? merge(s) : s));
  }

  function handleCreated(space: HubSpace) {
    setMySpaces(prev => [...prev, space].sort((a, b) => a.name.localeCompare(b.name)));
    setAllSpaces(prev => [space, ...prev]);
    selectSpace(space); setShowCreate(false);
  }

  function handleDeleted(spaceId: string) {
    setMySpaces(prev => prev.filter(s => s.id !== spaceId));
    setAllSpaces(prev => prev.filter(s => s.id !== spaceId));
    selectSpace(null);
  }

  const displaySpaces = (showAll ? allSpaces : mySpaces)
    .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => !categoryFilter || s.category === categoryFilter);
  const pendingInvites = allSpaces.filter(s => s.my_status === 'invited');

  // Category-chip row horizontal scroll — same pattern as Feed's category
  // tabs: chevrons show only on the side(s) there's still more to scroll
  // toward, recomputed on scroll and on resize. A ref callback (not a plain
  // useRef + mount-only effect) so it keeps working correctly even if this
  // row's container is ever conditionally unmounted/remounted elsewhere.
  const chipRowElRef = useRef<HTMLDivElement | null>(null);
  const chipContentRef = useRef<HTMLDivElement | null>(null);
  const chipRowCleanupRef = useRef<() => void>(() => {});
  const [chipScroll, setChipScroll] = useState({ canLeft: false, canRight: false });

  const updateChipScroll = useCallback(() => {
    const el = chipRowElRef.current;
    if (!el) return;
    const scrollLeft = Math.round(el.scrollLeft);
    setChipScroll({
      canLeft: scrollLeft > 1,
      canRight: scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  const chipRowRef = useCallback((el: HTMLDivElement | null) => {
    chipRowCleanupRef.current();
    chipRowCleanupRef.current = () => {};
    chipRowElRef.current = el;
    if (!el) return;
    const raf = requestAnimationFrame(updateChipScroll);
    el.addEventListener('scroll', updateChipScroll, { passive: true });
    const ro = new ResizeObserver(updateChipScroll);
    ro.observe(el);
    if (chipContentRef.current) ro.observe(chipContentRef.current);
    chipRowCleanupRef.current = () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', updateChipScroll);
      ro.disconnect();
    };
  }, [updateChipScroll]);

  const scrollChips = (dir: 'left' | 'right') => {
    chipRowElRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  };

  const chipFadeMask = !chipScroll.canLeft && !chipScroll.canRight ? undefined :
    chipScroll.canLeft && chipScroll.canRight
      ? 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)'
      : chipScroll.canLeft
        ? 'linear-gradient(to right, transparent, black 24px)'
        : 'linear-gradient(to right, black calc(100% - 24px), transparent)';

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r cn-border flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-4 border-b cn-border flex-shrink-0">
          <button onClick={onBack} className="md:hidden w-8 h-8 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center flex-shrink-0"><ArrowLeft className="w-4 h-4 cn-text-3" /></button>
          <h1 className="text-base font-semibold cn-text-1 flex-1">Spaces</h1>
          <button onClick={() => setShowCreate(true)} title="Create space" aria-label="Create space" className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center"><Plus className="w-4 h-4 text-white" /></button>
        </div>
        <div className="px-4 py-3 border-b cn-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search spaces…"
              className="w-full cn-surface-2 border cn-border rounded-xl pl-9 pr-3 py-2 text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-1 mt-2">
            <button onClick={() => setShowAll(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${showAll ? 'cn-surface-3 cn-text-1' : 'cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300'}`}>Discover</button>
            <button onClick={() => setShowAll(false)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${!showAll ? 'cn-surface-3 cn-text-1' : 'cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300'}`}>Joined{mySpaces.length > 0 ? ` (${mySpaces.length})` : ''}</button>
          </div>
          <div className="relative mt-2">
            {chipScroll.canLeft && (
              <button
                onClick={() => scrollChips('left')}
                aria-label="Scroll categories left"
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full cn-surface border cn-border flex items-center justify-center shadow-sm"
              >
                <ChevronLeft className="w-3 h-3 cn-text-2" />
              </button>
            )}
            {chipScroll.canRight && (
              <button
                onClick={() => scrollChips('right')}
                aria-label="Scroll categories right"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full cn-surface border cn-border flex items-center justify-center shadow-sm"
              >
                <ChevronRight className="w-3 h-3 cn-text-2" />
              </button>
            )}
            <div
              ref={chipRowRef}
              className={`flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth ${chipScroll.canLeft ? 'pl-6' : ''} ${chipScroll.canRight ? 'pr-6' : ''}`}
              style={chipFadeMask ? { WebkitMaskImage: chipFadeMask, maskImage: chipFadeMask } : undefined}
            >
              {/* Separate from the scroll container above so a ResizeObserver can
                  watch this row's own natural (unclipped) width independent of the
                  scroll container's own (clipped) box size. */}
              <div ref={chipContentRef} className="flex items-center gap-1.5">
                {CATEGORY_FILTERS.map(f => (
                  <button key={f.value} onClick={() => setCategoryFilter(prev => prev === f.value ? null : f.value)}
                    className={`flex-none px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${categoryFilter === f.value ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/30' : 'cn-surface-2 cn-border cn-text-3 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {pendingInvites.length > 0 && !showAll && (
          <div className="px-4 py-2 bg-blue-100 dark:bg-blue-900/20 border-b border-blue-300 dark:border-blue-900/40 flex-shrink-0">
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">You have {pendingInvites.length} invite{pendingInvites.length > 1 ? 's' : ''}</p>
            {pendingInvites.map(s => (
              <button key={s.id} onClick={() => selectSpace(s)} className="w-full text-left flex items-center gap-2 py-1.5 text-sm cn-text-1 hover:text-blue-600 dark:hover:text-blue-300">
                <ChevronRight className="w-3 h-3 text-blue-500 dark:text-blue-400" /> {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin cn-text-4" /></div>}
          {error && <div className="m-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 flex gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}</div>}
          {!loading && displaySpaces.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl cn-surface-2 flex items-center justify-center mb-3"><LayoutGrid className="w-6 h-6 cn-text-4" /></div>
              <p className="text-sm cn-text-3 font-medium mb-1">{showAll ? 'No spaces on this hub yet' : 'No spaces joined yet'}</p>
              <p className="text-xs cn-text-4">{showAll ? 'Be the first to create one.' : 'Switch to Discover to find spaces to join.'}</p>
            </div>
          )}
          {displaySpaces.map(space => {
            const cat = categoryOf(space);
            const onlineCount = Number(space.online_count) || 0;
            return (
            <button key={space.id} onClick={() => selectSpace(space)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left border-b cn-border ${selected?.id === space.id ? 'bg-black/5 dark:bg-white/5' : ''}`}>
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden" style={getBannerStyle(space, tunnelUrl)}>
                  <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold bg-black/10">{space.name[0]?.toUpperCase()}</div>
                </div>
                {/* Floating category badge — same "this kind of space" cue the
                    detail banner and card grid use, just scaled to a list row. */}
                {cat && (
                  <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-md flex items-center justify-center ring-2 ring-white dark:ring-zinc-900" style={{ width: 18, height: 18, background: cat.grad }}>
                    <cat.Icon className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-medium cn-text-1 truncate">{space.name}</span>
                  <span className="cn-text-4 flex-shrink-0">{visibilityIcon(space.visibility)}</span>
                </div>
                <p className="text-xs cn-text-4 truncate">{space.description || `${Number(space.member_count) || 0} members`}</p>
                <div className="flex items-center gap-2.5 mt-0.5">
                  {space.description && <span className="text-[11px] cn-text-4">{Number(space.member_count) || 0} members</span>}
                  {onlineCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <span className="cn-live-dot w-1.5 h-1.5" />{onlineCount} online
                    </span>
                  )}
                </div>
                {space.my_status === 'pending' && <span className="text-xs text-amber-600 dark:text-amber-400">Pending approval</span>}
                {space.my_status === 'invited' && <span className="text-xs text-blue-600 dark:text-blue-400">Invited — tap to accept</span>}
              </div>
            </button>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col flex-1 overflow-hidden`}>
        {selected ? (
          <>
            <button onClick={() => selectSpace(null)} className="md:hidden flex items-center gap-2 px-4 py-3 border-b cn-border cn-text-3 text-sm flex-shrink-0">
              <ArrowLeft className="w-4 h-4" /> All Spaces
            </button>
            <SpaceDetail hubSlug={hubSlug} space={selected} myUserId={myUserId}
              tunnelUrl={tunnelUrl} authToken={authToken} currentUser={currentUser ?? undefined}
              onSpaceUpdated={handleSpaceUpdated} onSpaceDeleted={handleDeleted} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-900 to-indigo-900 border border-blue-800 flex items-center justify-center mb-5"><SpacesGlyph className="w-9 h-9 text-blue-300" /></div>
            <h2 className="text-lg font-semibold cn-text-1 mb-2">Select a Space</h2>
            <p className="text-sm cn-text-4 max-w-xs">Choose a space from the list to view its feed and members, or create a new one.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateSpaceModal hubSlug={hubSlug} onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
