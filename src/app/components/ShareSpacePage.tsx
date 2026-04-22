import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Users, Globe, MessageCircle } from 'lucide-react';
import type { HubPost } from '../types/hub';

interface PublicSpace {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  visibility: string;
  banner_mode?: string | null;
  banner_color?: string | null;
  banner_gradient_from?: string | null;
  banner_gradient_to?: string | null;
  banner_image_file_name?: string | null;
  banner_image_url?: string | null;
  member_count?: number;
  created_at: string;
}

interface PublicSpaceData {
  space: PublicSpace;
  posts: HubPost[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getBannerStyle(space: PublicSpace, src: string): React.CSSProperties {
  if (space.banner_mode === 'image') {
    const url = space.banner_image_url ?? (space.banner_image_file_name ? `${src}/api/spaces/${space.slug}/banner` : null);
    if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (space.banner_mode === 'solid' && space.banner_color) {
    return { backgroundColor: space.banner_color };
  }
  if (space.banner_mode === 'gradient' && space.banner_gradient_from && space.banner_gradient_to) {
    return { backgroundImage: `linear-gradient(135deg, ${space.banner_gradient_from}, ${space.banner_gradient_to})` };
  }
  const grads = [
    ['#2563eb', '#7c3aed'], ['#0f766e', '#2563eb'], ['#7c3aed', '#ec4899'],
    ['#1d4ed8', '#0f766e'], ['#be123c', '#7c2d12'], ['#374151', '#111827'],
  ];
  let h = 0;
  for (let i = 0; i < space.name.length; i++) h = space.name.charCodeAt(i) + ((h << 5) - h);
  const [from, to] = grads[Math.abs(h) % grads.length];
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

export function ShareSpacePage() {
  const { hubSlug, spaceSlug } = useParams<{ hubSlug: string; spaceSlug: string }>();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<PublicSpaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const src = searchParams.get('src') ?? '';

  useEffect(() => {
    if (!hubSlug || !spaceSlug) { setError('Invalid share link'); setLoading(false); return; }

    if (!src || !/^https?:\/\/.+/.test(src)) {
      setError('This share link is missing the hub source. Ask the owner to re-copy the link.');
      setLoading(false);
      return;
    }

    fetch(`${src}/api/public/spaces/${spaceSlug}`)
      .then(async r => {
        if (!r.ok) {
          setError('This space is not publicly accessible or no longer exists.');
          return;
        }
        setData(await r.json() as PublicSpaceData);
      })
      .catch(() => setError('Could not reach the hub. It may be offline.'))
      .finally(() => setLoading(false));
  }, [hubSlug, spaceSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-900 px-6 py-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tracking-tight text-white">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="text-sm text-zinc-400">Loading space…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-center max-w-sm">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : data ? (
          <div className="w-full space-y-4">
            {/* Space header card */}
            <div className="rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
              <div className="h-24" style={getBannerStyle(data.space, src)} />
              <div className="bg-zinc-900 px-6 py-4">
                <h1 className="text-xl font-bold text-white mb-1">{data.space.name}</h1>
                {data.space.description && (
                  <p className="text-sm text-zinc-400 mb-3">{data.space.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  {data.space.member_count !== undefined && (
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {data.space.member_count} members</span>
                  )}
                  <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Shared from <span className="text-zinc-400 ml-0.5">{hubSlug}</span></span>
                </div>
              </div>
            </div>

            {/* Posts */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">
                Posts · {data.posts.length}
              </p>
              {data.posts.length === 0 && (
                <div className="text-center py-10 text-zinc-600 text-sm">No posts in this space yet.</div>
              )}
              {data.posts.map(post => {
                const mediaUrl = (post as any).media_url as string | undefined
                  ?? (post.media_file_name ? `${src}/api/public/spaces/${spaceSlug}/files/${encodeURIComponent(post.media_file_name)}` : null);
                const isVideo = mediaUrl && /\.(mp4|webm|mov)$/i.test(mediaUrl);
                return (
                  <div key={post.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    {mediaUrl && (
                      isVideo
                        ? <video src={mediaUrl} className="w-full max-h-72 object-cover" muted autoPlay loop playsInline />
                        : <img src={mediaUrl} alt="" className="w-full max-h-72 object-cover" />
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-zinc-400">@{post.author_username}</span>
                        <span className="text-xs text-zinc-600 ml-auto">{timeAgo(post.created_at)}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1">{post.title}</h3>
                      {post.body && <p className="text-sm text-zinc-400 leading-relaxed">{post.body}</p>}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                        <span className="text-xs text-zinc-600 flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" /> {post.reply_count}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="px-6 py-5 text-center">
        <p className="text-xs text-zinc-700">
          Space is hosted on the hub owner's device and served over their Tailscale connection.
        </p>
      </footer>
    </div>
  );
}
