import { QrCode, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface JoinQrCardProps {
  tunnelUrl: string;
  /** When true, skips the outer card chrome — for embedding inside another modal/card shell. */
  embedded?: boolean;
}

/** QR code + copyable link for a hub's real public URL. No LAN-IP guessing —
 * every hub now gets a real, publicly-resolvable address (see Automatic
 * HTTPS), so there's nothing to reconstruct. */
export function JoinQrCard({ tunnelUrl, embedded }: JoinQrCardProps) {
  const hasUrl = !!tunnelUrl && tunnelUrl !== 'https://' && tunnelUrl !== 'http://';

  const body = (
    <>
      {!embedded && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <QrCode className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            <h3 className="text-sm font-semibold cn-text-1">Member join QR code</h3>
          </div>
          <p className="text-xs cn-text-3 mb-4">Anyone can scan this to join the hub instantly.</p>
        </>
      )}

      {hasUrl ? (
        <div className="flex flex-col items-center gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm">
            <QRCodeSVG value={tunnelUrl} size={180} bgColor="#ffffff" fgColor="#18181b" level="M" />
          </div>
          <div className="w-full">
            <p className="text-xs cn-text-3 text-center mb-2">Scan with any camera app or browser</p>
            <div className="flex items-center gap-2 cn-surface-2 rounded-lg px-3 py-2">
              <code className="text-xs cn-text-2 flex-1 truncate">{tunnelUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(tunnelUrl)}
                className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title="Copy link"
              >
                <Copy className="w-3.5 h-3.5 cn-text-3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs cn-text-4 text-center py-4">Set up your hub's public address to generate a join link.</p>
      )}
    </>
  );

  if (embedded) return body;
  return <div className="cn-surface border cn-border rounded-2xl p-6">{body}</div>;
}
