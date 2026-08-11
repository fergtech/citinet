import { useEffect, useState } from 'react';
import { Users, NotebookPen, User, FileText, Store, LogIn, Globe, Loader2 } from 'lucide-react';
import { hubService } from '../services/hubService';

// ── URL extraction ──────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s]+/g;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;

/** Splits a message body into its link-stripped text and the URLs it contained
 *  (in order, deduplicated) — the URLs get rendered as cards instead. */
export function parseMessageLinks(body: string): { text: string; urls: string[] } {
  const found = body.match(URL_REGEX) ?? [];
  const urls: string[] = [];
  let text = body;
  for (const raw of found) {
    // Strip the exact matched substring (incl. trailing sentence punctuation like
    // "." or ",") out of the displayed text, but link/fetch the punctuation-free URL.
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    if (url && !urls.includes(url)) urls.push(url);
    text = text.split(raw).join('');
  }
  return { text: text.trim(), urls };
}

// ── Internal (citinet) link recognition ─────────────────────
// These match the SPA's own share routes (see App.tsx), by pathname shape only —
// deliberately host-agnostic so it works on citinet.cloud, a custom domain, or a
// local dev tunnel alike.

type InternalLink =
  | { kind: 'space'; hubSlug: string; spaceSlug: string; src: string | null }
  | { kind: 'note'; noteId: string; src: string | null }
  | { kind: 'profile'; username: string; src: string | null }
  | { kind: 'file'; fileName: string }
  | { kind: 'vendor'; hubSlug: string; vendorSlug: string }
  | { kind: 'join' };

function parseInternalLink(raw: string): InternalLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const src = u.searchParams.get('src');
  if (parts[0] === 'share-space' && parts.length >= 3)
    return { kind: 'space', hubSlug: decodeURIComponent(parts[1]), spaceSlug: decodeURIComponent(parts[2]), src };
  if (parts[0] === 'share-note' && parts.length >= 3)
    return { kind: 'note', noteId: decodeURIComponent(parts[2]), src };
  if (parts[0] === 'u' && parts.length >= 3)
    return { kind: 'profile', username: decodeURIComponent(parts[2]), src };
  if (parts[0] === 'share' && parts.length >= 3)
    return { kind: 'file', fileName: decodeURIComponent(parts[2]) };
  if (parts[0] === 'v' && parts.length >= 3)
    return { kind: 'vendor', hubSlug: decodeURIComponent(parts[1]), vendorSlug: decodeURIComponent(parts[2]) };
  if (parts[0] === 'join')
    return { kind: 'join' };
  return null;
}

function titleCaseSlug(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, ' ').trim();
  return spaced.replace(/\b\w/g, c => c.toUpperCase()) || slug;
}

function hostnameOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Card shell ───────────────────────────────────────────────

interface CardContent {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  domain: string;
}

function CardShell({ url, content, loading, iconGrad }: {
  url: string;
  content: CardContent | null;
  loading: boolean;
  iconGrad: string;
}) {
  if (loading) {
    return (
      <div className="mt-1 flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 max-w-[280px] animate-pulse">
        <span className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-zinc-700 flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-zinc-700" />
          <div className="h-2.5 w-1/2 rounded bg-slate-200 dark:bg-zinc-700" />
        </div>
      </div>
    );
  }
  if (!content) return null;
  const Icon = content.icon;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700/60 transition-colors max-w-[280px]"
    >
      <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${iconGrad} flex items-center justify-center shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{content.title}</p>
        {content.subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{content.subtitle}</p>
        )}
        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-0.5 truncate">{content.domain}</p>
      </div>
    </a>
  );
}

// ── Public component ────────────────────────────────────────

/** Renders a single message URL as a rich card instead of raw link text. Internal
 *  citinet share links (space/note/profile) do a live fetch against the tunnel URL
 *  embedded in the link's ?src= param for a real title/description; vendor and file
 *  links (no ?src=) fall back to a name derived from the URL itself; anything else
 *  goes through the hub's own /api/public/og unfurl endpoint. */
