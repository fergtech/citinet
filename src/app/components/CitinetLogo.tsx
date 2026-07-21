interface CitinetLogoProps {
  size?: number;
  className?: string;
}

/** The citinet brand mark — used consistently across the onboarding flow
 * (Welcome, Join a Hub, hub login/signup, Create a Hub). */
export function CitinetLogo({ size = 32, className = '' }: CitinetLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="citinet"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
