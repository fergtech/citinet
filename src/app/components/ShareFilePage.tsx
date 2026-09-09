import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Download, File, FileVideo, FileImage, FileAudio, FileText,
  Loader2, AlertCircle,
} from 'lucide-react';
import { hubService } from '../services/hubService';
import { registryService } from '../services/registryService';

export function ShareFilePage() {
  const { hubSlug, fileName: rawFileName } = useParams<{ hubSlug: string; fileName: string }>();
  const [searchParams] = useSearchParams();
  const fileName = rawFileName ? decodeURIComponent(rawFileName) : '';

  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [hubName, setHubName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hubSlug) { setError('Invalid share link'); setLoading(false); return; }

    // 1. ?src= param embedded by the share-link generator — most reliable, skips
    //    registry slug-matching entirely. Validated: must be https:// (no localhost).
    const srcParam = searchParams.get('src');
    if (srcParam && /^https:\/\/.+/.test(srcParam) && !srcParam.includes('localhost')) {
      setTunnelUrl(srcParam);
      // Try to enrich hub name from local storage if available
      const local = hubService.getHubConnection(hubSlug);
      setHubName(local?.hub.name || hubSlug);
      setLoading(false);
      return;
    }

    // 2. Locally stored connection (same device / already joined)
    const local = hubService.getHubConnection(hubSlug);
    if (local?.hub.tunnelUrl && !isShellUrl(local.hub.tunnelUrl)) {
      setTunnelUrl(local.hub.tunnelUrl);
      setHubName(local.hub.name || hubSlug);
      setLoading(false);
      return;
    }

    // 3. Fall back to the public registry (external visitors, no ?src= param)
    registryService.getHubBySlug(hubSlug)
      .then(hub => {
        if (hub?.tunnel_url && !isShellUrl(hub.tunnel_url)) {
          setTunnelUrl(hub.tunnel_url);
          setHubName(hub.name || hubSlug);
        } else {
          setError('This hub is not publicly accessible. Ask the owner to set up Tailscale.');
        }
      })
      .catch(() => setError('Could not load hub information.'))
      .finally(() => setLoading(false));
  }, [hubSlug]);

  const fileUrl = tunnelUrl && fileName ? `${tunnelUrl}/api/public/files/${encodeURIComponent(fileName)}` : null;

  const handleDownload = () => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogv'].includes(ext);
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext);
  const isMedia = isVideo || isImage;

  const fileIcon = (() => {
    if (isVideo) return <FileVideo className="w-12 h-12 text-blue-400" />;
    if (isImage) return <FileImage className="w-12 h-12 text-pink-400" />;
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext))
      return <FileAudio className="w-12 h-12 text-blue-400" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xls', 'xlsx'].includes(ext))
      return <FileText className="w-12 h-12 text-amber-400" />;
    return <File className="w-12 h-12 text-slate-400" />;
  })();

  return (
    <div className={`min-h-screen bg-zinc-950 flex flex-col items-center p-6 ${isMedia && !loading && !error ? 'justify-start pt-12' : 'justify-center'}`}>
      {/* Wordmark */}
      <div className="mb-8 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-white">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </div>

      {loading ? (
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-zinc-400">Loading…</p>
        </div>
      ) : error ? (
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-3 py-4 text-center">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : isMedia && fileUrl ? (
        // Images/videos are meant to be seen right here — the media is the primary
        // focus, download is a small secondary action underneath, not the CTA.
        <div className="w-full max-w-2xl flex flex-col items-center gap-4">
          <div className="w-full rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl">
            {isVideo ? (
              <video src={fileUrl} controls preload="metadata" className="w-full max-h-[75vh] bg-black" />
            ) : (
              <img src={fileUrl} alt={fileName} className="w-full max-h-[75vh] object-contain bg-black" />
            )}
          </div>
          <div className="text-center w-full">
            <p className="text-sm font-medium text-zinc-300 break-all leading-snug">{fileName}</p>
            {hubName && (
              <p className="text-xs text-zinc-500 mt-1">
                Shared from <span className="text-zinc-400 font-medium">{hubName}</span>
              </p>
            )}
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download {isVideo ? 'video' : 'image'}
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center">
              {fileIcon}
            </div>

            <div className="text-center w-full">
              <p className="text-base font-semibold text-white break-all leading-snug">
                {fileName}
              </p>
              {hubName && (
                <p className="text-sm text-zinc-400 mt-1.5">
                  Shared from <span className="text-zinc-300 font-medium">{hubName}</span>
                </p>
              )}
            </div>

            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-800 hover:to-blue-600 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-900/30 active:scale-95"
            >
              <Download className="w-4 h-4" />
              Download file
            </button>
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-600 text-center max-w-xs">
        File is hosted on the hub owner's device and served over their Tailscale connection.
        No account required.
      </p>
    </div>
  );
}

/** Returns true for empty / shell-only tunnel URLs that have no real hostname */
function isShellUrl(url: string): boolean {
  return !url || url === 'http://' || url === 'https://' || url.trim() === '';
}
