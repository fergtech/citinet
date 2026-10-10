import { useEffect, useRef, useState } from 'react';

export interface SectionPill {
  /** DOM id of the section element this pill jumps to. */
  id: string;
  label: string;
}

/** Give every section element this class so the sticky bar doesn't cover its heading after a jump. */
export const SECTION_SCROLL_MARGIN = 'scroll-mt-20';

/** Nearest ancestor that actually scrolls vertically (falls back to the document element). */
function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return document.documentElement;
}

/**
 * Sticky "jump to section" row for long tabs. Highlights the section currently in view and
 * scrolls to a section on click. Pills whose section isn't rendered (e.g. a card hidden by
 * state) are left out, so a pill never jumps to nothing.
 */
export function SectionPills({ sections }: { sections: SectionPill[] }) {
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const rowRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const key = sections.map(s => s.id).join('|');

  // Track which sections exist in the DOM; they mount/unmount as data loads.
  useEffect(() => {
    const ids = key.split('|').filter(Boolean);
    const scan = () => {
      // Non-empty only: a wrapper whose child rendered null (e.g. health panel on an old sidecar) doesn't count.
      const found = ids.filter(id => (document.getElementById(id)?.childElementCount ?? 0) > 0);
      setPresent(prev => (prev.join('|') === found.join('|') ? prev : found));
    };
    scan();
    const root = wrapRef.current?.parentElement;
    if (!root) return;
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(scan); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [key]);

  // Scroll-spy: the active section is the last one whose top has passed the line under the bar
  // (or the last section once the page can't scroll any further). A pill click locks the
  // highlight to the clicked pill until the user scrolls by hand, since a smooth scroll to a short
  // or bottom-of-page section can't always bring it to the line.
  useEffect(() => {
    if (present.length === 0) return;
    // The app scrolls inside an inner container, not the document, so find the real one.
    const scroller = scrollParent(wrapRef.current);
    const update = () => {
      if (lockRef.current) return;
      const top = scroller === document.documentElement ? 0 : scroller.getBoundingClientRect().top;
      const line = top + 100; // just below the sticky bar (top-4 + bar height); matches scroll-mt-20 + slack
      const atBottom = scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      let current = present[0];
      for (const id of present) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      if (atBottom) current = present[present.length - 1];
      setActive(current);
    };
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    const unlock = () => { lockRef.current = false; };
    update();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', unlock, { passive: true });
    window.addEventListener('touchmove', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', unlock);
      window.removeEventListener('touchmove', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [present]);

  // Keep the active pill visible in the horizontally scrolling row (mobile).
  useEffect(() => {
    const btn = rowRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    btn?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  const jump = (id: string) => {
    lockRef.current = true;
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const shown = sections.filter(s => present.includes(s.id));
  // Always render the wrapper (just hidden when pointless) so the observer above keeps its anchor.
  return (
    <div ref={wrapRef} className={shown.length < 2 ? 'hidden' : 'sticky top-4 z-20 -mx-1 px-1 py-2 backdrop-blur-md cn-glass rounded-2xl'}>
      <div ref={rowRef} className="flex gap-2 overflow-x-auto no-scrollbar">
        {shown.map(s => (
          <button
            key={s.id}
            type="button"
            data-active={active === s.id}
            onClick={() => jump(s.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
              active === s.id
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border-transparent'
                : 'cn-surface-2 cn-text-2 cn-border hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
