import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Mic, MicOff, Video, VideoOff, Phone, PhoneOff } from 'lucide-react';

import { useCall } from '../../context/CallContext';
import { useHub } from '../../context/HubContext';
import type { CallMode } from '../../types/hub';
import { CommsAvatar } from './CommsAvatar';

/** Ringing screen shown to the callee — rendered globally, visible only
 * while CallContext's phase is 'incoming'. */
export function IncomingCallModal() {
  const { call, answer, decline } = useCall();
  const { currentHub } = useHub();
  const slug = currentHub?.slug || '';

  if (call.phase !== 'incoming') return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex flex-col bg-gradient-to-b from-[#331CA7] to-[#07060F]">
      <div className="flex items-center justify-between px-5 pt-6">
        <button onClick={decline} aria-label="Decline" className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white">
          <X className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold text-sm">{call.mode === 'video' ? 'Video call' : 'Audio call'}</span>
        <div className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-1">
          <Lock className="w-[11px] h-[11px] text-emerald-300" />
          <span className="text-emerald-300 text-[11px] font-semibold">Encrypted</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <CommsAvatar slug={slug} userId={call.peerId} name={call.peerName ?? '?'} size={128} />
        <div className="text-center">
          <p className="text-white text-xl font-semibold">{call.peerName ?? 'Neighbor'}</p>
          <p className="text-white/70 text-sm mt-1">Incoming {call.mode === 'video' ? 'video call' : 'call'}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-16 pb-14">
        <div className="flex flex-col items-center gap-2">
          <button onClick={decline} aria-label="Decline call" className="w-16 h-16 rounded-full bg-[#DC2B2B] flex items-center justify-center">
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
          <span className="text-white/70 text-xs">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={answer} aria-label="Accept call" className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
            <Phone className="w-6 h-6 text-white" />
          </button>
          <span className="text-white/70 text-xs">Accept</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Pre-call preview shown to the caller before ringing — pure local UI/state
 * (mirrors mobile's app/call/setup.tsx: no LiveKit connection here, the real
 * one starts once startOutgoingCall actually fires). */
export function OutgoingCallModal({
  open,
  onClose,
  conversationId,
  peerId,
  peerName,
  initialMode,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  peerId: string;
  peerName: string;
  initialMode: CallMode;
}) {
  const { startOutgoingCall } = useCall();
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug || '';
  const [mode, setMode] = useState<CallMode>(initialMode);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  if (!open) return null;

  function handleStart() {
    startOutgoingCall({ conversationId, peerId, peerName, mode, micOn, camOn });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[210] flex flex-col bg-gradient-to-b from-[#331CA7] to-[#07060F]">
      <div className="flex items-center justify-between px-5 pt-6">
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white">
          <X className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold text-sm">{mode === 'video' ? 'Video call' : 'Audio call'}</span>
        <div className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-1">
          <Lock className="w-[11px] h-[11px] text-emerald-300" />
          <span className="text-emerald-300 text-[11px] font-semibold">Encrypted</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <CommsAvatar slug={slug} userId={currentUser?.hubUserId} name={currentUser?.displayName || currentUser?.username || '?'} size={128} />
        <div className="text-center">
          <p className="text-white text-xl font-semibold">{peerName}</p>
          <p className="text-white/70 text-sm mt-1">Ready to call</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 pb-6">
        <button
          onClick={() => setMicOn((v) => !v)}
          aria-label={micOn ? 'Mute' : 'Unmute'}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${micOn ? 'bg-white/15' : 'bg-white'}`}
        >
          {micOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-[#07060F]" />}
        </button>
        <button
          onClick={() => setMode((m) => (m === 'video' ? 'audio' : 'video'))}
          aria-label={mode === 'video' ? 'Switch to audio' : 'Switch to video'}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${mode === 'video' ? 'bg-white/15' : 'bg-white'}`}
        >
          {mode === 'video' ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-[#07060F]" />}
        </button>
        {mode === 'video' && (
          <button
            onClick={() => setCamOn((v) => !v)}
            aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/15' : 'bg-white'}`}
          >
            {camOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-[#07060F]" />}
          </button>
        )}
      </div>

      <div className="flex items-center justify-center pb-14">
        <button onClick={handleStart} className="flex items-center gap-2 bg-emerald-500 rounded-full px-8 py-3.5">
          <Phone className="w-5 h-5 text-white" />
          <span className="text-white font-semibold">Call</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
