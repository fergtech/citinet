// Small shared custom SVG icons that mirror citinet-mobile's own custom
// glyphs (components/ui/custom-icon.tsx) — used where citinet-web wants the
// same iconography as the mobile app instead of a generic lucide-react icon.

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
