import { useMemo, useRef, useState, useEffect } from 'react';
import {
  MapPin, Shield, Calendar, MessageCircle,
  Loader2, AlertCircle, Tag, Globe,
  ImagePlus, Palette, Pencil, ArrowLeft,
  FileText, Pin, Hash, Building2,
  BookOpen, Map, Share2, Copy, Check, X, Users, Lock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { atlasService } from '../services/atlasService';
import { useHub } from '../context/HubContext';
import { PostDetailModal } from './PostDetailModal';
import { NoteDetailModal } from './NoteDetailModal';
import type { HubMember, HubPost, HubNote } from '../types/hub';
import type { AtlasPin } from '../types/atlas';

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
  const [copied, setCopied] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !!currentUser?.hubUserId && currentUser.hubUserId === userId;
  const isAdmin = currentUser?.isAdmin === true ||
    (!!currentUser?.username && (currentHub?.tunnelUrl ?? '').includes('localhost'));

  useEffect(() => {
    if (!slug || !userId) return;
    setLoading(true);
    setError('');
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
    sessionStorage.setItem('citinet-dm-userId', userId);
    sessionStorage.setItem('citinet-dm-username', member?.username ?? '');
    onNavigate('messages');
  };

  // ── Loading / Error ──────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
    </div>
  );

  if (error || !member) return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center gap-3">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm text-slate-500">{error || 'Profile not found'}</p>
      <button onClick={onBack} className="text-sm text-purple-600 hover:underline">Go back</button>
    </div>
  );

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
          <span className="text-base font-semibold text-slate-900 dark:text-white truncate flex-1">
            {displayName || member.username}
          </span>
          {isOwnProfile && (
            <button onClick={() => onNavigate('account')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors shrink-0">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {member.profile_visibility !== 'private' && (
            <button
              onClick={() => setShowShareModal(true)}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors shrink-0"
              title="Share profile"
            >
              <Share2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-3 pb-12 space-y-3">

        {/* ══ IDENTITY CARD ══════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 overflow-hidden relative"
        >
          {/* Full-card banner background — the whole card sits on the banner */}
          <div
            className={`absolute inset-0 ${hasBannerStyle ? '' : `bg-gradient-to-br ${avatarColor(member.username)}`}`}
            style={hasBannerStyle ? { ...bannerStyle, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          />
          {/* Slight dark scrim for overall legibility */}
          <div className="absolute inset-0 bg-black/25" />

          {/* Banner strip — height anchor + customize button */}
          <div className="relative h-24">
            {isOwnProfile && (
              <>
                <button
                  type="button"
                  onClick={() => setShowBannerEditor(v => !v)}
                  className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-black/50 hover:bg-black/65 text-white text-xs font-semibold transition-colors"
                >
                  {savingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Palette className="w-3.5 h-3.5" />}
                  Customize
                </button>
                <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
              </>
            )}
          </div>

          {/* Identity body — frosted glass layer over the banner */}
          <div className="relative px-5 pb-5 backdrop-blur-xl bg-black/30 border-t border-white/10">
            <div className="flex gap-4 justify-between items-end -mt-10">
              {/* Left: Avatar + Name */}
              <div className="flex gap-4 items-end flex-1 min-w-0">
                {/* Avatar */}
                <div className="shrink-0 relative z-10">
                  {member.avatar_url && avatarUrl
                    ? <img src={avatarUrl} alt={displayName}
                        className="w-20 h-20 rounded-full object-cover ring-2 ring-white/20 shadow-lg"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    : <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${avatarColor(member.username)} flex items-center justify-center text-white font-bold text-3xl ring-2 ring-white/20 shadow-lg`}>
                        {(displayName || member.username).charAt(0).toUpperCase()}
                      </div>
                  }
                </div>

                {/* Name block */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-white leading-tight truncate drop-shadow">
                      {displayName || member.username}
                    </h1>
                    {member.is_admin && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/25 text-purple-200 border border-purple-400/30 shrink-0">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-white/45">@{member.username}</p>
                </div>
              </div>

              {/* Right: Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {isOwnProfile ? (
                  <button
                    onClick={() => onNavigate('account')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit Profile
                  </button>
                ) : (
                  <button
                    onClick={handleMessage}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Message
                  </button>
                )}
              </div>
            </div>


            {/* Banner editor */}
            {isOwnProfile && showBannerEditor && (
              <div className="mt-4 rounded-xl border border-white/15 p-3 bg-black/30 backdrop-blur-sm space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white/80">Banner Style</p>
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={savingBanner}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 transition-colors disabled:opacity-60"
                  >
                    <ImagePlus className="w-3.5 h-3.5" /> Upload Image
                  </button>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-white/45 mb-1.5">Solid Colors</p>
                  <div className="flex flex-wrap gap-2">
                    {BANNER_SOLID_COLORS.map(color => (
                      <button key={color} type="button"
                        onClick={() => saveBannerFields({ bannerMode: 'solid', bannerColor: color })}
                        className="w-7 h-7 rounded-full border-2 border-white/30 shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-white/45 mb-1.5">Gradients</p>
                  <div className="flex flex-wrap gap-2">
                    {BANNER_GRADIENTS.map((g, i) => (
                      <button key={i} type="button"
                        onClick={() => saveBannerFields({ bannerMode: 'gradient', bannerGradientFrom: g.from, bannerGradientTo: g.to })}
                        className="w-14 h-7 rounded-full border-2 border-white/30 shadow-sm hover:scale-105 transition-transform"
                        style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ══ CONTRIBUTION STATS ═════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="hidden"
        >
          {[
            { icon: FileText, label: 'Posts',     value: posts.length,           color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-500/10' },
            { icon: Pin,       label: 'Pins',      value: pins.length,               color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
            { icon: Hash,      label: 'Interests', value: member.tags?.length ?? 0, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 py-2.5 flex items-center justify-center gap-2">
              <div className={`w-6 h-6 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
            </div>
          ))}
        </motion.div>

        {/* ══ TABS ═══════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
        >
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 dark:border-zinc-800">
            {(['overview', 'posts', 'notes'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${
                  activeTab === tab
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {tab === 'overview' ? 'Overview' : tab === 'posts' ? `Posts${posts.length > 0 ? ` (${posts.length})` : ''}` : `Notes${notes.length > 0 ? ` (${notes.length})` : ''}`}
                {activeTab === tab && (
                  <motion.div layoutId="profile-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-purple-500 dark:bg-purple-400" />
                )}
              </button>
            ))}
            {pins.length > 0 && (
              <button
                key="pins"
                onClick={() => setActiveTab('pins')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${
                  activeTab === 'pins'
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {`Pins (${pins.length})`}
                {activeTab === 'pins' && (
                  <motion.div layoutId="profile-tab-indicator" className="absolute bottom-0 inset-x-0 h-0.5 bg-purple-500 dark:bg-purple-400" />
                )}
              </button>
            )}
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
                {/* Identity metadata — civic, local, network */}
                <div className="space-y-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/?hub=${slug}`;
                      window.open(url, '_blank');
                    }}
                    className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                  >
                    <Building2 className="w-4 h-4 text-purple-500 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400">Member of Hub</span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate hover:text-purple-700 dark:hover:text-purple-300 transition-colors">{hubName}</span>
                  </button>
                  {member.location && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <MapPin className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="truncate">{member.location}</span>
                    </div>
                  )}
                  {member.created_at && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Calendar className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span>Joined {formatJoinDate(member.created_at)}</span>
                    </div>
                  )}
                  {member.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <a
                        href={member.website.startsWith('http') ? member.website : `https://${member.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:underline truncate"
                      >
                        {member.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                </div>

                {/* Bio */}
                {member.bio ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">About</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{member.bio}</p>
                  </div>
                ) : isOwnProfile ? (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 p-4 text-center">
                    <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">Add a bio to tell your community who you are.</p>
                    <button onClick={() => onNavigate('account')} className="text-sm text-purple-600 dark:text-purple-400 font-semibold hover:underline">
                      Complete your profile
                    </button>
                  </div>
                ) : null}

                {/* Community focus — tags */}
                {(member.tags?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Community Focus</p>
                    <div className="flex flex-wrap gap-2">
                      {member.tags!.map(tag => (
                        <button
                          key={tag}
                          onClick={() => { sessionStorage.setItem('citinet-filter-tag', tag); onNavigate('discover'); }}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors font-medium"
                        >
                          <Tag className="w-3 h-3" />{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty overview */}
                {!member.bio && (member.tags?.length ?? 0) === 0 && !isOwnProfile && (
                  <div className="py-6 text-center">
                    <p className="text-sm text-slate-400 dark:text-slate-500">No overview yet.</p>
                  </div>
                )}
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
              >
                {posts.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {posts.map((post, i) => (
                      <motion.button
                        key={post.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => setSelectedPost(post)}
                        className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.DISCUSSION}`}>
                                {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(post.created_at)}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                              {post.title}
                            </p>
                            {post.body && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{post.body}</p>
                            )}
                          </div>
                          {post.reply_count > 0 && (
                            <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 shrink-0 mt-0.5">
                              <MessageCircle className="w-3.5 h-3.5" />{post.reply_count}
                            </div>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <FileText className="w-8 h-8 text-slate-200 dark:text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {isOwnProfile ? 'You haven\'t posted yet.' : 'No posts yet.'}
                    </p>
                    {isOwnProfile && (
                      <button onClick={() => onNavigate('feed')} className="mt-2 text-sm text-purple-600 dark:text-purple-400 font-semibold hover:underline">
                        Start a discussion
                      </button>
                    )}
                  </div>
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
              >
                {notes.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {notes.map((note, i) => (
                      <motion.div
                        key={note.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => setSelectedNote(note)}
                        className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors group cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {note.is_pinned && (
                                <Pin className="w-3.5 h-3.5 text-amber-500" />
                              )}
                              <span className="text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(note.updated_at)}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                              {note.title || 'Untitled'}
                            </p>
                            {note.body_plain && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{note.body_plain}</p>
                            )}
                          </div>
                          {note.color && (
                            <div
                              className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                              style={{ backgroundColor: note.color }}
                            />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <BookOpen className="w-8 h-8 text-slate-200 dark:text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {isOwnProfile ? 'No public notes yet.' : 'No shared notes.'}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Pins tab ── */}
            {activeTab === 'pins' && pins.length > 0 && (
              <motion.div
                key="pins"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {pins.map((pin, i) => (
                    <motion.button
                      key={pin.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => {
                        sessionStorage.setItem('citinet-focus-pin', pin.id);
                        onNavigate('atlas');
                      }}
                      className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              {pin.category}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(pin.createdAt)}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                            {pin.title}
                          </p>
                          {pin.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{pin.description}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 shrink-0 text-slate-600 dark:text-slate-300">
                          <Map className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
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

      {/* Share profile modal */}
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
        return (
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
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden"
              >
                {/* Profile identity card */}
                <div className="relative">
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
                    <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-white leading-tight">
                      {displayName || member.username}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                    <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate font-mono">{profileUrl}</span>
                    <button
                      onClick={handleCopy}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        copied
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
