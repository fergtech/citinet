import { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import { LiveKitRoom, useTracks, VideoTrack } from '@livekit/components-react';

import { hubService } from '../../services/hubService';
import { useHub } from '../../context/HubContext';

// Silent/hidden preview connection for a "Live now" card — mints a
// canPublish:false, hidden:true token (see api/comms.js's /token route) so
// it never counts as a real viewer or triggers a join announcement.
export function LiveThumbnail({ roomName, hostId }: { roomName: string; hostId: string }) {
  const { currentHub } = useHub();
  const slug = currentHub?.slug;
  const [conn, setConn] = useState<{ token: string; livekitUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug) return;
    hubService
      .getCommsToken(slug, 'broadcast', roomName, undefined, true)
      .then((res) => {
        if (!cancelled) setConn({ token: res.token, livekitUrl: res.livekit_url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, roomName]);

  if (!conn) return null;

  return (
    <LiveKitRoom serverUrl={conn.livekitUrl} token={conn.token} audio={false} video={false} connect>
      <div className="absolute inset-0">
        <ThumbnailVideo hostId={hostId} />
      </div>
    </LiveKitRoom>
  );
}

function ThumbnailVideo({ hostId }: { hostId: string }) {
  const tracks = useTracks([Track.Source.Camera]);
  const hostTrack = tracks.find((t) => t.participant.identity === hostId);
  if (!hostTrack) return null;
  return <VideoTrack trackRef={hostTrack} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}
