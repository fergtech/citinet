import { ArrowLeft, Radio, Users, QrCode, Server, AlertTriangle, Zap } from 'lucide-react';

interface NetworkScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

export function NetworkScreen({ onBack, onNavigate }: NetworkScreenProps) {
  const activeUsers = 3;
  const targetUsers = 25;
  const progress = (activeUsers / targetUsers) * 100;

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Glassmorphism Gradient Header */}
      <div className="sticky top-0 bg-gradient-to-r from-blue-600/95 via-purple-600/95 to-pink-600/95 backdrop-blur-xl z-10 p-4 shadow-2xl border-b border-white/10">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h2 className="text-white text-2xl font-black tracking-tight">Your Network 🌐</h2>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8">
        {/* Status Card - Elevated with Shadow */}
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-3xl p-6 md:p-8 shadow-xl border-2 border-blue-100 dark:border-blue-900/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-start gap-4 md:gap-6">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-lg animate-pulse">
              <Radio className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-card-foreground text-xl md:text-2xl font-black tracking-tight">Cloud Instance</h3>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">ONLINE</span>
                </div>
              </div>
              <p className="text-muted-foreground text-sm md:text-base">
                Connected to citinet cloud. Local nodes coming soon.
              </p>
            </div>
          </div>
        </div>

        {/* Community Density Widget - Hero Metric */}
        <div className="relative bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-3xl p-8 md:p-10 shadow-2xl overflow-hidden mt-6 md:mt-8">
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full blur-3xl animate-pulse delay-1000" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white text-lg md:text-xl font-bold">Community Density</h3>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-3 mb-3">
                <p className="text-7xl md:text-8xl font-black text-white tracking-tight drop-shadow-2xl">
                  {activeUsers}
                </p>
                <span className="text-3xl md:text-4xl font-light text-white/70">/ {targetUsers}</span>
              </div>
              <p className="text-white/90 text-base md:text-lg font-normal">
                active users in Highland Park
              </p>
            </div>

            {/* Animated Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full bg-white rounded-full transition-all duration-[2000ms] ease-out shadow-lg animate-in slide-in-from-left"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-300" />
                <p className="text-sm text-white/90">
                  Neighborhood Chat unlocks at {targetUsers} users
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions - Modern Button Grid */}
        <div className="space-y-4">
          <h3 className="text-card-foreground text-lg font-black tracking-tight px-2">Quick Actions</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Invite Neighbors - Primary Action */}
            <button
              onClick={() => onNavigate('invite-neighbors')}
              className="group relative bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.05] active:scale-95"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110">
                  <QrCode className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg mb-1">Invite Neighbors</h4>
                  <p className="text-sm text-white/80 font-light">Share QR or link</p>
                </div>
              </div>
            </button>

            {/* Host a Node - Secondary Action */}
            <button
              onClick={() => onNavigate('host-node')}
              className="group relative bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.05] active:scale-95"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110">
                  <Server className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg mb-1">Host a Node</h4>
                  <p className="text-sm text-white/80 font-light">Setup guide</p>
                </div>
              </div>
            </button>
          </div>

          {/* Emergency Signal - Full Width Critical Action */}
          <button
            onClick={() => onNavigate('signal')}
            className="group relative w-full bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95 border-2 border-white/20"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110 flex-shrink-0">
                <AlertTriangle className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="text-white font-black text-lg md:text-xl mb-1">Emergency Signal</h4>
                <p className="text-sm md:text-base text-white/80 font-light">Broadcast urgent alert to entire community</p>
              </div>
              <ArrowLeft className="w-6 h-6 text-white rotate-180 group-hover:translate-x-2 transition-transform duration-300" />
            </div>
          </button>
        </div>

        {/* Future Upgrade Info - Frosted Glass Card */}
        <div className="relative bg-gradient-to-br from-purple-50/80 via-pink-50/50 to-blue-50/80 dark:from-purple-900/20 dark:via-pink-900/10 dark:to-blue-900/20 rounded-2xl p-6 border border-purple-200/30 dark:border-purple-700/30 backdrop-blur-md shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 flex items-center justify-center flex-shrink-0 shadow-md">
              <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                Coming Soon: Physical Node Integration
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-light mb-3">
                When physical mesh nodes are deployed, this screen will display:
              </p>
              <ul className="text-xs text-slate-600 dark:text-slate-300 font-light space-y-1.5">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Node name, signal strength, and uptime
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Interactive map of nearby nodes
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Real-time mesh health metrics
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
