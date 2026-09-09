// Small shared custom SVG icons that mirror citinet-mobile's own custom
// glyphs (components/ui/custom-icon.tsx) — used where citinet-web wants the
// same iconography as the mobile app instead of a generic lucide-react icon.

// "search" (Android vector drawable, lifted via citinet-mobile's own
// components/ui/custom-icon.tsx ICON_PATHS.search) — citinet-mobile's
// Discover icon (Home screen's header search button, which opens the
// DiscoverDrawer/navigates to /discover). Path lifted verbatim (already a
// 0-24 viewBox, no rescale needed) — replaces the earlier lucide `Compass`.
export function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.9,16.776A10.539,10.539,0,1,0,16.776,18.9l5.1,5.1L24,21.88ZM10.5,18A7.5,7.5,0,1,1,18,10.5,7.507,7.507,0,0,1,10.5,18Z" />
    </svg>
  );
}

// "landLayerLocation" — citinet-mobile's Atlas icon (its app drawer's Atlas
// row, and this file's own former lucide `Map` icon before this swap).
// Path lifted verbatim (already a 0-24 viewBox, no rescale needed).
export function AtlasGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="m16.949,2.05c-1.321-1.322-3.079-2.05-4.949-2.05s-3.628.728-4.95,2.05c-2.729,2.729-2.729,7.17.008,9.907l2.495,2.44c.675.66,1.561.99,2.447.99s1.772-.33,2.447-.99l2.502-2.448c1.322-1.322,2.051-3.08,2.051-4.95s-.729-3.627-2.051-4.95Zm-4.949,7.94c-1.657,0-3-1.343-3-3s1.343-3,3-3,3,1.343,3,3-1.343,3-3,3Zm12,6.772c.002.354-.183.682-.485.863l-9.861,5.917c-.51.306-1.082.459-1.653.459s-1.144-.153-1.653-.459L.485,17.625c-.303-.182-.487-.51-.485-.863.002-.353.19-.679.495-.857l4.855-2.842c.1.11.203.219.309.325l2.495,2.439c1.028,1.006,2.395,1.561,3.846,1.561s2.817-.555,3.846-1.561l2.518-2.463c.098-.098.194-.199.287-.301l4.854,2.841c.305.179.493.505.495.857Z" />
    </svg>
  );
}

// "cloud-upload-alt" (Android Material Symbols glyph, from H:\Apps\custom-icons\
// cloud-upload-alt-android.zip) — citinet-web's Files icon, replacing the
// earlier lucide `FolderOpen` pick. Path lifted verbatim (0-24 viewBox
// matches the source vector's own declared 24dp width/height, no rescale
// needed).
export function FilesGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.974,7.146c-.331-.066-.602-.273-.742-.569-1.55-3.271-5.143-5.1-8.734-4.438-3.272,.6-5.837,3.212-6.384,6.501-.162,.971-.15,1.943,.033,2.89,.06,.309-.073,.653-.346,.901-1.145,1.041-1.801,2.524-1.801,4.07,0,3.032,2.467,5.5,5.5,5.5h11c4.136,0,7.5-3.364,7.5-7.5,0-3.565-2.534-6.658-6.026-7.354Zm-2.853,6.562c-.195,.195-.451,.293-.707,.293s-.512-.098-.707-.293l-1.707-1.707v5c0,.553-.448,1-1,1s-1-.447-1-1v-5l-1.707,1.707c-.391,.391-1.023,.391-1.414,0s-.391-1.023,0-1.414l2.707-2.707c.386-.386,.893-.58,1.4-.583l.014-.003,.014,.003c.508,.003,1.014,.197,1.4,.583l2.707,2.707c.391,.391,.391,1.023,0,1.414Z" />
    </svg>
  );
}

// "satelliteDish" — citinet-mobile's Messages tab-bar icon (replaced its
// IconSymbol "paperplane.fill" there). Path lifted verbatim (already a 0-24
// viewBox, no rescale needed).
export function MessagesGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="m20,11c0,.553-.448,1-1,1s-1-.447-1-1c0-2.757-2.243-5-5-5-.552,0-1-.447-1-1s.448-1,1-1c3.86,0,7,3.141,7,7Zm-6,0c0,.553.448,1,1,1s1-.447,1-1c0-1.654-1.346-3-3-3-.552,0-1,.447-1,1s.448,1,1,1,1,.448,1,1ZM13,0c-.552,0-1,.447-1,1s.448,1,1,1c4.962,0,9,4.037,9,9,0,.553.448,1,1,1s1-.447,1-1C24,4.935,19.065,0,13,0Zm3.246,18.351c.552.552.821,1.313.74,2.09-.083.785-.511,1.482-1.175,1.914-1.691,1.099-3.625,1.635-5.549,1.635-2.654,0-5.292-1.019-7.262-2.989C-.399,17.603-.969,12.215,1.646,8.188c.431-.663,1.128-1.092,1.913-1.174.776-.084,1.539.187,2.091.739l4.591,4.591,1.052-1.052c.391-.391,1.023-.391,1.414,0s.391,1.023,0,1.414l-1.052,1.052,4.591,4.591Z" />
    </svg>
  );
}

