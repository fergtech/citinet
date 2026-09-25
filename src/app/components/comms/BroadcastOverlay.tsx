import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Track } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useRemoteParticipants, useTracks, VideoTrack } from '@livekit/components-react';
import { Eye, Heart, Send, Mic, MicOff, Video, VideoOff } from 'lucide-react';

import { useBroadcast } from '../../context/BroadcastContext';
import { useHub } from '../../context/HubContext';
import { useBroadcastActions } from '../../lib/comms/use-broadcast-actions';
import { avatarSizeFor } from '../../lib/comms/broadcast-grid';
import { formatCallDuration, useElapsedSeconds } from '../../lib/comms/use-elapsed';
import { CommsAvatar } from './CommsAvatar';
import { BroadcastDataBridge } from './BroadcastDataBridge';

export function BroadcastOverlay() {
  const { broadcast } = useBroadcast();

  if (broadcast.phase !== 'live' || !broadcast.token || !broadcast.livekitUrl) return null;

  const isHost = broadcast.role === 'host';

  return createPortal(
    <div className={broadcast.minimized ? 'hidden' : 'fixed inset-0 z-[200]'}>
      <LiveKitRoom serverUrl={broadcast.livekitUrl} token={broadcast.token} audio={isHost && broadcast.micOn} video={isHost && broadcast.camOn} connect>
        <RoomAudioRenderer />
        <BroadcastDataBridge />
        {!broadcast.minimized && <RoomContent />}
      </LiveKitRoom>
    </div>,
    document.body,
  );
}

