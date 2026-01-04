import { useRef } from 'react';
import Slider from 'react-slick';

interface FeaturedItem {
  id: string;
  type: 'event' | 'announcement' | 'marketplace' | 'community';
  title: string;
  description: string;
  imageUrl: string;
}

const featuredItems: FeaturedItem[] = [
  {
    id: '1',
    type: 'event',
    title: 'Community Meetup',
    description: 'Join us this Saturday at Highland Park',
    imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=400&fit=crop'
  },
  {
    id: '2',
    type: 'marketplace',
    title: 'Local Coffee Shop',
    description: '20% off with node membership',
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=400&fit=crop'
  },
  {
    id: '3',
    type: 'announcement',
    title: 'Network Upgrade',
    description: 'Faster speeds coming next week',
    imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop'
  }
];

export function FeaturedCarousel() {
  const sliderRef = useRef<Slider>(null);

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 5000,
    arrows: false,
    pauseOnHover: true,
    customPaging: () => (
      <div className="w-2 h-2 rounded-full bg-white/40 hover:bg-white/70 transition-all duration-200" />
    ),
    dotsClass: 'slick-dots !bottom-4 flex items-center justify-center gap-2'
  };

  return (
    <div className="w-full max-w-full overflow-hidden">
      <Slider ref={sliderRef} {...settings}>
        {featuredItems.map((item) => (
          <div key={item.id} className="px-0.5 sm:px-1">
            <div className="relative w-full h-56 md:h-64 rounded-xl sm:rounded-2xl overflow-hidden bg-zinc-900 shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer group">
              <img 
                src={item.imageUrl} 
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-white">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <span className="px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wide bg-purple-500/90 backdrop-blur-sm ring-1 ring-white/20">
                    {item.type}
                  </span>
                </div>
                <h3 className="mb-1 sm:mb-2 text-lg sm:text-xl md:text-2xl font-semibold tracking-tight">{item.title}</h3>
                <p className="text-white/90 text-sm md:text-base font-light">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
}