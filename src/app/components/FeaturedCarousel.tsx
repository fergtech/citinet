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

const typeColors = {
  event: 'bg-purple-500',
  announcement: 'bg-blue-500',
  marketplace: 'bg-pink-500',
  community: 'bg-green-500'
};

export function FeaturedCarousel() {
  const sliderRef = useRef<Slider>(null);

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 4000,
    arrows: false,
    customPaging: () => (
      <div className="w-2 h-2 rounded-full bg-white/40 hover:bg-white/60 transition-colors mt-4" />
    ),
    dotsClass: 'slick-dots !bottom-3 flex items-center justify-center gap-2'
  };

  return (
    <div className="w-full">
      <Slider ref={sliderRef} {...settings}>
        {featuredItems.map((item) => (
          <div key={item.id} className="px-1">
            <div className="relative w-full h-48 md:h-64 lg:h-80 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-purple-600">
              <img 
                src={item.imageUrl} 
                alt={item.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 md:px-3 md:py-1 rounded-md text-xs md:text-sm uppercase tracking-wide ${typeColors[item.type]}`}>
                    {item.type}
                  </span>
                </div>
                <h3 className="mb-1 text-lg md:text-xl lg:text-2xl font-bold">{item.title}</h3>
                <p className="text-white/90 text-sm md:text-base">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
}