import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsService } from '../services/notificationsService';

const POLL_INTERVAL = 30_000; // 30 seconds — same cadence as useNotificationCounts

// Total unread across all 6 notification types, for the Notifications bell
// badge — deliberately separate from useNotificationCounts, whose 3-bucket
// NotificationCounts only covers feed/messages/hub_management (the types
// that also get a per-tile badge). This badge is meant to match exactly what
// the Notifications screen itself will show.
export function useUnreadNotificationsCount(hubSlug: string) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!hubSlug) return;
    const result = await notificationsService.getUnread(hubSlug).catch(() => null);
    if (result) setCount(result.length);
  }, [hubSlug]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_INTERVAL);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { count, refresh };
}
