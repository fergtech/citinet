import { useEffect, useState } from 'react';
import { Globe, Plus, X } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { externalFeedService, type ExternalSourceSummary } from '../services/externalFeedService';

const csv = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </span>
  );
}

/**
 * Account → Outside. Everything here is something the member sets on purpose; nothing about what
 * they click is learned or stored. Saved per account via /api/me/preferences (external_* keys).
 */
export function OutsideSettings({ profileTags }: { profileTags: string[] }) {
  const { currentHub, userPreferences, updateUserPreferences } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const [sources, setSources] = useState<ExternalSourceSummary[] | null>(null);
  const [sourcesError, setSourcesError] = useState(false);
  const [draft, setDraft] = useState('');
  // Switching off "use my profile interests" must stick even before any custom topic exists.
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (!hubSlug) return;
    externalFeedService.getSources(hubSlug).then(setSources).catch(() => { setSources([]); setSourcesError(true); });
  }, [hubSlug]);

  const enabled = userPreferences.external_enabled === 'true'; // opt-in (matches the API default)
  const customTopics = csv(userPreferences.external_topics);
  const usingProfile = !customMode && customTopics.length === 0;
  const muted = new Set(csv(userPreferences.external_muted_sources));

  const saveTopics = (next: string[]) => updateUserPreferences({ external_topics: next.join(',') });
  const addTopic = () => {
    const t = draft.trim().toLowerCase().replace(/^#/, '').replace(/,/g, ' ').slice(0, 40);
    setDraft('');
    if (!t || customTopics.includes(t) || customTopics.length >= 10) return;
    void saveTopics([...customTopics, t]);
  };
  const toggleMuted = (id: string) => {
    const next = new Set(muted);
    if (next.has(id)) next.delete(id); else next.add(id);
    void updateUserPreferences({ external_muted_sources: [...next].join(',') });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Outside</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-5">
          Headlines and public posts from the wider web, from sources your hub admin chose. Your hub fetches them, so the
          sites never see you. Each card links out and opens the original in a new tab. Nothing about what you open is tracked.
        </p>
        <button onClick={() => updateUserPreferences({ external_enabled: enabled ? 'false' : 'true' })} className="w-full flex items-center gap-3 py-1 text-left">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Show Outside on Home</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Adds one card from the public web to your Home feed.</p>
          </div>
          <Toggle on={enabled} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Topics</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
              Sources your admin tagged with a topic only show up when it matches one of yours. General sources always show.
            </p>
            <button
              onClick={() => { setCustomMode(usingProfile); void saveTopics(usingProfile ? profileTags : []); }}
              className="w-full flex items-center gap-3 py-1 mb-4 text-left"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Use my profile interests</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  {profileTags.length
                    ? profileTags.join(', ')
                    : 'No interests on your profile yet. Add some in the Profile tab, or turn this off to list topics here.'}
                </p>
              </div>
              <Toggle on={usingProfile} />
            </button>
            {!usingProfile && (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {customTopics.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      {t}
                      <button onClick={() => saveTopics(customTopics.filter(x => x !== t))} aria-label={`Remove ${t}`} className="p-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } }}
                    placeholder="Add a topic, e.g. gardening"
                    maxLength={40}
                    disabled={customTopics.length >= 10}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <button onClick={addTopic} disabled={!draft.trim() || customTopics.length >= 10} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5">{customTopics.length}/10</p>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Sources</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">Turn off any source you don't want to see.</p>
            {sources === null ? (
              <p className="text-xs text-slate-400 dark:text-zinc-500">Loading…</p>
            ) : sourcesError ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">Couldn't load this hub's sources. The hub may need an update.</p>
            ) : sources.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">Your hub admin hasn't added any sources yet (Hub Management → Outside).</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {sources.map(s => (
                  <button key={s.id} onClick={() => toggleMuted(s.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.label}</p>
                      {s.topics.length > 0 && <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">{s.topics.join(', ')}</p>}
                    </div>
                    <Toggle on={!muted.has(s.id)} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
