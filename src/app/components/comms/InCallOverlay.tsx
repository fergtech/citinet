import { createPortal } from 'react-dom';
import { Track } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useRemoteParticipants, useTracks, VideoTrack } from '@livekit/components-react';
import { ChevronDown, Mic, MicOff, Video, VideoOff, Volume2, VolumeX, ScreenShare, PhoneOff, Maximize2, Minimize2, Wifi } from 'lucide-react';

import { useCall } from '../../context/CallContext';
import { useHub } from '../../context/HubContext';
import { formatCallDuration, useElapsedSeconds } from '../../lib/comms/use-elapsed';
import { CommsAvatar } from './CommsAvatar';

// Portaled to <body>, same z-index-escape reasoning as MessagesScreen's own
// lightbox: HubLayout's content area is `position: relative; z-index: 10`,
// which starts its own stacking context — nothing inside it can out-rank
// HubLayout's chrome without escaping via a portal.
export function InCallOverlay() {
  const { call } = useCall();

  if ((call.phase !== 'connected' && call.phase !== 'outgoing') || !call.token || !call.livekitUrl) return null;

  return createPortal(
    <div className={call.minimized ? 'hidden' : 'fixed inset-0 z-[200]'}>
      <LiveKitRoom serverUrl={call.livekitUrl} token={call.token} audio={call.micOn} video={call.mode === 'video' && call.camOn} connect>
        {/* @livekit/components-react doesn't auto-play remote audio the way
            VideoTrack self-renders video — without this, subscribed audio
            tracks never hit a playable <audio> element. */}
        <RoomAudioRenderer />
        {!call.minimized && <RoomContent />}
      </LiveKitRoom>
    </div>,
    document.body,
  );
}

