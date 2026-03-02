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
    autoplaySpeed: 5000,
    arrows: false,
    pauseOnHover: true,
    customPaging: () => (
      <div className="w-2 h-2 rounded-full bg-white/40 hover:bg-white/70 transition-all duration-200" />
    ),
    dotsClass: 'slick-dots !bottom-4 flex items-center justify-center gap-2',
  };

  function resolveMediaUrl(item: FeaturedItem): string | null {
    if (item.imageUrl) return item.imageUrl;
    if (item.mediaFileName) return hubService.getPublicFileUrl(hubSlug, item.mediaFileName);
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
                className={`relative w-full h-56 md:h-64 rounded-xl sm:rounded-2xl overflow-hidden bg-zinc-900 shadow-lg hover:shadow-xl transition-shadow duration-300 group ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {/* Background */}
                {item.mediaType === 'video' && mediaUrl ? (
                  <video
                    src={mediaUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
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

                {/* Scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Video badge */}
                {item.mediaType === 'video' && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-medium">
                    <Play className="w-3 h-3 fill-white" />
                    Video
                  </div>
                )}

                {/* Text content */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-white">
                  {item.categoryLabel && (
                    <div className="mb-2 sm:mb-3">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wide backdrop-blur-sm ring-1 ring-white/20 ${labelBg(item.categoryLabel)}`}>
                        {item.categoryLabel}
                      </span>
                    </div>
                  )}
                  <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight line-clamp-2 mb-1">
                    {item.title}
                  </h3>
                  {item.caption && (
                    <p className="text-white/80 text-sm font-light line-clamp-2">{item.caption}</p>
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
