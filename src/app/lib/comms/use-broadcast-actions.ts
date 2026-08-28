import { useRoomContext } from '@livekit/components-react';

import { hubService } from '../../services/hubService';
import { useHub } from '../../context/HubContext';
import { destinationFor, encodeBroadcastMessage, isReliable, type BroadcastMessage } from './broadcast-protocol';
import { useBroadcast } from '../../context/BroadcastContext';

// Must be called from inside <LiveKitRoom> (useRoomContext requires it).
export function useBroadcastActions() {
  const room = useRoomContext();
  const { currentHub, currentUser } = useHub();
  const { broadcast, addComment, addHeart, setPendingRequest, setJoinRequestPending, end } = useBroadcast();

  function publish(message: BroadcastMessage) {
    // BroadcastState.hostId is already populated for both roles by the time
    // any live UI can call this (startBroadcast/joinAsViewer both set it
    // before phase flips to 'live') — no need to re-derive it from
    // room.metadata.
    const hostId = broadcast.hostId ?? '';
    // encoder.encode()'s Uint8Array is typed ArrayBufferLike, but
    // publishData wants the narrower ArrayBuffer-backed variant — always
    // true in practice (TextEncoder never backs with a SharedArrayBuffer),
    // just not reflected in its type.
    const payload = encodeBroadcastMessage(message) as Uint8Array<ArrayBuffer>;
    const destinationIdentities = destinationFor(message, hostId);
    room.localParticipant.publishData(payload, { reliable: isReliable(message), destinationIdentities }).catch((err) => console.warn('[broadcast] publishData failed', message.type, err));
  }

  function sendComment(text: string) {
    if (!currentUser?.hubUserId || !text.trim()) return;
    const senderName = currentUser.displayName || currentUser.username;
    const message: BroadcastMessage = { type: 'comment', text: text.trim(), senderId: currentUser.hubUserId, senderName };
    publish(message);
    // Optimistic — I don't receive my own room-wide data messages back, so
    // this is the only place my own comment/heart ever lands in my own state.
    addComment({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, senderId: message.senderId, senderName: message.senderName, text: message.text });
  }

  function sendHeart(delta: 1 | -1) {
    publish({ type: 'heart', delta });
    addHeart(delta);
  }

  function requestToJoin() {
    if (!currentUser?.hubUserId) return;
    const requesterName = currentUser.displayName || currentUser.username;
    publish({ type: 'join_request', requesterId: currentUser.hubUserId, requesterName });
    // Optimistic — flips the Join in button to a pending state immediately
    // rather than it looking like the tap did nothing until the host responds.
    setJoinRequestPending(true);
  }

  function respondToRequest(request: { requesterId: string; requesterName: string }, accepted: boolean) {
    publish({ type: 'join_response', requesterId: request.requesterId, requesterName: request.requesterName, accepted });
    // Host's own pending-card dismissal, and — for an accept — the "<name>
    // joined the live" comment host's own client won't otherwise see.
    setPendingRequest(null);
    if (accepted) {
      addComment({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, senderId: 'system', senderName: '', text: `${request.requesterName} joined the live`, system: true });
    }
  }

  // Host-only. Two independent ways every other client finds out this is
  // over: the room-wide 'broadcast_ended' data message (fast, but only
  // reaches clients still connected at that exact instant), and the
  // server-side room deletion below (slower, but authoritative — LiveKit
  // force-disconnects anyone still in the room). Without the server call,
  // ending only ever disconnects the host's own client — the room itself
  // lingers, still joinable, until LiveKit's 5-minute empty-room timeout.
  function endBroadcast() {
    publish({ type: 'broadcast_ended' });
    if (currentHub?.slug && broadcast.roomName) hubService.endRoom(currentHub.slug, broadcast.roomName);
    end();
  }

  return { sendComment, sendHeart, requestToJoin, respondToRequest, endBroadcast };
}
