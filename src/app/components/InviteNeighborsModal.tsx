import { X, Copy, Check, Users, QrCode, Link, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useHub } from '../context/HubContext';

interface InviteNeighborsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InviteNeighborsModal({ isOpen, onClose }: InviteNeighborsModalProps) {
  const [copied, setCopied] = useState(false);
  const { currentHub } = useHub();

  const inviteUrl = currentHub?.tunnelUrl || '';
  const memberCount = currentHub?.meta?.activeMembers ?? currentHub?.memberCount ?? 0;
  const qrCodeUrl = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteUrl)}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-purple-600 to-blue-600 text-white">
          <button
            onClick={onClose}
            aria-label="Close invite neighbors modal"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all backdrop-blur-sm"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Invite Neighbors</h3>
              <p className="text-purple-100 text-sm mt-1">
                {currentHub?.name ? `Grow ${currentHub.name}` : 'Grow your community hub'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {inviteUrl ? (
            <>
              {/* QR Code */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-zinc-800 dark:to-zinc-800 rounded-xl p-6 border border-slate-200 dark:border-zinc-700">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <QrCode className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Scan to Join</p>
                  </div>
                  <div className="inline-flex items-center justify-center p-4 bg-white rounded-xl shadow-lg">
                    <img
                      src={qrCodeUrl}
                      alt="Hub invite QR code"
                      className="w-44 h-44"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                    Anyone who scans this can request to join {currentHub?.name || 'your hub'}
                  </p>
                </div>
              </div>

              {/* Link Copy */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Link className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <label className="text-sm font-medium text-slate-900 dark:text-white">
                    Or share this link
                  </label>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 px-3.5 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-mono truncate">
                    {inviteUrl}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                      copied
                        ? 'bg-green-600 text-white'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* No URL configured */
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-1">No hub URL configured</p>
                <p className="text-xs text-amber-800 dark:text-amber-400">
                  Your hub needs a public URL before you can share an invite. If you set up Tailscale, the URL will appear here automatically. For local-only hubs, share your LAN IP directly with neighbors.
                </p>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                {memberCount > 0 ? memberCount : '—'}
              </div>
              <p className="text-xs text-purple-700 dark:text-purple-400">Current Members</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">∞</div>
              <p className="text-xs text-blue-700 dark:text-blue-400">Invite Limit</p>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Tips for growing your hub
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              {[
                'Share the link in your building\'s group chat or neighborhood forum',
                'Print QR codes and post them on community boards or mailrooms',
                'Post on the hub\'s feed to let existing members know to invite others',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0 mt-1" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
