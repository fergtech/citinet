import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Loader2, AlertCircle, MessageCircle, Calendar, MapPin, Users,
  Megaphone, Briefcase, HelpCircle, BarChart3, Newspaper,
} from 'lucide-react';
import { hubService } from '../services/hubService';
import { AvatarFallback } from './icons';
import { ShareWallpaper } from './ShareWallpaper';
import type { HubPost } from '../types/hub';

const CATEGORY_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  DISCUSSION:   { label: 'Discussion',   Icon: MessageCircle, color: 'text-blue-400' },
  ANNOUNCEMENT: { label: 'Announcement', Icon: Megaphone,     color: 'text-amber-400' },
  PROJECT:      { label: 'Project',      Icon: Briefcase,     color: 'text-emerald-400' },
  REQUEST:      { label: 'Request',      Icon: HelpCircle,    color: 'text-rose-400' },
  EVENT:        { label: 'Event',        Icon: Calendar,      color: 'text-violet-400' },
  POLL:         { label: 'Poll',         Icon: BarChart3,     color: 'text-sky-400' },
};

function PollView({ post }: { post: HubPost }) {
  const poll = post.poll;
  if (!poll) return null;
  const total = poll.total_votes || 0;
  return (
    <div className="space-y-2">
      {poll.options.map((opt, i) => {
        const count = poll.vote_counts[i] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={i} className="relative rounded-xl border border-slate-700 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-sky-500/15" style={{ width: `${pct}%` }} />
            <div className="relative flex items-center justify-between px-3.5 py-2.5">
              <span className="text-sm text-slate-200">{opt}</span>
              <span className="text-xs text-slate-500 font-medium">{pct}% · {count}</span>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-600 pt-1">
        {total} vote{total !== 1 ? 's' : ''} · {poll.closed ? 'Closed' : 'Open'} — sign in to vote
      </p>
    </div>
  );
}

export function SharePostPage() {
  const { hubSlug, postId } = useParams<{ hubSlug: string; postId: string }>();
  const [searchParams] = useSearchParams();

  const [post, setPost] = useState<HubPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvedSrc, setResolvedSrc] = useState('');

  useEffect(() => {
    if (!hubSlug || !postId) { setError('Invalid share link'); setLoading(false); return; }

    const localConn = hubService.getHubConnection(hubSlug);
    const localTunnelUrl = localConn?.hub?.tunnelUrl;
    const srcParam = searchParams.get('src');
    const isShell = (u: string) => !u || u === 'http://' || u === 'https://';
    const fetchBase = (localTunnelUrl && !isShell(localTunnelUrl)) ? localTunnelUrl : srcParam;

    if (!fetchBase || !/^https?:\/\/.+/.test(fetchBase)) {
      setError('This post cannot be reached — the hub does not have a public tunnel URL configured.');
      setLoading(false);
      return;
    }

    setResolvedSrc(fetchBase);
    fetch(`${fetchBase}/api/public/posts/${postId}`)
      .then(async r => {
        if (!r.ok) { setError('This post is not publicly accessible or no longer exists.'); return; }
        setPost(await r.json() as HubPost);
      })
      .catch(() => setError('Could not reach the hub. It may be offline.'))
      .finally(() => setLoading(false));
  }, [hubSlug, postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = post ? (CATEGORY_META[post.category] ?? CATEGORY_META.DISCUSSION) : null;
  const mediaUrl = post?.media_url ?? (post?.media_file_name ? `${resolvedSrc}/api/public/files/${encodeURIComponent(post.media_file_name)}` : null);
  const isVideo = !!mediaUrl && /\.(mp4|webm|mov|mkv|ogv)$/i.test(mediaUrl);

  return (
    <div className="min-h-screen flex flex-col">
      <ShareWallpaper />
      <header className="border-b border-slate-900 px-6 py-4 flex items-center justify-between">
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-baseline gap-1.5 transition-opacity hover:opacity-70">
          <span className="text-lg font-bold tracking-tight cn-wordmark">citinet</span>
          <span className="text-xs text-slate-500 font-medium">community network</span>
        </a>
        {post && resolvedSrc && (
          <a href={`${resolvedSrc}?auth=true`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors">
            Sign in to Join
          </a>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-20">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading post…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-center max-w-sm">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : post && meta ? (
          <div className="w-full max-w-2xl space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
              {/* Author + category */}
              <div className="flex items-center gap-2.5 mb-5">
                <AvatarFallback className="w-9 h-9 rounded-full" name={post.author_username} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{post.author_username}</p>
                  <p className="text-xs text-slate-500">{new Date(post.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800 ${meta.color}`}>
                  <meta.Icon className="w-3.5 h-3.5" /> {meta.label}
                </span>
              </div>

              {post.title && (
                <h1 className="text-xl font-bold text-white mb-2 leading-tight break-words">{post.title}</h1>
              )}

              {post.category === 'EVENT' && (post.event_date || post.event_location) && (
                <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-violet-300">
                  {post.event_date && (
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(post.event_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  )}
                  {post.event_location && (
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {post.event_location}</span>
                  )}
                  {post.rsvp_count !== undefined && (
                    <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {post.rsvp_count} going</span>
                  )}
                </div>
              )}

              {post.body && (
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mb-4">{post.body}</p>
              )}

              {post.category === 'POLL' && <PollView post={post} />}

              {mediaUrl && (
                <div className="mt-4 rounded-xl overflow-hidden bg-black">
                  {isVideo
                    ? <video src={mediaUrl} controls preload="metadata" className="w-full max-h-[60vh] bg-black" />
                    : <img src={mediaUrl} alt={post.title ?? ''} className="w-full max-h-[60vh] object-contain" />}
                </div>
              )}

              <div className="flex items-center gap-4 mt-5 pt-4 border-t border-slate-800 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {post.reply_count} repl{post.reply_count === 1 ? 'y' : 'ies'}</span>
                <span className="flex items-center gap-1.5 ml-auto"><Newspaper className="w-3.5 h-3.5" /> Shared from <span className="text-slate-400">{hubSlug}</span></span>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="px-6 py-5 text-center">
        <p className="text-xs text-slate-700">
          Post is hosted on the hub owner's device and served over their Tailscale connection.
        </p>
      </footer>
    </div>
  );
}
