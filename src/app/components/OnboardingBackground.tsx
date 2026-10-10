/** Looping, muted background video shared by the onboarding flow (Welcome, Join a Hub, Create a Node).
 * The footage keeps its own colour; a single solid overlay sits on top of it: black in dark mode, white in
 * light mode, plus a faint neutral dot grid. No gradients and no tint stack. */
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
      <div className="absolute inset-0 bg-white/60 dark:bg-black/82" />
      {/* dot grid, as before: neutral so it reads on both the dark and the light overlay */}
      <svg className="absolute inset-0 w-full h-full text-foreground" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="onboarding-bg-dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="9" cy="9" r="0.9" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#onboarding-bg-dots)" opacity="0.075" />
      </svg>
    </div>
  );
}