// "users-alt" (Android vector drawable, from H:\Apps\custom-icons\
// users-alt-android.zip) — citinet-web's Spaces icon, replacing the earlier
// lucide `LayoutGrid` pick (itself a swap-in for the original `Layers`, to
// match citinet-mobile's app-drawer "square.grid.2x2" — this custom glyph
// supersedes that match). Path lifted verbatim from the drawable's
// android:pathData (same grammar as an SVG path's `d`, 0-24 viewport, no
// rescale needed).
export function SpacesGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12,16a4,4,0,1,1,4-4A4,4,0,0,1,12,16ZM5.683,16H1a1,1,0,0,1-1-1A6.022,6.022,0,0,1,5.131,9.084a1,1,0,0,1,1.1,1.266A6.009,6.009,0,0,0,6,12a5.937,5.937,0,0,0,.586,2.57,1,1,0,0,1-.9,1.43ZM17,24H7a1,1,0,0,1-1-1,6,6,0,0,1,12,0A1,1,0,0,1,17,24ZM18,8a4,4,0,1,1,4-4A4,4,0,0,1,18,8ZM6,8a4,4,0,1,1,4-4A4,4,0,0,1,6,8Zm17,8H18.317a1,1,0,0,1-.9-1.43A5.937,5.937,0,0,0,18,12a6.009,6.009,0,0,0-.236-1.65,1,1,0,0,1,1.105-1.266A6.022,6.022,0,0,1,24,15,1,1,0,0,1,23,16Z" />
    </svg>
  );
}

// "person" silhouette (Android vector drawable, from H:\Apps\custom-icons\
// user-android\res\drawable\user_24.xml) — citinet-mobile's default "no
// profile pic yet" avatar glyph (components/hub-avatar.tsx). Kept on its own
// native 512x512 viewBox instead of rescaled into this file's usual 0-24
// space, matching mobile's own choice there (its comment: rescaling by hand
// risks a transcription slip in the arc-radius args). This path pair is
// edge-to-edge on its own viewBox (head touches y=0, shoulders' base touches
// y=512), so rendering it at the full circle size fills it with no built-in
// padding — see AvatarFallback below, which is the actual thing call sites use.
function PersonSilhouetteGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" className={className} aria-hidden="true">
      <path d="M256,298.667c-105.99,0.118-191.882,86.01-192,192C64,502.449,73.551,512,85.333,512h341.333c11.782,0,21.333-9.551,21.333-21.333C447.882,384.677,361.99,298.784,256,298.667z" />
      <path d="M 256 128 m -128, 0 a 128, 128 0 1,0 256,0 a 128, 128 0 1,0 -256,0" />
    </svg>
  );
}

// citinet-mobile's default "no profile pic yet" glyph (components/hub-avatar.tsx)
// is a solid person silhouette on its fixed two-stop brand gradient — but
// citinet-web's old per-user name-hash-colored initials had real value (each
// person reads as visually distinct at a glance, e.g. scanning a member list).
// This keeps mobile's silhouette but restores that per-name color variety: with
// a `name`, the background is picked from the same rotation citinet-web's old
// avatar-color helpers used (stable per name, not random); without one, it
// falls back to mobile's own fixed brand gradient. The glyph itself is plain
// white rather than mobile's fixed navy tint (computed for its one fixed blue
// gradient specifically) so it reads cleanly against any of the rotation colors.
// `className` controls size/shape — pass the same w-*/h-*/rounded-* classes the
// old initials div used; this owns its own bg-gradient/flex/overflow so callers
// don't repeat that part.
const AVATAR_GRADIENTS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500', 'from-violet-500 to-purple-500',
  'from-sky-500 to-blue-500', 'from-lime-500 to-green-500',
];
function nameGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

export function AvatarFallback({ className, name }: { className?: string; name?: string }) {
  const gradient = name ? nameGradient(name) : 'from-[#300feb] to-[#0d5adf]';
  return (
    <div className={`bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden ${className ?? ''}`}>
      <PersonSilhouetteGlyph className="w-full h-full text-white" />
    </div>
  );
}

