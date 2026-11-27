import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive, BookOpen, ChevronLeft, Download, ChevronRight, ExternalLink, FileText, Globe, Home,Library, Loader2, RefreshCw, Search,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { GetContentPanel } from './GetContentPanel';
import {
  libraryService, formatBytes, LibraryUnsupportedError,
  type ArchiveBook, type LibraryCategory, type LibraryItem, type LibraryItemDetail, type LibrarySourceType,
} from '../services/libraryService';

interface LibraryScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

const TYPE_META: Record<LibrarySourceType, { label: string; Icon: React.ElementType }> = {
  pdf:   { label: 'PDF',     Icon: FileText },
  epub:  { label: 'Book',    Icon: BookOpen },
  html:  { label: 'Website', Icon: Globe },
  kiwix: { label: 'Archive', Icon: Archive },
};

function ItemCard({ item, onOpen }: { item: LibraryItem; onOpen: () => void }) {
  const { label, Icon } = TYPE_META[item.type] ?? TYPE_META.pdf;
  return (
    <button
      onClick={onOpen}
      className="cn-glass rounded-2xl p-4 flex flex-col gap-2.5 text-left transition-all hover:border-blue-400/40 dark:hover:border-blue-500/40"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold cn-text-1 leading-snug line-clamp-2">{item.title}</h3>
          {item.description && <p className="text-xs cn-text-3 leading-relaxed line-clamp-2 mt-0.5">{item.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-medium cn-text-3 mt-auto">
        <span className="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/8 cn-text-2">{label}</span>
        <span>{formatBytes(item.size_bytes)}</span>
        {item.license && <span className="truncate">· {item.license}</span>}
      </div>
    </button>
  );
}

/**
 * Archive reader. Some archives are book collections (medicine, water, post-disaster guides): their own
 * page is an app that can't run in a sandboxed frame, but the book list is plain data, so we show the
 * books natively and open each PDF in the viewer. Everything else (Wikipedia and other website-style
 * archives) is searched by article title and shown in a frame with an opaque origin -- archive pages can
 * carry script, and this origin holds the session and encryption keys, so the frame never gets
 * allow-same-origin.
 */
function ArchiveReader({ archiveUrl }: { archiveUrl: string }) {
  const [mode, setMode] = useState<'checking' | 'books' | 'site'>('checking');
  const [books, setBooks] = useState<ArchiveBook[]>([]);

  useEffect(() => {
    let cancelled = false;
    libraryService.archiveBooks(archiveUrl)
      .then(b => { if (cancelled) return; if (b) { setBooks(b); setMode('books'); } else setMode('site'); })
      .catch(() => { if (!cancelled) setMode('site'); });
    return () => { cancelled = true; };
  }, [archiveUrl]);

  if (mode === 'checking') return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin cn-text-2" /></div>;
  if (mode === 'books') return <ArchiveBookList archiveUrl={archiveUrl} books={books} />;
  return <ArchiveSiteReader archiveUrl={archiveUrl} />;
}

function ArchiveBookList({ archiveUrl, books }: { archiveUrl: string; books: ArchiveBook[] }) {
  const [filter, setFilter] = useState('');
  const [reading, setReading] = useState<{ title: string; url: string } | null>(null);
  const q = filter.trim().toLowerCase();
  const shown = q
    ? books.filter(b => `${b.title} ${b.author} ${b.description}`.toLowerCase().includes(q))
    : books;

  if (reading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b cn-border">
          <button onClick={() => setReading(null)} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-2 hover:cn-text-1">
            <ChevronLeft className="w-4 h-4" /> All books
          </button>
          <span className="text-xs cn-text-3 truncate">{reading.title}</span>
          <a href={reading.url} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab" className="ml-auto cn-text-2 hover:cn-text-1">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <iframe key={reading.url} src={reading.url} title={reading.title} className="flex-1 w-full bg-white" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="relative px-4 py-2 border-b cn-border">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4 pointer-events-none" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Search ${books.length} books by title, author or topic…`}
          className="w-full pl-9 pr-4 py-2 rounded-xl text-sm cn-surface border cn-border cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {shown.length === 0 && <p className="text-sm cn-text-3 text-center py-10">No books match “{filter.trim()}”.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.map(b => (
            <div key={b.id} className="rounded-2xl cn-glass p-4 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white shrink-0"><FileText className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold cn-text-1 leading-snug">{b.title}</h3>
                  {b.author && <p className="text-[11px] cn-text-3 mt-0.5">{b.author}</p>}
                </div>
              </div>
              {b.description && <p className="text-xs cn-text-2 leading-relaxed line-clamp-3">{b.description}</p>}
              <div className="flex flex-wrap gap-2 mt-auto pt-1">
                {b.files.map((f, i) => (
                  <button
                    key={f}
                    onClick={() => setReading({ title: b.files.length > 1 ? `${b.title} (part ${i + 1})` : b.title, url: libraryService.archiveFile(archiveUrl, f) })}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    {b.files.length > 1 ? `Read part ${i + 1}` : 'Read'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArchiveSiteReader({ archiveUrl }: { archiveUrl: string }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<{ title: string; path: string }[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const home = `${archiveUrl}/`;
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Pages visited in the frame and where we are among them (each page reports itself; see the server).
  const [trail, setTrail] = useState<{ ids: string[]; at: number }>({ ids: [], at: -1 });
  // Navigating the same frame (not replacing it) keeps the pages in history, so Back works.
  const goTo = (url: string) => { if (frameRef.current) frameRef.current.src = url; };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const id = e.data?.citinetPage;
      if (typeof id !== 'string') return;
      setTrail(t => {
        const known = t.ids.indexOf(id);
        if (known >= 0) return { ids: t.ids, at: known };
        // A page we haven't recorded: a new step. (A reload of an unknown one is treated the same.)
        const ids = [...t.ids.slice(0, t.at + 1), id];
        return { ids, at: ids.length - 1 };
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults(null); setSearchError(''); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      libraryService.archiveSuggest(archiveUrl, q)
        .then(r => { if (!cancelled) { setResults(r); setSearchError(''); } })
        .catch(e => { if (!cancelled) setSearchError(e instanceof Error ? e.message : 'Search failed'); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [archiveUrl, term]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2 border-b cn-border">
        {/* history.back() only when the frame has somewhere to go back to, so it never leaves the reader. */}
        <button onClick={() => window.history.back()} disabled={trail.at < 1}
          className="inline-flex items-center gap-1 text-xs font-semibold cn-text-2 hover:cn-text-1 disabled:opacity-40 disabled:cursor-default">
          <ChevronLeft className="w-4 h-4" /> Previous page
        </button>
        <button onClick={() => goTo(home)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold cn-text-2 hover:cn-text-1">
          <Home className="w-3.5 h-3.5" /> Front page
        </button>
      </div>
      <div className="relative px-4 py-2 border-b cn-border">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4 pointer-events-none" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search article titles in this archive…"
          className="w-full pl-9 pr-4 py-2 rounded-xl text-sm cn-surface border cn-border cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
        {(results !== null || searchError) && (
          <div className="absolute left-4 right-4 top-full mt-1 z-10 max-h-72 overflow-y-auto rounded-xl cn-surface border cn-border shadow-xl">
            {searchError && <p className="px-3 py-2.5 text-xs text-red-500">{searchError}</p>}
            {!searchError && results?.length === 0 && <p className="px-3 py-2.5 text-xs cn-text-3">No article titles start with “{term.trim()}”.</p>}
            {results?.map(r => (
              <button
                key={r.path}
                onClick={() => { goTo(libraryService.archivePage(archiveUrl, r.path)); setTerm(''); setResults(null); }}
                className="w-full text-left px-3 py-2 text-sm cn-text-1 hover:bg-black/5 dark:hover:bg-white/10 truncate"
              >
                {r.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <iframe ref={frameRef} src={home} title="Archive page" sandbox="allow-scripts allow-popups" className="flex-1 w-full bg-white" />
    </div>
  );
}

/** EPUB reader. epubjs is loaded on demand so it never weighs down the rest of the app. */
function EpubReader({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<{ next: () => void; prev: () => void; destroy: () => void } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.arrayBuffer();
        const { default: ePub } = await import('epubjs');
        if (cancelled || !hostRef.current) return;
        const book = ePub(data);
        // No scripted content: an EPUB is a book, and its scripts are never needed here.
        const rendition = book.renderTo(hostRef.current, {
          width: '100%', height: '100%', flow: 'paginated', allowScriptedContent: false,
        });
        renditionRef.current = rendition as unknown as typeof renditionRef.current;
        await rendition.display();
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      try { renditionRef.current?.destroy(); } catch { /* already gone */ }
      renditionRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') renditionRef.current?.next();
      if (e.key === 'ArrowLeft') renditionRef.current?.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative flex-1 min-h-0 bg-white">
      <div ref={hostRef} className="absolute inset-0" />
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-slate-600 text-center">
          This book could not be opened.
        </div>
      )}
      {state === 'ready' && (
        <>
          <button onClick={() => renditionRef.current?.prev()} aria-label="Previous page"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => renditionRef.current?.next()} aria-label="Next page"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}

function Viewer({ hubSlug, item, isAdmin, onClose }: { hubSlug: string; item: LibraryItem; isAdmin: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<LibraryItemDetail | null>(null);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  // A fresh link each time (and on Reload): viewer links expire after 30 minutes.
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError('');
    libraryService.open(hubSlug, item.id)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this item'); });
    return () => { cancelled = true; };
  }, [hubSlug, item.id, nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const url = detail?.viewerUrl ?? null;

  // Fills the app's content area (not the window), so the top bar and sidebar stay usable.
  return (
    <div className="h-full max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-col">
    <div className="flex-1 min-h-0 flex flex-col cn-glass rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b cn-border cn-text-1">
        <button onClick={onClose} aria-label="Back to the Library" title="Back to the Library" className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{item.title}</h2>
          <p className="text-[11px] cn-text-3 truncate">{TYPE_META[item.type]?.label}{item.license ? ` · ${item.license}` : ''}</p>
        </div>
        <button onClick={() => setNonce(n => n + 1)} aria-label="Reload"
          className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0" title="Reload (links expire after 30 minutes)">
          <RefreshCw className="w-4 h-4" />
        </button>
        {url && item.type !== 'epub' && (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab"
            className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {!detail && !error && (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin cn-text-2" /></div>
      )}
      {error && <div className="flex-1 flex items-center justify-center p-6 text-sm cn-text-2 text-center">{error}</div>}

      {detail && item.type === 'kiwix' && detail.readerAvailable === false && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center cn-text-2">
          <Archive className="w-8 h-8 cn-text-3" />
          <p className="text-sm font-semibold">The archive reader isn't running on this hub.</p>
          {isAdmin ? (
            <>
              <p className="text-xs cn-text-3 max-w-sm">This pack is stored on the hub, but its reader isn't running. On the computer that runs the hub, start it, then press Reload:</p>
              <code className="text-xs px-3 py-2 rounded-lg bg-black/5 dark:bg-white/10 cn-text-1 select-all">docker compose up -d citinet-kiwix</code>
            </>
          ) : (
            <p className="text-xs cn-text-3 max-w-sm">Ask your hub admin to switch on the archive reader.</p>
          )}
        </div>
      )}
      {detail?.archiveUrl && detail.readerAvailable !== false && item.type === 'kiwix' && (
        <ArchiveReader key={detail.archiveUrl} archiveUrl={detail.archiveUrl} />
      )}
      {url && item.type === 'pdf' && (
        <iframe key={url} src={url} title={item.title} className="flex-1 w-full bg-white" />
      )}
      {url && item.type === 'html' && (
        // Imported pages can run script, so the frame gets an opaque origin: no allow-same-origin,
        // which keeps it away from this hub's session and encryption keys (the server also sends
        // a sandbox CSP header on these files).
        <iframe key={url} src={url} title={item.title} sandbox="allow-scripts allow-popups" className="flex-1 w-full bg-white" />
      )}
      {url && item.type === 'epub' && <EpubReader key={url} url={url} />}
    </div>
    </div>
  );
}

export function LibraryScreen({ onBack }: LibraryScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug || '';
  const isAdmin = currentUser?.isAdmin === true;

  const [categories, setCategories] = useState<LibraryCategory[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [showGet, setShowGet] = useState(false);
  // Bumped when a pack finishes installing, so the Library below refreshes without a reload.
  const [reloadKey, setReloadKey] = useState(0);

  const fail = useCallback((e: unknown) => {
    if (e instanceof LibraryUnsupportedError) setUnsupported(true);
    else setError(e instanceof Error ? e.message : 'Something went wrong');
  }, []);

  useEffect(() => {
    if (!hubSlug) return;
    libraryService.categories(hubSlug).then(setCategories).catch(fail);
  }, [hubSlug, fail, reloadKey]);

  // Debounced search; the category chips and the box combine.
  useEffect(() => {
    if (!hubSlug || unsupported) return;
    let cancelled = false;
    const t = setTimeout(() => {
      libraryService.search(hubSlug, { category: category ?? undefined, q: query })
        .then(r => { if (!cancelled) { setItems(r); setError(''); } })
        .catch(e => { if (!cancelled) fail(e); });
    }, query ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [hubSlug, category, query, unsupported, fail, reloadKey]);

  const total = categories?.reduce((n, c) => n + c.count, 0) ?? 0;
  const empty = categories !== null && total === 0;

  if (open) return <Viewer hubSlug={hubSlug} item={open} isAdmin={isAdmin} onClose={() => setOpen(null)} />;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-7 flex flex-col gap-5">
        <button
          onClick={onBack}
          className="md:hidden inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:cn-text-1 transition-colors self-start"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div className="flex items-center gap-3">
          <span className="w-11 h-11 cn-action bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md shrink-0">
            <Library className="w-6 h-6 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight cn-text-1 leading-none">Library</h1>
            <p className="text-sm cn-text-3 mt-0.5">Reference guides and books stored on this hub — available even with no internet</p>
          </div>
          {isAdmin && !unsupported && !empty && (
            <button
              onClick={() => setShowGet(v => !v)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" /> {showGet ? 'Hide' : 'Get content'}
            </button>
          )}
        </div>
        {isAdmin && !unsupported && !empty && showGet && (
          <GetContentPanel hubSlug={hubSlug} onChanged={() => setReloadKey(k => k + 1)} />
        )}

        {unsupported ? (
          <div className="cn-glass rounded-2xl p-6 text-sm cn-text-2">
            This hub hasn't been updated to support the Library yet. Ask your hub admin to update it.
          </div>
        ) : empty ? (
          isAdmin ? (
            <div className="flex flex-col gap-3">
              <GetContentPanel hubSlug={hubSlug} onChanged={() => setReloadKey(k => k + 1)} />
              <p className="text-xs cn-text-3 text-center">
                No internet on this hub? Load a Knowledge Vault drive instead:{' '}
                <code className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/8 cn-text-1">./citinet.sh vault import &lt;drive or folder&gt;</code>
              </p>
            </div>
          ) : (
            <div className="cn-glass rounded-2xl p-8 text-center flex flex-col items-center gap-3">
              <Library className="w-9 h-9 cn-text-4" />
              <h2 className="text-base font-semibold cn-text-1">The Library is empty</h2>
              <p className="text-sm cn-text-3 max-w-md">Your hub admin can add reference material for everyone on this hub. Nothing has been added yet.</p>
            </div>
          )
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the library…  e.g. water purification"
                className="w-full pl-9 pr-4 py-2.5 cn-surface border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {[{ slug: null as string | null, label: 'All', count: total }, ...(categories ?? [])].map(c => (
                <button
                  key={c.slug ?? 'all'}
                  onClick={() => setCategory(c.slug)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    category === c.slug
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'cn-border cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {c.label}
                  <span className={category === c.slug ? 'text-white/80' : 'cn-text-4'}>{c.count}</span>
                </button>
              ))}
            </div>

            {error && <div className="text-sm text-red-500">{error}</div>}
            {items === null && !error && (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin cn-text-4" /></div>
            )}
            {items !== null && items.length === 0 && (
              <div className="cn-glass rounded-2xl p-8 text-center text-sm cn-text-3">
                {query.trim() ? <>Nothing in the Library matches “{query.trim()}”.</> : 'Nothing in this category yet.'}
              </div>
            )}
            {items !== null && items.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(it => <ItemCard key={it.id} item={it} onOpen={() => setOpen(it)} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
