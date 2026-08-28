import { useEffect, useRef } from 'react';
import type { IncomingCallPayload } from '../../types/hub';

export type CommsSocketEvent =
  | IncomingCallPayload
  | { type: 'call_answered'; call_id: string }
  | { type: 'call_declined'; call_id: string }
  | { type: 'call_ended'; call_id: string };

// tunnelUrl is http(s):// — swap the scheme for ws(s):// and keep the rest.
// The session token rides as a query param (not a header) to match
// api/comms.js's attachCommsSignaling, which reads it off the upgrade
// request's URL.
function commsSocketUrl(tunnelUrl: string, token: string): string {
  const wsUrl = tunnelUrl.replace(/^http/, 'ws');
  return `${wsUrl}/ws/comms?token=${encodeURIComponent(token)}`;
}

// One always-on connection purely for "someone is calling you right now" —
// see api/comms.js's own note on why this exists. Reconnects on drop with a
// flat 3s retry.
export function useCommsSocket(
  tunnelUrl: string | undefined,
  token: string | undefined,
  onEvent: (event: CommsSocketEvent) => void,
) {
  // Ref, not a dependency — onEvent is typically a fresh closure every
  // render (it reads live component state), and this effect must not
  // reconnect the socket just because that closure identity changed.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!tunnelUrl || !token) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(commsSocketUrl(tunnelUrl!, token!));
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          onEventRef.current(event);
        } catch (err) {
          console.warn('[comms-socket] malformed payload, dropped', e.data, err);
        }
      };
      ws.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    }
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [tunnelUrl, token]);
}
