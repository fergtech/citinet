// Dot-grid wallpaper for the public share pages (ShareFilePage, ShareNotePage,
// SharePostPage, ShareSpacePage, ShareVendorPage, PublicProfilePage). Visually
// the same treatment as HubBackground.tsx's default branch (rich radial
// gradients + a subtle dot grid), but hardcoded to the dark variant rather
// than reading the theme-reactive --cn-wallpaper token: these pages have no
// theme toggle and are always dark, so they'd otherwise mismatch (light
// wallpaper behind a hardcoded-dark card) for a visitor whose system is in
// light mode. Also has no HubContext dependency, unlike HubBackground, since
// public/anonymous visitors are never inside a HubProvider.
export function ShareWallpaper() {
  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        background: '#09090b',
      }}
    >
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="cn-share-bg-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#a1a1aa" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cn-share-bg-dots)" opacity="0.07" />
      </svg>
    </div>
  );
}
