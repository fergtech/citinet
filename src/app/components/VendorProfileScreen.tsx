import { ArrowLeft, MapPin, Clock, Phone, Globe, Mail, Store } from 'lucide-react';

export interface Vendor {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  category: string;
  location: string;
  distance: number;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string;
  memberSince: string;
  totalListings: number;
  specialty: string;
}

interface VendorProfileScreenProps {
  vendor: Vendor;
  vendorListings: Array<{
    id: string;
    title: string;
    price: number;
    imageUrl: string;
    category: string;
    featured?: boolean;
  }>;
  onBack: () => void;
  onItemClick: (itemId: string) => void;
}

export const mockVendors: Vendor[] = [
  {
    id: 'vendor-1',
    name: 'Highland Brew',
    description: 'Family-owned coffee shop serving Highland Park since 2018. We roast our beans locally and source from sustainable farms. Stop by for your daily caffeine fix and community connection!',
    category: 'Food & Beverage',
    location: 'Highland Park',
    distance: 0.3,
    phone: '(555) 123-4567',
    email: 'hello@highlandbrew.local',
    hours: 'Mon-Fri 6am-6pm, Sat-Sun 7am-5pm',
    memberSince: 'January 2024',
    totalListings: 8,
    specialty: 'Specialty Coffee & Pastries'
  },
  {
    id: 'vendor-2',
    name: 'TechConnect Local',
    description: 'Your neighborhood tech support and network installation experts. We believe everyone deserves reliable internet access. Specializing in mesh networks, home WiFi, and community connectivity solutions.',
    category: 'Services',
    location: 'Highland Park',
    distance: 0.5,
    phone: '(555) 234-5678',
    email: 'support@techconnect.local',
    hours: 'Mon-Sat 9am-7pm',
    memberSince: 'March 2024',
    totalListings: 12,
    specialty: 'Network Installation & IT Support'
  },
  {
    id: 'vendor-3',
    name: 'Highland Community Garden',
    description: 'Non-profit community garden growing fresh, organic produce for our neighborhood. All proceeds support local food access programs. Join us for volunteer days every Saturday morning!',
    category: 'Food & Beverage',
    location: 'Highland Park',
    distance: 0.2,
    email: 'info@highlandgarden.local',
    website: 'highlandgarden.local',
    hours: 'Daily 7am-7pm',
    memberSince: 'February 2024',
    totalListings: 15,
    specialty: 'Organic Produce & Community Agriculture'
  },
  {
    id: 'vendor-4',
    name: 'Local Tech Support',
    description: 'Affordable, friendly tech help for Highland Park residents. No job too small! From printer setup to smart home installation, we keep our community connected.',
    category: 'Services',
    location: 'Highland Park',
    distance: 0.4,
    phone: '(555) 345-6789',
    hours: 'Mon-Fri 10am-6pm',
    memberSince: 'April 2024',
    totalListings: 6,
    specialty: 'Home Tech & Device Setup'
  },
  {
    id: 'vendor-5',
    name: 'Mike\'s Electronics',
    description: 'Buying, selling, and trading quality used electronics since 2020. Every device tested and guaranteed. Supporting sustainable tech consumption in our community.',
    category: 'Electronics',
    location: 'Highland Park',
    distance: 0.8,
    phone: '(555) 456-7890',
    email: 'mike@mikeselectronics.local',
    hours: 'Tue-Sat 11am-7pm',
    memberSince: 'January 2024',
    totalListings: 24,
    specialty: 'Refurbished Electronics'
  },
  {
    id: 'vendor-6',
    name: 'Highland Wellness',
    description: 'Community wellness studio offering yoga, meditation, and movement classes for all levels. We believe wellness should be accessible to everyone in our neighborhood.',
    category: 'Health & Wellness',
    location: 'Highland Park',
    distance: 0.6,
    phone: '(555) 567-8901',
    email: 'namaste@highlandwellness.local',
    website: 'highlandwellness.local',
    hours: 'Mon-Sun 6am-8pm',
    memberSince: 'February 2024',
    totalListings: 10,
    specialty: 'Yoga & Wellness Classes'
  },
  {
    id: 'vendor-7',
    name: 'Local Artisan',
    description: 'Handcrafted pottery, ceramics, and home goods made right here in Highland Park. Each piece is unique and made with love. Custom orders welcome!',
    category: 'Arts & Crafts',
    location: 'Highland Park',
    distance: 0.4,
    email: 'create@localartisan.local',
    hours: 'By appointment',
    memberSince: 'March 2024',
    totalListings: 18,
    specialty: 'Handmade Pottery & Ceramics'
  },
  {
    id: 'vendor-8',
    name: 'Fix-It Shop',
    description: 'Mobile repair service for bikes, small appliances, and more. Reducing waste, one repair at a time. We come to you! Supporting the right to repair movement.',
    category: 'Services',
    location: 'Highland Park',
    distance: 0.7,
    phone: '(555) 678-9012',
    email: 'repairs@fixitshop.local',
    hours: 'Mon-Sat 8am-6pm',
    memberSince: 'January 2024',
    totalListings: 9,
    specialty: 'Bicycle & Small Appliance Repair'
  },
  {
    id: 'vendor-9',
    name: 'Tech Resale',
    description: 'Premium pre-owned smartphones, tablets, and accessories. All devices professionally refurbished with warranty. Making quality tech affordable for our community.',
    category: 'Electronics',
    location: 'Highland Park',
    distance: 0.9,
    phone: '(555) 789-0123',
    email: 'sales@techresale.local',
    hours: 'Mon-Sat 10am-7pm',
    memberSince: 'April 2024',
    totalListings: 16,
    specialty: 'Refurbished Smartphones & Tablets'
  },
  {
    id: 'vendor-10',
    name: 'Highland Heritage',
    description: 'Preserving and sharing Highland Park\'s rich history through walking tours, storytelling events, and educational programs. Join us to explore where we come from!',
    category: 'Events & Education',
    location: 'Highland Park',
    distance: 0.6,
    email: 'history@highlandheritage.local',
    website: 'highlandheritage.local',
    hours: 'Tours: Sun 2pm',
    memberSince: 'February 2024',
    totalListings: 5,
    specialty: 'Historical Tours & Community Education'
  }
];

