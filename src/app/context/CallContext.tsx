import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHub } from './HubContext';
import { hubService } from '../services/hubService';
import { useCommsSocket } from '../lib/comms/socket';
import type { CallMode, CallOutcome } from '../types/hub';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connected' | 'ended';

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  peerId: string | null;
  peerName: string | null;
  mode: CallMode;
  roomName: string | null;
  token: string | null;
  livekitUrl: string | null;
  // Wall-clock timestamp (Date.now()), not a tick counter — every on-screen
  // timer derives from `Date.now() - startedAt` instead of an interval that
  // would drift under re-render load.
  startedAt: number | null;
  minimized: boolean;
  layout: 'split' | 'focus';
  micOn: boolean;
  camOn: boolean;
  speakerOn: boolean;
  sharingOn: boolean;
  // Set the instant a call resolves so the ending UI can read the outcome
  // once, before the safety-net timer below resets everything to idle.
  endedOutcome: CallOutcome | null;
};

const idleState: CallState = {
  phase: 'idle',
  callId: null,
  conversationId: null,
  peerId: null,
  peerName: null,
  mode: 'video',
  roomName: null,
  token: null,
  livekitUrl: null,
  startedAt: null,
  minimized: false,
  // 'focus' (one big feed + a small self PiP) is the desktop-appropriate
  // default — a landscape viewport makes two equally-billed tiles ('split')
  // look stretched and stubby unless placed side-by-side, which is what
  // toggleLayout switches to instead.
  layout: 'focus',
  micOn: true,
  camOn: true,
  speakerOn: true,
  sharingOn: false,
  endedOutcome: null,
};

