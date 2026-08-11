// Session-level tracker for whether the user has navigated within the app
// at least once since this page load. Resets naturally on a hard refresh
// or a direct link — exactly the cases where navigate(-1) has nothing real
// to go back to (a dead click, or worse on the installed standalone PWA,
// which has no browser chrome to fall back on at all).
//
// A module-level flag (not React state) is enough: onBack handlers read the
// current value at click time, they don't need a re-render when it flips.

let hasNavigated = false;

export function markInAppNavigation(): void {
  hasNavigated = true;
}

export function hasNavigationHistory(): boolean {
  return hasNavigated;
}
