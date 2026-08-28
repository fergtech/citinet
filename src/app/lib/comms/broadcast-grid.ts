// A desktop canvas is landscape, unlike the portrait phone screen this grid
// was originally designed for — a single participant still fills the whole
// frame (immersive, like Zoom/Discord's solo speaker view), but 2+
// participants use a real CSS grid (see BroadcastOverlay's canvas) that
// keeps each tile close to a normal 16:9 video shape instead of stretching
// full-width rows down to a "stubby" fraction of the height. This just picks
// the fallback avatar size for a tile with no camera track.
export function avatarSizeFor(participantCount: number): number {
  if (participantCount <= 1) return 104;
  if (participantCount === 2) return 84;
  return 56;
}
