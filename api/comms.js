// Comms — 1:1 calls, broadcasts, and rooms, backed by a self-hosted LiveKit
// server (the one new service in docker-compose.yml; see livekit.yaml.example
// for its own config). Split out of server.js the way mailer.js/certAgent.js
// already are, since it's a genuinely separate concern (WebRTC signaling +
// token minting) with its own external dependency.
//
// Persistence is deliberately minimal: LiveKit's own room list IS the source
// of truth for "what's live right now" (GET /api/comms/live just calls its
// listRooms()) — the only real table here is hub_call_events, for post-call
// history in a DM thread's transcript. Everything ephemeral (ringing state,
// in-room presence) lives in LiveKit itself or this module's own in-memory
// WebSocket registry, never in Postgres.
//
// Signaling (the "someone is calling you right now" push) needs something
// faster than this app's usual REST-poll-on-focus convention — there's no
// WebSocket layer anywhere else in this codebase (typingState at the top of
// server.js is the closest precedent: a plain in-memory Map, single-process,
// no pub/sub across instances, which is exactly this hub's own deployment
// shape — one Node process per hub). This adds the smallest version of that:
// one WS endpoint, a Map<userId, WebSocket>, three message types.
const { WebSocketServer } = require('ws');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const LIVEKIT_INTERNAL_URL = process.env.LIVEKIT_INTERNAL_URL || '';
const LIVEKIT_PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const livekitConfigured = !!(LIVEKIT_INTERNAL_URL && LIVEKIT_PUBLIC_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
const roomService = livekitConfigured
  ? new RoomServiceClient(LIVEKIT_INTERNAL_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
  : null;

async function initCommsDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_call_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES hub_conversations(id) ON DELETE CASCADE,
      room_name       TEXT NOT NULL,
      caller_id       UUID REFERENCES hub_users(id) ON DELETE SET NULL,
      callee_id       UUID REFERENCES hub_users(id) ON DELETE SET NULL,
      mode            VARCHAR(10) NOT NULL,
      outcome         VARCHAR(20) NOT NULL DEFAULT 'ringing',
      started_at      TIMESTAMPTZ,
      ended_at        TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_hub_call_events_conversation ON hub_call_events(conversation_id, created_at DESC)`,
  );
}

// A 1:1 call always lands both sides in the same deterministic room name —
// no separate "create the room" step needed, LiveKit creates it on first
// join. Broadcasts/rooms get a random name instead (see createRoomToken).
function dmRoomName(userIdA, userIdB) {
  return `call-${[userIdA, userIdB].sort().join('-')}`;
}

async function mintToken({ roomName, identity, name, metadata, canPublish = true, hidden = false }) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name, metadata, ttl: '4h' });
  at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true, canPublishData: true, hidden });
  return at.toJwt();
}

function requireLivekit(res) {
  if (livekitConfigured) return true;
  res.status(503).json({
    error: 'Comms is not configured on this hub yet — set LIVEKIT_INTERNAL_URL/LIVEKIT_PUBLIC_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET.',
  });
  return false;
}

// userId -> WebSocket, this process only. Module-level (not inside
// createCommsRouter) so attachCommsSignaling populates the exact same Map
// the router's sendTo() reads from — reset on restart is fine, a call in
// progress is LiveKit's problem, not this registry's; this is purely for
// the initial "ring".
const sockets = new Map();

function createCommsRouter({ pool, authenticate, express }) {
  const router = express.Router();

  function sendTo(userId, payload) {
    const ws = sockets.get(userId);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  }

  // POST /api/comms/call/ring — start (or re-ring) a 1:1 call in an existing
  // DM conversation. The caller gets back their own token immediately (so
  // their camera/mic preview and publish can start right away, matching the
  // pre-call setup screen's self-preview tile) — the callee only gets theirs
  // once they answer.
  router.post('/call/ring', authenticate, async (req, res) => {
    if (!requireLivekit(res)) return;
    const { conversation_id, peer_id, mode } = req.body || {};
    if (!conversation_id || !peer_id || !['audio', 'video'].includes(mode)) {
      return res.status(400).json({ error: 'conversation_id, peer_id, and a valid mode are required' });
    }
    try {
      const member = await pool.query(
        `SELECT 1 FROM hub_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
        [conversation_id, req.user.id],
      );
      if (!member.rows[0]) return res.status(403).json({ error: 'Not a member of this conversation' });

      const roomName = dmRoomName(req.user.id, peer_id);
      const { rows } = await pool.query(
        `INSERT INTO hub_call_events (conversation_id, room_name, caller_id, callee_id, mode, outcome)
         VALUES ($1, $2, $3, $4, $5, 'ringing') RETURNING id`,
        [conversation_id, roomName, req.user.id, peer_id, mode],
      );
      const callId = rows[0].id;
      const token = await mintToken({ roomName, identity: req.user.id, name: req.user.username });

      sendTo(peer_id, {
        type: 'incoming_call',
        call_id: callId,
        conversation_id,
        room_name: roomName,
        mode,
        from_id: req.user.id,
        from_username: req.user.username,
      });

      res.json({ call_id: callId, room_name: roomName, token, livekit_url: LIVEKIT_PUBLIC_URL });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/comms/call/:id/answer — callee accepts. Only the callee may
  // answer their own call.
  router.post('/call/:id/answer', authenticate, async (req, res) => {
    if (!requireLivekit(res)) return;
    try {
      const { rows } = await pool.query(
        `UPDATE hub_call_events SET outcome = 'connected', started_at = NOW()
         WHERE id = $1 AND callee_id = $2 AND outcome = 'ringing'
         RETURNING room_name, mode, caller_id`,
        [req.params.id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: 'Call not found or already resolved' });
      const token = await mintToken({ roomName: rows[0].room_name, identity: req.user.id, name: req.user.username });
      sendTo(rows[0].caller_id, { type: 'call_answered', call_id: req.params.id });
      res.json({ room_name: rows[0].room_name, mode: rows[0].mode, token, livekit_url: LIVEKIT_PUBLIC_URL });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/comms/call/:id/decline — callee declines before answering.
  router.post('/call/:id/decline', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `UPDATE hub_call_events SET outcome = 'declined', ended_at = NOW()
         WHERE id = $1 AND callee_id = $2 AND outcome = 'ringing'
         RETURNING caller_id`,
        [req.params.id, req.user.id],
      );
      if (rows[0]) sendTo(rows[0].caller_id, { type: 'call_declined', call_id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/comms/call/:id/end — either side hangs up. Caller-hangs-up-
  // while-still-ringing resolves as "not answered", same as the callee just
  // never picking up.
  router.post('/call/:id/end', authenticate, async (req, res) => {
    try {
      const { rows: existing } = await pool.query(
        `SELECT caller_id, callee_id, outcome FROM hub_call_events WHERE id = $1`,
        [req.params.id],
      );
      if (!existing[0]) return res.status(404).json({ error: 'Call not found' });
      if (existing[0].caller_id !== req.user.id && existing[0].callee_id !== req.user.id) {
        return res.status(403).json({ error: 'Not a party to this call' });
      }
      const finalOutcome = existing[0].outcome === 'connected' ? 'connected' : 'not_answered';
      await pool.query(
        `UPDATE hub_call_events SET outcome = $1, ended_at = NOW() WHERE id = $2 AND ended_at IS NULL`,
        [finalOutcome, req.params.id],
      );
      const otherId = existing[0].caller_id === req.user.id ? existing[0].callee_id : existing[0].caller_id;
      sendTo(otherId, { type: 'call_ended', call_id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/comms/token — generic mint for broadcasts/rooms (not used by
  // 1:1 calls, which mint inline above). `kind` just becomes room metadata
  // for GET /api/comms/live to read back — LiveKit doesn't care what it means.
  router.post('/token', authenticate, async (req, res) => {
    if (!requireLivekit(res)) return;
    const { kind, room_name, title, preview } = req.body || {};
    if (!['broadcast', 'room'].includes(kind)) return res.status(400).json({ error: 'kind must be broadcast or room' });
    // A preview token is for the "Live now" card's silent camera-thumbnail
    // connection (see LiveThumbnail) — it only ever joins an existing
    // broadcast, never creates one, and is minted with canPublish:false,
    // hidden:true so it never shows up as a real viewer: no participant-
    // count inflation, no "X entered the broadcast" announcement (see
    // broadcast-data-bridge.tsx's permissions.hidden check).
    if (preview && !room_name) return res.status(400).json({ error: 'preview requires an existing room_name' });
    try {
      const roomName = room_name || `${kind}-${req.user.id}-${Date.now().toString(36)}`;
      const isHost = !room_name; // creating fresh (no existing room_name given) = you're the host/owner
      if (isHost) {
        await roomService.createRoom({
          name: roomName,
          metadata: JSON.stringify({ kind, title: title || '', host_id: req.user.id, host_username: req.user.username }),
          emptyTimeout: 300,
        });
      }
      const token = await mintToken({
        roomName,
        identity: req.user.id,
        name: req.user.username,
        canPublish: !preview,
        hidden: !!preview,
      });
      res.json({ room_name: roomName, token, livekit_url: LIVEKIT_PUBLIC_URL });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/comms/:roomName/end — host force-closes a broadcast/room.
  // Without this, ending one only ever disconnected the host's own client;
  // the LiveKit room itself (and its GET /live listing) lingered until its
  // emptyTimeout (5 min, see /token above) elapsed on its own, staying
  // joinable by anyone else in the meantime.
  router.post('/:roomName/end', authenticate, async (req, res) => {
    if (!requireLivekit(res)) return;
    try {
      const [room] = await roomService.listRooms([req.params.roomName]);
      if (!room) return res.json({ ok: true }); // already gone — nothing to do
      let meta = {};
      try {
        meta = JSON.parse(room.metadata || '{}');
      } catch {
        // non-JSON/empty metadata — treated as no host on record, falls
        // through to the ownership check below and 403s same as any
        // other mismatch.
      }
      if (meta.host_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the host can end this' });
      }
      await roomService.deleteRoom(req.params.roomName);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/comms/live — every currently-active broadcast/room on this
  // hub's own LiveKit instance. No hub-scoping needed beyond "this LiveKit
  // server" since each hub runs its own, single-tenant (same trust boundary
  // as the rest of this stack).
  router.get('/live', authenticate, async (req, res) => {
    if (!livekitConfigured) return res.json([]);
    try {
      const rooms = await roomService.listRooms();
      const live = rooms
        .map((r) => {
          let meta = {};
          try {
            meta = JSON.parse(r.metadata || '{}');
          } catch {
            // non-JSON/empty metadata (e.g. a 1:1 call room) — not a
            // broadcast/room, excluded below.
          }
          return { ...meta, room_name: r.name, participant_count: r.numParticipants };
        })
        .filter((r) => r.kind === 'broadcast' || r.kind === 'room');
      res.json(live);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// GET /api/conversations/:id/call-events — history for the transcript's
// "Video call · 1:12" chip. Registered directly on `app` (not this router)
// since it nests under /api/conversations, not /api/comms — see server.js.
async function registerCallEventHistoryRoute(app, pool, authenticate) {
  app.get('/api/conversations/:id/call-events', authenticate, async (req, res) => {
    try {
      const member = await pool.query(
        `SELECT 1 FROM hub_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!member.rows[0]) return res.status(403).json({ error: 'Not a member of this conversation' });
      const { rows } = await pool.query(
        `SELECT id, mode, outcome, started_at, ended_at, created_at, caller_id, callee_id
         FROM hub_call_events WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [req.params.id],
      );
      res.json({ call_events: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Attaches the WS upgrade handler to the same http.Server Express is already
// listening on (server.js must pass the return value of app.listen(), not
// just call it) — a separate port/server would need its own tunnel exposure,
// which the rest of this stack has no mechanism for.
function attachCommsSignaling(server, pool) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/comms') return; // not ours — leave it alone
    const token = url.searchParams.get('token');
    if (!token) {
      socket.destroy();
      return;
    }
    pool
      .query(
        `SELECT user_id FROM hub_sessions WHERE token = $1 AND expires_at > NOW()`,
        [token],
      )
      .then(({ rows }) => {
        if (!rows[0]) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          sockets.set(rows[0].user_id, ws);
          ws.on('close', () => {
            if (sockets.get(rows[0].user_id) === ws) sockets.delete(rows[0].user_id);
          });
        });
      })
      .catch(() => socket.destroy());
  });
}

module.exports = { initCommsDb, createCommsRouter, registerCallEventHistoryRoute, attachCommsSignaling, livekitConfigured };
