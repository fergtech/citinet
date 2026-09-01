import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin, Shield, Calendar, MessageCircle,
  Loader2, AlertCircle, Globe,
  ImagePlus, Pencil, ArrowLeft,
  FileText, Sparkles, Film,
  Share2, Copy, Check, X, Users, Lock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { marketplaceService } from '../services/marketplaceService';
import { useHub } from '../context/HubContext';
import { PostDetailModal } from './PostDetailModal';
import { ListingCard } from './MarketplaceScreen';
import type { HubMember, HubPost, HubVendor, HubListing } from '../types/hub';
import type { LucideIcon } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',    'from-violet-500 to-purple-500',
  'from-sky-500 to-blue-500',     'from-lime-500 to-green-500',
];
function avatarColor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function formatJoinDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  catch { return ''; }
}
// Relative "time ago" all the way up — no fallback to an absolute date, so
// a years-old post's card still reads as "2y ago" rather than a raw date.
// Month/year buckets use average lengths (a la a standard timeAgo utility)
// so they don't drift as actual calendar months vary.
const TIMEAGO_MONTH_SECONDS = 2_629_800; // 365.25 / 12 days
const TIMEAGO_YEAR_SECONDS = 31_557_600; // 365.25 days — accounts for leap years
function formatTimestamp(iso: string): string {
  try {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now'; // also covers a future/clock-skewed timestamp
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < TIMEAGO_MONTH_SECONDS) return `${Math.floor(diff / 604800)}w ago`;
    if (diff < TIMEAGO_YEAR_SECONDS) return `${Math.floor(diff / TIMEAGO_MONTH_SECONDS)}mo ago`;
    return `${Math.floor(diff / TIMEAGO_YEAR_SECONDS)}y ago`;
  } catch { return ''; }
}

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/20',
  PROJECT:      'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/20',
  REQUEST:      'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-500/20',
};

const BANNER_SOLID_COLORS = ['#0f766e','#0369a1','#1d4ed8','#6d28d9','#be123c','#b45309','#374151'];
const BANNER_GRADIENTS = [
  { from: '#2563eb', to: '#7c3aed' }, { from: '#0f766e', to: '#2563eb' },
  { from: '#be123c', to: '#7c2d12' }, { from: '#1d4ed8', to: '#0f766e' },
  { from: '#c2410c', to: '#be123c' }, { from: '#374151', to: '#111827' },
];

type Tab = 'overview' | 'activity' | 'resources' | 'requests';

// ── Small presentational pieces (mirror the design system's SkillTag / ListRow) ──

// Hero-only (see ProfileScreen's hero card below) — the hero now sits on a
// fixed-dark scrim over the member's own banner image/gradient regardless of
// site theme, so this uses hardcoded light colors instead of the usual
// theme-adaptive cn-text-* tokens (which would go near-black-on-near-black
// in light mode).
function SkillTag({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-semibold text-white/90 hover:bg-white/20 transition-colors"
    >
      <Sparkles className="w-3 h-3 text-white/60 shrink-0" />{children}
    </button>
  );
}

