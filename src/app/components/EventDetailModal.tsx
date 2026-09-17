import { MapPin, X, Clock, Share2, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { AvatarFallback } from './icons';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { openLocationInAtlas, hubCenterOf } from '../utils/geocoding';
import type { HubPost, HubEventAttendee } from '../types/hub';

function AttendeeAvatar({ userId, username, hubSlug, onClick }: { userId: string; username: string; hubSlug: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  const url = hubService.getAvatarUrl(hubSlug, userId);
  return (
    <button
      onClick={onClick}
      title={username}
      className="w-7 h-7 rounded-full ring-2 ring-white dark:ring-zinc-900 overflow-hidden shrink-0 hover:z-10 hover:scale-110 transition-transform"
    >
      {url && !failed
        ? <img src={url} alt={username} className="w-full h-full object-cover" onError={() => setFailed(true)} />
        : <AvatarFallback className="w-full h-full" name={username} />
      }
    </button>
  );
}

// ── Event Detail Modal ───────────────────────────────────
// Compact RSVP-focused overlay for a quick glance at an upcoming event, opened
// from an event marker on Atlas (previously the dashboard's "Upcoming events"
// list). RSVP is real and shared (hub_event_rsvps), with a clickable attendee
// avatar stack. "View full post" deep-links into Feed and opens the exact same
// post detail view you'd get by clicking the event there.
export function EventDetailModal({ event, hubSlug, onClose, onNavigate }: { event: HubPost; hubSlug: string; onClose: () => void; onNavigate: (screen: string) => void }) {
  const { currentHub } = useHub();
  const d = event.event_date ? new Date(event.event_date) : null;
  const weekdayStr = d ? d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() : '—';
  const dayOfMonth = d ? d.getDate() : '–';
  const timeStr = d ? `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : null;

  const [going, setGoing] = useState(event.my_rsvp ?? false);
  const [count, setCount] = useState(event.rsvp_count ?? 0);
  const [attendees, setAttendees] = useState<HubEventAttendee[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAttendeesLoading(true);
    hubService.listRsvps(hubSlug, event.id)
      .then(data => {
        if (cancelled) return;
        setAttendees(data.attendees);
        setCount(data.count);
        setGoing(data.going);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAttendeesLoading(false); });
    return () => { cancelled = true; };
  }, [hubSlug, event.id]);

  const toggleGoing = async () => {
    if (toggling) return;
    setToggling(true);
    const wasGoing = going;
    setGoing(!wasGoing);
    setCount(c => wasGoing ? Math.max(0, c - 1) : c + 1);
    try {
      const result = await hubService.toggleRsvp(hubSlug, event.id);
      setGoing(result.going);
      setCount(result.count);
      const data = await hubService.listRsvps(hubSlug, event.id);
      setAttendees(data.attendees);
    } catch {
      setGoing(wasGoing);
      setCount(c => wasGoing ? c + 1 : Math.max(0, c - 1));
    } finally {
      setToggling(false);
    }
  };

  const handleShare = () => {
    const parts = [event.title];
    if (timeStr) parts.push(timeStr);
    if (event.event_location) parts.push(event.event_location);
    navigator.clipboard.writeText(parts.join(' — '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm z-50"
      />
      <div key="panel-wrap" className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="cn-surface border cn-border rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden"
        >
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold cn-text-3 uppercase tracking-wide">Event</span>
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 cn-text-3" />
              </button>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-14 text-center rounded-xl cn-surface-2 border cn-border py-2 shrink-0">
                <div className="text-[10px] font-bold tracking-wider cn-text-4">{weekdayStr}</div>
                <div className="font-mono text-xl font-bold leading-tight cn-text-1">{dayOfMonth}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold cn-text-1 leading-snug">{event.title}</h2>
                <div className="flex flex-col gap-1 mt-1.5 text-xs cn-text-3">
                  {timeStr && <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 shrink-0" />{timeStr}</span>}
                </div>
              </div>
            </div>

            {event.body && <p className="text-sm cn-text-2 leading-relaxed">{event.body}</p>}

            {/* Referenced location — clickable into Atlas, resolving to a real pin if one
                exists nearby or offering to add one if not (mirrors Feed's post locations). */}
            {event.event_location && (
              <button
                onClick={() => openLocationInAtlas(event.event_location!, event.event_lat, event.event_lng, onNavigate, currentHub?.location, hubCenterOf(currentHub))}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border cn-border bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-white" />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium cn-text-2 truncate">{event.event_location}</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] font-semibold cn-text-2 shrink-0">
                  Open in Atlas
                </span>
              </button>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs cn-text-3">Hosted by <span className="font-semibold cn-text-1">{event.author_username}</span></span>
              {event.reply_count > 0 && (
                <span className="text-xs cn-text-4">{event.reply_count} comment{event.reply_count === 1 ? '' : 's'}</span>
              )}
            </div>

            {/* Attendees — real, shared RSVPs; click an avatar to open that person's profile */}
            {(attendeesLoading || count > 0) && (
              <div className="flex items-center gap-2.5">
                {attendeesLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin cn-text-4" />
                ) : (
                  <div className="flex -space-x-2">
                    {attendees.slice(0, 6).map(a => (
                      <AttendeeAvatar
                        key={a.user_id}
                        userId={a.user_id}
                        username={a.display_name || a.username}
                        hubSlug={hubSlug}
                        onClick={() => { onClose(); onNavigate(`profile/${a.user_id}`); }}
                      />
                    ))}
                  </div>
                )}
                {!attendeesLoading && (
                  <span className="text-xs cn-text-3">
                    {count} going{attendees.length > 6 ? ` · +${count - 6} more` : ''}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={toggleGoing}
                disabled={toggling}
                className={`flex-1 py-2.5 cn-action text-sm font-semibold transition-colors disabled:opacity-60 ${going ? 'cn-surface-2 cn-text-1 border cn-border' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              >
                {going ? "You're going" : "I'm going"}
              </button>
              <button
                onClick={handleShare}
                title={copied ? 'Copied!' : 'Copy event details'}
                className="px-4 py-2.5 rounded-xl cn-surface-2 border cn-border cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={() => { onClose(); onNavigate(`feed/${event.id}`); }}
              className="w-full text-center text-xs font-medium cn-text-3 hover:cn-text-1 transition-colors"
            >
              View full post &amp; comments →
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
