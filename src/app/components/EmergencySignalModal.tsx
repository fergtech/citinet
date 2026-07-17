import { X, AlertTriangle, Radio, Loader2 } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="cn-surface border cn-border rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        {!broadcasted ? (
          <>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </span>
              <h2 className="flex-1 text-lg font-bold cn-text-1">Send emergency signal?</h2>
              <button onClick={handleClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors shrink-0">
                <X className="w-4 h-4 cn-text-3" />
              </button>
            </div>

            <p className="text-sm cn-text-2 leading-relaxed">
              This posts a pinned announcement visible to all {memberCount > 0 ? memberCount : ''} members of {currentHub?.name || 'this hub'}. Use only for genuine safety emergencies — for anything life-threatening, call 911 first.
            </p>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder="Add a message (optional)…"
              className="w-full px-3.5 py-2.5 rounded-xl cn-surface-2 border cn-border cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 text-sm focus:border-red-400 focus:outline-none transition-colors resize-none"
            />

            {error && <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl border cn-border cn-text-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBroadcast}
                disabled={broadcasting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {broadcasting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Broadcast'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold cn-text-1 mb-1.5">Alert posted</h2>
            <p className="text-sm cn-text-3 mb-5">
              Visible to all members of {currentHub?.name || 'this hub'} in the feed. Stay safe — check for responses from neighbors.
            </p>
            <button
              onClick={handleClose}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
