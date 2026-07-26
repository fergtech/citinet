import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsService, type NotificationCounts, type NotificationFeature } from '../services/notificationsService';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotificationCounts(hubSlug: string) {
  const [counts, setCounts] = useState<NotificationCounts>({ feed: 0, messages: 0, hub_management: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!hubSlug) return;
    const result = await notificationsService.getCounts(hubSlug).catch(() => null);
    if (result) setCounts(result);
  }, [hubSlug]);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_INTERVAL);
    const onFocus = () => fetch();
    window.addEventListener('focus', onFocus);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetch]);

  const clearBadge = useCallback((feature: NotificationFeature) => {
    setCounts(prev => ({ ...prev, [feature]: 0 }));
  }, []);

  return { counts, clearBadge };
}
