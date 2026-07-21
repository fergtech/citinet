/** Looping, muted, dimmed video background shared by the onboarding flow
 * (Welcome, Join a Hub, Create a Node) — replaces the old static gradient.
 * The same wallpaper gradient + dot grid used everywhere else post-login
 * (see HubBackground's default branch) is blended over the footage so the
 * onboarding flow reads as the same product, not a separate marketing page. */
export function OnboardingBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <video
        className="w-full h-full object-cover"
        src="/video-background.mp4"
        autoPlay
        loop
        muted
        playsInline
      />
      {/* Plain alpha tint, not a blend mode — mix-blend-overlay multiplies shadows and
          screens highlights, which crushed contrast and blew out saturation on this
          footage. A translucent layer just tints color without distorting it. */}
      <div className="absolute inset-0 opacity-70" style={{ background: 'var(--cn-wallpaper)' }} />
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="onboarding-bg-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#onboarding-bg-dots)" opacity="0.12" />
      </svg>
      <div className="absolute inset-0 bg-black/15" />
    </div>
  );
}
