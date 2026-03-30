import Slider from 'react-slick';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface FeaturedItem {
  id: string;
  image: string;
  title: string;
  excerpt: string;
  author: {
    name: string;
    avatar: string;
  };
}

interface FeaturedCarouselProps {
  items: FeaturedItem[];
}

function NextArrow(props: any) {
  const { onClick } = props;
  return (
    <button
      onClick={onClick}
      className="absolute right-4 bottom-4 z-10 w-10 h-10 bg-white/20 backdrop-blur-md hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
    >
      <ChevronRight className="w-5 h-5 text-white" />
    </button>
  );
}

function PrevArrow(props: any) {
  const { onClick } = props;
  return (
    <button
      onClick={onClick}
      className="absolute left-4 bottom-4 z-10 w-10 h-10 bg-white/20 backdrop-blur-md hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
    >
      <ChevronLeft className="w-5 h-5 text-white" />
    </button>
  );
}

export function FeaturedCarousel({ items }: FeaturedCarouselProps) {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 6000,
    nextArrow: <NextArrow />,
    prevArrow: <PrevArrow />,
    appendDots: (dots: any) => (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <ul className="flex gap-2">{dots}</ul>
      </div>
    ),
    customPaging: () => (
      <div className="w-2 h-2 bg-white/40 hover:bg-white/60 rounded-full transition-all" />
    ),
  };

  return (
    <div className="relative w-full rounded-[14px] overflow-hidden" style={{ boxShadow: 'var(--shadow-base)' }}>
      <Slider {...settings}>
        {items.map((item) => (
          <div key={item.id} className="relative">
            <div className="relative aspect-[2/1] overflow-hidden">
              {/* Background image */}
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
              />
              
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
              
              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                {/* Author info */}
                <div className="flex items-center gap-2 mb-3">
                  <img
                    src={item.author.avatar}
                    alt={item.author.name}
                    className="w-7 h-7 rounded-full border-2 border-white/50"
                  />
                  <span className="text-xs text-white/90">
                    {item.author.name}
                  </span>
                  <span className="text-xs text-white/50">·</span>
                  <span className="text-[10px] text-white/70 uppercase tracking-wider">
                    Featured
                  </span>
                </div>
                
                {/* Title */}
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-2 line-clamp-2 leading-tight">
                  {item.title}
                </h3>
                
                {/* Excerpt */}
                <p className="text-sm text-white/80 line-clamp-2 max-w-2xl">
                  {item.excerpt}
                </p>
              </div>
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
}
