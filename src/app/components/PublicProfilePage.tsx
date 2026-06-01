import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Loader2, AlertCircle, MapPin, Globe, Link as LinkIcon,
  Calendar, MessageCircle, Tag, NotebookPen,
} from 'lucide-react';

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
  event_date?: string | null;
  event_location?: string | null;
  author_username: string;
  reply_count: number;
  media_file_name?: string | null;
}

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
  DISCUSSION:   'bg-blue-500/10 text-blue-400 ring-blue-500/20',
  ANNOUNCEMENT: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
  PROJECT:      'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  REQUEST:      'bg-rose-500/10 text-rose-400 ring-rose-500/20',
  EVENT:        'bg-purple-500/10 text-purple-400 ring-purple-500/20',
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

export function PublicProfilePage() {
  const { hubSlug, username } = useParams<{ hubSlug: string; username: string }>();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts]     = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!hubSlug || !username) { setError('Invalid profile link.'); setLoading(false); return; }

    const src = searchParams.get('src');
    if (!src || !/^https?:\/\/.+/.test(src)) {
      setError('This profile cannot be reached — the hub does not have a public tunnel URL. The owner needs to set up Tailscale Funnel.');
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`${src}/api/public/profile/${encodeURIComponent(username)}`),
      fetch(`${src}/api/public/profile/${encodeURIComponent(username)}/posts`),
    ])
      .then(async ([pRes, postsRes]) => {
        if (!pRes.ok) { setError('This profile is not public or does not exist.'); return; }
        const [profileData, postsData] = await Promise.all([pRes.json(), postsRes.ok ? postsRes.json() : { posts: [] }]);
        setProfile(profileData as PublicProfile);
        setPosts((postsData.posts ?? []) as PublicPost[]);
      })
      .catch((err) => setError(`Could not reach the hub at ${src} — it may be offline or the tunnel URL is wrong. (${err?.message ?? 'network error'})`))
      .finally(() => setLoading(false));
  }, [hubSlug, username]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = searchParams.get('src') ?? '';

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
            {/* Banner + Avatar */}
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

            {/* Profile info */}
            <div className="mt-14 px-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {profile.display_name || profile.username}
                  </h1>
                  <p className="text-sm text-zinc-400">@{profile.username}</p>
                </div>
                <a
                  href={`https://citinet.cloud`}
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

            {/* Divider */}
            <div className="mx-6 mt-6 border-t border-zinc-800" />

            {/* Posts */}
            <div className="px-6 mt-6">
              <h2 className="text-sm font-semibold text-zinc-400 mb-4">Posts</h2>
              {posts.length === 0 ? (
                <div className="text-center py-10">
                  <NotebookPen className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No public posts yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {posts.map(post => {
                    const mediaVariant = getMediaVariant(post.media_file_name);
                    const mediaUrl = post.media_file_name
                      ? `${src}/api/public/files/${encodeURIComponent(post.media_file_name)}`
                      : null;
                    return (
                      <div key={post.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                        {/* Media */}
                        {mediaUrl && mediaVariant === 'image' && (
                          <div className="relative w-full h-56 overflow-hidden">
                            {/* Blurred background fill — no black bars, uniform height */}
                            <div
                              className="absolute inset-0 scale-110 blur-xl opacity-70"
                              style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                            />
                            <img
                              src={mediaUrl}
                              alt=""
                              className="relative w-full h-full object-contain"
                            />
                          </div>
                        )}
                        {mediaUrl && mediaVariant === 'video' && (
                          <video
                            src={mediaUrl}
                            controls
                            className="w-full h-56 object-contain bg-black"
                          />
                        )}
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${CATEGORY_COLORS[post.category] ?? 'bg-zinc-800 text-zinc-400 ring-zinc-700'}`}>
                              {post.category}
                            </span>
                            <span className="text-xs text-zinc-500">{formatDate(post.created_at)}</span>
                          </div>
                          <p className="text-sm font-medium text-zinc-200 leading-snug">{post.title}</p>
                          {post.body && (
                            <p className="mt-1 text-xs text-zinc-400 leading-relaxed line-clamp-3">{post.body}</p>
                          )}
                          {typeof post.reply_count === 'number' && (
                            <div className="flex items-center gap-1 mt-3 text-xs text-zinc-600">
                              <MessageCircle className="w-3 h-3" />
                              {post.reply_count === 0 ? 'No replies' : `${post.reply_count} ${post.reply_count === 1 ? 'reply' : 'replies'}`}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer CTA */}
            <div className="mx-6 mt-10 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
              <p className="text-sm text-zinc-400 mb-3">
                Want to connect with <span className="text-white font-medium">{profile.display_name || profile.username}</span> and the {hubSlug} community?
              </p>
              <a
                href={`https://citinet.cloud`}
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
