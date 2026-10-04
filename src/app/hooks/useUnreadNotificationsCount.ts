import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsService, NOTIFICATIONS_CHANGED_EVENT } from '../services/notificationsService';
import { getActiveConversation, playNotificationSound } from '../utils/notificationAlert';

const POLL_INTERVAL = 30_000; // 30 seconds — same cadence as useNotificationCounts

// Total unread across all 6 notification types, for the Notifications bell
// badge — deliberately separate from useNotificationCounts, whose 3-bucket
// NotificationCounts only covers feed/messages/hub_management (the types
// that also get a per-tile badge). This badge is meant to match exactly what
// the Notifications screen itself will show.
export function useUnreadNotificationsCount(hubSlug: string) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const seenIds = useRef<Set<number> | null>(null);

  // A new hub must not diff against the previous one's ids.
  useEffect(() => {
    seenIds.current = null;
  }, [hubSlug]);

  const refresh = useCallback(async () => {
    if (!hubSlug) return;
    const fetched = await notificationsService.getUnread(hubSlug).catch(() => null);
    if (!fetched) return;
    // Messages in the thread being read right now (tab visible) are already
    // seen - MessagesScreen clears them server-side; keep them out of the
    // count and the chime meanwhile. A hidden tab with the thread open
    // genuinely hasn't seen them, so those still count and chime.
    const active = document.visibilityState === 'visible' ? getActiveConversation() : null;
    const list = active ? fetched.filter(n => !(n.type === 'message' && n.ref_id === active)) : fetched;
    setCount(list.length);
    const prev = seenIds.current;
    seenIds.current = new Set(list.map(n => n.id));
    // First fetch only seeds the baseline, so old unread items are silent on load.
    if (prev && list.some(n => !prev.has(n.id))) playNotificationSound();
  }, [hubSlug]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_INTERVAL);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocus);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocus);
    };
  }, [refresh]);

  return { count, refresh };
}
