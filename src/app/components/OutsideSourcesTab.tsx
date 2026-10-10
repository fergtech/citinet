import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Globe, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  externalFeedService,
  type ExternalSourceAdmin,
  type ExternalSettings,
  type ThreadsStatus,
  type ExternalSourceInput,
  type ExternalSourceKind,
} from '../services/externalFeedService';

const KIND_LABEL: Record<ExternalSourceKind, string> = {
  google_news: 'News search (Google News)',
  reddit_search: 'Reddit search',
  bluesky_search: 'Bluesky search',
  lemmy_search: 'Lemmy search',
  threads_search: 'Threads search',
  rss: 'News / blog feed (RSS or Atom)',
  mastodon_tag: 'Mastodon hashtag',
  bluesky_feed: 'Bluesky account',
};

const KIND_BADGE: Record<ExternalSourceKind, string> = { google_news: 'News', reddit_search: 'Reddit', bluesky_search: 'Bluesky', lemmy_search: 'Lemmy', threads_search: 'Threads', rss: 'RSS', mastodon_tag: 'Mastodon', bluesky_feed: 'Bluesky' };

const inputCls =
  'w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const parseTopics = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);

/**
 * Hub Management → Outside. The admin's list of public-web sources the hub fetches for everyone.
 * The hub itself does the fetching; a new source is test-fetched before it is saved.
 */
