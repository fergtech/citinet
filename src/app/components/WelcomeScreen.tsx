import { MapPin } from 'lucide-react';
import { motion } from 'motion/react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
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
        <h2 className="text-white tracking-tight">citinet</h2>
      </div>

      {/* Center Content */}
      <div className="flex flex-col items-center text-center z-10 max-w-md">
        {/* Icon Container with Location Label */}
        <motion.div
          className="mb-6"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-32 h-32 rounded-3xl backdrop-blur-md bg-white/10 border border-white/20 flex items-center justify-center mb-4">
            <MapPin className="w-16 h-16 text-white" strokeWidth={2} />
          </div>
          <div className="px-4 py-1.5 rounded-full bg-white/90 backdrop-blur-sm">
            <span className="text-purple-600">Highland Park</span>
          </div>
        </motion.div>

        {/* Headline */}
        <h1 className="text-white mb-4 max-w-sm" style={{ fontSize: '2.5rem', lineHeight: '1.15', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Digital Infrastructure
          <br />
          <span className="text-white/80 font-medium">for Highland Park</span>
        </h1>

        {/* Subtext */}
        <p className="text-white/90 mb-8 font-light leading-relaxed text-base">
          A local network owned by neighbors,<br />
          not corporations.<br />
          <br />
          <span className="text-sm text-white/70">
          No surveillance. No algorithms. No extraction.
          </span>
        </p>

        {/* Join Now Button */}
        <button
          onClick={onGetStarted}
          className="w-full bg-white text-purple-600 py-4 rounded-2xl font-semibold shadow-lg hover:bg-white/95 transition-all hover:scale-[1.02] active:scale-95 mb-3"
        >
          Enter Highland Park
        </button>

        {/* Disclaimer */}
        <p className="text-white/70 text-sm font-light">
          Entering this network means participating in shared civic space.
        </p>
      </div>
    </div>
  );
}