import { useHub } from '../context/HubContext';
import { preferencesService } from '../services/preferencesService';

export function HubBackground() {
  const { currentHub, userPreferences } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const bgType = userPreferences?.background_type;
  const bgValue = userPreferences?.background_value ?? '';
  const parsedBrightness = Number(userPreferences?.background_brightness);
  const bgBrightness = Number.isFinite(parsedBrightness)
    ? Math.min(1, Math.max(0.35, parsedBrightness))
    : 0.65;

  if (bgType === 'color' && bgValue) {
    return (
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ backgroundColor: bgValue }}
      />
    );
  }

  if (bgType === 'image' && bgValue) {
    const imageUrl = preferencesService.getBackgroundImageUrl(hubSlug, bgValue);
    return (
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: `brightness(${bgBrightness})`,
        }}
      />
    );
  }

  if (bgType === 'preset' && bgValue) {
    return (
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage: `url(/default_backgrounds/${encodeURIComponent(bgValue)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: `brightness(${bgBrightness})`,
        }}
      />
    );
  }

  // Classic Citinet look: a plain theme-aware surface color — --cn-surface-2
  // already flips between light/dark under the .dark scope. Explicit opt-in via
  // the "Classic" pick in Appearance.
  if (bgType === 'solid') {
    return (
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ background: 'var(--cn-surface-2)' }}
      />
    );
  }

  // True default ('default', or no preference set yet): the Citinet dot-grid
  // wallpaper (rich radial gradients + dot grid).
  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: 'var(--cn-wallpaper)' }}
    >
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hub-bg-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hub-bg-dots)" opacity="0.05" className="dark:opacity-[0.09]" />
      </svg>
    </div>
  );
}
