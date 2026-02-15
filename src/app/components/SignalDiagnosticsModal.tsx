import { X, Wifi, Activity, TrendingUp, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SignalDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SignalDiagnosticsModal({ isOpen, onClose }: SignalDiagnosticsModalProps) {
  if (!isOpen) return null;

  const signalStrength = 87; // Mock signal strength

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[80vh] shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-green-600 to-emerald-600 text-white">
          <button
            onClick={onClose}
            aria-label="Close signal diagnostics modal"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all backdrop-blur-sm"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Wifi className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Signal Diagnostics</h3>
              <p className="text-green-100 text-sm mt-1">Network health report</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* Overall Signal */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Overall Signal Quality</h4>
              <span className="text-3xl font-bold text-green-600 dark:text-green-400">{signalStrength}%</span>
            </div>
            <div className="w-full bg-white dark:bg-zinc-800 rounded-full h-3 overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${signalStrength}%` }}
              />
            </div>
            <p className="text-sm text-green-700 dark:text-green-400 mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Excellent connection quality
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Latency */}
            <div className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h5 className="text-sm font-medium text-slate-900 dark:text-white">Latency</h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Network delay</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Current</span>
                  <span className="font-semibold text-slate-900 dark:text-white">12ms</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Average</span>
                  <span className="font-semibold text-slate-900 dark:text-white">15ms</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Peak</span>
                  <span className="font-semibold text-slate-900 dark:text-white">28ms</span>
                </div>
              </div>
            </div>

            {/* Bandwidth */}
            <div className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h5 className="text-sm font-medium text-slate-900 dark:text-white">Bandwidth</h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Transfer speed</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Download</span>
                  <span className="font-semibold text-slate-900 dark:text-white">45 Mbps</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Upload</span>
                  <span className="font-semibold text-slate-900 dark:text-white">12 Mbps</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Stability</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">Stable</span>
                </div>
              </div>
            </div>
          </div>

          {/* Connection Path */}
          <div className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <h5 className="text-sm font-semibold text-slate-900 dark:text-white">Connection Path</h5>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Your Node</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">192.168.1.100</p>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Active</span>
              </div>
              <div className="ml-1 border-l-2 border-dashed border-slate-300 dark:border-slate-600 h-6" />
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Gateway Node</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">10.0.1.1 • 2 hops</p>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Active</span>
              </div>
              <div className="ml-1 border-l-2 border-dashed border-slate-300 dark:border-slate-600 h-6" />
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Mesh Network</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Connected to 12 peers</p>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Active</span>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h5 className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-2">Optimization Tips</h5>
                <ul className="space-y-1.5 text-sm text-amber-800 dark:text-amber-400">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                    Position node near a window for better signal
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                    Consider upgrading antenna for improved range
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                    Peak usage hours: 6-9 PM local time
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