export function OutsideSourcesTab({ hubSlug }: { hubSlug: string }) {
  const [sources, setSources] = useState<ExternalSourceAdmin[] | null>(null);
  const [settings, setSettings] = useState<ExternalSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  const [threads, setThreads] = useState<ThreadsStatus | null>(null);
  const [threadsToken, setThreadsToken] = useState('');
  const [threadsBusy, setThreadsBusy] = useState(false);
  const [threadsError, setThreadsError] = useState('');
  const [threadsMode, setThreadsMode] = useState<'KEYWORD' | 'TAG'>('KEYWORD');
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [kind, setKind] = useState<ExternalSourceKind>('google_news');
  const [query, setQuery] = useState('');
  const [mustMention, setMustMention] = useState('');
  const [url, setUrl] = useState('');
  const [instance, setInstance] = useState('mastodon.social');
  const [lemmyInstance, setLemmyInstance] = useState('lemmy.world');
  const [tag, setTag] = useState('');
  const [actor, setActor] = useState('');
  const [label, setLabel] = useState('');
  const [topics, setTopics] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, st, th] = await Promise.all([
        externalFeedService.adminList(hubSlug),
        externalFeedService.adminSettings(hubSlug).catch(() => null),
        externalFeedService.threadsStatus(hubSlug).catch(() => null),
      ]);
      setSources(list);
      setSettings(st);
      setThreads(th);
      setLoadError('');
    } catch (err) {
      setLoadError((err as { status?: number }).status === 404
        ? 'This hub needs an update before it can fetch outside sources.'
        : err instanceof Error ? err.message : 'Failed to load sources');
    }
  }, [hubSlug]);

  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (patch: { auto?: boolean; use_member_topics?: boolean; ai?: boolean }) => {
    setSavingSettings(true);
    try {
      setSettings(await externalFeedService.adminSaveSettings(hubSlug, patch));
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSettings(false);
    }
  };

  const threadsAction = async (fn: () => Promise<ThreadsStatus>, clear = false) => {
    setThreadsBusy(true);
    setThreadsError('');
    try {
      setThreads(await fn());
      if (clear) setThreadsToken('');
      await load();
    } catch (err) {
      setThreadsError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setThreadsBusy(false);
    }
  };

  const buildInput = (): ExternalSourceInput | null => {
    if (kind === 'threads_search') return query.trim() ? { kind, config: { q: query.trim(), mode: threadsMode } } : null;
    if (kind === 'reddit_search' || kind === 'bluesky_search' || kind === 'lemmy_search') {
      if (!query.trim()) return null;
      const word = mustMention.trim() || undefined;
      return kind === 'lemmy_search'
        ? { kind, config: { q: query.trim(), instance: lemmyInstance.trim() || undefined, must_word: word } }
        : { kind, config: { q: query.trim(), must_word: word } };
    }
    if (kind === 'google_news') return query.trim() ? { kind, config: { q: query.trim(), must_mention: mustMention.trim() || undefined } } : null;
    if (kind === 'rss') return url.trim() ? { kind, config: { url: url.trim() } } : null;
    if (kind === 'mastodon_tag') return instance.trim() && tag.trim() ? { kind, config: { instance: instance.trim(), tag: tag.trim() } } : null;
    return actor.trim() ? { kind, config: { actor: actor.trim() } } : null;
  };

  const add = async () => {
    const input = buildInput();
    if (!input) { setAddError('Fill in the source details first.'); return; }
    setAdding(true);
    setAddError('');
    try {
      await externalFeedService.adminAdd(hubSlug, { ...input, label: label.trim() || undefined, topics: parseTopics(topics) });
      setUrl(''); setTag(''); setActor(''); setLabel(''); setTopics(''); setQuery(''); setMustMention('');
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add source');
    } finally {
      setAdding(false);
    }
  };

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setRowError(e => ({ ...e, [id]: '' }));
    try { await fn(); await load(); }
    catch (err) { setRowError(e => ({ ...e, [id]: err instanceof Error ? err.message : 'Failed' })); }
    finally { setBusyId(''); }
  };

  const refresh = (s: ExternalSourceAdmin) => run(s.id, async () => {
    const r = await externalFeedService.adminRefresh(hubSlug, s.id).catch((err: Error) => ({ ok: false, error: err.message }));
    if (!r.ok) throw new Error(r.error || 'Refresh failed');
  });

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Outside sources</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Public-web feeds your hub fetches for its members (every 30 minutes). Members see a short excerpt and a link out;
          nothing is copied in full, and members' IPs never reach these sites. Tag a source with topics to show it only to
          members whose interests match; leave topics empty for sources everyone should see.
        </p>
      </div>

      {settings && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Local news, automatically</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
            {settings.place
              ? <>The hub searches for news about <strong>{[settings.place.city, settings.place.county, settings.place.state].filter(Boolean).join(', ')}</strong> from its saved location, and only keeps stories that name the place. Change the place in the Hub Info tab.</>
              : 'Set a location for this hub (Hub Info tab) and it can search for local news automatically.'}
          </p>
          <button
            onClick={() => saveSettings({ auto: !settings.auto })}
            disabled={savingSettings || !settings.place}
            className="w-full flex items-center gap-3 py-1 text-left disabled:opacity-50"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-white">Find local news for this hub</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Searches Google News for your town and county. Members see it in their Outside card.</p>
            </div>
            <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${settings.auto ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.auto ? 'translate-x-4' : 'translate-x-0'}`} />
            </span>
          </button>
          {settings.ai?.available && (
            <button
              onClick={() => saveSettings({ ai: !settings.ai?.enabled })}
              disabled={savingSettings}
              className="w-full flex items-center gap-3 py-1 mt-3 text-left disabled:opacity-50"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Use hub AI to improve relevance</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  The hub's own AI reads each headline and excerpt (nothing leaves this machine) so posts about a member's topic show up even when
                  they don't use the exact word. {settings.ai.active ? `${settings.ai.embedded} of ${settings.ai.total} items analysed so far.` : 'Currently off.'}
                </p>
              </div>
              <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${settings.ai.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.ai.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </span>
            </button>
          )}
          {settings.auto && (
            <button
              onClick={() => saveSettings({ use_member_topics: !settings.use_member_topics })}
              disabled={savingSettings}
              className="w-full flex items-center gap-3 py-1 mt-3 text-left disabled:opacity-50"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Also search for members' interests</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  For each popular member topic, adds local news plus what people are posting about it on Reddit and Bluesky (top posts of the week). Searches come from the hub,
                  not from members, and never say who asked — but on a small hub a topic can hint that someone cares about it. Members can opt out in their own settings.
                </p>
              </div>
              <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${settings.use_member_topics ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.use_member_topics ? 'translate-x-4' : 'translate-x-0'}`} />
              </span>
            </button>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Threads</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
          Connect one Threads account for the whole hub. The hub searches Threads through it for your place and your members' topics,
          and shows short excerpts that link out to Threads. The access token stays on this hub, encrypted, and is never shown again.
        </p>
        {threads?.connected ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-900 dark:text-white">
              Connected as <strong>@{threads.username}</strong>
              {threads.expires_at
                ? <span className="text-xs text-slate-500 dark:text-zinc-400"> · renews automatically (valid until {new Date(threads.expires_at).toLocaleDateString()})</span>
                : <span className="text-xs text-amber-600 dark:text-amber-400"> · short-lived token: it will stop working within about an hour. Paste a long-lived one.</span>}
            </p>
            {threads.public_search === true && <p className="text-xs text-green-600 dark:text-green-400">Public search is working: results include other people's posts.</p>}
            {threads.public_search === false && (
              <p className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {threads.probe_error || 'Search only returns this account\'s own posts. The Meta app still needs approval for the threads_keyword_search permission.'}
              </p>
            )}
            {threads.public_search === null && <p className="text-xs text-slate-500 dark:text-zinc-400">Could not tell yet whether public search is approved. Use Test.</p>}
            {threads.last_error && <p className="text-xs text-red-500 dark:text-red-400">{threads.last_error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => threadsAction(() => externalFeedService.threadsTest(hubSlug))} disabled={threadsBusy} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300">Test</button>
              <button
                onClick={() => { if (window.confirm('Disconnect Threads and remove its searches from this hub?')) void threadsAction(() => externalFeedService.threadsDisconnect(hubSlug)); }}
                disabled={threadsBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50"
              >
                Disconnect
              </button>
              {threadsBusy && <Loader2 className="w-4 h-4 animate-spin text-slate-400 self-center" />}
            </div>
            {threadsError && <p className="text-xs text-red-500 dark:text-red-400">{threadsError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="password"
              autoComplete="off"
              value={threadsToken}
              onChange={e => setThreadsToken(e.target.value)}
              placeholder="Paste a Threads access token"
              className={inputCls}
            />
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              In your Meta app dashboard, open the Threads API use case, add the account under Threads testers, accept the invite in Threads, then generate its access token
              (permissions: threads_basic and threads_keyword_search).
            </p>
            {threadsError && <p className="text-xs text-red-500 dark:text-red-400">{threadsError}</p>}
            <button
              onClick={() => threadsAction(() => externalFeedService.threadsConnect(hubSlug, threadsToken), true)}
              disabled={threadsBusy || threadsToken.trim().length < 20}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5"
            >
              {threadsBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {threadsBusy ? 'Checking…' : 'Connect Threads'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Add a source</h3>
        <div className="space-y-3">
          <select value={kind} onChange={e => { setKind(e.target.value as ExternalSourceKind); setAddError(''); }} className={inputCls}>
            {(Object.keys(KIND_LABEL) as ExternalSourceKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          {kind === 'google_news' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder='Search, e.g. "Aberdeen Proving Ground"' className={inputCls} />
              <input value={mustMention} onChange={e => setMustMention(e.target.value)} placeholder="Must mention (optional)" className={inputCls} />
            </div>
          )}
          {kind === 'threads_search' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={threadsMode} onChange={e => setThreadsMode(e.target.value as 'KEYWORD' | 'TAG')} className={inputCls}>
                <option value="KEYWORD">Keyword</option>
                <option value="TAG">Topic tag</option>
              </select>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={threadsMode === 'TAG' ? 'Topic tag, e.g. gardening' : 'Search, e.g. Aberdeen farmers market'} className={inputCls} />
            </div>
          )}
          {(kind === 'reddit_search' || kind === 'bluesky_search' || kind === 'lemmy_search') && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search, e.g. gardening" className={inputCls} />
              {kind === 'lemmy_search' && <input value={lemmyInstance} onChange={e => setLemmyInstance(e.target.value)} placeholder="lemmy.world" className={inputCls} />}
              <input value={mustMention} onChange={e => setMustMention(e.target.value)} placeholder="Must contain word (optional)" className={inputCls} />
            </div>
          )}
          {kind === 'rss' && <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/feed.xml" className={inputCls} />}
          {kind === 'mastodon_tag' && (
            <div className="flex gap-2">
              <input value={instance} onChange={e => setInstance(e.target.value)} placeholder="mastodon.social" className={inputCls} />
              <input value={tag} onChange={e => setTag(e.target.value)} placeholder="#baltimore" className={inputCls} />
            </div>
          )}
          {kind === 'bluesky_feed' && <input value={actor} onChange={e => setActor(e.target.value)} placeholder="handle, e.g. bart.gov" className={inputCls} />}
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Name (optional)" maxLength={200} className={inputCls} />
            <input value={topics} onChange={e => setTopics(e.target.value)} placeholder="Topics, comma separated (optional)" className={inputCls} />
          </div>
          {addError && <p className="text-xs text-red-500 dark:text-red-400">{addError}</p>}
          <button onClick={add} disabled={adding} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {adding ? 'Checking the source…' : 'Add source'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <div className="flex items-center mb-3">
          <h3 className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">Your sources{sources ? ` (${sources.filter(x => !x.auto).length})` : ''}</h3>
          {sources && sources.some(x => x.auto) && (
            <button onClick={() => setShowAuto(v => !v)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
              {showAuto ? 'Hide' : 'Show'} automatic searches ({sources.filter(x => x.auto).length})
            </button>
          )}
        </div>
        {loadError ? (
          <p className="text-xs text-red-500 dark:text-red-400">{loadError}</p>
        ) : sources === null ? (
          <p className="text-xs text-slate-400 dark:text-zinc-500">Loading…</p>
        ) : sources.filter(x => showAuto || !x.auto).length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-zinc-400">No sources yet. Add one above and it shows up on members' Home within moments.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {sources.filter(x => showAuto || !x.auto).map(s => (
              <div key={s.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {s.label}
                      {s.auto && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300">Auto</span>}
                      <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">{KIND_BADGE[s.kind]}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      {s.item_count ?? 0} items · updated {ago(s.last_ok_at)}
                      {s.topics.length > 0 && <> · topics: {s.topics.join(', ')}</>}
                    </p>
                    {s.last_error && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" /> {s.last_error} (retrying with backoff)
                      </p>
                    )}
                    {rowError[s.id] && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{rowError[s.id]}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {busyId === s.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    <button
                      onClick={() => run(s.id, () => externalFeedService.adminUpdate(hubSlug, s.id, { enabled: !s.enabled }))}
                      disabled={busyId === s.id}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${s.enabled ? 'border-green-300 dark:border-green-800 text-green-700 dark:text-green-400' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'}`}
                    >
                      {s.enabled ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => refresh(s)} disabled={busyId === s.id} title="Fetch now" aria-label="Fetch now" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    {!s.auto && <button
                      onClick={() => { if (window.confirm(`Remove "${s.label}" and its cached items?`)) void run(s.id, () => externalFeedService.adminDelete(hubSlug, s.id)); }}
                      disabled={busyId === s.id}
                      title="Remove"
                      aria-label="Remove source"
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
