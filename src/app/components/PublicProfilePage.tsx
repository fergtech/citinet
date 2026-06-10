import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { hubService } from '../services/hubService';
import {
  Loader2, AlertCircle, MapPin, Globe, Link as LinkIcon,
  Calendar, MessageCircle, Tag, NotebookPen, Pin, FileText,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface PublicProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  tags: string[] | null;
  avatar_url: string | null;
  profile_headline: string | null;
  website: string | null;
  banner_mode: string | null;
  banner_color: string | null;
  banner_gradient_from: string | null;
  banner_gradient_to: string | null;
  banner_image_file_name: string | null;
  role: string | null;
  created_at: string;
}

interface PublicPost {
  id: string;
  category: string;
  title: string;
  body: string;
  created_at: string;
  reply_count: number;
  media_file_name?: string | null;
}

interface PublicNote {
  id: string;
  title: string;
  web_body_plain: string | null;
  color: string | null;
  is_pinned: boolean;
  updated_at: string;
}

interface PublicPin {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description: string | null;
  category: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────

const PREVIEW_LIMIT = 4;

function getMediaVariant(name?: string | null): 'image' | 'video' | null {
  if (!name) return null;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  return null;
}

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',    'from-violet-500 to-purple-500',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const CATEGORY_COLORS: Record<string, string> = {
  DISCUSSION:   'bg-blue-500/15 text-blue-400',
  ANNOUNCEMENT: 'bg-amber-500/15 text-amber-400',
  PROJECT:      'bg-emerald-500/15 text-emerald-400',
  REQUEST:      'bg-rose-500/15 text-rose-400',
  EVENT:        'bg-purple-500/15 text-purple-400',
};

