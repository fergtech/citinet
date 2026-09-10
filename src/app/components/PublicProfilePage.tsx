import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { hubService } from '../services/hubService';
import { AvatarFallback } from './icons';
import { ShareWallpaper } from './ShareWallpaper';
import {
  Loader2, AlertCircle, MapPin, Globe, Calendar, Tag,
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

// ── Page ──────────────────────────────────────────────────────

export function PublicProfilePage() {
  const { hubSlug, username } = useParams<{ hubSlug: string; username: string }>();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
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

    const fetchWithTimeout = (url: string, ms: number) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    };

    const tryBase = async (base: string) => {
      const pRes = await fetchWithTimeout(`${base}/api/public/profile/${enc}`, 5000);
      if (!pRes.ok) throw new Error('not_found');
      setProfile(await pRes.json() as PublicProfile);
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

  return (
    <div className="min-h-screen flex flex-col">
      <ShareWallpaper />
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tracking-tight cn-wordmark">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-14">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-zinc-400">Loading profile…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 mt-14 text-center max-w-sm">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : profile ? (
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/30 overflow-visible">

            {/* ── Banner + Avatar ── */}
            <div className="relative">
              <div className="rounded-t-2xl overflow-hidden">
                <BannerArea profile={profile} src={src} />
              </div>
              <div className="absolute -bottom-10 left-6">
                {profile.avatar_url ? (
                  <img
                    src={`${src}/api/auth/avatar/${encodeURIComponent(profile.user_id)}`}
                    className="w-20 h-20 rounded-full border-4 border-zinc-900 object-cover"
                    alt={profile.username}
                  />
                ) : (
                  <AvatarFallback className="w-20 h-20 rounded-full border-4 border-zinc-900" name={profile.username} />
                )}
              </div>
            </div>

            {/* ── Profile info ── */}
            <div className="pt-14 px-6 pb-6">
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
          </div>
        ) : null}
      </main>
    </div>
  );
}
