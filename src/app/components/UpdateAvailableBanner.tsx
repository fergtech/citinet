import { useEffect, useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { hubService } from '../services/hubService';
import { isUpdateSnoozed, snoozeUpdate, UPDATES_CHANGED } from '../utils/updateSnooze';
import type { StackUpdates } from '../types/hub';

/**
 * Admin-only nudge shown when the hub's own software has a newer published
 * version. Silent for non-admins, for hubs without the admin sidecar, on any
 * error, and while snoozed — it must never get in the way of using the hub.
 */
export function UpdateAvailableBanner({ hubSlug, onOpen }: { hubSlug: string; onOpen: () => void }) {
  const [pending, setPending] = useState<{ service: string; digest: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (d: StackUpdates) => {
      if (cancelled || !d.available) return;
      const hit = (d.services ?? []).find(
        (s) => s.updateAvailable && s.canApply && !isUpdateSnoozed(hubSlug, s.service, s.latest?.digest ?? null),
      );
      setPending(hit ? { service: hit.service, digest: hit.latest?.digest ?? null } : null);
    };
    hubService.getStackUpdates(hubSlug).then(apply).catch(() => {});
    // Updated, re-checked or put off from the Updates panel: follow along.
    const onChanged = (e: Event) => apply((e as CustomEvent<StackUpdates>).detail);
    window.addEventListener(UPDATES_CHANGED, onChanged);
    return () => { cancelled = true; window.removeEventListener(UPDATES_CHANGED, onChanged); };
  }, [hubSlug]);

  if (!pending) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 flex flex-col gap-2 md:flex-row md:items-center">
      <div className="flex items-center gap-2 md:flex-1">
        <ArrowUpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-800 dark:text-blue-200 flex-1">A hub update is available</span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onOpen} className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
          Review
        </button>
        <button
          onClick={() => { snoozeUpdate(hubSlug, pending.service, pending.digest); setPending(null); }}
          className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40"
        >
          Later
        </button>
      </div>
    </div>
  );
}
