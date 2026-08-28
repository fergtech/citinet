import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHub } from './HubContext';
import { hubService } from '../services/hubService';
import type { LiveCommsItem } from '../types/hub';

export type BroadcastPhase = 'idle' | 'starting' | 'live' | 'ended';
export type BroadcastRole = 'host' | 'viewer';

export type BroadcastComment = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  // "<name> joined the live" lines derived from an accepted join_response —
  // rendered without a sender name/monogram, same feed, no separate UI.
  system?: boolean;
};

export type PendingJoinRequest = {
  requesterId: string;
  requesterName: string;
};

export type BroadcastState = {
  phase: BroadcastPhase;
  role: BroadcastRole;
  roomName: string | null;
  token: string | null;
  livekitUrl: string | null;
  title: string;
  hostId: string | null;
  hostName: string | null;
  // Wall-clock timestamp, not a tick counter — same reasoning as
  // CallState.startedAt.
  startedAt: number | null;
  minimized: boolean;
  micOn: boolean;
  camOn: boolean;
  hearts: number;
  comments: BroadcastComment[];
  pendingRequest: PendingJoinRequest | null;
  // Host is implicitly always approved; a viewer flips this once the host
  // accepts their join request. Lives here (not local component state) so
  // it survives minimize/restore.
  approvedToPublish: boolean;
  // A viewer's own "I've asked, waiting on the host" flag.
  joinRequestPending: boolean;
};

const idleState: BroadcastState = {
  phase: 'idle',
  role: 'host',
  roomName: null,
  token: null,
  livekitUrl: null,
  title: '',
  hostId: null,
  hostName: null,
  startedAt: null,
  minimized: false,
  micOn: true,
  camOn: true,
  hearts: 0,
  comments: [],
  pendingRequest: null,
  approvedToPublish: false,
  joinRequestPending: false,
};

type BroadcastContextValue = {
  broadcast: BroadcastState;
  startBroadcast: (args: { title: string }) => void;
  joinAsViewer: (item: LiveCommsItem) => void;
  end: () => void;
  reset: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  minimize: () => void;
  restore: () => void;
  // Called by the data-channel bridge (which has the actual LiveKit room
  // access this context deliberately doesn't) to record the effect of a
  // sent or received data-channel message — both the send path (optimistic
  // local update) and the receive path go through this one place.
  addComment: (comment: BroadcastComment) => void;
  addHeart: (delta: 1 | -1) => void;
  setPendingRequest: (request: PendingJoinRequest | null) => void;
  approvePublish: () => void;
  setJoinRequestPending: (pending: boolean) => void;
};

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug;
  const userId = currentUser?.hubUserId;
  const displayName = currentUser?.displayName || currentUser?.username;

  const [broadcast, setBroadcast] = useState<BroadcastState>(idleState);
  const broadcastRef = useRef(broadcast);
  broadcastRef.current = broadcast;

  const startBroadcast = useCallback<BroadcastContextValue['startBroadcast']>(
    ({ title }) => {
      if (!hubSlug) return;
      // Carry forward mic/cam from whatever the setup modal's toggles left
      // them at — spreading idleState wholesale here (its micOn/camOn are
      // just this app's fresh-boot defaults) would silently discard a mute
      // set right before going live.
      setBroadcast((prev) => ({
        ...idleState,
        phase: 'starting',
        title,
        role: 'host',
        hostId: userId ?? null,
        hostName: displayName ?? null,
        micOn: prev.micOn,
        camOn: prev.camOn,
      }));
      hubService
        .getCommsToken(hubSlug, 'broadcast', undefined, title)
        .then((res) => {
          setBroadcast((prev) =>
            prev.phase === 'starting'
              ? { ...prev, phase: 'live', roomName: res.room_name, token: res.token, livekitUrl: res.livekit_url, startedAt: Date.now(), approvedToPublish: true }
              : prev,
          );
        })
        .catch(() => {
          setBroadcast(idleState);
        });
    },
    [hubSlug, userId, displayName],
  );

  const joinAsViewer = useCallback<BroadcastContextValue['joinAsViewer']>(
    (item) => {
      if (!hubSlug) return;
      setBroadcast({
        ...idleState,
        phase: 'starting',
        role: 'viewer',
        title: item.title || '',
        hostId: item.host_id,
        hostName: item.host_username,
      });
      hubService
        .getCommsToken(hubSlug, 'broadcast', item.room_name, item.title)
        .then((res) => {
          setBroadcast((prev) =>
            prev.phase === 'starting'
              ? { ...prev, phase: 'live', roomName: res.room_name, token: res.token, livekitUrl: res.livekit_url, startedAt: Date.now() }
              : prev,
          );
        })
        .catch(() => {
          setBroadcast(idleState);
        });
    },
    [hubSlug],
  );

  // Just the local phase flip — the host's server-side room deletion is a
  // separate call (see useBroadcastActions' endBroadcast) made from inside
  // <LiveKitRoom>, since it needs to publish a 'broadcast_ended' data
  // message to the room before this resets local state out from under it.
  const end = useCallback(() => setBroadcast((prev) => ({ ...prev, phase: 'ended' })), []);
  const reset = useCallback(() => setBroadcast(idleState), []);

  // Same safety net as CallProvider's own — guarantees phase resets back to
  // idle regardless of whether the overlay happens to be mounted when it ends.
  useEffect(() => {
    if (broadcast.phase !== 'ended') return;
    const timer = setTimeout(() => setBroadcast(idleState), 900);
    return () => clearTimeout(timer);
  }, [broadcast.phase]);

  const toggleMic = useCallback(() => setBroadcast((prev) => ({ ...prev, micOn: !prev.micOn })), []);
  const toggleCam = useCallback(() => setBroadcast((prev) => ({ ...prev, camOn: !prev.camOn })), []);
  const minimize = useCallback(() => setBroadcast((prev) => ({ ...prev, minimized: true })), []);
  const restore = useCallback(() => setBroadcast((prev) => ({ ...prev, minimized: false })), []);

  const addComment = useCallback((comment: BroadcastComment) => setBroadcast((prev) => ({ ...prev, comments: [...prev.comments, comment] })), []);
  const addHeart = useCallback((delta: 1 | -1) => setBroadcast((prev) => ({ ...prev, hearts: Math.max(0, prev.hearts + delta) })), []);
  const setPendingRequest = useCallback((request: PendingJoinRequest | null) => setBroadcast((prev) => ({ ...prev, pendingRequest: request })), []);
  const approvePublish = useCallback(() => setBroadcast((prev) => ({ ...prev, approvedToPublish: true, pendingRequest: null, joinRequestPending: false })), []);
  const setJoinRequestPending = useCallback((pending: boolean) => setBroadcast((prev) => ({ ...prev, joinRequestPending: pending })), []);

  const value = useMemo<BroadcastContextValue>(
    () => ({
      broadcast,
      startBroadcast,
      joinAsViewer,
      end,
      reset,
      toggleMic,
      toggleCam,
      minimize,
      restore,
      addComment,
      addHeart,
      setPendingRequest,
      approvePublish,
      setJoinRequestPending,
    }),
    [broadcast, startBroadcast, joinAsViewer, end, reset, toggleMic, toggleCam, minimize, restore, addComment, addHeart, setPendingRequest, approvePublish, setJoinRequestPending],
  );

  return <BroadcastContext.Provider value={value}>{children}</BroadcastContext.Provider>;
}

export function useBroadcast(): BroadcastContextValue {
  const ctx = useContext(BroadcastContext);
  if (!ctx) throw new Error('useBroadcast must be used within BroadcastProvider');
  return ctx;
}
