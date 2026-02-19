import { MapPin, Network, Plus, Download } from 'lucide-react';
import { motion } from 'motion/react';

interface WelcomeScreenProps {
  onJoinNetwork: () => void;
  onCreateNetwork: () => void;
}

// Simple desktop detection (not perfect, but covers most cases)
const isDesktop = typeof window !== 'undefined' && !/Mobi|Android|iPad|iPhone/i.test(navigator.userAgent);

export function WelcomeScreen({ onJoinNetwork, onCreateNetwork }: WelcomeScreenProps) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Background Vector Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="mesh-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            {/* Curved flowing lines */}
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
        <h2 className="text-white tracking-tight">[citinet]</h2>
      </div>

      {/* Top Right Download Button (Desktop only) */}
      {isDesktop && (
        <div className="absolute top-6 right-6">
          <a
            href="https://github.com/fergtech/citinet-client/releases/download/v1.0.0/citinet.exe"
            className="flex items-center gap-2 bg-white/90 text-blue-700 font-semibold px-4 py-2 rounded-lg shadow hover:bg-white transition border border-blue-200 hover:border-blue-400"
            download
            title="Download Citinet Desktop Client for Windows"
          >
            <Download className="w-5 h-5" />
            Download Desktop Client
          </a>
        </div>
      )}

      {/* Center Content */}
      <div className="flex flex-col items-center text-center z-10 max-w-2xl w-full">
        {/* Icon Container */}
        <motion.div
          className="mb-8"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-32 h-32 rounded-3xl backdrop-blur-md bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
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
              Find and connect to an existing citinet node in your neighborhood
            </p>
            <div className="mt-4 flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-sm group-hover:gap-3 transition-all">
              <span>Scan for networks</span>
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
    </div>
  );
}