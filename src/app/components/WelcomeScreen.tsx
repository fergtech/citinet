import { Network, Plus, MapPin, X, Download, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

interface WelcomeScreenProps {
  onJoinNetwork: () => void;
  onCreateNetwork: () => void;
}

export function WelcomeScreen({ onJoinNetwork, onCreateNetwork }: WelcomeScreenProps) {
  const { showBanner, isIOS, install, dismiss } = useInstallPrompt();

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Background Vector Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="mesh-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M 0 150 Q 50 100 100 150 T 200 150" stroke="white" strokeWidth="1.5" fill="none" />
            <ellipse cx="100" cy="100" rx="80" ry="40" stroke="white" strokeWidth="1" fill="none" opacity="0.5" />
            <ellipse cx="150" cy="150" rx="60" ry="30" stroke="white" strokeWidth="1" fill="none" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mesh-pattern)" />
      </svg>

      {/* Top Left Logo */}
      <div className="absolute top-6 left-6">
        <a
          href="https://citinet-info.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white tracking-tight hover:text-white/85 transition-colors"
        >
          [citinet]
        </a>
      </div>

      {/* Center Content */}
      <div className="flex flex-col items-center text-center z-10 max-w-2xl w-full">
        {/* Icon Container */}
        <motion.div
          className="mb-8"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-32 h-32 rounded-3xl backdrop-blur-md bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
            {/* Citinet mesh logo mark - MapPin icon */}
            <MapPin className="w-16 h-16 text-white" strokeWidth={2} />
          </div>
        </motion.div>

        {/* Headline */}
        <h1 className="text-white mb-4 max-w-xl text-5xl leading-tight font-semibold tracking-tight">
          Decentralized. Local.
          <br />
          <span className="text-white/90 font-medium">Citizens' Internet.</span>
        </h1>

        {/* Subtext */}
        <p className="text-white/90 mb-10 font-light leading-relaxed text-base max-w-md">
          Community-owned networks.<br />
          No mega-corporations. No central servers.
        </p>

        {/* Two Path Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
          {/* Join Existing Network */}
          <motion.button
            onClick={onJoinNetwork}
            className="group bg-white dark:bg-zinc-900/78 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 text-left border-2 border-transparent hover:border-purple-300 dark:hover:border-purple-600"
            whileHover={{ y: -4 }}
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mb-4">
              <Network className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Join Your Local Network
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Browse available community hubs or connect directly with a hub URL
            </p>
            <div className="mt-4 flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-sm group-hover:gap-3 transition-all">
              <span>Find a hub</span>
              <span>→</span>
            </div>
          </motion.button>

          {/* Create New Node */}
          <motion.button
            onClick={onCreateNetwork}
            className="group bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 text-left border-2 border-white/20 hover:border-white/40"
            whileHover={{ y: -4 }}
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              Start a New Community Node
            </h3>
            <p className="text-sm text-white/90 leading-relaxed">
              Be the first in your neighborhood to launch a local mesh network
            </p>
            <div className="mt-4 flex items-center gap-2 text-white font-semibold text-sm group-hover:gap-3 transition-all">
              <span>Create your node</span>
              <span>→</span>
            </div>
          </motion.button>
        </div>

        {/* Footer Note */}
        <p className="text-white/70 text-sm font-light mt-8">
          Participating in citinet means joining shared civic digital space
        </p>
      </div>

      {/* Install / Add to Home Screen banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe"
          >
            <div className="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0 mt-0.5">
                {isIOS ? <Share className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Add citinet to your home screen</p>
                {isIOS ? (
                  <p className="text-white/60 text-xs mt-0.5 leading-relaxed">
                    Tap the <strong className="text-white/80">Share</strong> button in your browser, then choose{' '}
                    <strong className="text-white/80">Add to Home Screen</strong>.
                  </p>
                ) : (
                  <p className="text-white/60 text-xs mt-0.5">
                    Install for faster access — no App Store needed.
                  </p>
                )}
                {!isIOS && (
                  <button
                    onClick={install}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
                  >
                    Install
                  </button>
                )}
              </div>
              <button
                onClick={dismiss}
                className="text-white/40 hover:text-white/70 transition-colors shrink-0 mt-0.5"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
