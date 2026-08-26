// CSS `100dvh` is supposed to track the true visible viewport, but on iOS —
// especially in standalone (home-screen) PWA mode, with no browser chrome to
// even account for — it can get stuck at a stale value on first load and
// only recalculate once a real scroll/resize event fires. That shows up as
// unused space below the bottom nav until the user drags the screen.
//
// This mirrors the fix a real production PWA landed after hitting the exact
// same bug (github.com/we-promise/sure#835, PRs #995/#1007): measure plain
// `window.innerHeight` — not `visualViewport.height`, which their fix
// deliberately avoided — into a CSS custom property that full-height screens
// read instead of trusting `dvh`'s own recalculation timing. Their follow-up
// PR also *removed* a scroll-nudge/ResizeObserver layer they'd tried, noting
// it was racy ("the script doesn't load properly, or loads too early") —
// kept this deliberately minimal for the same reason.
export function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
