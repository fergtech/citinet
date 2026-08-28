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
      className="fixed left-4 right-4 bottom-4 z-[190] flex items-center gap-2 rounded-xl bg-[#331CA7] px-3 py-2.5 text-left shadow-lg"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span className="flex-1 text-white text-sm font-semibold truncate">{call.peerName ?? 'Call'} · in progress</span>
      <span className="text-white/85 text-xs tabular-nums">{formatCallDuration(elapsed)}</span>
      <ChevronUp className="w-3.5 h-3.5 text-white" />
    </button>
  );
}