// "shop" (Android vector drawable, from H:\Apps\custom-icons\shop-android\
// res\drawable\shop_24.xml) — citinet-web's default "no logo yet" glyph for
// vendors/businesses, replacing their old first-letter-of-name initial.
// Businesses aren't people, so this deliberately doesn't reuse AvatarFallback's
// person silhouette — same gradient-rotation background (still per-name-stable
// color variety), different glyph. Path lifted verbatim (0-24 viewBox matches
// the source vector's own declared 24dp width/height, no rescale needed).
function ShopGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19,17a5.994,5.994,0,0,1-3-.806A5.994,5.994,0,0,1,13,17H11a5.938,5.938,0,0,1-3-.818A5.936,5.936,0,0,1,5,17H4a5.949,5.949,0,0,1-3-.813V21a3,3,0,0,0,3,3H20a3,3,0,0,0,3-3V16.188A5.958,5.958,0,0,1,20,17Z" />
      <path d="M17,0V6H15V0H9V6H7V0H2.2L.024,9.783,0,11a4,4,0,0,0,4,4H5a3.975,3.975,0,0,0,3-1.382A3.975,3.975,0,0,0,11,15h2a3.99,3.99,0,0,0,3-1.357A3.99,3.99,0,0,0,19,15h1a4,4,0,0,0,4-4V10L21.8,0Z" />
    </svg>
  );
}

/** Vendor/business equivalent of AvatarFallback — same per-name gradient
 * rotation, shop glyph instead of a person. `className` controls size/shape,
 * same as AvatarFallback. */
export function VendorAvatarFallback({ className, name }: { className?: string; name?: string }) {
  const gradient = name ? nameGradient(name) : 'from-[#300feb] to-[#0d5adf]';
  return (
    <div className={`bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden ${className ?? ''}`}>
      <ShopGlyph className="w-[55%] h-[55%] text-white" />
    </div>
  );
}

// "bullseyeArrow" — citinet-mobile's Initiatives icon (its app drawer's
// Initiatives row). Path lifted verbatim (0-24 viewBox despite the source
// svg also declaring width/height="512" — that's just export metadata, not
// the coordinate space the path data is actually in, so no rescale needed).
export function InitiativesGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24,12c0,6.62-5.38,12-12,12S0,18.62,0,12,5.38,0,12,0c.19,0,.38,0,.57,.01,.83,.04,1.47,.74,1.43,1.57-.04,.83-.72,1.45-1.57,1.43-.14,0-.29-.01-.43-.01C7.04,3,3,7.04,3,12s4.04,9,9,9,9-4.04,9-9c0-.14,0-.29-.01-.43-.04-.83,.6-1.53,1.43-1.57,.85-.03,1.53,.6,1.57,1.43,0,.19,.01,.38,.01,.57Zm-13.09-3.85c.8-.23,1.26-1.05,1.04-1.85s-1.06-1.26-1.85-1.04c-3,.85-5.09,3.62-5.09,6.74,0,3.86,3.14,7,7,7,3.12,0,5.89-2.09,6.74-5.09,.23-.8-.24-1.63-1.04-1.85-.8-.23-1.63,.24-1.85,1.04-.48,1.71-2.07,2.91-3.85,2.91-2.21,0-4-1.79-4-4,0-1.78,1.2-3.37,2.91-3.85Zm.03,2.79c-.59,.59-.59,1.54,0,2.12,.29,.29,.68,.44,1.06,.44s.77-.15,1.06-.44l5.06-5.06h2.38c.4,0,.78-.16,1.06-.44l2-2c.43-.43,.56-1.07,.33-1.63-.23-.56-.78-.93-1.39-.93h-1.5V1.5c0-.61-.37-1.15-.93-1.39-.56-.23-1.21-.1-1.63,.33l-2,2c-.28,.28-.44,.66-.44,1.06v2.38l-5.06,5.06Z" />
    </svg>
  );
}

// "menu-dots" (Android vector drawable, from H:\Apps\custom-icons\
// menu-dots-android) — citinet-web's sidebar/bottom-nav "More" trigger,
// replacing the lucide `Grid3x3` waffle icon. The source drawable's
// pathData draws each dot as a pair of arcs in a 512-unit coordinate space
// (despite the file's own declared 24dp viewport, which the paths ignore),
// so this uses viewBox 0 0 512 512 — matching the coordinate space the
// numbers are actually in — and three <circle>s in place of the arc pairs,
// same shape, much easier to read.
export function MoreGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="458.667" cy="256" r="53.333" />
      <circle cx="256" cy="256" r="53.333" />
      <circle cx="53.333" cy="256" r="53.333" />
    </svg>
  );
}
