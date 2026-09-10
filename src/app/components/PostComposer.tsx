import { useState, useEffect, useRef } from 'react';
import {
  Loader2, X, Image, Film, Calendar, MapPin, ChevronDown, Send, BarChart2, Vote, Plus, Link2, Clock,
} from 'lucide-react';
import { LocationSearchInput } from './LocationSearchInput';
import { AvatarCircle } from './AvatarCircle';
import { createPostOrQueue } from '../services/writeQueueService';
import { requestsService, type HubRequest } from '../services/requestsService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { HubPost } from '../types/hub';

// Categories selectable from the quick inline composer's plain post mode —
// Event and Poll are excluded here since they already have their own
// dedicated composer modes (with their own required fields) rather than a
// plain-post + category label.
export const QUICK_POST_CATEGORIES = [
  { value: 'DISCUSSION',   label: 'Discussion' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'PROJECT',      label: 'Project' },
  { value: 'REQUEST',      label: 'Request' },
] as const;

/** Whatever category tab the feed is currently filtered to becomes the
 *  composer's starting category too — e.g. opening the composer while
 *  viewing the "Requests" tab defaults it to Request instead of always
 *  Discussion. Falls back to Discussion when the active filter isn't one
 *  the given composer actually supports (e.g. "All" or "Polls" for the
 *  quick composer, which has no plain-post Poll option). */
export function contextualDefaultCategory(activeFilter: string | null, allowed: readonly string[]): string {
  return activeFilter && allowed.includes(activeFilter) ? activeFilter : 'DISCUSSION';
}

export interface PostComposerProps {
  hubSlug: string;
  hubCenter?: [number, number];
  isMod: boolean;
  currentUserId?: string;
  currentUserName: string;
  currentUserAvatarUrl?: string;
  onPostCreated: (post: HubPost) => void;
  onOpenFullComposer: (initialBody: string) => void;
  autoFocus?: boolean;
  // Whichever feed tab is currently active — used to default the quick-post
  // category picker (e.g. viewing "Requests" defaults a new plain post to
  // Request instead of always Discussion).
  activeFilter: string | null;
  /** Scopes every post this composer creates to a space instead of the main
   * hub feed — threaded straight through to hubService.createPost, which the
   * server enforces (membership-checked, and the post is excluded from the
   * main feed unless explicitly shared). Omit for the plain hub-wide Feed
   * composer. Full Poll/Event/Photo/Video/Place parity either way — this is
   * the exact same composer Feed uses, not a lookalike. */
  spaceSlug?: string;
}

/** The post composer used by both Feed (hub-wide) and a single Space's own
 * feed (space-scoped, via `spaceSlug`). Supports a quick plain post (with an
 * optional photo/video/place attachment and a category pick), or expanding
 * into a dedicated Event or Poll mode with its own required fields. */
