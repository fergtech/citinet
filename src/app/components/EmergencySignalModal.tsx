import { X, AlertTriangle, Radio, User, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';

interface EmergencySignalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmergencySignalModal({ isOpen, onClose }: EmergencySignalModalProps) {
  const { currentHub, currentUser } = useHub();
  const [message, setMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcasted, setBroadcasted] = useState(false);
  const [error, setError] = useState('');

  const memberCount = currentHub?.meta?.activeMembers ?? currentHub?.memberCount ?? 0;

  const handleBroadcast = async () => {
    if (!currentHub?.slug) return;
    setBroadcasting(true);
    setError('');
    try {
      const body = message.trim()
        || 'I need urgent help from nearby community members. Please respond as soon as possible.';
      await hubService.createPost(currentHub.slug, {
        category: 'ANNOUNCEMENT',
        title: `🚨 Emergency Alert from ${currentUser?.username || 'a neighbor'}`,
        body,
      });
      setBroadcasted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send alert — check your connection');
    } finally {
      setBroadcasting(false);
    }
  };

  const handleClose = () => {
    setBroadcasted(false);
    setMessage('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full shadow-2xl border border-red-200 dark:border-red-900/50 overflow-hidden">
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-red-600 to-orange-600 text-white">
          <button
            onClick={handleClose}
            aria-label="Close emergency signal modal"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center ${!broadcasted ? 'animate-pulse' : ''}`}>
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Emergency Alert</h3>
              <p className="text-red-100 text-sm mt-1">
                Posts an urgent announcement to {currentHub?.name || 'your hub'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {!broadcasted ? (
            <>
              {/* Warning */}
              <div className="bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-800/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Before you send
                </h4>
                <ul className="space-y-1.5 text-sm text-red-800 dark:text-red-400">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>This posts a pinned announcement visible to <strong>all {memberCount > 0 ? memberCount : ''} hub members</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>Use only for <strong>genuine emergencies</strong> — misuse undermines community trust</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>For life-threatening situations, <strong>call 911 first</strong></span>
                  </li>
                </ul>
              </div>

              {/* What gets shared */}
              <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  What gets posted
                </h4>
                {[
                  { icon: User, label: 'Your username', note: `@${currentUser?.username || 'you'}` },
                  { icon: Clock, label: 'Timestamp', note: 'Right now' },
                  { icon: Radio, label: 'Hub feed', note: 'Pinned as Announcement' },
                ].map(({ icon: Icon, label, note }) => (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional message */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">
                  Add a message <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={2}
                  maxLength={280}
                  placeholder="Briefly describe what help you need…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:border-red-400 focus:outline-none transition-colors resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBroadcast}
                  disabled={broadcasting}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2 ${
                    broadcasting
                      ? 'bg-red-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 hover:shadow-lg'
                  }`}
                >
                  {broadcasting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Sending…</>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Send Emergency Alert
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Success */
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Alert Posted
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Your emergency alert is now visible to all members of {currentHub?.name || 'your hub'} in the hub feed.
              </p>

              {memberCount > 0 && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 rounded-xl p-4 mb-6">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                    {memberCount}
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-400">members can see your alert</p>
                </div>
              )}

              <button
                onClick={handleClose}
                className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Close
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Stay safe. Check the hub feed for responses from neighbors.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
