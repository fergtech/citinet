interface CitinetLogoProps {
  size?: number;
  className?: string;
}

/** (The mark is a light-on-dark asset, so it is inverted in light mode.)
 * The citinet brand mark — used consistently across the onboarding flow
 * (Welcome, Join a Hub, hub login/signup, Create a Hub). */
export function CitinetLogo({ size = 32, className = '' }: CitinetLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="citinet"
      className={`invert dark:invert-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