export function PostComposer({ hubSlug, hubCenter, isMod, currentUserId, currentUserName, currentUserAvatarUrl, onPostCreated, onOpenFullComposer, autoFocus, activeFilter, spaceSlug }: PostComposerProps) {
  const [mode, setMode] = useState<'idle' | 'poll' | 'event'>('idle');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  // true when postError is actually a "queued for later" notice (hub
  // unreachable), not a real failure -- styled differently in the JSX below.
  const [postQueued, setPostQueued] = useState(false);
  const bodyInputRef = useRef<HTMLInputElement>(null);
  const eventTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pollTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Dashboard's "Share something with your neighbors" deep-links here instead of
  // popping the full modal — just put the cursor where neighbors already know to type.
  useEffect(() => {
    if (autoFocus) bodyInputRef.current?.focus();
  }, [autoFocus]);

  // Focus + place the caret at the END of whatever's already in `body` the
  // moment either mode's textarea appears — covers both entry paths (clicking
  // Event/Poll explicitly with text already typed, and the auto-switch below
  // that promotes mid-keystroke). Plain `autoFocus` isn't enough: a freshly
  // mounted, pre-filled <textarea> puts Chromium's caret at position 0, not
  // the end, so the very next keystroke lands BEFORE the carried-over text
  // instead of after it — e.g. typing "Block party…" would land as "lock
  // party…B". Runs only on mode transitions (not every keystroke), so it
  // never yanks the caret away from someone editing mid-text afterward.
  useEffect(() => {
    const el = mode === 'event' ? eventTextareaRef.current : mode === 'poll' ? pollTextareaRef.current : null;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [mode]);

  // Idle-mode attachments — a plain post can carry a photo/video and/or a place
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [place, setPlace] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Idle-mode post intent — which of the feed's own category tabs this quick
  // post should land under. Starts out following the active feed tab.
  const [category, setCategory] = useState(() => contextualDefaultCategory(activeFilter, QUICK_POST_CATEGORIES.map(c => c.value)));
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);

  // Re-sync to the active tab whenever it changes — but only while the box is
  // still empty/untouched, so switching feed tabs never yanks a category out
  // from under someone who's already mid-post.
  useEffect(() => {
    if (body.trim() || mediaFile || place) return;
    setCategory(contextualDefaultCategory(activeFilter, QUICK_POST_CATEGORIES.map(c => c.value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  // Event-only fields
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventCoords, setEventCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Poll-only fields
  const [options, setOptions] = useState(['', '']);
  const [closesAt, setClosesAt] = useState('');
  const [quorumPct, setQuorumPct] = useState(0);
  const [passPct, setPassPct] = useState(50);
  const [linkedRequestId, setLinkedRequestId] = useState('');
  const [openRequests, setOpenRequests] = useState<HubRequest[]>([]);
  const [showGovernance, setShowGovernance] = useState(false);

  useEffect(() => {
    if (mode !== 'poll' || !isMod) return; // linking a poll to a request is mod-only
    requestsService.list(hubSlug).then(reqs =>
      setOpenRequests(reqs.filter(r => !['shipped', 'declined', 'approved'].includes(r.status)))
    ).catch(() => {});
  }, [hubSlug, mode, isMod]);

  const reset = () => {
    setMode('idle'); setBody(''); setPostError('');
    setCategory(contextualDefaultCategory(activeFilter, QUICK_POST_CATEGORIES.map(c => c.value)));
    setCategoryMenuOpen(false);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null); setMediaPreview(null);
    setPlaceOpen(false); setPlaceQuery(''); setPlace(null);
    setEventDate(''); setEventLocation(''); setEventCoords(null);
    setOptions(['', '']); setClosesAt(''); setQuorumPct(0); setPassPct(50); setLinkedRequestId(''); setShowGovernance(false);
  };

  function handleMediaFile(file: File) {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  }

  function removeMedia() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  }

  const canQuickPost = !!(body.trim() || mediaFile || place);

  async function submitQuickPost() {
    if (!canQuickPost || posting) return;
    setPosting(true);
    setPostError('');
    setPostQueued(false);
    try {
      const post = await createPostOrQueue(hubSlug, {
        category,
        body: body.trim(),
        mediaFile: mediaFile ?? undefined,
        eventLocation: place?.label,
        eventLat: place?.lat,
        eventLng: place?.lng,
        spaceSlug,
      });
      if (post) { onPostCreated(post); reset(); }
      else { reset(); setPostQueued(true); setPostError("Hub's unreachable — this'll send once it's back."); setTimeout(() => { setPostQueued(false); setPostError(''); }, 5000); }
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  }

  async function submitEvent() {
    if (!body.trim() || !eventDate || posting) return;
    setPosting(true);
    setPostError('');
    setPostQueued(false);
    try {
      const post = await createPostOrQueue(hubSlug, {
        category: 'EVENT',
        body: body.trim(),
        mediaFile: mediaFile ?? undefined,
        eventDate: new Date(eventDate).toISOString(),
        eventLocation: eventLocation || undefined,
        eventLat: eventCoords?.lat,
        eventLng: eventCoords?.lng,
        spaceSlug,
      });
      if (post) { onPostCreated(post); reset(); }
      else { reset(); setPostQueued(true); setPostError("Hub's unreachable — this event will post once it's back."); setTimeout(() => { setPostQueued(false); setPostError(''); }, 5000); }
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post event');
    } finally {
      setPosting(false);
    }
  }

  async function submitPoll() {
    const validOptions = options.filter(o => o.trim());
    if (!body.trim() || validOptions.length < 2 || posting) return;
    setPosting(true);
    setPostError('');
    setPostQueued(false);
    try {
      const post = await createPostOrQueue(hubSlug, {
        category: 'POLL',
        title: body.trim(),
        body: '',
        mediaFile: mediaFile ?? undefined,
        options: validOptions,
        closesAt: closesAt || undefined,
        requestId: isMod ? (linkedRequestId || undefined) : undefined,
        quorumPct,
        passPct,
        spaceSlug,
      });
      if (post) { onPostCreated(post); reset(); }
      else { reset(); setPostQueued(true); setPostError("Hub's unreachable — this poll will post once it's back."); setTimeout(() => { setPostQueued(false); setPostError(''); }, 5000); }
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to create poll');
    } finally {
      setPosting(false);
    }
  }

  const fieldCls = 'w-full cn-surface-2 border cn-border rounded-lg px-3 py-2 text-sm cn-text-1 placeholder-zinc-500 focus:outline-none focus:border-blue-400';
  // LocationSearchInput draws its own search icon at left-3/w-4 and (while
  // there's a value) a clear button at right-3 — fieldCls's plain px-3 sits
  // the caret right underneath the icon instead of after it. pl-9/pr-8 match
  // the clearance ComposeModal's and Atlas's own LocationSearchInput fields
  // already use.
  const locationFieldCls = 'w-full cn-surface-2 border cn-border rounded-lg pl-9 pr-8 py-2 text-sm cn-text-1 placeholder-zinc-500 focus:outline-none focus:border-blue-400';

  const isVideoFile = mediaFile?.type.startsWith('video/') ?? false;
  const mediaChipsRow = (
    <div className="flex items-center gap-1">
      <button onClick={() => photoInputRef.current?.click()} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <Image className="w-3.5 h-3.5" />Photo
      </button>
      <button onClick={() => videoInputRef.current?.click()} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <Film className="w-3.5 h-3.5" />Video
      </button>
    </div>
  );
  const mediaPreviewBlock = mediaPreview && (
    <div className="relative rounded-xl overflow-hidden bg-black">
      {isVideoFile
        ? <video src={mediaPreview} controls className="w-full max-h-56 object-contain" />
        : <img src={mediaPreview} alt="Preview" className="w-full max-h-56 object-cover" />}
      <button onClick={removeMedia} className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors">
        <X className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );

  if (mode === 'poll') {
    const validCount = options.filter(o => o.trim()).length;
    return (
      <div className="cn-glass rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--cn-grad-spaces)' }}>
            <Vote className="w-4 h-4 text-white" />
          </span>
          <span className="text-sm font-semibold cn-text-1 flex-1">Create a poll</span>
          <button onClick={reset} className="w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          ref={pollTextareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="Ask your neighbors something…"
          className={`${fieldCls} resize-none`}
        />
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono text-[11px] cn-text-4 w-4 shrink-0">{i + 1}</span>
              <input
                value={opt}
                onChange={e => setOptions(o => o.map((x, idx) => idx === i ? e.target.value : x))}
                placeholder={`Option ${i + 1}`}
                className={fieldCls}
              />
              {options.length > 2 && (
                <button onClick={() => setOptions(o => o.filter((_, idx) => idx !== i))} className="w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {options.length < 5 && (
            <button onClick={() => setOptions(o => [...o, ''])} className="inline-flex items-center gap-1.5 self-start text-xs font-semibold cn-text-3 hover:cn-text-1 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add option
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs cn-text-3">Closes</span>
          <input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} className="cn-surface-2 border cn-border rounded-lg px-2.5 py-1.5 text-xs cn-text-1 focus:outline-none focus:border-blue-400" />
          <span className="text-xs cn-text-4">(optional)</span>
        </div>

        {mediaPreviewBlock}
        {mediaChipsRow}

        <div className="border-t cn-border pt-2.5">
          <button type="button" onClick={() => setShowGovernance(v => !v)} className="flex items-center gap-1.5 text-xs font-medium cn-text-3 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showGovernance ? 'rotate-180' : ''}`} /> Governance options
          </button>
          {showGovernance && (
            <div className="flex flex-col gap-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium cn-text-3 mb-1">Quorum (%)</label>
                  <input type="number" min={0} max={100} value={quorumPct}
                    onChange={e => setQuorumPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className={fieldCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium cn-text-3 mb-1">Pass threshold (%)</label>
                  <input type="number" min={1} max={100} value={passPct}
                    onChange={e => setPassPct(Math.min(100, Math.max(1, parseInt(e.target.value) || 50)))} className={fieldCls} />
                </div>
              </div>
              {openRequests.length > 0 && (
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium cn-text-3 mb-1">
                    <Link2 className="w-3 h-3" /> Link to feature request (optional)
                  </label>
                  <select value={linkedRequestId} onChange={e => setLinkedRequestId(e.target.value)} className={fieldCls}>
                    <option value="">— None —</option>
                    {openRequests.map(r => (
                      <option key={r.id} value={r.id}>{r.problem.slice(0, 80)}{r.problem.length > 80 ? '…' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {postError && <p className={`text-xs flex items-center gap-1 ${postQueued ? 'text-amber-500' : 'text-rose-500'}`}>{postQueued && <Clock className="w-3 h-3" />}{postError}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={reset} className="px-3.5 py-1.5 rounded-lg text-sm cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={submitPoll}
            disabled={!body.trim() || validCount < 2 || posting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Vote className="w-3.5 h-3.5" />} Post poll
          </button>
        </div>

        {/* mediaChipsRow's Photo/Video buttons click these — without them
            here too, they only exist in the idle-mode return below, so
            clicking Photo/Video while in poll mode silently does nothing
            (photoInputRef.current is null, not just unmounted-and-stale). */}
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleMediaFile(e.target.files[0]); e.target.value = ''; }} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleMediaFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  if (mode === 'event') {
    return (
      <div className="cn-glass rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--cn-grad-exchange)' }}>
            <Calendar className="w-4 h-4 text-white" />
          </span>
          <span className="text-sm font-semibold cn-text-1 flex-1">Create an event</span>
          <button onClick={reset} className="w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          ref={eventTextareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="What's the event? Add details for your neighbors…"
          className={`${fieldCls} resize-none`}
        />
        <input
          type="datetime-local"
          value={eventDate}
          onChange={e => setEventDate(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className={fieldCls}
        />
        <LocationSearchInput
          value={eventLocation}
          onChange={v => { setEventLocation(v); setEventCoords(null); }}
          onSelect={r => { setEventLocation(r.label); setEventCoords({ lat: r.lat, lng: r.lng }); }}
          hubCenter={hubCenter}
          historyKey="citinet-feed-event-location-history"
          placeholder="Location — optional"
          inputClassName={locationFieldCls}
        />
        {eventCoords && <p className="text-[11px] text-emerald-500">Linked to Atlas — this exact spot will be clickable on the post.</p>}

        {mediaPreviewBlock}
        {mediaChipsRow}

        {postError && <p className={`text-xs flex items-center gap-1 ${postQueued ? 'text-amber-500' : 'text-rose-500'}`}>{postQueued && <Clock className="w-3 h-3" />}{postError}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={reset} className="px-3.5 py-1.5 rounded-lg text-sm cn-text-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={submitEvent}
            disabled={!body.trim() || !eventDate || posting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />} Post event
          </button>
        </div>

        {/* See the matching comment in the poll-mode return above — same
            reason these need to be duplicated here rather than shared. */}
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleMediaFile(e.target.files[0]); e.target.value = ''; }} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleMediaFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    // No overflow-hidden here (unlike the other cn-glass cards) — every child
    // that needs corner-clipping already clips itself (media preview), and the
    // category picker below needs to pop up past this card's own edge.
    <div className="cn-glass rounded-2xl">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <AvatarCircle
          authorId={currentUserId ?? ''}
          authorUsername={currentUserName}
          authorAvatarUrl={currentUserAvatarUrl}
          currentUserId={currentUserId}
          currentUserAvatarUrl={currentUserAvatarUrl}
          size="sm"
        />
        <input
          ref={bodyInputRef}
          value={body}
          onChange={e => {
            const v = e.target.value;
            setBody(v);
            // Typing here is exactly the moment someone acts on "Event/Poll is
            // hinted, so this must already be what I'm writing" — the ring
            // alone can't stop that assumption, only actually becoming true
            // can. So the first character typed while that tab's hinted and
            // nothing else has been picked promotes straight into the real
            // form, carrying the text along (mirrors what clicking Event
            // itself already does with a pending Place, below).
            if (mode === 'idle' && v.trim() && (activeFilter === 'EVENT' || activeFilter === 'POLL')) {
              if (activeFilter === 'EVENT' && place) { setEventLocation(place.label); setEventCoords({ lat: place.lat, lng: place.lng }); }
              setMode(activeFilter === 'EVENT' ? 'event' : 'poll');
            }
          }}
          onKeyDown={e => { if (e.key === 'Enter' && canQuickPost) submitQuickPost(); }}
          placeholder={
            activeFilter === 'EVENT' ? "What's the event? Add details for your neighbors…"
              : activeFilter === 'POLL' ? 'Ask your neighbors something…'
              : 'Share something with your neighbors…'
          }
          className="flex-1 bg-transparent text-sm cn-text-1 placeholder:cn-text-4 focus:outline-none"
        />
      </div>

      {/* Photo/video preview — right where you were typing */}
      {mediaPreview && (
        <div className="px-4 pb-3">
          <div className="relative rounded-xl overflow-hidden bg-black">
            {isVideoFile
              ? <video src={mediaPreview} controls className="w-full max-h-56 object-contain" />
              : <img src={mediaPreview} alt="Preview" className="w-full max-h-56 object-cover" />}
            <button onClick={removeMedia} className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Place — inline search that collapses to a removable chip once picked */}
      {(placeOpen || place) && (
        <div className="px-4 pb-3">
          {place ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cn-surface-2 border cn-border text-xs cn-text-2">
              <MapPin className="w-3.5 h-3.5 cn-text-3 shrink-0" />
              {place.label}
              <button onClick={() => setPlace(null)} className="cn-text-4 hover:text-red-500 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <LocationSearchInput
              value={placeQuery}
              onChange={setPlaceQuery}
              onSelect={r => { setPlace({ label: r.label, lat: r.lat, lng: r.lng }); setPlaceOpen(false); setPlaceQuery(''); }}
              hubCenter={hubCenter}
              historyKey="citinet-feed-place-history"
              placeholder="Search a place…"
              inputClassName={locationFieldCls}
            />
          )}
        </div>
      )}

      <div className="border-t cn-border px-3 py-2 flex items-center gap-1">
        {/* Post intent — subtle, text-only picker (matches the muted category
            treatment used everywhere else now) rather than a loud colored pill.
            Built on the shared Radix DropdownMenu (same one the post-actions
            "⋮" menu uses below) rather than a hand-rolled absolute div: Radix
            portals its content straight to <body>, which is required here —
            this card's own cn-glass backdrop-blur creates a stacking context,
            so a plain in-tree absolute/z-10 popover can never paint above the
            sticky, z-indexed category-filter tabs row that sits right above
            this composer, no matter how high its z-index goes. */}
        <DropdownMenu open={categoryMenuOpen} onOpenChange={setCategoryMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {QUICK_POST_CATEGORIES.find(c => c.value === category)?.label ?? 'Discussion'}
              <ChevronDown className={`w-3 h-3 transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {QUICK_POST_CATEGORIES.map(opt => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setCategory(opt.value)}
                className={category === opt.value ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300' : ''}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0">
          <button onClick={() => photoInputRef.current?.click()} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <Image className="w-3.5 h-3.5" />Photo
          </button>
          <button onClick={() => videoInputRef.current?.click()} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <Film className="w-3.5 h-3.5" />Video
          </button>
          <button
            onClick={() => {
              if (place) return;
              setEventLocation(''); setEventCoords(null);
              setPlaceOpen(v => !v);
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />Place
          </button>
          {/* Event/Poll switch into their own dedicated modes (own category),
              so — unlike Photo/Video/Place — they pick up a thin ring whenever
              that's the feed tab you're currently viewing: a "you're probably
              looking for this" nudge, not a solid pill. A filled pill here
              would read as "already on" (that's what the tab bar's own
              selected state looks like right above this), when clicking is
              still required to actually switch into that mode — a filled
              state that isn't backed by the real mode would be misleading. */}
          <button
            onClick={() => {
              if (place) { setEventLocation(place.label); setEventCoords({ lat: place.lat, lng: place.lng }); }
              setMode('event');
            }}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeFilter === 'EVENT' ? 'ring-1 ring-inset ring-blue-400/50 dark:ring-blue-500/40 text-blue-600 dark:text-blue-300 hover:bg-black/5 dark:hover:bg-white/5' : 'cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />Event
          </button>
          <button
            onClick={() => setMode('poll')}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeFilter === 'POLL' ? 'ring-1 ring-inset ring-blue-400/50 dark:ring-blue-500/40 text-blue-600 dark:text-blue-300 hover:bg-black/5 dark:hover:bg-white/5' : 'cn-text-3 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />Poll
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => (canQuickPost ? submitQuickPost() : onOpenFullComposer(''))}
          disabled={posting}
          className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
        >
          {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Post
        </button>
      </div>
      {postError && <p className={`text-xs px-4 pb-2 flex items-center gap-1 ${postQueued ? 'text-amber-500' : 'text-rose-500'}`}>{postQueued && <Clock className="w-3 h-3" />}{postError}</p>}

      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleMediaFile(e.target.files[0]); e.target.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleMediaFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}