export function LinkPreviewCard({ url, slug }: { url: string; slug: string }) {
  const internal = parseInternalLink(url);
  const domain = hostnameOf(url);

  const [content, setContent] = useState<CardContent | null>(() => {
    // Kinds with nothing to fetch (or nothing to fetch from) resolve synchronously.
    if (internal?.kind === 'file')
      return { icon: FileText, title: titleCaseSlug(internal.fileName.replace(/\.[^.]+$/, '')), subtitle: 'Shared file', domain };
    if (internal?.kind === 'vendor')
      return { icon: Store, title: titleCaseSlug(internal.vendorSlug), subtitle: 'Vendor listing', domain };
    if (internal?.kind === 'join')
      return { icon: LogIn, title: 'Join this hub', subtitle: 'You’ll need an invite from a member', domain };
    return null;
  });
  const [loading, setLoading] = useState(
    internal?.kind === 'space' || internal?.kind === 'note' || internal?.kind === 'profile' || !internal
  );

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (internal?.kind === 'space' && internal.src) {
        try {
          const res = await fetchWithTimeout(`${internal.src}/api/public/spaces/${encodeURIComponent(internal.spaceSlug)}`);
          if (!res.ok) throw new Error('not ok');
          const data = await res.json();
          if (!cancelled) setContent({ icon: Users, title: data.space.name, subtitle: data.space.description || 'Shared space', domain });
        } catch {
          if (!cancelled) setContent({ icon: Users, title: titleCaseSlug(internal.spaceSlug), subtitle: 'Shared space', domain });
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      if (internal?.kind === 'note' && internal.src) {
        try {
          const res = await fetchWithTimeout(`${internal.src}/api/public/notes/${encodeURIComponent(internal.noteId)}`);
          if (!res.ok) throw new Error('not ok');
          const data = await res.json();
          const subtitle = (data.web_body_plain || '').trim().slice(0, 80) || `By ${data.author}`;
          if (!cancelled) setContent({ icon: NotebookPen, title: data.title || 'Shared note', subtitle, domain });
        } catch {
          if (!cancelled) setContent({ icon: NotebookPen, title: 'Shared note', subtitle: 'Open in citinet', domain });
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      if (internal?.kind === 'profile' && internal.src) {
        try {
          const res = await fetchWithTimeout(`${internal.src}/api/public/profile/${encodeURIComponent(internal.username)}`);
          if (!res.ok) throw new Error('not ok');
          const data = await res.json();
          const subtitle = data.profile_headline || data.bio || 'Member profile';
          if (!cancelled) setContent({ icon: User, title: data.display_name || data.username, subtitle, domain });
        } catch {
          if (!cancelled) setContent({ icon: User, title: `@${internal.username}`, subtitle: 'Member profile', domain });
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      // Recognized internal link shape, but no ?src= to fetch against (e.g. hand-typed
      // URL) — resolve straight to the derived fallback instead of spinning forever.
      if (internal?.kind === 'space') {
        if (!cancelled) { setContent({ icon: Users, title: titleCaseSlug(internal.spaceSlug), subtitle: 'Shared space', domain }); setLoading(false); }
        return;
      }
      if (internal?.kind === 'note') {
        if (!cancelled) { setContent({ icon: NotebookPen, title: 'Shared note', subtitle: 'Open in citinet', domain }); setLoading(false); }
        return;
      }
      if (internal?.kind === 'profile') {
        if (!cancelled) { setContent({ icon: User, title: `@${internal.username}`, subtitle: 'Member profile', domain }); setLoading(false); }
        return;
      }
      if (!internal) {
        // External link — resolve via the current hub's own OG-unfurl endpoint.
        const tunnelUrl = hubService.getHubConnection(slug)?.hub?.tunnelUrl;
        if (tunnelUrl) {
          try {
            const res = await fetchWithTimeout(`${tunnelUrl}/api/public/og?url=${encodeURIComponent(url)}`);
            if (!res.ok) throw new Error('not ok');
            const data = await res.json();
            if (data.title) {
              if (!cancelled) setContent({ icon: Globe, title: data.title, subtitle: data.description || data.site_name || undefined, domain });
              if (!cancelled) setLoading(false);
              return;
            }
          } catch {
            // fall through to plain domain card
          }
        }
        if (!cancelled) { setContent({ icon: Globe, title: domain, domain }); setLoading(false); }
      }
    }

    resolve();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, slug]);

  return <CardShell url={url} content={content} loading={loading} iconGrad="from-purple-600 to-blue-600" />;
}
