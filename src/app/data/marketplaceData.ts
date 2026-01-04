export interface MarketItem {
  id: string;
  title: string;
  price: number;
  vendor: string;
  vendorId: string;
  distance: number;
  category: 'FOOD' | 'SERVICES' | 'ELECTRONICS' | 'EVENTS' | 'OTHER';
  imageUrl: string;
  featured?: boolean;
  condition?: 'new' | 'like-new' | 'used';
  description?: string;
  postedDate?: string;
}

export const marketItems: MarketItem[] = [
  {
    id: '1',
    title: 'Coffee Shop: Daily Special',
    price: 4.50,
    vendor: 'Highland Brew',
    vendorId: 'vendor-1',
    distance: 0.3,
    category: 'FOOD',
    imageUrl: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=600&h=600&fit=crop',
    featured: true,
    description: 'Start your day right with our daily coffee special! Freshly roasted beans from local farms, expertly crafted by our baristas. Available all day while supplies last.',
    postedDate: 'Today'
  },
  {
    id: '2',
    title: 'WiFi Antenna Installation',
    price: 150,
    vendor: 'TechConnect Local',
    vendorId: 'vendor-2',
    distance: 0.5,
    category: 'SERVICES',
    imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&h=600&fit=crop',
    featured: true,
    description: 'Professional installation and setup of mesh network WiFi antennas for optimal coverage in your home or business. Includes hardware, configuration, and network optimization.',
    postedDate: '2 days ago'
  },
  {
    id: '3',
    title: 'Fresh Organic Vegetables',
    price: 12,
    vendor: 'Highland Community Garden',
    vendorId: 'vendor-3',
    distance: 0.2,
    category: 'FOOD',
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&h=600&fit=crop',
    description: 'Farm-fresh organic vegetables harvested this morning! Seasonal selection including tomatoes, lettuce, peppers, and herbs. Supporting community gardens and sustainable agriculture.',
    postedDate: 'Today'
  },
  {
    id: '4',
    title: 'Home Network Setup',
    price: 75,
    vendor: 'Local Tech Support',
    vendorId: 'vendor-4',
    distance: 0.4,
    category: 'SERVICES',
    imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=600&fit=crop',
    description: 'Complete home network setup and troubleshooting. We\'ll configure your router, secure your network, optimize WiFi coverage, and connect all your devices. Same-day service available.',
    postedDate: '3 days ago'
  },
  {
    id: '5',
    title: 'Used Laptop - Like New',
    price: 350,
    vendor: 'Mike\'s Electronics',
    vendorId: 'vendor-5',
    distance: 0.8,
    category: 'ELECTRONICS',
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&h=600&fit=crop',
    condition: 'like-new',
    description: 'Dell XPS 13 in excellent condition. Intel i5 processor, 8GB RAM, 256GB SSD. Barely used, comes with charger and original packaging. Perfect for students or remote work.',
    postedDate: '1 week ago'
  },
  {
    id: '6',
    title: 'Community Yoga Class',
    price: 15,
    vendor: 'Highland Wellness',
    vendorId: 'vendor-6',
    distance: 0.6,
    category: 'EVENTS',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=600&fit=crop',
    description: 'Join our weekly community yoga class! All levels welcome. Mats provided or bring your own. Focus on mindfulness, flexibility, and community connection. Every Saturday at 10am.',
    postedDate: '5 days ago'
  },
  {
    id: '7',
    title: 'Handmade Pottery',
    price: 45,
    vendor: 'Local Artisan',
    vendorId: 'vendor-7',
    distance: 0.4,
    category: 'OTHER',
    imageUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600&h=600&fit=crop',
    condition: 'new',
    description: 'Beautiful handcrafted ceramic bowls and mugs made by local artisans. Each piece is unique, food-safe, and dishwasher friendly. Support local art and craftsmanship!',
    postedDate: '4 days ago'
  },
  {
    id: '8',
    title: 'Bicycle Repair',
    price: 30,
    vendor: 'Fix-It Shop',
    vendorId: 'vendor-8',
    distance: 0.7,
    category: 'SERVICES',
    imageUrl: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&h=600&fit=crop',
    description: 'Mobile bike repair service - we come to you! Tune-ups, flat fixes, brake adjustments, and more. Quick turnaround, experienced mechanics. Keep your bike running smoothly.',
    postedDate: '2 days ago'
  },
  {
    id: '9',
    title: 'iPhone 13 - Excellent',
    price: 425,
    vendor: 'Tech Resale',
    vendorId: 'vendor-9',
    distance: 0.9,
    category: 'ELECTRONICS',
    imageUrl: 'https://images.unsplash.com/photo-1592286927505-b48ed7ba7a6b?w=600&h=600&fit=crop',
    condition: 'used',
    description: 'iPhone 13 in excellent working condition. 128GB storage, unlocked for all carriers. Battery health at 89%. Minor cosmetic wear but screen is perfect. Comes with case.',
    postedDate: '1 week ago'
  }
];
