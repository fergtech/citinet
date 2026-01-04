import { ArrowLeft, Search, Home, Menu, Grid3x3, List, SlidersHorizontal, X, MapPin } from 'lucide-react';
import { useState } from 'react';
import { MarketItemDetailModal } from './MarketItemDetailModal';
import { marketItems, type MarketItem } from '../data/marketplaceData';

interface MarketplaceScreenProps {
  onBack: () => void;
  onVendorClick?: (vendorId: string) => void;
}

const categories = ['Electronics', 'Services', 'Events', 'Food', 'Other'];

export function MarketplaceScreen({ onBack, onVendorClick }: MarketplaceScreenProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [maxDistance, setMaxDistance] = useState(5);
  const [sortBy, setSortBy] = useState<'distance' | 'price-low' | 'price-high' | 'newest'>('distance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const filteredItems = marketItems.filter(item => {
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(item.category);
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.vendor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPrice = item.price >= priceRange[0] && item.price <= priceRange[1];
    const matchesDistance = item.distance <= maxDistance;
    return matchesCategory && matchesSearch && matchesPrice && matchesDistance;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'distance': return a.distance - b.distance;
      case 'price-low': return a.price - b.price;
      case 'price-high': return b.price - a.price;
      default: return 0;
    }
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Top Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 z-20 border-b border-slate-200 dark:border-zinc-800">
        <div className="px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <h2 className="text-slate-900 dark:text-white text-xl font-semibold flex-1">Market</h2>
            
            {/* Mobile Filter Toggle */}
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="md:hidden w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <SlidersHorizontal className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-700' : 'hover:bg-slate-200 dark:hover:bg-zinc-700'}`}
              >
                <Grid3x3 className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700' : 'hover:bg-slate-200 dark:hover:bg-zinc-700'}`}
              >
                <List className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              </button>
            </div>

            <button className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
              <Home className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <button className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
              <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search marketplace..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1">
        {/* Left Sidebar - Desktop Only */}
        <aside className={`${showFilters ? 'block' : 'hidden'} md:block w-full md:w-64 lg:w-72 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 overflow-y-auto absolute md:relative z-10 h-full md:h-auto`}>
          <div className="p-4 space-y-6">
            {/* Close button for mobile */}
            <div className="md:hidden flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Filters</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            {/* Categories */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Categories</h3>
              <div className="space-y-2">
                {categories.map((category) => (
                  <label key={category} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category.toUpperCase())}
                      onChange={() => toggleCategory(category.toUpperCase())}
                      className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                      {category}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Price Range</h3>
              <div className="space-y-3">
                <input
                  type="range"
                  min="0"
                  max="500"
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>$0</span>
                  <span className="font-semibold text-purple-600 dark:text-purple-400">${priceRange[1]}</span>
                </div>
              </div>
            </div>

            {/* Distance */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Distance</h3>
              <div className="space-y-3">
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Nearby</span>
                  <span className="font-semibold text-purple-600 dark:text-purple-400">{maxDistance} mi</span>
                </div>
              </div>
            </div>

            {/* Sort By */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Sort By</h3>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="distance">Nearest First</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="newest">Newest First</option>
              </select>
            </div>

            {/* Clear Filters */}
            <button
              onClick={() => {
                setSelectedCategories([]);
                setPriceRange([0, 500]);
                setMaxDistance(5);
                setSearchQuery('');
              }}
              className="w-full py-2 px-4 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        </aside>

        {/* Market Items Grid */}
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {/* Results Count */}
            <div className="mb-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} found
              </p>
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer"
                  >
                    {/* Square Image */}
                    <div className="relative w-full aspect-square bg-slate-200 dark:bg-zinc-800">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      {/* Badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
                        {item.featured && (
                          <span className="px-2 py-1 rounded-md text-xs font-medium bg-purple-600 text-white shadow-lg">
                            Featured
                          </span>
                        )}
                        {item.condition && (
                          <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-900/80 dark:bg-white/80 text-white dark:text-slate-900 backdrop-blur-sm ml-auto">
                            {item.condition === 'like-new' ? 'Like New' : item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-2 right-2">
                        <span className="px-2 py-1 rounded-md text-xs font-medium uppercase tracking-wide bg-purple-500/90 backdrop-blur-sm text-white shadow-lg">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3">
                      <h3 className="text-slate-900 dark:text-white font-semibold text-sm mb-1 line-clamp-2">{item.title}</h3>
                      <p className="text-purple-600 dark:text-purple-400 font-semibold text-lg mb-1">${item.price.toFixed(2)}</p>
                      <div className="flex items-center justify-between text-xs">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onVendorClick?.(item.vendorId);
                          }}
                          className="text-slate-600 dark:text-slate-400 truncate hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                        >
                          {item.vendor}
                        </button>
                        <p className="text-slate-500 dark:text-slate-500 whitespace-nowrap ml-2">{item.distance} mi</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex gap-4 p-4">
                      {/* Image */}
                      <div className="relative w-32 h-32 flex-shrink-0 bg-slate-200 dark:bg-zinc-800 rounded-lg overflow-hidden">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        {item.featured && (
                          <span className="absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium bg-purple-600 text-white">
                            Featured
                          </span>
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-slate-900 dark:text-white font-semibold text-base">{item.title}</h3>
                          <span className="px-2 py-1 rounded-md text-xs font-medium uppercase tracking-wide bg-purple-500/10 text-purple-600 dark:text-purple-400 whitespace-nowrap">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-purple-600 dark:text-purple-400 font-semibold text-xl mb-2">${item.price.toFixed(2)}</p>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onVendorClick?.(item.vendorId);
                            }}
                            className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                          >
                            {item.vendor}
                          </button>
                          <span>•</span>
                          <span>{item.distance} mi away</span>
                          {item.condition && (
                            <>
                              <span>•</span>
                              <span className="text-purple-600 dark:text-purple-400 font-medium">
                                {item.condition === 'like-new' ? 'Like New' : item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500 dark:text-slate-400 mb-2">No items found matching your filters.</p>
                <button
                  onClick={() => {
                    setSelectedCategories([]);
                    setPriceRange([0, 500]);
                    setMaxDistance(5);
                    setSearchQuery('');
                  }}
                  className="text-purple-600 dark:text-purple-400 font-medium hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
      <MarketItemDetailModal 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)}
        onVendorClick={onVendorClick}
      />    </div>
  );
}
