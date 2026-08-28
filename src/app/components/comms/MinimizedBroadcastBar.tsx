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
      className={`fixed left-4 right-4 z-[190] flex items-center gap-2 rounded-xl px-3 py-2.5 text-left shadow-lg ${hasPendingRequest ? 'bottom-20 bg-[#331CA7]' : 'bottom-4 bg-[#4A1616]'}`}
    >
      <span className={`w-2 h-2 rounded-full ${hasPendingRequest ? 'bg-white' : 'bg-[#DC2B2B]'}`} />
      <span className="flex-1 text-white text-sm font-semibold truncate">
        {hasPendingRequest ? `${broadcast.pendingRequest!.requesterName} wants to join in` : broadcast.role === 'host' ? 'Broadcasting live' : 'Watching live'}
      </span>
      <span className="text-white/85 text-xs tabular-nums">{formatCallDuration(elapsed)}</span>
      <ChevronUp className="w-3.5 h-3.5 text-white" />
    </button>
  );
}