export function VendorProfileScreen({ vendor, vendorListings, onBack, onItemClick }: VendorProfileScreenProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-900 dark:text-white" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Vendor Profile</h1>
        </div>
      </header>

      {/* Profile Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          
          {/* Vendor Header Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 overflow-hidden">
            {/* Cover gradient */}
            <div className="h-32 bg-gradient-to-br from-blue-600 to-purple-600"></div>
            
            {/* Profile info */}
            <div className="px-6 pb-6">
              {/* Avatar */}
              <div className="flex items-end gap-4 -mt-16 mb-4">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg ring-4 ring-white dark:ring-zinc-900">
                  {vendor.avatar || vendor.name.charAt(0).toUpperCase()}
                </div>
                <div className="mb-2 flex-1">
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    {vendor.name}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{vendor.category}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                    {vendor.totalListings}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Listings</div>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                    {vendor.distance}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Miles Away</div>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                    {vendor.memberSince.split(' ')[0]}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Member Since</div>
                </div>
              </div>

              {/* Specialty */}
              <div className="mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Store className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="font-medium text-slate-900 dark:text-white">{vendor.specialty}</span>
                </div>
              </div>

              {/* Contact Button */}
              <button title="Contact Vendor" className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl">
                Contact Vendor
              </button>
            </div>
          </div>

          {/* About Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">About</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {vendor.description}
            </p>
          </div>

          {/* Contact Information */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span className="text-slate-700 dark:text-slate-300">
                  {vendor.location} · {vendor.distance} miles away
                </span>
              </div>
              {vendor.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <a href={`tel:${vendor.phone}`} className="text-purple-600 dark:text-purple-400 hover:underline">
                    {vendor.phone}
                  </a>
                </div>
              )}
              {vendor.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <a href={`mailto:${vendor.email}`} className="text-purple-600 dark:text-purple-400 hover:underline">
                    {vendor.email}
                  </a>
                </div>
              )}
              {vendor.website && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <a href={`http://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">
                    {vendor.website}
                  </a>
                </div>
              )}
              {vendor.hours && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-slate-700 dark:text-slate-300">{vendor.hours}</span>
                </div>
              )}
            </div>
          </div>

          {/* Listings Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              All Listings ({vendorListings.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {vendorListings.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onItemClick(item.id)}
                  className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700 transition-all cursor-pointer group"
                >
                  <div className="relative aspect-square bg-slate-200 dark:bg-zinc-700">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    {item.featured && (
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-purple-600 text-white">
                          Featured
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 mb-1">
                      {item.title}
                    </h4>
                    <p className="text-purple-600 dark:text-purple-400 font-semibold text-base">
                      ${item.price.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            {vendorListings.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-slate-400">No listings yet</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
