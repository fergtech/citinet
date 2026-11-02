import { ChevronUp } from 'lucide-react';
import { useBroadcast } from '../../context/BroadcastContext';
import { formatCallDuration, useElapsedSeconds } from '../../lib/comms/use-elapsed';

/** Persistent status bar shown while a live broadcast is minimized. */
export function MinimizedBroadcastBar() {
  const { broadcast, restore } = useBroadcast();
  const elapsed = useElapsedSeconds(broadcast.startedAt);

  if (broadcast.phase !== 'live' || !broadcast.minimized) return null;

  // The join-request card only exists inside the live overlay itself — a
  // minimized host would otherwise never know one arrived at all. This is
  // the only surface that exists while minimized, so it has to carry that
  // signal.
  const hasPendingRequest = broadcast.role === 'host' && !!broadcast.pendingRequest;

  return (
    <button
      onClick={restore}
      className={`fixed left-1/2 -translate-x-1/2 z-[190] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full pl-3 pr-3.5 py-1.5 text-left shadow-lg top-[calc(env(safe-area-inset-top)+2.75rem)] md:top-[5rem] ${hasPendingRequest ? 'bg-[#331CA7]' : 'bg-[#4A1616]'}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${hasPendingRequest ? 'bg-white' : 'bg-[#DC2B2B]'}`} />
      <span className="text-white text-xs font-semibold truncate max-w-[50vw]">
        {hasPendingRequest ? `${broadcast.pendingRequest!.requesterName} wants to join in` : broadcast.role === 'host' ? 'Broadcasting live' : 'Watching live'}
      </span>
      <span className="text-white/85 text-xs tabular-nums">{formatCallDuration(elapsed)}</span>
      <ChevronUp className="w-3.5 h-3.5 text-white" />
    </button>
  );
}