function RoomContent() {
  const { currentHub } = useHub();
  const slug = currentHub?.slug || '';
  const { call, minimize, end, toggleLayout, toggleMic, toggleCam, toggleSpeaker, toggleSharing, setMode } = useCall();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const remote = remoteParticipants[0];
  const cameraTracks = useTracks([Track.Source.Camera]);
  const localTrackRef = cameraTracks.find((t) => t.participant.isLocal);
  const remoteTrackRef = cameraTracks.find((t) => !t.participant.isLocal);
  const elapsed = useElapsedSeconds(call.startedAt);

  function handleToggleMic() {
    toggleMic();
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch((err) => console.warn('[call] toggle mic failed', err));
  }

  function handleToggleCam() {
    toggleCam();
    localParticipant.setCameraEnabled(!isCameraEnabled).catch((err) => console.warn('[call] toggle camera failed', err));
  }

  function handleToggleShare() {
    toggleSharing();
    // Triggers the browser's own getDisplayMedia() picker.
    localParticipant.setScreenShareEnabled(!isScreenShareEnabled).catch((err) => console.warn('[call] toggle screen share failed', err));
  }

  const statusLine = call.phase === 'outgoing' ? 'Ringing…' : formatCallDuration(elapsed);

  return (
    <div className="absolute inset-0 bg-[#07060F] flex flex-col">
      {call.mode === 'video' ? (
        <div className={`flex-1 relative ${call.layout === 'split' ? 'flex items-center justify-center gap-3 p-3 pb-[190px]' : ''}`}>
          {call.layout === 'split' ? (
            <>
              {/* Side-by-side, not stacked — a desktop viewport is landscape,
                  so two full-width rows each end up short and wide ("stubby").
                  Each tile keeps a normal 16:9 video shape and the pair is
                  centered in the available space, same as Discord/Zoom's
                  windowed call view. */}
              <div className="flex-1 max-w-[46%] aspect-video rounded-[20px] overflow-hidden bg-[#100E1C] relative">
                {remoteTrackRef ? <VideoTrack trackRef={remoteTrackRef} style={videoStyle} /> : <FallbackTile name={call.peerName} />}
              </div>
              <div className="flex-1 max-w-[46%] aspect-video rounded-[20px] overflow-hidden bg-[#100E1C] relative">
                {localTrackRef && isCameraEnabled ? <VideoTrack trackRef={localTrackRef} style={mirroredVideoStyle} /> : <SelfFallback />}
              </div>
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-[#100E1C]">
                {remoteTrackRef ? <VideoTrack trackRef={remoteTrackRef} style={videoStyle} /> : <FallbackTile name={call.peerName} />}
              </div>
              {/* Landscape PiP (a laptop webcam is landscape, not a phone's
                  portrait selfie) in the bottom-right corner — the
                  Discord/FaceTime convention for a 1:1 call: one big feed,
                  one small self-thumbnail, not two equally-billed tiles. */}
              <div className="absolute right-3 bottom-[196px] w-[180px] aspect-video rounded-2xl overflow-hidden bg-[#100E1C]">
                {localTrackRef && isCameraEnabled ? <VideoTrack trackRef={localTrackRef} style={mirroredVideoStyle} /> : <SelfFallback compact />}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <CommsAvatar slug={slug} userId={call.peerId} name={call.peerName ?? '?'} size={140} />
        </div>
      )}

      {call.sharingOn && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between bg-[#331CA7] px-4 pt-14 pb-2.5">
          <span className="text-white text-sm font-semibold">Sharing your screen</span>
          <button onClick={handleToggleShare} className="bg-white/20 rounded-full px-3 py-1 text-white text-xs font-bold">
            Stop
          </button>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-5 pb-6 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={minimize} aria-label="Minimize" className="text-white">
          <ChevronDown className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-white text-[15px] font-semibold">{call.peerName ?? remote?.name ?? 'Neighbor'}</span>
          <span className="text-white/70 text-xs tabular-nums mt-0.5">{statusLine}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400 text-[10.5px] font-bold">Direct · P2P</span>
          </div>
          {call.mode === 'video' && (
            <button onClick={toggleLayout} aria-label="Toggle layout" className="text-white">
              {call.layout === 'split' ? <Maximize2 className="w-[18px] h-[18px]" /> : <Minimize2 className="w-[18px] h-[18px]" />}
            </button>
          )}
        </div>
      </div>

      <div className="absolute left-0 right-0 bottom-6 flex flex-col items-center gap-4">
        <div className="flex bg-white/10 rounded-full px-2.5 py-2.5 gap-1">
          <ControlButton icon={isMicrophoneEnabled ? Mic : MicOff} active={!isMicrophoneEnabled} label={isMicrophoneEnabled ? 'Mic on' : 'Muted'} onClick={handleToggleMic} />
          {call.mode === 'video' ? (
            <ControlButton icon={isCameraEnabled ? Video : VideoOff} active={!isCameraEnabled} label={isCameraEnabled ? 'Camera on' : 'Camera off'} onClick={handleToggleCam} />
          ) : (
            <ControlButton icon={Video} active={false} label="Video" onClick={() => setMode('video')} />
          )}
          <ControlButton icon={call.speakerOn ? Volume2 : VolumeX} active={call.speakerOn} label={call.speakerOn ? 'Speaker' : 'Earpiece'} onClick={toggleSpeaker} />
          <ControlButton icon={ScreenShare} active={call.sharingOn} label={call.sharingOn ? 'Sharing' : 'Share'} onClick={handleToggleShare} />
        </div>
        <button onClick={end} aria-label="End call" className="w-16 h-16 rounded-full bg-[#DC2B2B] flex items-center justify-center">
          <PhoneOff className="w-6 h-6 text-white" />
        </button>
      </div>
    </div>
  );
}

const videoStyle = { width: '100%', height: '100%', objectFit: 'cover' } as const;
const mirroredVideoStyle = { ...videoStyle, transform: 'scaleX(-1)' } as const;

function ControlButton({ icon: Icon, active, label, onClick }: { icon: React.ElementType; active: boolean; label: string; onClick: () => void }) {
  return (
    <div className="w-[66px] flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        aria-label={label}
        className={`w-[52px] h-[52px] rounded-full flex items-center justify-center ${active ? 'bg-white' : 'bg-white/15'}`}
      >
        <Icon className="w-[22px] h-[22px]" color={active ? '#07060F' : '#fff'} />
      </button>
      <span className="text-white/80 text-[11px] truncate max-w-full">{label}</span>
    </div>
  );
}

function FallbackTile({ name }: { name: string | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#331CA7]">
      <div className="w-24 h-24 rounded-full bg-white/15 flex items-center justify-center">
        <span className="text-white text-4xl font-semibold">{(name || '?').charAt(0).toUpperCase()}</span>
      </div>
    </div>
  );
}

function SelfFallback({ compact }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#100E1C]">
      <div className={`rounded-full bg-white/15 flex items-center justify-center ${compact ? 'w-11 h-11' : 'w-24 h-24'}`}>
        <VideoOff className={compact ? 'w-4 h-4 text-white/70' : 'w-6 h-6 text-white/70'} />
      </div>
      {!compact && <span className="text-white/70 text-[13px]">Camera is off</span>}
    </div>
  );
}
