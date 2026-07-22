import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin, Shield, Calendar, MessageCircle,
  Loader2, AlertCircle, Globe,
  ImagePlus, Pencil, ArrowLeft,
  FileText, Pin, Hash, Building2, Sparkles,
  BookOpen, Map, Share2, Copy, Check, X, Users, Lock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { atlasService } from '../services/atlasService';
import { useHub } from '../context/HubContext';
import { getBackLabel } from '../utils/routeLabels';
import { PostDetailModal } from './PostDetailModal';
import { NoteDetailModal } from './NoteDetailModal';
import type { HubMember, HubPost, HubNote } from '../types/hub';
import type { AtlasPin } from '../types/atlas';
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
function formatTimestamp(iso: string): string {
  try {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
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

type Tab = 'overview' | 'posts' | 'notes' | 'pins';

// ── Small presentational pieces (mirror the design system's Stat / SkillTag / DetailRow / ListRow) ──

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 cn-text-4 shrink-0" />
      <div>
        <div className="font-mono text-xl font-bold cn-text-1 leading-tight">{value}</div>
        <div className="text-[11px] cn-text-3 whitespace-nowrap">{label}</div>
      </div>
    </div>
  );
}

function SkillTag({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full cn-surface-2 border cn-border text-xs font-semibold cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
    >
      <Sparkles className="w-3 h-3 text-purple-500 dark:text-purple-400 shrink-0" />{children}
    </button>
  );
}

