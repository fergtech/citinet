import { useState } from 'react';
import { QrCode, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface JoinQrCardProps {
  hubSlug: string;
  tunnelUrl: string;
  /** When true, skips the outer card chrome — for embedding inside another modal/card shell. */
  embedded?: boolean;
}

/** The real, reachable "join this hub" URL for local-network hubs — the API's tunnelUrl
 * (port 9090) is a backend endpoint, not something a browser can load as the app, and
 * "localhost" only resolves on the hub's own machine. Neighbors on the same Wi-Fi need
 * the hub machine's actual LAN IPv4 address plus the frontend's port instead. */
export function JoinQrCard({ hubSlug, tunnelUrl, embedded }: JoinQrCardProps) {
  const frontendPort = window.location.port || '3001';
  const storageKey = `citinet-lan-ip-${hubSlug}`;

  // Priority: 1) saved in localStorage, 2) real IP from tunnelUrl, 3) page host if LAN, 4) blank
  const deriveDefault = () => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return saved;
    try {
      const apiHost = tunnelUrl ? new URL(tunnelUrl).hostname : '';
      const isLocal = !apiHost || apiHost === 'localhost' || apiHost === '127.0.0.1';
      if (!isLocal) return apiHost;
    } catch { /* ignore */ }
    const pageHost = window.location.hostname;
    if (pageHost !== 'localhost' && pageHost !== '127.0.0.1') return pageHost;
    return '';
  };

  const [lanIp, setLanIp] = useState(deriveDefault);

  const handleIpChange = (val: string) => {
    setLanIp(val);
    if (val.trim()) localStorage.setItem(storageKey, val.trim());
    else localStorage.removeItem(storageKey);
  };
  const joinUrl = lanIp.trim() ? `http://${lanIp.trim()}:${frontendPort}?hub=${hubSlug}` : '';

  const body = (
    <>
      {!embedded && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <QrCode className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            <h3 className="text-sm font-semibold cn-text-1">Member join QR code</h3>
          </div>
          <p className="text-xs cn-text-3 mb-4">Anyone on the same Wi-Fi can scan this to join the hub instantly.</p>
        </>
      )}

      <div className="mb-4">
        <label className="block text-xs font-medium cn-text-3 mb-1">Hub machine's LAN IP</label>
        <input
          type="text"
          value={lanIp}
          onChange={e => handleIpChange(e.target.value)}
          placeholder="e.g. 10.0.0.139"
          className="w-full px-3 py-2 rounded-lg border cn-border cn-surface-2 text-sm cn-text-1 font-mono focus:border-purple-500 focus:outline-none transition-colors"
        />
        <p className="text-xs cn-text-4 mt-1">
          Run <code className="cn-surface-3 px-1 rounded">ipconfig</code> and look for your Ethernet/Wi-Fi IPv4 address.
        </p>
      </div>

      {joinUrl ? (
        <div className="flex flex-col items-center gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm">
            <QRCodeSVG value={joinUrl} size={180} bgColor="#ffffff" fgColor="#18181b" level="M" />
          </div>
          <div className="w-full">
            <p className="text-xs cn-text-3 text-center mb-2">Scan with any camera app or browser</p>
            <div className="flex items-center gap-2 cn-surface-2 rounded-lg px-3 py-2">
              <code className="text-xs cn-text-2 flex-1 truncate">{joinUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(joinUrl)}
                className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title="Copy link"
              >
                <Copy className="w-3.5 h-3.5 cn-text-3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs cn-text-4 text-center py-4">Enter the LAN IP above to generate the QR code.</p>
      )}
    </>
  );

  if (embedded) return body;
  return <div className="cn-surface border cn-border rounded-2xl p-6">{body}</div>;
}