type CallContextValue = {
  call: CallState;
  startOutgoingCall: (args: { conversationId: string; peerId: string; peerName: string; mode: CallMode; micOn?: boolean; camOn?: boolean }) => void;
  answer: () => void;
  decline: () => void;
  end: () => void;
  reset: () => void;
  setMode: (mode: CallMode) => void;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleSpeaker: () => void;
  toggleSharing: () => void;
  toggleLayout: () => void;
  minimize: () => void;
  restore: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug;
  const tunnelUrl = currentHub?.tunnelUrl;
  const authToken = currentUser?.authToken;

  const [call, setCall] = useState<CallState>(idleState);
  // Actions below read `call` synchronously inside async callbacks and the
  // socket handler — a ref sidesteps stale closures without re-subscribing
  // useCommsSocket (and its WS connection) on every state change.
  const callRef = useRef(call);
  callRef.current = call;

  useCommsSocket(tunnelUrl, authToken, (event) => {
    if (event.type === 'incoming_call') {
      // A second ring arriving mid-call: don't let it stomp whatever's
      // already happening.
      if (callRef.current.phase !== 'idle') return;
      setCall({
        ...idleState,
        phase: 'incoming',
        callId: event.call_id,
        conversationId: event.conversation_id,
        peerId: event.from_id,
        peerName: event.from_username,
        mode: event.mode,
        roomName: event.room_name,
      });
    } else if (event.type === 'call_answered') {
      // Caller's own token/roomName were already set by startOutgoingCall's
      // ringCall() response — this just flips the phase now that the callee
      // has actually picked up.
      if (callRef.current.callId === event.call_id) {
        setCall((prev) => ({ ...prev, phase: 'connected', startedAt: Date.now() }));
      }
    } else if (event.type === 'call_declined' || event.type === 'call_ended') {
      if (callRef.current.callId === event.call_id && callRef.current.phase !== 'idle' && callRef.current.phase !== 'ended') {
        setCall((prev) => ({
          ...prev,
          phase: 'ended',
          endedOutcome: event.type === 'call_declined' ? 'declined' : prev.startedAt ? 'connected' : 'not_answered',
        }));
      }
    }
  });

  const startOutgoingCall = useCallback<CallContextValue['startOutgoingCall']>(
    ({ conversationId, peerId, peerName, mode, micOn, camOn }) => {
      if (!hubSlug) return;
      // Prefer the pre-call setup modal's toggles when given, otherwise carry
      // forward whatever they were left at — spreading idleState wholesale
      // here would silently discard a mute set right before placing the call.
      setCall((prev) => ({
        ...idleState,
        phase: 'outgoing',
        conversationId,
        peerId,
        peerName,
        mode,
        micOn: micOn ?? prev.micOn,
        camOn: camOn ?? prev.camOn,
        speakerOn: prev.speakerOn,
      }));
      hubService
        .ringCall(hubSlug, conversationId, peerId, mode)
        .then((res) => {
          setCall((prev) =>
            prev.phase === 'outgoing'
              ? { ...prev, callId: res.call_id, roomName: res.room_name, token: res.token, livekitUrl: res.livekit_url }
              : prev,
          );
        })
        .catch(() => {
          setCall((prev) => ({ ...prev, phase: 'ended', endedOutcome: 'not_answered' }));
        });
    },
    [hubSlug],
  );

  const answer = useCallback(() => {
    if (!hubSlug || !callRef.current.callId) return;
    const callId = callRef.current.callId;
    hubService
      .answerCall(hubSlug, callId)
      .then((res) => {
        setCall((prev) =>
          prev.callId === callId
            ? { ...prev, phase: 'connected', roomName: res.room_name, mode: res.mode ?? prev.mode, token: res.token, livekitUrl: res.livekit_url, startedAt: Date.now() }
            : prev,
        );
      })
      .catch(() => {
        setCall((prev) => (prev.callId === callId ? { ...prev, phase: 'ended', endedOutcome: 'not_answered' } : prev));
      });
  }, [hubSlug]);

  const decline = useCallback(() => {
    if (hubSlug && callRef.current.callId) hubService.declineCall(hubSlug, callRef.current.callId);
    setCall(idleState);
  }, [hubSlug]);

  const end = useCallback(() => {
    if (hubSlug && callRef.current.callId) hubService.endCall(hubSlug, callRef.current.callId);
    setCall((prev) => ({ ...prev, phase: 'ended', endedOutcome: prev.startedAt ? 'connected' : 'not_answered' }));
  }, [hubSlug]);

  const reset = useCallback(() => setCall(idleState), []);

  // Safety net for phase 'ended': guarantees phase resets back to idle
  // regardless of which UI (if any) is mounted to see 'ended' happen.
  useEffect(() => {
    if (call.phase !== 'ended') return;
    const timer = setTimeout(() => setCall(idleState), 900);
    return () => clearTimeout(timer);
  }, [call.phase]);

  const setMode = useCallback((mode: CallMode) => setCall((prev) => ({ ...prev, mode })), []);
  const toggleMic = useCallback(() => setCall((prev) => ({ ...prev, micOn: !prev.micOn })), []);
  const toggleCam = useCallback(() => setCall((prev) => ({ ...prev, camOn: !prev.camOn })), []);
  const toggleSpeaker = useCallback(() => setCall((prev) => ({ ...prev, speakerOn: !prev.speakerOn })), []);
  const toggleSharing = useCallback(() => setCall((prev) => ({ ...prev, sharingOn: !prev.sharingOn })), []);
  const toggleLayout = useCallback(() => setCall((prev) => ({ ...prev, layout: prev.layout === 'split' ? 'focus' : 'split' })), []);
  const minimize = useCallback(() => setCall((prev) => ({ ...prev, minimized: true })), []);
  const restore = useCallback(() => setCall((prev) => ({ ...prev, minimized: false })), []);

  const value = useMemo<CallContextValue>(
    () => ({ call, startOutgoingCall, answer, decline, end, reset, setMode, toggleMic, toggleCam, toggleSpeaker, toggleSharing, toggleLayout, minimize, restore }),
    [call, startOutgoingCall, answer, decline, end, reset, setMode, toggleMic, toggleCam, toggleSpeaker, toggleSharing, toggleLayout, minimize, restore],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
