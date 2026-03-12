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
          backgroundAttachment: 'fixed',
          filter: `brightness(${bgBrightness})`,
        }}
      />
    );
  }

  // Default: gradient + dot grid
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hub-bg-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hub-bg-dots)" opacity="0.07" className="dark:opacity-[0.12]" />
      </svg>
    </div>
  );
}