function RoomContent() {
  const { currentHub } = useHub();
  const slug = currentHub?.slug || '';
  const { broadcast, minimize, end, toggleMic, toggleCam } = useBroadcast();
  const { sendComment, sendHeart, requestToJoin, respondToRequest, endBroadcast } = useBroadcastActions();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone]);
  const [commentText, setCommentText] = useState('');
  const [liked, setLiked] = useState(false);
  // The solo tile's real width/height ratio (portrait for a typical mobile
  // broadcaster, landscape for a desktop one) — read straight off the
  // <video> element once its metadata loads. Desktop's theater layout uses
  // this to size the stage to the source's own shape instead of stretching
  // a phone-shot portrait clip to fill a wide/short box (the "blotchy,
  // 480p-looking" crop that was actually just object-fit: cover zooming
  // ~1.8x into a mismatched frame). Defaults to portrait since that's the
  // common case before the first frame arrives.
  const [soloAspect, setSoloAspect] = useState(9 / 16);
  const elapsed = useElapsedSeconds(broadcast.startedAt);

  const isHost = broadcast.role === 'host';
  const canPublish = isHost || broadcast.approvedToPublish;
  // Hidden participants are "Live now" card preview connections, not real
  // viewers — excluded so merely having Messages open elsewhere doesn't
  // inflate the count.
  const viewerCount = remoteParticipants.filter((p) => !p.permissions?.hidden).length + 1;

  useEffect(() => {
    if (isHost || !broadcast.approvedToPublish) return;
    localParticipant.setMicrophoneEnabled(true).catch((err) => console.warn('[broadcast] mic publish failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcast.approvedToPublish, isHost]);

  function handleToggleMic() {
    toggleMic();
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch((err) => console.warn('[broadcast] toggle mic failed', err));
  }

  function handleToggleCam() {
    toggleCam();
    localParticipant.setCameraEnabled(!isCameraEnabled).catch((err) => console.warn('[broadcast] toggle camera failed', err));
  }

  function handleSend() {
    if (!commentText.trim()) return;
    sendComment(commentText);
    setCommentText('');
  }

  // Host ends the broadcast for everyone; a guest/viewer leaving is purely
  // local, nothing to tell anyone else.
  function handleEnd() {
    if (isHost) endBroadcast();
    else end();
  }

  function handleToggleLike() {
    const next = !liked;
    setLiked(next);
    sendHeart(next ? 1 : -1);
  }

  function handleSoloVideoResize(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) setSoloAspect(v.videoWidth / v.videoHeight);
  }

  const gridParticipants = new Map<string, { identity: string; name: string; cameraTrack?: (typeof tracks)[number] }>();
  for (const t of tracks) {
    const identity = t.participant.identity;
    const entry = gridParticipants.get(identity) ?? { identity, name: t.participant.name || '?', cameraTrack: undefined };
    if (t.source === Track.Source.Camera) entry.cameraTrack = t;
    gridParticipants.set(identity, entry);
  }
  const boxes = Array.from(gridParticipants.values());
  const avatarSize = avatarSizeFor(boxes.length);
  const recentComments = broadcast.comments.slice(-4);
  const solo = boxes.length <= 1;

  const header = (
    <>
      <div className="flex items-center gap-1.5 bg-[#DC2B2B] rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        <span className="text-white text-[11px] font-extrabold">LIVE</span>
      </div>
      <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
        <Eye className="w-3 h-3 text-white" />
        <span className="text-white text-[11.5px] font-bold tabular-nums">{viewerCount}</span>
      </div>
      <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
        <Heart className="w-3 h-3 text-white" />
        <span className="text-white text-[11.5px] font-bold tabular-nums">{broadcast.hearts}</span>
      </div>
      <span className="flex-1 text-white/75 text-xs tabular-nums">{formatCallDuration(elapsed)}</span>
      <button onClick={minimize} className="bg-white/15 rounded-full px-3 py-1.5 text-white text-[12.5px] font-semibold">
        Minimize
      </button>
    </>
  );

  const pendingAndTitle = (
    <>
      {isHost && broadcast.pendingRequest && (
        <div className="flex items-center gap-2 bg-[#331CA7]/55 rounded-2xl p-2.5">
          <CommsAvatar slug={slug} userId={broadcast.pendingRequest.requesterId} name={broadcast.pendingRequest.requesterName} size={32} />
          <span className="flex-1 text-white text-[12.5px] truncate">{broadcast.pendingRequest.requesterName} wants to join in</span>
          <button onClick={() => broadcast.pendingRequest && respondToRequest(broadcast.pendingRequest, false)} className="px-2 py-1.5 text-white/75 text-xs">
            Not now
          </button>
          <button onClick={() => broadcast.pendingRequest && respondToRequest(broadcast.pendingRequest, true)} className="bg-white rounded-full px-3 py-1.5 text-[#07060F] text-xs font-bold">
            Add
          </button>
        </div>
      )}
      <div className="self-start bg-black/40 rounded-full px-2.5 py-1.5 max-w-full">
        <span className="text-white text-xs font-semibold truncate">{broadcast.title}</span>
      </div>
    </>
  );

  const commentsItems = recentComments.map((c) =>
    c.system ? (
      <span key={c.id} className="text-white/60 text-[11.5px] italic">
        {c.text}
      </span>
    ) : (
      <div key={c.id} className="flex items-start gap-2">
        <CommsAvatar slug={slug} userId={c.senderId} name={c.senderName} size={24} />
        <p className="flex-1 text-white text-[13px] leading-[17px]">
          <span className="font-semibold">{c.senderName} </span>
          {c.text}
        </p>
      </div>
    ),
  );

  const composer = (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 flex items-center gap-2 bg-white/15 rounded-full px-3.5 py-2.5">
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Say something…"
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1 bg-transparent text-white text-sm placeholder-white/50 outline-none"
        />
        {commentText.trim().length > 0 && (
          <button onClick={handleSend} aria-label="Send">
            <Send className="w-[18px] h-[18px] text-white" />
          </button>
        )}
      </div>
      <button onClick={handleToggleLike} aria-label="Like" className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
        <Heart className="w-5 h-5" color={liked ? '#DC2B2B' : '#fff'} fill={liked ? '#DC2B2B' : 'none'} />
      </button>
    </div>
  );

  const controls = (
    <div className="flex items-center justify-center gap-3">
      {canPublish && (
        <>
          <ControlCircle icon={isMicrophoneEnabled ? Mic : MicOff} active={!isMicrophoneEnabled} onClick={handleToggleMic} />
          <ControlCircle icon={isCameraEnabled ? Video : VideoOff} active={!isCameraEnabled} onClick={handleToggleCam} />
        </>
      )}
      {isHost ? (
        <button onClick={handleEnd} className="h-12 rounded-full bg-[#DC2B2B] px-6 text-white text-[15px] font-semibold">
          End
        </button>
      ) : canPublish ? (
        <button onClick={handleEnd} className="h-12 rounded-full bg-white px-6 text-[#07060F] text-[15px] font-semibold">
          Leave
        </button>
      ) : (
        <>
          {/* A plain viewer who never asked to join in had no way out of
              this screen at all before except minimizing — Leave here
              just ends their own viewing session. */}
          <button onClick={handleEnd} className="h-12 px-3.5 text-white/80 text-sm font-semibold">
            Leave
          </button>
          <button
            onClick={requestToJoin}
            disabled={broadcast.joinRequestPending}
            className={`h-12 rounded-full bg-white px-7 text-[#07060F] text-[15px] font-semibold ${broadcast.joinRequestPending ? 'opacity-55' : ''}`}
          >
            {broadcast.joinRequestPending ? 'Requested' : 'Join in'}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 bg-black">
      {/* Mobile / narrow browser viewport: the original immersive, full-
          bleed stage with all chrome overlaid directly on the video. A
          phone screen is already close to a portrait broadcaster's own
          aspect ratio, so `object-fit: cover` here is just a mild crop —
          not the ultra-wide-vs-portrait mismatch the desktop layout below
          exists to fix. Unchanged from before. */}
      <div className="lg:hidden absolute inset-0">
        <div
          className={`h-full pb-[244px] bg-black overflow-hidden ${solo ? '' : 'grid content-center gap-2 p-2'}`}
          style={solo ? undefined : { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gridAutoRows: 'min-content' }}
        >
          {boxes.map((p) => (
            <GridBox key={p.identity} solo={solo} avatarSize={avatarSize} slug={slug} userId={p.identity} name={p.name} isHost={p.identity === broadcast.hostId}>
              {p.cameraTrack ? <VideoTrack trackRef={p.cameraTrack} style={coverVideoStyle} /> : null}
            </GridBox>
          ))}
        </div>

        <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-4 pt-5 pb-6 bg-gradient-to-b from-black/60 to-transparent">{header}</div>
        <div className="absolute top-[60px] left-4 right-4 flex flex-col gap-2">{pendingAndTitle}</div>

        <div className="absolute left-0 right-0 bottom-0 bg-black/[.78] px-4 pt-3.5 pb-5 flex flex-col gap-3">
          {recentComments.length > 0 && <div className="max-h-[150px] overflow-y-auto flex flex-col gap-1.5">{commentsItems}</div>}
          {composer}
          {controls}
        </div>
      </div>

      {/* Desktop / wide browser viewport: a bounded "theater" layout instead
          of stretching the same full-bleed mobile design across an
          ultra-wide window. The stage keeps the broadcaster's real aspect
          ratio (portrait for a typical mobile go-live, landscape for a
          desktop one, read straight off the <video> element's own
          dimensions in handleSoloVideoResize) instead of being cropped/
          upscaled to fill a mismatched wide-short box — that upscale is
          what actually produced the "480p, blotchy" look, not the source
          bitrate. Chat/engagement moves into its own fixed-width side
          panel next to the stage rather than floating text on top of the
          video. */}
      <div className="hidden lg:flex absolute inset-0 items-stretch justify-center gap-5 p-8">
        <div className="flex-1 min-w-0 h-full flex items-center justify-center">
          <div
            className="relative rounded-2xl overflow-hidden bg-black"
            style={{ height: '100%', maxWidth: '100%', ...(solo ? { aspectRatio: soloAspect } : {}) }}
          >
            <div className={`w-full h-full ${solo ? '' : 'grid content-center gap-2 p-2'}`} style={solo ? undefined : { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gridAutoRows: 'min-content' }}>
              {boxes.map((p) => (
                <GridBox key={p.identity} solo={solo} avatarSize={avatarSize} slug={slug} userId={p.identity} name={p.name} isHost={p.identity === broadcast.hostId}>
                  {p.cameraTrack ? (
                    <VideoTrack
                      trackRef={p.cameraTrack}
                      style={containVideoStyle}
                      onLoadedMetadata={solo ? handleSoloVideoResize : undefined}
                      onResize={solo ? handleSoloVideoResize : undefined}
                    />
                  ) : null}
                </GridBox>
              ))}
            </div>

            <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-4 pt-4 pb-7 bg-gradient-to-b from-black/60 to-transparent">{header}</div>
            <div className="absolute top-[52px] left-4 right-4 flex flex-col gap-2">{pendingAndTitle}</div>
          </div>
        </div>

        <div className="h-full w-[360px] shrink-0 flex flex-col bg-[#0B0A14] rounded-2xl overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-1.5">
            {recentComments.length > 0 ? commentsItems : <span className="text-white/40 text-[13px]">No comments yet.</span>}
          </div>
          <div className="px-4 pb-5 pt-3 flex flex-col gap-3 border-t border-white/10">
            {composer}
            {controls}
          </div>
        </div>
      </div>
    </div>
  );
}

const coverVideoStyle = { width: '100%', height: '100%', objectFit: 'cover' } as const;
const containVideoStyle = { width: '100%', height: '100%', objectFit: 'contain' } as const;

function GridBox({
  solo,
  avatarSize,
  slug,
  userId,
  name,
  isHost,
  children,
}: {
  solo: boolean;
  avatarSize: number;
  slug: string;
  userId: string;
  name: string;
  isHost: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{ background: 'linear-gradient(135deg, #331CA7, #100E1C)' }}
      className={`rounded-[18px] overflow-hidden relative flex items-center justify-center ${solo ? 'w-full h-full' : 'w-full aspect-video'}`}
    >
      <div className="absolute inset-0 flex items-center justify-center">{children ?? <CommsAvatar slug={slug} userId={userId} name={name} size={avatarSize} />}</div>
      <div className="absolute left-2.5 bottom-2.5 bg-black/40 rounded-[10px] px-2 py-1">
        <p className="text-white text-xs font-semibold truncate">{name}</p>
        <p className="text-white/70 text-[8.5px] font-bold tracking-wide">{isHost ? 'HOST' : 'GUEST'}</p>
      </div>
    </div>
  );
}

function ControlCircle({ icon: Icon, active, onClick }: { icon: React.ElementType; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-12 h-12 rounded-full flex items-center justify-center ${active ? 'bg-white' : 'bg-white/15'}`}>
      <Icon className="w-5 h-5" color={active ? '#07060F' : '#fff'} />
    </button>
  );
}