const PIN_CATEGORY_COLORS: Record<string, string> = {
  food:         'bg-orange-500/15 text-orange-400',
  service:      'bg-blue-500/15 text-blue-400',
  community:    'bg-emerald-500/15 text-emerald-400',
  safety:       'bg-red-500/15 text-red-400',
  nature:       'bg-teal-500/15 text-teal-400',
  event:        'bg-purple-500/15 text-purple-400',
  other:        'bg-zinc-500/15 text-zinc-400',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function BannerArea({ profile, src }: { profile: PublicProfile; src: string }) {
  if (profile.banner_mode === 'image' && profile.banner_image_file_name) {
    const imgUrl = `${src}/api/public/files/${encodeURIComponent(profile.banner_image_file_name)}`;
    return <div className="h-36 w-full bg-cover bg-center" style={{ backgroundImage: `url(${imgUrl})` }} />;
  }
  if (profile.banner_mode === 'gradient' && profile.banner_gradient_from && profile.banner_gradient_to) {
    return <div className="h-36 w-full" style={{ background: `linear-gradient(135deg, ${profile.banner_gradient_from}, ${profile.banner_gradient_to})` }} />;
  }
  if (profile.banner_mode === 'solid' && profile.banner_color) {
    return <div className="h-36 w-full" style={{ backgroundColor: profile.banner_color }} />;
  }
  return <div className="h-36 w-full bg-gradient-to-br from-zinc-800 to-zinc-900" />;
}

// ── Mini cards ────────────────────────────────────────────────

function PostMiniCard({ post, src }: { post: PublicPost; src: string }) {
  const mediaVariant = getMediaVariant(post.media_file_name);
  const mediaUrl = post.media_file_name
    ? `${src}/api/public/files/${encodeURIComponent(post.media_file_name)}`
    : null;
  const catColor = CATEGORY_COLORS[post.category] ?? 'bg-zinc-500/15 text-zinc-400';

  return (
    <div className="bg-zinc-800/60 rounded-xl overflow-hidden border border-zinc-700/50 flex flex-col">
      {mediaUrl && mediaVariant === 'image' && (
        <div className="relative w-full h-24 overflow-hidden bg-zinc-900 shrink-0">
          <div
            className="absolute inset-0 scale-110 blur-lg opacity-60"
            style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          <img src={mediaUrl} alt="" className="relative w-full h-full object-contain" />
        </div>
      )}
      {mediaUrl && mediaVariant === 'video' && (
        <div className="relative w-full h-24 bg-black shrink-0 flex items-center justify-center">
          <video src={mediaUrl} className="w-full h-full object-contain" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[9px] border-l-white ml-0.5" />
            </div>
          </div>
        </div>
      )}
      <div className="p-2.5 flex-1 flex flex-col gap-1">
        <span className={`self-start text-[9px] font-bold px-1.5 py-0.5 rounded-md ${catColor}`}>
          {post.category.charAt(0) + post.category.slice(1).toLowerCase()}
        </span>
        <p className="text-xs font-semibold text-zinc-200 leading-snug line-clamp-2">{post.title}</p>
        {post.body && !mediaUrl && (
          <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2 mt-0.5">{post.body}</p>
        )}
        {typeof post.reply_count === 'number' && post.reply_count > 0 && (
          <div className="flex items-center gap-1 mt-auto pt-1 text-[10px] text-zinc-600">
            <MessageCircle className="w-2.5 h-2.5" />
            {post.reply_count}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteMiniCard({ note }: { note: PublicNote }) {
  const accent = note.color ?? '#6366f1';
  return (
    <div
      className="rounded-xl border border-zinc-700/50 overflow-hidden flex flex-col"
      style={{ background: `color-mix(in srgb, ${accent} 8%, #27272a)` }}
    >
      {/* Color accent bar */}
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />
      <div className="p-2.5 flex-1 flex flex-col gap-1">
        {note.is_pinned && (
          <Pin className="w-2.5 h-2.5 text-amber-400 shrink-0" />
        )}
        <p className="text-xs font-semibold text-zinc-200 leading-snug line-clamp-2">
          {note.title || 'Untitled'}
        </p>
        {note.web_body_plain && (
          <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-3 mt-0.5">
            {note.web_body_plain}
          </p>
        )}
        <p className="text-[9px] text-zinc-600 mt-auto pt-1">{formatDate(note.updated_at)}</p>
      </div>
    </div>
  );
}

function PinMiniCard({ pin }: { pin: PublicPin }) {
  const catColor = PIN_CATEGORY_COLORS[pin.category?.toLowerCase()] ?? PIN_CATEGORY_COLORS.other;
  return (
    <div className="bg-zinc-800/60 rounded-xl border border-zinc-700/50 p-2.5 flex flex-col gap-1.5">
      <span className={`self-start text-[9px] font-bold px-1.5 py-0.5 rounded-md ${catColor}`}>
        {pin.category}
      </span>
      <p className="text-xs font-semibold text-zinc-200 leading-snug line-clamp-2">{pin.title}</p>
      {pin.description && (
        <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{pin.description}</p>
      )}
      <p className="text-[9px] text-zinc-600 font-mono mt-auto pt-1">
        {pin.latitude.toFixed(3)}, {pin.longitude.toFixed(3)}
      </p>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────

function BentoSection({
  title, icon, count, hasMore, joinUrl, hubSlug, children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  hasMore: boolean;
  joinUrl: string;
  hubSlug: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-sm font-semibold text-zinc-300">{title}</span>
        <span className="ml-auto text-xs text-zinc-600">{count}</span>
      </div>

      {/* Mini grid */}
      <div className="px-3 grid grid-cols-2 gap-2">
        {children}
      </div>

      {/* Join CTA */}
      {hasMore && (
        <div className="px-4 py-3 mt-2 border-t border-zinc-800/60">
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            Join {hubSlug} to see more →
          </a>
        </div>
      )}
      {!hasMore && <div className="pb-3" />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export function PublicProfilePage() {
  const { hubSlug, username } = useParams<{ hubSlug: string; username: string }>();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts]     = useState<PublicPost[]>([]);
  const [notes, setNotes]     = useState<PublicNote[]>([]);
  const [pins, setPins]       = useState<PublicPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!hubSlug || !username) { setError('Invalid profile link.'); setLoading(false); return; }

    // Prefer local hub connection when available — avoids Tailscale hairpin
    // issues where the public *.ts.net URL can't be reached from the same machine.
    const localConn = hubService.getHubConnection(hubSlug);
    const localTunnelUrl = localConn?.hub?.tunnelUrl;
    const srcParam = searchParams.get('src');
    const fetchBase = (localTunnelUrl && localTunnelUrl !== '' && localTunnelUrl !== 'http://' && localTunnelUrl !== 'https://')
      ? localTunnelUrl
      : srcParam;

    if (!fetchBase || !/^https?:\/\/.+/.test(fetchBase)) {
      setError('This profile cannot be reached — the hub does not have a public tunnel URL configured.');
      setLoading(false);
      return;
    }

    const enc = encodeURIComponent(username);
    const lim = PREVIEW_LIMIT + 1;

    const safeJson = async (res: Response, fallback: unknown) => {
      if (!res.ok) return fallback;
      try { return await res.json(); } catch { return fallback; }
    };

    const fetchWithTimeout = (url: string, ms: number) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    };

    const tryBase = async (base: string) => {
      const [pRes, postsRes, notesRes, pinsRes] = await Promise.all([
        fetchWithTimeout(`${base}/api/public/profile/${enc}`, 5000),
        fetchWithTimeout(`${base}/api/public/profile/${enc}/posts?limit=${lim}`, 5000),
        fetchWithTimeout(`${base}/api/public/profile/${enc}/notes?limit=${lim}`, 5000),
        fetchWithTimeout(`${base}/api/public/profile/${enc}/pins?limit=${lim}`, 5000),
      ]);
      if (!pRes.ok) throw new Error('not_found');
      const profileData = await pRes.json();
      const [postsData, notesData, pinsData] = await Promise.all([
        safeJson(postsRes, { posts: [] }),
        safeJson(notesRes, { notes: [] }),
        safeJson(pinsRes,  { pins:  [] }),
      ]);
      setProfile(profileData as PublicProfile);
      setPosts(((postsData as { posts?: PublicPost[] }).posts ?? []) as PublicPost[]);
      setNotes(((notesData as { notes?: PublicNote[] }).notes ?? []) as PublicNote[]);
      setPins(((pinsData  as { pins?:  PublicPin[]  }).pins  ?? []) as PublicPin[]);
    };

    (async () => {
      const bases = [fetchBase, 'http://localhost:9090'];
      for (const base of bases) {
        try { await tryBase(base); return; }
        catch (err) {
          if ((err as Error).message === 'not_found') {
            setError('This profile is not public or does not exist.');
            return;
          }
        }
      }
      setError('Could not reach the hub — it may be offline or the tunnel is not configured.');
    })()
      .finally(() => setLoading(false));
  }, [hubSlug, username]); // eslint-disable-line react-hooks/exhaustive-deps

  const src     = searchParams.get('src') ?? '';
  const joinUrl = 'https://citinet.cloud';

  const shownPosts = posts.slice(0, PREVIEW_LIMIT);
  const shownNotes = notes.slice(0, PREVIEW_LIMIT);
  const shownPins  = pins.slice(0, PREVIEW_LIMIT);
  const morePosts  = posts.length > PREVIEW_LIMIT;
  const moreNotes  = notes.length > PREVIEW_LIMIT;
  const morePins   = pins.length  > PREVIEW_LIMIT;

  const hasContent = shownPosts.length > 0 || shownNotes.length > 0 || shownPins.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tracking-tight text-white">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </header>

      <main className="flex-1 flex flex-col items-center pb-16">
        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-24">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-zinc-400">Loading profile…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 mt-24 text-center max-w-sm px-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : profile ? (
          <div className="w-full max-w-2xl">

            {/* ── Banner + Avatar ── */}
            <div className="relative">
              <BannerArea profile={profile} src={src} />
              <div className="absolute -bottom-10 left-6">
                {profile.avatar_url ? (
                  <img
                    src={`${src}/api/auth/avatar/${encodeURIComponent(profile.user_id)}`}
                    className="w-20 h-20 rounded-full border-4 border-zinc-950 object-cover"
                    alt={profile.username}
                  />
                ) : (
                  <div className={`w-20 h-20 rounded-full border-4 border-zinc-950 bg-gradient-to-br ${avatarColor(profile.username)} flex items-center justify-center`}>
                    <span className="text-xl font-bold text-white">{profile.username.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Profile info ── */}
            <div className="mt-14 px-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-xl font-bold text-white">{profile.display_name || profile.username}</h1>
                  <p className="text-sm text-zinc-400">@{profile.username}</p>
                </div>
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                >
                  Join {hubSlug}
                </a>
              </div>

              {profile.profile_headline && (
                <p className="mt-3 text-sm text-zinc-300">{profile.profile_headline}</p>
              )}
              {profile.bio && (
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{profile.bio}</p>
              )}

              <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-500">
                {profile.location && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.location}</span>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                    <Globe className="w-3 h-3" />{profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </span>
              </div>

              {profile.tags && profile.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {profile.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs">
                      <Tag className="w-3 h-3" />{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bento content grid ── */}
            <div className="mx-6 mt-8 mb-2">
              {hasContent ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <BentoSection
                    title="Posts" icon={<FileText className="w-3.5 h-3.5" />}
                    count={shownPosts.length} hasMore={morePosts} joinUrl={joinUrl} hubSlug={hubSlug!}
                  >
                    {shownPosts.map(p => <PostMiniCard key={p.id} post={p} src={src} />)}
                  </BentoSection>

                  <BentoSection
                    title="Notes" icon={<NotebookPen className="w-3.5 h-3.5" />}
                    count={shownNotes.length} hasMore={moreNotes} joinUrl={joinUrl} hubSlug={hubSlug!}
                  >
                    {shownNotes.map(n => <NoteMiniCard key={n.id} note={n} />)}
                  </BentoSection>

                  <BentoSection
                    title="Pins" icon={<Pin className="w-3.5 h-3.5" />}
                    count={shownPins.length} hasMore={morePins} joinUrl={joinUrl} hubSlug={hubSlug!}
                  >
                    {shownPins.map(p => <PinMiniCard key={p.id} pin={p} />)}
                  </BentoSection>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-zinc-500">Nothing public shared yet.</p>
                </div>
              )}
            </div>

            {/* ── Footer CTA ── */}
            <div className="mx-6 mt-8 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
              <p className="text-sm text-zinc-400 mb-3">
                Want to connect with <span className="text-white font-medium">{profile.display_name || profile.username}</span> and the {hubSlug} community?
              </p>
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Join {hubSlug} on Citinet
              </a>
              <p className="mt-3 text-xs text-zinc-600 flex items-center justify-center gap-1">
                <LinkIcon className="w-3 h-3" />
                Profile hosted on this community's own hub
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
