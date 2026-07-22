import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Users, Globe, MessageCircle, LayoutGrid } from 'lucide-react';
import { hubService } from '../services/hubService';
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

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }
function getAvatarColor(name: string) {
  const colors = ['from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500', 'from-violet-500 to-purple-500'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function truncateText(text: string, maxLength: number = 150): { truncated: string; isTruncated: boolean } {
  if (!text || text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return {
    truncated: (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated).trim() + '…',
    isTruncated: true
  };
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
  const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'files'>('feed');
  const [resolvedSrc, setResolvedSrc] = useState('');
  const srcParam = searchParams.get('src') ?? '';

  useEffect(() => {
    if (!hubSlug || !spaceSlug) { setError('Invalid share link'); setLoading(false); return; }

    const localConn = hubService.getHubConnection(hubSlug);
    const localTunnelUrl = localConn?.hub?.tunnelUrl;
    const isShell = (u: string) => !u || u === 'http://' || u === 'https://';
    const fetchBase = (localTunnelUrl && !isShell(localTunnelUrl)) ? localTunnelUrl : srcParam;

    if (!fetchBase || !/^https?:\/\/.+/.test(fetchBase)) {
      setError('This share link is missing the hub source. Ask the owner to re-copy the link.');
      setLoading(false);
      return;
    }

    setResolvedSrc(fetchBase);
    fetch(`${fetchBase}/api/public/spaces/${spaceSlug}`)
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
      <header className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-baseline gap-1.5 transition-opacity hover:opacity-70">
          <span className="text-lg font-bold tracking-tight text-white">citinet</span>
          <span className="text-xs text-zinc-500 font-medium">community cloud</span>
        </a>
        {data && (
          <a href={`${resolvedSrc || srcParam}?auth=true`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white transition-colors">
            Sign in to Join
          </a>
        )}
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
              <div className="h-24" style={getBannerStyle(data.space, resolvedSrc || srcParam)} />
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

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 gap-6">
              {(['feed', 'members', 'files'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 px-1 text-sm font-medium border-b-2 -mb-px capitalize whitespace-nowrap transition-colors ${activeTab === tab ? 'border-purple-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'feed' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">
                  Posts · {data.posts.length}
                </p>
                {data.posts.length === 0 && (
                  <div className="text-center py-10 text-zinc-600 text-sm">No posts in this space yet.</div>
                )}
                {data.posts.map(post => {
                  const mediaUrl = (post as any).media_url as string | undefined
                    ?? (post.media_file_name ? `${resolvedSrc || srcParam}/api/public/spaces/${spaceSlug}/files/${encodeURIComponent(post.media_file_name)}` : null);
                  const isVideo = mediaUrl && /\.(mp4|webm|mov)$/i.test(mediaUrl);
                  const { truncated, isTruncated } = truncateText(post.body);
                  
                  // Detect external/third-party source posts
                  const authorUsernameLower = (post.author_username || '').toLowerCase();
                  const externalSourceMeta = (post as any).source || (post as any).platform || (post as any).origin || (post as any).source_app;
                  const isExternalProxyAuthor = (
                    !!externalSourceMeta
                    || authorUsernameLower === 'email'
                    || authorUsernameLower.includes('@')
                    || !post.author_id
                  );
                  const sourceBrandName = (post as any).source_name
                    || (post as any).app_name
                    || (post as any).platform_name
                    || (post as any).source
                    || 'External Source';
                  const sourceBrandLogo = (post as any).source_logo_url
                    || (post as any).source_favicon_url
                    || null;
                  
                  return (
                    <div key={post.id} className="bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        {isExternalProxyAuthor ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/70 border border-zinc-700/80">
                            {sourceBrandLogo
                              ? <img src={sourceBrandLogo} className="w-3.5 h-3.5 rounded-sm object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <LayoutGrid className="w-3 h-3 text-zinc-400" />
                            }
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Shared from</span>
                            <span className="text-xs font-semibold text-zinc-200 leading-none">{sourceBrandName}</span>
                          </div>
                        ) : (
                          <>
                            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(post.author_username)} flex items-center justify-center text-white text-xs font-semibold`}>
                              {getInitials(post.author_username)}
                            </div>
                            <span className="text-sm font-medium text-white">{post.author_username}</span>
                          </>
                        )}
                        <span className="text-xs text-zinc-500 ml-auto">{timeAgo(post.created_at)}</span>
                      </div>
                      {post.body && (
                        <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                          {truncated}{isTruncated && <span className="text-purple-400 font-medium"> Sign in to read more</span>}
                        </p>
                      )}
                      {mediaUrl && (
                        <div className="mt-3 rounded-xl overflow-hidden">
                          {isVideo
                            ? <video src={mediaUrl} controls preload="auto" className="w-full max-h-64 object-contain bg-black rounded-xl" />
                            : <img src={mediaUrl} alt={post.title ?? ''} className="w-full max-h-64 object-cover rounded-xl" />}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-700">
                        <span className="text-xs text-zinc-500 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {post.reply_count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">
                  Members · {data.space.member_count || 0}
                </p>
                <div className="text-center py-10 text-zinc-600 text-sm">
                  Member list is private. Sign in to see who's in this space.
                </div>
              </div>
            )}

            {activeTab === 'files' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">
                  Files
                </p>
                <div className="text-center py-10 text-zinc-600 text-sm">
                  File access is private. Sign in to browse files shared in this space.
                </div>
              </div>
            )}
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