function DetailRow({ icon: Icon, label, children, first, href, onClick }: {
  icon: LucideIcon; label: string; children: React.ReactNode; first?: boolean; href?: string; onClick?: () => void;
}) {
  const row = (
    <>
      <span className="w-8 h-8 rounded-lg cn-surface-2 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 cn-text-3" />
      </span>
      <span className="text-sm cn-text-3 shrink-0">{label}</span>
      <span className="text-sm font-semibold cn-text-1 truncate flex-1 text-right">{children}</span>
    </>
  );
  const cls = `w-full flex items-center gap-3 px-3.5 py-3 text-left ${first ? '' : 'border-t cn-border'}`;
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}>{row}</a>;
  }
  if (onClick) {
    return <button onClick={onClick} className={`${cls} hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}>{row}</button>;
  }
  return <div className={cls}>{row}</div>;
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

// ── Component ──────────────────────────────────────────────

interface ProfileScreenProps {
  userId: string;
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

export function ProfileScreen({ userId, onBack, onNavigate }: ProfileScreenProps) {
  const { currentHub, currentUser, updateUserProfile, previousPath } = useHub();
  const slug = currentHub?.slug ?? '';
  const hubName = currentHub?.name ?? 'Hub';
  const backLabel = getBackLabel(previousPath, hubName);

  const [member, setMember]           = useState<HubMember | null>(null);
  const [posts, setPosts]             = useState<HubPost[]>([]);
  const [notes, setNotes]             = useState<HubNote[]>([]);
  const [pins, setPins]               = useState<AtlasPin[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState<Tab>('overview');
  const [selectedPost, setSelectedPost] = useState<HubPost | null>(null);
  const [selectedNote, setSelectedNote] = useState<HubNote | null>(null);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [forkingNoteId, setForkingNoteId] = useState<string | null>(null);
  const [forkedNoteId, setForkedNoteId] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !!currentUser?.hubUserId && currentUser.hubUserId === userId;
  const isAdmin = currentUser?.isAdmin === true ||
    (!!currentUser?.username && (currentHub?.tunnelUrl ?? '').includes('localhost'));

  useEffect(() => {
    if (!slug || !userId) return;
    setLoading(true);
    setError('');
    setActiveTab('overview');
    Promise.allSettled([
      hubService.getMember(slug, userId),
      hubService.listPosts(slug),
      atlasService.getPins(slug),
      hubService.getPublicNotes(slug, userId),
    ]).then(([memberRes, postsRes, pinsRes, notesRes]) => {
      if (memberRes.status === 'fulfilled') {
        setMember(memberRes.value);
        if (postsRes.status === 'fulfilled')
          setPosts(postsRes.value.filter(p => p.author_id === userId));
        if (pinsRes.status === 'fulfilled')
          setPins(pinsRes.value.filter(p => p.authorUsername === memberRes.value?.username));
        if (notesRes.status === 'fulfilled')
          setNotes(notesRes.value);
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

  const handleForkNote = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setForkingNoteId(noteId);
    try {
      await hubService.forkNote(slug, noteId);
      setForkedNoteId(noteId);
      setTimeout(() => setForkedNoteId(null), 2000);
    } catch { /* silent */ }
    finally { setForkingNoteId(null); }
  };

  // ── Loading / Error ──────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
    </div>
  );

  if (error || !member) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm cn-text-3">{error || 'Profile not found'}</p>
      <button onClick={onBack} className="text-sm text-purple-600 hover:underline">Go back</button>
    </div>
  );

  const bio = member.bio ?? '';
  const bioClamped = bio.length > 280 ? bio.slice(0, 280).trim() + '…' : bio;

  const TABS: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'posts', label: `Posts${posts.length ? ` (${posts.length})` : ''}` },
    { value: 'notes', label: `Notes${notes.length ? ` (${notes.length})` : ''}` },
    { value: 'pins', label: `Pins${pins.length ? ` (${pins.length})` : ''}` },
  ];

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-5 sm:py-7">

        {/* Top bar — back only; Message/Edit/Share live inside the hero card, next to the avatar */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 border cn-border cn-surface cn-text-2 text-sm font-semibold px-3.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
          </button>
        </div>

        {/* ══ Hero card — banner, avatar, name, stats, skills ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden cn-glass mb-6"
        >
          <div
            className={`relative h-32 ${isOwnProfile ? 'cursor-pointer group' : ''}`}
            style={hasBannerStyle ? { ...bannerStyle, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'var(--cn-grad-identity)' }}
            onClick={() => isOwnProfile && setShowBannerEditor(v => !v)}
          >
            {!hasBannerStyle && (
              <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 80% -20%, rgba(255,255,255,.22), transparent 60%)' }} />
            )}
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
                      className="w-[88px] h-[88px] rounded-full object-cover ring-4 ring-white dark:ring-zinc-900 shadow-md"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  : <div className={`w-[88px] h-[88px] rounded-full bg-gradient-to-br ${avatarColor(member.username)} flex items-center justify-center text-white font-bold text-3xl ring-4 ring-white dark:ring-zinc-900 shadow-md`}>
                      {(displayName || member.username).charAt(0).toUpperCase()}
                    </div>
                }
              </div>

              {/* Action cluster — desktop: Message/Edit + Share, inline next to the avatar */}
              <div className="hidden sm:flex items-center gap-2 pt-4 shrink-0">
                {isOwnProfile ? (
                  <button
                    onClick={() => onNavigate('account')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border cn-border cn-surface hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold cn-text-2 transition-colors"
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
                    className="w-9 h-9 rounded-lg border cn-border flex items-center justify-center cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
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
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border cn-border cn-surface text-sm font-semibold cn-text-2 transition-colors"
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
                  className="w-11 h-11 shrink-0 rounded-xl border cn-border flex items-center justify-center cn-text-2"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Name block */}
            <div className="mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold cn-text-1 leading-tight truncate">
                  {displayName || member.username}
                </h1>
                {member.is_admin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20 shrink-0">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                )}
              </div>
              <p className="cn-mono text-xs cn-text-3 mt-0.5">@{member.username} · {hubName}</p>
            </div>

            {/* Stats */}
            <div className="flex gap-7 mt-5">
              <Stat icon={FileText} value={posts.length} label="Posts" />
              <Stat icon={BookOpen} value={notes.length} label="Notes" />
              <Stat icon={Map} value={pins.length} label="Pins" />
            </div>

            {/* Skills & interests — Community Focus tags */}
            {(member.tags?.length ?? 0) > 0 && (
              <div className="mt-5">
                <span className="cn-eyebrow">Skills &amp; interests</span>
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

            {/* ── Overview tab ── */}
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
                      {bio.length > 280 && (
                        <button onClick={() => setShowBioModal(true)} className="ml-1.5 font-semibold text-purple-600 dark:text-purple-400 hover:underline">
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

                {/* About */}
                <div>
                  <span className="cn-eyebrow">About</span>
                  <div className="mt-2.5">
                    <ListGroup>
                      <DetailRow icon={Building2} label="Member of" first onClick={() => window.open(`${window.location.origin}/?hub=${slug}`, '_blank')}>
                        {hubName}
                      </DetailRow>
                      {member.location && (
                        <DetailRow icon={MapPin} label="Lives at">{member.location}</DetailRow>
                      )}
                      {member.created_at && (
                        <DetailRow icon={Calendar} label="Neighbor since">{formatJoinDate(member.created_at)}</DetailRow>
                      )}
                      <DetailRow icon={Hash} label="Hub handle">
                        <span className="cn-mono">@{member.username}</span>
                      </DetailRow>
                      {member.website && (
                        <DetailRow icon={Globe} label="Website" href={member.website.startsWith('http') ? member.website : `https://${member.website}`}>
                          {member.website.replace(/^https?:\/\//, '')}
                        </DetailRow>
                      )}
                    </ListGroup>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Posts tab ── */}
            {activeTab === 'posts' && (
              <motion.div
                key="posts"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                {posts.length > 0 ? (
                  <ListGroup>
                    {posts.map((post, i) => (
                      <button
                        key={post.id}
                        onClick={() => setSelectedPost(post)}
                        className={`w-full text-left px-3.5 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 ${i === 0 ? '' : 'border-t cn-border'}`}
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
                          {post.body && (
                            <p className="text-xs cn-text-3 mt-0.5 line-clamp-2 leading-relaxed">{post.body}</p>
                          )}
                        </div>
                        {post.reply_count > 0 && (
                          <div className="flex items-center gap-1 text-xs cn-text-4 shrink-0 mt-0.5">
                            <MessageCircle className="w-3.5 h-3.5" />{post.reply_count}
                          </div>
                        )}
                      </button>
                    ))}
                  </ListGroup>
                ) : (
                  <EmptyTab
                    icon={FileText}
                    label={isOwnProfile ? "You haven't posted yet." : `${displayName || member.username} hasn't posted yet.`}
                    action={isOwnProfile && (
                      <button onClick={() => onNavigate('feed')} className="mt-2 text-sm text-purple-600 dark:text-purple-400 font-semibold hover:underline">
                        Start a discussion
                      </button>
                    )}
                  />
                )}
              </motion.div>
            )}

            {/* ── Notes tab ── */}
            {activeTab === 'notes' && (
              <motion.div
                key="notes"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                {notes.length > 0 ? (
                  <ListGroup>
                    {notes.map((note, i) => (
                      <div
                        key={note.id}
                        onClick={() => setSelectedNote(note)}
                        className={`px-3.5 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-pointer flex items-start gap-3 ${i === 0 ? '' : 'border-t cn-border'}`}
                      >
                        <span className="w-9 h-9 rounded-lg cn-surface-2 flex items-center justify-center shrink-0 mt-0.5">
                          <BookOpen className="w-4 h-4 cn-text-3" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {note.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                            <span className="text-xs cn-text-4">{formatTimestamp(note.updated_at)}</span>
                          </div>
                          <p className="text-sm font-semibold cn-text-1 truncate">
                            {note.title || 'Untitled'}
                          </p>
                          {note.body_plain && (
                            <p className="text-xs cn-text-3 mt-0.5 line-clamp-2 leading-relaxed">{note.body_plain}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          {note.color && (
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: note.color }} />
                          )}
                          {!isOwnProfile && (
                            <button
                              onClick={e => handleForkNote(note.id, e)}
                              disabled={forkingNoteId === note.id}
                              title="Copy this note into your own notes"
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all opacity-0 group-hover:opacity-100 ${
                                forkedNoteId === note.id
                                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                  : 'cn-surface-2 cn-text-3 cn-border hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-200 dark:hover:border-purple-800'
                              }`}
                            >
                              {forkingNoteId === note.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : forkedNoteId === note.id ? (
                                <><Check className="w-3 h-3" /> Copied!</>
                              ) : (
                                <><Copy className="w-3 h-3" /> Copy</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </ListGroup>
                ) : (
                  <EmptyTab icon={BookOpen} label={isOwnProfile ? 'No public notes yet.' : 'No shared notes.'} />
                )}
              </motion.div>
            )}

            {/* ── Pins tab ── */}
            {activeTab === 'pins' && (
              <motion.div
                key="pins"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                {pins.length > 0 ? (
                  <ListGroup>
                    {pins.map((pin, i) => (
                      <button
                        key={pin.id}
                        onClick={() => {
                          sessionStorage.setItem('citinet-focus-pin', pin.id);
                          onNavigate('atlas');
                        }}
                        className={`w-full text-left px-3.5 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 ${i === 0 ? '' : 'border-t cn-border'}`}
                      >
                        <span className="w-9 h-9 rounded-lg cn-surface-2 flex items-center justify-center shrink-0 mt-0.5">
                          <Map className="w-4 h-4 cn-text-3" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              {pin.category}
                            </span>
                            <span className="text-xs cn-text-4">{formatTimestamp(pin.createdAt)}</span>
                          </div>
                          <p className="text-sm font-semibold cn-text-1 truncate">{pin.title}</p>
                          {pin.description && (
                            <p className="text-xs cn-text-3 mt-0.5 line-clamp-2 leading-relaxed">{pin.description}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </ListGroup>
                ) : (
                  <EmptyTab icon={Map} label="No pins yet." />
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

      {selectedNote && (
        <NoteDetailModal
          isOpen
          onClose={() => setSelectedNote(null)}
          note={selectedNote}
          isOwnNote={isOwnProfile}
          onEdit={isOwnProfile ? () => { onNavigate('notes'); setSelectedNote(null); } : undefined}
        />
      )}

      {/* Bio modal — portaled to <body>: HubLayout's content area is `position: relative;
          z-index: 10`, its own stacking context, so nothing inside it can out-rank the
          chrome (bottom nav included, z-30) no matter its own z-index. */}
      {showBioModal && createPortal(
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowBioModal(false)} />
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
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
