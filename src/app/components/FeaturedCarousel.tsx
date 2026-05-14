import { useRef } from 'react';
import Slider from 'react-slick';
import { Play } from 'lucide-react';
import type { FeaturedItem } from '../types/featured';
import { hubService } from '../services/hubService';

interface FeaturedCarouselProps {
  items: FeaturedItem[];
  hubSlug: string;
  onPostClick?: (postId: string) => void;
}

const GRADIENT_MAP: Record<string, string> = {
  ANNOUNCEMENT: 'from-purple-600 via-purple-500 to-indigo-600',
  DISCUSSION:   'from-blue-600 via-blue-500 to-cyan-600',
  PROJECT:      'from-emerald-600 via-emerald-500 to-teal-600',
  REQUEST:      'from-orange-500 via-amber-500 to-yellow-500',
  EVENT:        'from-pink-600 via-rose-500 to-red-500',
  CUSTOM:       'from-slate-700 via-slate-600 to-slate-500',
};

const LABEL_BG: Record<string, string> = {
  ANNOUNCEMENT: 'bg-purple-500/90',
  DISCUSSION:   'bg-blue-500/90',
  PROJECT:      'bg-emerald-500/90',
  REQUEST:      'bg-orange-500/90',
  EVENT:        'bg-pink-500/90',
};

function cardGradient(label?: string) {
  return GRADIENT_MAP[(label ?? '').toUpperCase()] ?? GRADIENT_MAP.CUSTOM;
}

function labelBg(label?: string) {
  return LABEL_BG[(label ?? '').toUpperCase()] ?? 'bg-slate-600/90';
}

const MOCK_ITEMS: FeaturedItem[] = [
  {
    id:            '__placeholder',
    type:          'custom',
    title:         'Welcome to your community hub',
    caption:       'Admins can pin posts or add custom cards to feature them here.',
    categoryLabel: 'ANNOUNCEMENT',
    mediaType:     'gradient',
    displayOrder:  0,
    createdAt:     new Date().toISOString(),
  },
];

export function FeaturedCarousel({ items, hubSlug, onPostClick }: FeaturedCarouselProps) {
  const sliderRef = useRef<Slider>(null);
  const displayItems = items.length > 0 ? items : MOCK_ITEMS;

  const settings = {
    dots: true,
    infinite: displayItems.length > 1,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: displayItems.length > 1,
    autoplaySpeed: 7000,
    arrows: false,
    pauseOnHover: true,
    customPaging: () => (
      <div className="w-2 h-2 rounded-full bg-white/40 hover:bg-white/70 transition-all duration-200" />
    ),
    dotsClass: 'slick-dots !bottom-4 flex items-center justify-center gap-2',
  };

  function resolveMediaUrl(item: FeaturedItem): string | null {
    // Pinned posts: filename stored separately — always construct fresh so the
    // URL reflects the current tunnelUrl (never stale).
    if (item.mediaFileName) return hubService.getPublicFileUrl(hubSlug, item.mediaFileName);
    if (item.imageUrl) {
      // Custom card uploads store the full URL at upload time, which may be a
      // localhost URL (admin was on the hub machine) or an old tunnel address.
      // Extract the filename and re-resolve via the current tunnelUrl so the
      // image loads on any device, matching how pinned-post media works.
      const m = item.imageUrl.match(/\/api\/public\/files\/([^?#]+)/);
      if (m) return hubService.getPublicFileUrl(hubSlug, decodeURIComponent(m[1]));
      return item.imageUrl; // External URL (e.g. unsplash.com) — use as-is
    }
    return null;
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      <Slider ref={sliderRef} {...settings}>
        {displayItems.map((item) => {
          const mediaUrl = resolveMediaUrl(item);
          const clickable = !!item.refId && !!onPostClick;

          return (
            <div key={item.id} className="px-0.5 sm:px-1">
              <div
                onClick={() => clickable && onPostClick!(item.refId!)}
                className={`relative w-full h-52 md:h-64 rounded-xl sm:rounded-2xl overflow-hidden bg-zinc-900 shadow-lg hover:shadow-xl transition-shadow duration-300 group ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {/* Background */}
                {item.mediaType === 'video' && mediaUrl ? (
                  <video
                    src={mediaUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : item.mediaType === 'image' && mediaUrl ? (
                  <img
                    src={mediaUrl}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${cardGradient(item.categoryLabel)}`} />
                )}

                {/* Gradient scrim — heavy at bottom for legibility */}
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.88) 100%)' }}
                />

                {/* Video badge */}
                {item.mediaType === 'video' && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-medium">
                    <Play className="w-3 h-3 fill-white" />
                    Video
                  </div>
                )}

                {/* Text content — bottom-left */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 text-white">
                  {/* Compact meta: avatar · username · category chip */}
                  {(item.authorUsername || item.categoryLabel) && (
                    <div className="flex items-center gap-1.5 mb-2">
                      {item.authorUsername && (() => {
                        const avatarUrl = item.authorId ? hubService.getAvatarUrl(hubSlug, item.authorId) : null;
                        return avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={item.authorUsername}
                            className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-white/30"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-[9px] font-bold shrink-0 ring-1 ring-white/30">
                            {item.authorUsername.charAt(0).toUpperCase()}
                          </div>
                        );
                      })()}
                      {item.authorUsername && (
                        <span className="text-xs text-white/70 font-medium">{item.authorUsername}</span>
                      )}
                      {item.categoryLabel && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide backdrop-blur-sm ${labelBg(item.categoryLabel)} text-white/95`}>
                          {item.categoryLabel}
                        </span>
                      )}
                    </div>
                  )}
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight line-clamp-2 leading-tight mb-1">
                    {item.title}
                  </h3>
                  {item.caption && (
                    <p className="text-white/75 text-sm line-clamp-1 max-w-[80%]">{item.caption}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </Slider>
    </div>
  );
}
