import { ChevronUp } from 'lucide-react';
import { useCall } from '../../context/CallContext';
import { formatCallDuration, useElapsedSeconds } from '../../lib/comms/use-elapsed';

/** Persistent status bar shown while a connected call is minimized. */
export function MinimizedCallBar() {
  const { call, restore } = useCall();
  const elapsed = useElapsedSeconds(call.startedAt);

  if (call.phase !== 'connected' || !call.minimized) return null;

  return (
    <button
      onClick={restore}
      // Compact pill at the top-center so it never covers the composer / message list.
      className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] md:top-11 z-[190] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-[#331CA7] pl-3 pr-3.5 py-1.5 text-left shadow-lg"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
      <span className="text-white text-xs font-semibold truncate max-w-[40vw]">{call.peerName ?? 'Call'}</span>
      <span className="text-white/85 text-xs tabular-nums">{formatCallDuration(elapsed)}</span>
      <ChevronUp className="w-3.5 h-3.5 text-white" />
    </button>
  );
}
