import { useEffect, useRef } from 'react';

/**
 * A muted/looping autoplay <video> that keeps playing correctly across the
 * two ways a mounted-but-unattended video actually stalls on the web: the
 * browser suspending it once it scrolls out of view (common with several of
 * these mounted at once — FilesScreen's grid, FeaturedCarousel's slides,
 * which react-slick keeps all mounted rather than just the active one), and
 * the tab itself being backgrounded and resumed. A plain `<video autoPlay>`
 * only ever autoplays once, at mount — neither of those re-triggers it, so
 * it's left stuck on its last frame until the page is hard-reloaded.
 *
 * The IntersectionObserver here is deliberately kept alive for the video's
 * whole lifetime (unlike e.g. FilesScreen's own thumbnail-loading observer,
 * which is intentionally one-shot — it only needs to fire once to know when
 * to start fetching the file) — pausing/resuming needs to keep responding
 * to visibility for as long as the element exists, not just once.
 */
export function AutoplayVideo({
  src,
  className,
  preload = 'auto',
  onError,
}: {
  src: string;
  className?: string;
  preload?: 'auto' | 'metadata' | 'none';
  onError?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const tryPlay = () => {
      el.play().catch(() => {
        // Autoplay can be legitimately rejected (e.g. a stricter browser
        // policy) — nothing to recover from here, it just stays paused.
      });
    };

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) tryPlay();
        else el.pause();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tryPlay();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload={preload}
      className={className}
      onError={onError}
    />
  );
}
