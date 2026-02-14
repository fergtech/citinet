import { X, AlertTriangle, Radio, MapPin, Clock } from 'lucide-react';
import { useState } from 'react';

interface EmergencySignalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmergencySignalModal({ isOpen, onClose }: EmergencySignalModalProps) {
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcasted, setBroadcasted] = useState(false);

  const handleBroadcast = () => {
    setBroadcasting(true);
    // Simulate broadcast delay
    setTimeout(() => {
      setBroadcasting(false);
      setBroadcasted(true);
    }, 2000);
  };

  const handleClose = () => {
    setBroadcasted(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full shadow-2xl border border-red-200 dark:border-red-900 overflow-hidden">
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-red-600 to-orange-600 text-white">
          <button
            onClick={handleClose}
            aria-label="Close emergency signal modal"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all backdrop-blur-sm"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Emergency Signal</h3>
              <p className="text-red-100 text-sm mt-1">Alert your community network</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!broadcasted ? (
            <>
              {/* Warning */}
              <div className="bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Important Information
                </h4>
                <ul className="space-y-2 text-sm text-red-800 dark:text-red-400">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>Broadcasting will alert <strong>all 47 members</strong> in your network</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>Your <strong>location will be shared</strong> with nearby members</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>Use only for <strong>genuine emergencies</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>Signal reaches nodes within <strong>~500ft radius</strong></span>
                  </li>
                </ul>
              </div>

              {/* Broadcast Details */}
              <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-5 space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                  What Will Be Shared
                </h4>
                
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-white">Approximate Location</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Within 100ft accuracy</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-white">Timestamp</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Exact time of broadcast</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-white">Your Node ID</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">So others can respond</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBroadcast}
                  disabled={broadcasting}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm text-white transition-all ${
                    broadcasting
                      ? 'bg-red-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 hover:shadow-lg'
                  }`}
                >
                  {broadcasting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Broadcasting...
                    </span>
                  ) : (
                    'Broadcast Emergency Signal'
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
                For life-threatening emergencies, always call 911 first
              </p>
            </>
          ) : (
            /* Success State */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Signal Broadcast
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Your emergency signal has been sent to nearby members
              </p>
              
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">12</div>
                    <p className="text-xs text-green-700 dark:text-green-400">Nodes Reached</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">3</div>
                    <p className="text-xs text-green-700 dark:text-green-400">Members En Route</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleClose}
                className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Close
              </button>
              
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-4">
                Stay safe. Help is on the way.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
