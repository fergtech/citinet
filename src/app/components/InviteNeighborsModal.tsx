import { X, Copy, Check, UserPlus, Mail, QrCode } from 'lucide-react';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useHub } from '../context/HubContext';
import { JoinQrCard } from './JoinQrCard';

interface InviteNeighborsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Whether a tunnel URL only resolves on the hub's own machine/network — if so it's not
 * something a neighbor's browser can actually load, so we need the LAN-IP flow instead
 * of just sharing it verbatim. */
function isLocalTunnelUrl(url: string): boolean {
  if (!url || url === 'https://' || url === 'http://') return true;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.');
  } catch {
    return true;
  }
}

export function InviteNeighborsModal({ isOpen, onClose }: InviteNeighborsModalProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const { currentHub } = useHub();

  const tunnelUrl = currentHub?.tunnelUrl || '';
  const isLocal = isLocalTunnelUrl(tunnelUrl);
  const memberCount = currentHub?.meta?.activeMembers ?? currentHub?.memberCount ?? 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tunnelUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Join ${currentHub?.name || 'our hub'} on Citinet`);
    const body = encodeURIComponent(`Come join our local community hub — ${tunnelUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="cn-surface border cn-border rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-white" />
          </span>
          <h2 className="flex-1 text-lg font-bold cn-text-1">Invite neighbors</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors shrink-0">
            <X className="w-4 h-4 cn-text-3" />
          </button>
        </div>

        <p className="text-sm cn-text-2 leading-relaxed">
          Share this link with people nearby. Each new neighbor who joins grows {currentHub?.name || 'the hub'}.
        </p>

        {isLocal ? (
          // Local/unconfigured hub — a raw localhost or LAN API URL isn't something another
          // device can actually load, so hand off to the same LAN-IP-aware flow Hub
          // Management uses, rather than sharing a link that won't work for anyone else.
          <JoinQrCard hubSlug={currentHub?.slug ?? ''} tunnelUrl={tunnelUrl} embedded />
        ) : (
          <>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg cn-surface-2 border cn-border text-sm cn-text-2 font-mono truncate">
                {tunnelUrl}
              </div>
              <button
                onClick={handleCopy}
                className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors flex items-center gap-1.5 shrink-0 ${
                  copied ? 'bg-emerald-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleEmail}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border cn-border cn-text-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <Mail className="w-4 h-4" /> Email invite
              </button>
              <button
                onClick={() => setShowQr(v => !v)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border cn-border cn-text-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <QrCode className="w-4 h-4" /> {showQr ? 'Hide QR code' : 'Show QR code'}
              </button>
            </div>

            {showQr && (
              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="p-3 bg-white rounded-xl">
                  <QRCodeSVG value={tunnelUrl} size={160} bgColor="#ffffff" fgColor="#18181b" level="M" />
                </div>
                <p className="text-xs cn-text-4">Anyone who scans this can request to join</p>
              </div>
            )}
          </>
        )}

        {memberCount > 0 && (
          <p className="text-xs cn-text-4">{memberCount} current member{memberCount === 1 ? '' : 's'}</p>
        )}
      </div>
    </div>
  );
}