function ListGroup({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border cn-border overflow-hidden">{children}</div>;
}

function EmptyTab({ icon: Icon, label, action }: { icon: LucideIcon; label: string; action?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <Icon className="w-8 h-8 cn-text-4 mx-auto mb-2" />
      <p className="text-sm cn-text-3">{label}</p>
      {action}
    </div>
  );
}

/** One post row — shared by the Overview snapshot, Activity tab, and
 *  Requests tab, which all render the same underlying `posts` data
 *  (just filtered/sliced differently). */
function PostRow({ post, first, onClick, showBody = true }: { post: HubPost; first?: boolean; onClick: () => void; showBody?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3.5 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 ${first ? '' : 'border-t cn-border'}`}
    >
      <span className="w-9 h-9 rounded-lg cn-surface-2 flex items-center justify-center shrink-0 mt-0.5">
        <FileText className="w-4 h-4 cn-text-3" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.DISCUSSION}`}>
            {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
          </span>
          <span className="text-xs cn-text-4">{formatTimestamp(post.created_at)}</span>
        </div>
        <p className="text-sm font-semibold cn-text-1 truncate">{post.title}</p>
        {showBody && post.body && (
          <p className="text-xs cn-text-3 mt-0.5 line-clamp-2 leading-relaxed">{post.body}</p>
        )}
      </div>
      {post.reply_count > 0 && (
        <div className="flex items-center gap-1 text-xs cn-text-4 shrink-0 mt-0.5">
          <MessageCircle className="w-3.5 h-3.5" />{post.reply_count}
        </div>
      )}
    </button>
  );
}

/** Grid-tile variant of a post — used by Overview's "Recent activity" card,
 *  styled to match ListingCard (the tile used by the "Shared resources" grid
 *  right below it) rather than PostRow's bordered-list-row look.
 *
 *  Fixed height (not just flex-stretch) so all three tiles in the row stay
 *  aligned regardless of content — flex-stretch alone wouldn't do it on
 *  mobile, where the grid drops to one column and each card is the only
 *  item in its own row.
 *
 *  Whenever the post has an attachment, that media fills the card as a
 *  cover background — same scrim-over-image pattern as the profile hero,
 *  badge/text/footer switching to white so they stay legible over any
 *  photo. A video attachment autoplays muted/looped/inline right in the
 *  tile, same treatment as the video previews in the dashboard's Featured
 *  section (FeaturedCarousel), rather than a static placeholder; a load
 *  error on either falls back to the plain themed card. Any post text
 *  still renders, now overlaid on the cover. Only a genuinely text-only
 *  post (no media) gets the plain themed card; a post with neither text
 *  nor media falls back to a "No content preview" note so it never renders
 *  as dead blank space. */
function PostGridCard({ post, hubSlug, onClick }: { post: HubPost; hubSlug: string; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const excerpt = post.title || post.body?.trim() || '';
  const mediaName = post.media_file_name || post.media_url || '';
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(mediaName.split('.').pop()?.toLowerCase() ?? '');
  const rawMediaUrl = post.media_file_name ? hubService.getPublicFileUrl(hubSlug, post.media_file_name) : (post.media_url ?? null);
  const hasImageCover = !!rawMediaUrl && !isVideo && !imgFailed;
  const hasVideoCover = !!rawMediaUrl && isVideo && !videoFailed;
  const isCoverMode = hasImageCover || hasVideoCover;

  return (
    <button
      onClick={onClick}
      className={`relative h-40 text-left flex flex-col overflow-hidden rounded-2xl transition-all group ${
        isCoverMode ? '' : 'cn-glass hover:border-black/15 dark:hover:border-white/15'
      }`}
    >
      {hasImageCover && (
        <img
          src={rawMediaUrl!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgFailed(true)}
        />
      )}
      {hasVideoCover && (
        <video
          src={rawMediaUrl!}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setVideoFailed(true)}
        />
      )}
      {isCoverMode && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/0" />
      )}
      {hasVideoCover && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm">
          <Film className="w-3 h-3 text-white" />
        </div>
      )}

      <div className="relative flex flex-col h-full p-3.5">
        <span className={`self-start shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${
          isCoverMode ? 'bg-white/15 backdrop-blur-sm text-white ring-white/25' : (CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.DISCUSSION)
        }`}>
          {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
        </span>

        <div className="flex-1 min-h-0 flex items-end py-1.5">
          {excerpt ? (
            <p className={`text-sm font-semibold line-clamp-3 leading-snug ${isCoverMode ? 'text-white' : 'cn-text-1'}`}>
              {excerpt}
            </p>
          ) : !isCoverMode ? (
            <p className="text-[11px] cn-text-4 italic">No content preview</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between shrink-0">
          <span className={`text-[10px] font-mono ${isCoverMode ? 'text-white/70' : 'cn-text-4'}`}>{formatTimestamp(post.created_at)}</span>
          {post.reply_count > 0 && (
            <span className={`flex items-center gap-1 text-[10px] ${isCoverMode ? 'text-white/70' : 'cn-text-4'}`}>
              <MessageCircle className="w-3 h-3" />{post.reply_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Component ──────────────────────────────────────────────

interface ProfileScreenProps {
  userId: string;
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

export function ProfileScreen({ userId, onBack, onNavigate }: ProfileScreenProps) {
  const { currentHub, currentUser, updateUserProfile } = useHub();
  const slug = currentHub?.slug ?? '';
  const hubName = currentHub?.name ?? 'Hub';

  const [member, setMember]           = useState<HubMember | null>(null);
  const [posts, setPosts]             = useState<HubPost[]>([]);
  const [vendor, setVendor]           = useState<HubVendor | null>(null);
  const [listings, setListings]       = useState<HubListing[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState<Tab>('overview');
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !!currentUser?.hubUserId && currentUser.hubUserId === userId;
  const isAdmin = currentUser?.isAdmin === true ||
    (!!currentUser?.username && (currentHub?.tunnelUrl ?? '').includes('localhost'));

  useEffect(() => {
    if (!slug || !userId) return;
    setLoading(true);
    setError('');
    setActiveTab('overview');
    setVendor(null);
    setListings([]);
    Promise.allSettled([
      hubService.getMember(slug, userId),
      hubService.listPosts(slug),
      marketplaceService.listVendors(slug),
    ]).then(([memberRes, postsRes, vendorsRes]) => {
      if (memberRes.status === 'fulfilled') {
        setMember(memberRes.value);
        if (postsRes.status === 'fulfilled')
          setPosts(postsRes.value.filter(p => p.author_id === userId));
        // No by-owner-user-id vendor lookup endpoint — find it in the full
        // vendor list, same client-side-filter pattern as posts above.
        if (vendorsRes.status === 'fulfilled') {
          const myVendor = vendorsRes.value.find(v => v.owner_user_id === userId) ?? null;
          setVendor(myVendor);
          if (myVendor) {
            marketplaceService.getVendor(slug, myVendor.id)
              .then(({ listings }) => setListings(listings))
              .catch(() => {});
          }
        }
      } else {
        setError('Could not load profile.');
      }
      setLoading(false);
    });
  }, [slug, userId]);

  const avatarUrl = member ? hubService.getAvatarUrl(slug, member.user_id) : null;
  const displayName = member?.display_name || member?.username || '';

  const bannerSource = isOwnProfile ? {
    banner_mode:           currentUser?.bannerMode           ?? member?.banner_mode,
    banner_color:          currentUser?.bannerColor          ?? member?.banner_color,
    banner_gradient_from:  currentUser?.bannerGradientFrom   ?? member?.banner_gradient_from,
    banner_gradient_to:    currentUser?.bannerGradientTo     ?? member?.banner_gradient_to,
    banner_image_file_name: currentUser?.bannerImageFileName ?? member?.banner_image_file_name,
  } : member;

  const bannerStyle = useMemo((): React.CSSProperties => {
    if (bannerSource?.banner_mode === 'image' && bannerSource.banner_image_file_name) {
      const url = hubService.getProfileBannerUrl(slug, userId, bannerSource.banner_image_file_name);
      if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (bannerSource?.banner_mode === 'solid' && bannerSource.banner_color)
      return { backgroundColor: bannerSource.banner_color };
    if (bannerSource?.banner_mode === 'gradient' && bannerSource.banner_gradient_from && bannerSource.banner_gradient_to)
      return { backgroundImage: `linear-gradient(135deg, ${bannerSource.banner_gradient_from}, ${bannerSource.banner_gradient_to})` };
    return {};
  }, [bannerSource, slug, userId]);

  const hasBannerStyle = !!bannerSource?.banner_mode;

  const saveBannerFields = async (fields: Parameters<typeof hubService.updateProfile>[1]) => {
    setSavingBanner(true);
    updateUserProfile({
      bannerMode: fields.bannerMode,
      bannerColor: fields.bannerColor,
      bannerGradientFrom: fields.bannerGradientFrom,
      bannerGradientTo: fields.bannerGradientTo,
    });
    try {
      await hubService.updateProfile(slug, fields);
      hubService.getMember(slug, userId).then(setMember).catch(() => {});
    } catch { /* silent */ }
    setSavingBanner(false);
    setShowBannerEditor(false);
  };

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavingBanner(true);
    try {
      const key = await hubService.uploadProfileBanner(slug, file);
      updateUserProfile({ bannerMode: 'image', bannerImageFileName: key });
      hubService.getMember(slug, userId).then(setMember).catch(() => {});
    } catch { /* silent */ }
    setSavingBanner(false);
    e.target.value = '';
  };

  const handleMessage = () => {
    sessionStorage.setItem('citinet-deeplink-message-peer', JSON.stringify({ userId, username: member?.username ?? '' }));
    onNavigate('messages');
  };


  // ── Loading / Error ──────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin cn-text-3" />
    </div>
  );

  if (error || !member) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm cn-text-3">{error || 'Profile not found'}</p>
      <button onClick={onBack} className="text-sm cn-text-3 hover:cn-text-1 hover:underline">Go back</button>
    </div>
  );

  const bio = member.bio ?? '';
  const bioClamped = bio.length > 280 ? bio.slice(0, 280).trim() + '…' : bio;

  // Requests get their own tab, so "Activity" (general posts, discussions,
  // announcements) is everything else. Same underlying `posts` fetch, just
  // split by the category the post already carries — no extra request.
  const activityPosts = posts.filter(p => p.category !== 'REQUEST');
  const requestPosts = posts.filter(p => p.category === 'REQUEST');

  const TABS: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'activity', label: `Activity${activityPosts.length ? ` (${activityPosts.length})` : ''}` },
    { value: 'resources', label: `Resources${listings.length ? ` (${listings.length})` : ''}` },
    { value: 'requests', label: `Requests${requestPosts.length ? ` (${requestPosts.length})` : ''}` },
  ];

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-5 sm:py-7">

        {/* Top bar — back only; Message/Edit/Share live inside the hero card, next to the avatar */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={onBack}
            className="md:hidden inline-flex items-center gap-1.5 border cn-border cn-surface cn-text-2 text-sm font-semibold px-3.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>

        {/* ══ Hero card — banner, avatar, name, stats, skills ══
            The banner (image, solid, or gradient) now extends the full
            height of the card as an absolute background layer (z-0), with a
            fixed-dark feathering scrim (z-10) fading it into the card's own
            surface color at the bottom so avatar/name/buttons/stats/tags
            (z-20) stay readable over *any* custom image a member uploads —
            in both themes, which is why this content uses hardcoded white/
            light colors below instead of the usual theme-adaptive cn-text-*
            tokens (see the Stat/SkillTag helpers above). */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl overflow-hidden cn-glass mb-6"
        >
          {/* Background layer — full-bleed banner image/solid/gradient */}
          <div
            className="absolute inset-0 z-0"
            style={hasBannerStyle ? { ...bannerStyle, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'var(--cn-grad-identity)' }}
          >
            {!hasBannerStyle && (
              <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 80% -20%, rgba(255,255,255,.22), transparent 60%)' }} />
            )}
          </div>

          {/* Scrim layer — clear near the top edge, feathering down to the
              card's own dark surface color by the bottom. Fixed (non-theme)
              colors, matching the background layer above. */}
          <div
            className="absolute inset-0 z-10 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, rgba(15,23,42,0) 0%, rgba(15,23,42,0.4) 35%, rgba(15,23,42,0.85) 70%, var(--cn-surface-1, #090d16) 100%)',
            }}
          />

          {/* Content layer — everything interactive lives above the scrim */}
          <div className="relative z-20">
            <div
              className={`relative h-32 ${isOwnProfile ? 'cursor-pointer group' : ''}`}
              onClick={() => isOwnProfile && setShowBannerEditor(v => !v)}
            >
              {isOwnProfile && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-semibold">
                    {savingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Edit banner
                  </span>
                </div>
              )}
            </div>
            {isOwnProfile && (
              <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
            )}

            <div className="px-5 sm:px-7 pb-7 pt-3">
              <div className="flex items-start justify-between gap-4">
                {/* Avatar — overlaps banner */}
                <div className="relative -mt-12 shrink-0">
                  {member.avatar_url && avatarUrl
                    ? <img src={avatarUrl} alt={displayName}
                        className="w-[88px] h-[88px] rounded-full object-cover ring-4 ring-white/20 backdrop-blur-sm shadow-md"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    : <div className={`w-[88px] h-[88px] rounded-full bg-gradient-to-br ${avatarColor(member.username)} flex items-center justify-center text-white font-bold text-3xl ring-4 ring-white/20 backdrop-blur-sm shadow-md`}>
                        {(displayName || member.username).charAt(0).toUpperCase()}
                      </div>
                  }
                </div>

                {/* Action cluster — desktop: Message/Edit + Share, inline next to the avatar */}
                <div className="hidden sm:flex items-center gap-2 pt-4 shrink-0">
                  {isOwnProfile ? (
                    <button
                      onClick={() => onNavigate('account')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-xs font-semibold text-white transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  ) : (
                    <button
                      onClick={handleMessage}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Message
                    </button>
                  )}
                  {member.profile_visibility !== 'private' && (
                    <button
                      onClick={() => setShowShareModal(true)}
                      title="Share profile"
                      className="w-9 h-9 rounded-lg border border-white/25 bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Action cluster — mobile, full-width row */}
              <div className="sm:hidden flex items-center gap-2 mt-3">
                {isOwnProfile ? (
                  <button
                    onClick={() => onNavigate('account')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/25 bg-white/10 backdrop-blur-sm text-sm font-semibold text-white transition-colors"
                  >
                    <Pencil className="w-4 h-4" /> Edit Profile
                  </button>
                ) : (
                  <button
                    onClick={handleMessage}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" /> Message
                  </button>
                )}
                {member.profile_visibility !== 'private' && (
                  <button
                    onClick={() => setShowShareModal(true)}
                    title="Share profile"
                    className="w-11 h-11 shrink-0 rounded-xl border border-white/25 bg-white/10 backdrop-blur-sm flex items-center justify-center text-white"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Name block */}
              <div className="mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">
                    {displayName || member.username}
                  </h1>
                  {member.is_admin && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white shrink-0">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>
                <p className="cn-mono text-xs text-white/70 mt-0.5">@{member.username} · {hubName}</p>
              </div>

              {/* Identity sub-header — Location / Member since / Website,
                  consolidated up from the old "About" card below (that data
                  belongs with the rest of the identity block, not repeated
                  further down the page). Item counts live on the tab bar
                  (Posts (N), Notes (N), Pins (N)) instead of a separate
                  stats row here — same numbers, one place. */}
              {(member.location || member.location_visible === false || member.created_at || member.website) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-xs text-white/70">
                  {(member.location || member.location_visible === false) && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-white/50 shrink-0" />
                      {member.location_visible === false ? 'Somewhere in the community' : member.location}
                    </span>
                  )}
                  {member.created_at && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-white/50 shrink-0" />
                      Member since {formatJoinDate(member.created_at)}
                    </span>
                  )}
                  {member.website && (
                    <a
                      href={member.website.startsWith('http') ? member.website : `https://${member.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-white hover:underline transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5 text-white/50 shrink-0" />
                      {member.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              )}

              {/* Skills & interests — Community Focus tags */}
              {(member.tags?.length ?? 0) > 0 && (
                <div className="mt-5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">Skills &amp; interests</span>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {member.tags!.map(tag => (
                      <SkillTag key={tag} onClick={() => { sessionStorage.setItem('citinet-deeplink-search', tag); onNavigate('discover'); }}>
                        {tag}
                      </SkillTag>
                    ))}
                  </div>
                </div>
              )}

            {/* Banner editor */}
            {isOwnProfile && showBannerEditor && (
              <div className="mt-4 rounded-xl border cn-border p-3.5 cn-surface-2 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold cn-text-2">Banner Style</p>
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={savingBanner}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-surface border cn-border hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold cn-text-2 transition-colors disabled:opacity-60"
                  >
                    <ImagePlus className="w-3.5 h-3.5" /> Upload Image
                  </button>
                </div>
                <div>
                  <p className="text-[11px] font-medium cn-text-4 mb-1.5">Solid Colors</p>
                  <div className="flex flex-wrap gap-2">
                    {BANNER_SOLID_COLORS.map(color => (
                      <button key={color} type="button"
                        onClick={() => saveBannerFields({ bannerMode: 'solid', bannerColor: color })}
                        className="w-7 h-7 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium cn-text-4 mb-1.5">Gradients</p>
                  <div className="flex flex-wrap gap-2">
                    {BANNER_GRADIENTS.map((g, i) => (
                      <button key={i} type="button"
                        onClick={() => saveBannerFields({ bannerMode: 'gradient', bannerGradientFrom: g.from, bannerGradientTo: g.to })}
                        className="w-14 h-7 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-sm hover:scale-105 transition-transform"
                        style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </motion.div>

        {/* ══ TABS ═══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl cn-glass overflow-hidden"
        >
          {/* Scrollable pill tab bar */}
          <div className="p-4 border-b cn-border">
            <div className="p-1 rounded-lg cn-surface-3 border cn-border overflow-x-auto no-scrollbar flex gap-1.5 w-full">
              {TABS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setActiveTab(t.value)}
                  className="relative shrink-0 whitespace-nowrap px-3.5 py-2 rounded-md text-[12.5px] font-semibold transition-colors"
                >
                  {activeTab === t.value && (
                    <motion.div layoutId="profile-tab-indicator" className="absolute inset-0 cn-surface rounded-md shadow-sm" />
                  )}
                  <span className={`relative z-10 ${activeTab === t.value ? 'cn-text-1' : 'cn-text-3'}`}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">

            {/* ── Overview tab — dual-card snapshot: recent activity + a
                Shared Resources & Skills spotlight ── */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5 space-y-5"
              >
                {/* Bio */}
                {bio ? (
                  <div>
                    <span className="cn-eyebrow">Bio</span>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed cn-text-2">
                      {bioClamped}
                      {bio.length > 300 && (
                        <button onClick={() => setShowBioModal(true)} className="ml-1.5 font-semibold cn-text-3 hover:cn-text-1 hover:underline">
                          Read more
                        </button>
                      )}
                    </p>
                  </div>
                ) : isOwnProfile ? (
                  <div className="rounded-xl border border-dashed cn-border p-5 text-center">
                    <p className="text-sm cn-text-4 mb-3">Add a bio to tell your community who you are.</p>
                    <button onClick={() => onNavigate('account')} className="inline-flex items-center px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors">
                      Complete your profile
                    </button>
                  </div>
                ) : null}

                {/* Card 1 — recent community activity (Activity + Requests
                    combined, newest first; the full per-type lists live on
                    their own tabs). Top 3, three-column grid — matches the
                    "Shared resources" grid below it. */}
                <div>
                  <span className="cn-eyebrow">Recent activity</span>
                  <div className="mt-2.5">
                    {posts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[...posts]
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .slice(0, 3)
                          .map(post => (
                            <PostGridCard key={post.id} post={post} hubSlug={slug} onClick={() => setSelectedPost(post)} />
                          ))}
                      </div>
                    ) : (
                      <EmptyTab
                        icon={FileText}
                        label={isOwnProfile ? "You haven't posted yet." : `${displayName || member.username} hasn't posted yet.`}
                      />
                    )}
                  </div>
                </div>

                {/* Card 2 — Shared Resources spotlight: this member's
                    marketplace listings (offered items/services). Skill/
                    interest tags live only in the hero above now — showing
                    them again here was a straight duplicate of the same
                    chips, not a second data point. */}
                <div>
                  <span className="cn-eyebrow">Shared resources</span>
                  <div className="mt-2.5">
                    {listings.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {listings.slice(0, 3).map(listing => (
                          <ListingCard
                            key={listing.id}
                            listing={listing}
                            hubSlug={slug}
                            onOpen={() => { sessionStorage.setItem('citinet-deeplink-listing', listing.id); onNavigate('marketplace'); }}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyTab
                        icon={Sparkles}
                        label={isOwnProfile ? "You haven't shared any resources yet." : `${displayName || member.username} hasn't shared any resources yet.`}
                        action={isOwnProfile && (
                          <button onClick={() => onNavigate('marketplace')} className="mt-2 text-sm cn-text-3 hover:cn-text-1 font-semibold hover:underline">
                            Share a resource or skill
                          </button>
                        )}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Activity tab — general posts: discussions, announcements,
                projects, events, polls. Requests get their own tab. ── */}
            {activeTab === 'activity' && (
              <motion.div
                key="activity"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                {activityPosts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {activityPosts.map(post => (
                      <PostGridCard key={post.id} post={post} hubSlug={slug} onClick={() => setSelectedPost(post)} />
                    ))}
                  </div>
                ) : (
                  <EmptyTab
                    icon={FileText}
                    label={isOwnProfile ? "You haven't posted yet." : `${displayName || member.username} hasn't posted yet.`}
                    action={isOwnProfile && (
                      <button onClick={() => onNavigate('feed')} className="mt-2 text-sm cn-text-3 hover:cn-text-1 font-semibold hover:underline">
                        Start a discussion
                      </button>
                    )}
                  />
                )}
              </motion.div>
            )}

            {/* ── Resources tab — items, skills, or services this member
                offers to share locally (their marketplace/Exchange listings). ── */}
            {activeTab === 'resources' && (
              <motion.div
                key="resources"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                {listings.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {listings.map(listing => (
                        <ListingCard
                          key={listing.id}
                          listing={listing}
                          hubSlug={slug}
                          onOpen={() => { sessionStorage.setItem('citinet-deeplink-listing', listing.id); onNavigate('marketplace'); }}
                        />
                      ))}
                    </div>
                    {vendor && (
                      <button
                        onClick={() => onNavigate(`vendor/${vendor.id}`)}
                        className="mt-4 text-sm cn-text-3 hover:cn-text-1 font-semibold hover:underline"
                      >
                        View full storefront →
                      </button>
                    )}
                  </>
                ) : (
                  <EmptyTab
                    icon={Sparkles}
                    label={isOwnProfile ? "You haven't shared any resources yet." : `${displayName || member.username} hasn't shared any resources yet.`}
                    action={isOwnProfile && (
                      <button onClick={() => onNavigate('marketplace')} className="mt-2 text-sm cn-text-3 hover:cn-text-1 font-semibold hover:underline">
                        Share a resource or skill
                      </button>
                    )}
                  />
                )}
              </motion.div>
            )}

            {/* ── Requests tab — this member's open calls for help,
                borrowing, or local support (REQUEST-category posts). ── */}
            {activeTab === 'requests' && (
              <motion.div
                key="requests"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                {requestPosts.length > 0 ? (
                  <ListGroup>
                    {requestPosts.map((post, i) => (
                      <PostRow key={post.id} post={post} first={i === 0} onClick={() => setSelectedPost(post)} />
                    ))}
                  </ListGroup>
                ) : (
                  <EmptyTab
                    icon={FileText}
                    label={isOwnProfile ? "You don't have any open requests." : `${displayName || member.username} doesn't have any open requests.`}
                    action={isOwnProfile && (
                      <button onClick={() => onNavigate('feed')} className="mt-2 text-sm cn-text-3 hover:cn-text-1 font-semibold hover:underline">
                        Ask your neighbors
                      </button>
                    )}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>

      {selectedPost && (
        <PostDetailModal
          isOpen
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
          hubSlug={slug}
          currentUserId={currentUser?.hubUserId}
          currentUserAvatarUrl={currentUser?.avatarUrl}
          isAdmin={isAdmin}
          categoryColors={CATEGORY_COLORS}
          publicFileUrl={(name) => hubService.getPublicFileUrl(slug, name) ?? ''}
          onDeleted={() => setSelectedPost(null)}
          onNavigateToProfile={(userId) => { setSelectedPost(null); onNavigate(`profile/${userId}`); }}
        />
      )}


      {/* Bio modal — portaled to <body>: HubLayout's content area is `position: relative;
          z-index: 10`, its own stacking context, so nothing inside it can out-rank the
          chrome (bottom nav included, z-30) no matter its own z-index. */}
      {showBioModal && createPortal(
        <>
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowBioModal(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={e => e.stopPropagation()}
              className="cn-surface rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] pointer-events-auto overflow-y-auto p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold cn-text-1">About {displayName || member.username}</h3>
                <button onClick={() => setShowBioModal(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <X className="w-4 h-4 cn-text-3" />
                </button>
              </div>
              <p className="text-sm leading-relaxed cn-text-2 whitespace-pre-wrap">{bio}</p>
            </motion.div>
          </div>
        </>,
        document.body
      )}

      {/* Share profile modal — portaled to <body> for the same reason as the bio modal above. */}
      {showShareModal && member.profile_visibility !== 'private' && (() => {
        const profileUrl = hubService.getPublicProfileUrl(slug, member.username);
        const hasPublicUrl = !!(currentHub?.publicTunnelUrl);
        const isPublic = member.profile_visibility === 'public';
        const handleCopy = () => {
          navigator.clipboard.writeText(profileUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        };
        return createPortal(
          <>
            <div
              className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowShareModal(false)}
            />
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                onClick={e => e.stopPropagation()}
                className="cn-surface rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] pointer-events-auto overflow-y-auto flex flex-col"
              >
                {/* Profile identity card */}
                <div className="relative shrink-0">
                  {/* Banner strip */}
                  <div
                    className={`h-20 w-full ${hasBannerStyle ? '' : `bg-gradient-to-br ${avatarColor(member.username)}`}`}
                    style={hasBannerStyle ? { ...bannerStyle, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                  />
                  <div className="absolute inset-0 bg-black/25 rounded-t-2xl" />
                  {/* Close button */}
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                  {/* Avatar + identity — overlaps banner */}
                  <div className="relative flex flex-col items-center px-5 pb-4 -mt-10">
                    {member.avatar_url && avatarUrl
                      ? <img
                          src={avatarUrl}
                          alt={displayName}
                          className="w-20 h-20 rounded-full object-cover ring-4 ring-white dark:ring-zinc-900 shadow-lg"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      : <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${avatarColor(member.username)} ring-4 ring-white dark:ring-zinc-900 flex items-center justify-center text-white font-bold text-2xl shadow-lg`}>
                          {(displayName || member.username).charAt(0).toUpperCase()}
                        </div>
                    }
                    <h2 className="mt-3 text-base font-bold cn-text-1 leading-tight">
                      {displayName || member.username}
                    </h2>
                    <p className="cn-mono text-xs cn-text-3 mt-0.5">
                      @{member.username} · {hubName}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-4">
                  {/* Visibility notice */}
                  {isPublic ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-700 dark:text-emerald-300">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      Public profile — anyone with this link can view it
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-800/50 text-xs text-blue-700 dark:text-blue-300">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      Hub members only — recipient must be a member to view
                    </div>
                  )}

                  {/* No tunnel warning */}
                  {!hasPublicUrl && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-700 dark:text-amber-300">
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      No public tunnel set up — link may not load remotely
                    </div>
                  )}

                  {/* QR code */}
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm">
                      <QRCodeSVG value={profileUrl} size={148} level="M" />
                    </div>
                  </div>

                  {/* URL + copy */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl cn-surface-2 border cn-border">
                    <span className="flex-1 text-xs cn-text-2 truncate cn-mono">{profileUrl}</span>
                    <button
                      onClick={handleCopy}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        copied
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'cn-surface-3 cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>,
          document.body
        );
      })()}
    </div>
  );
}
