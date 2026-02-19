import { X, MapPin, MessageCircle, Share2, Flag, Heart } from 'lucide-react';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { MarketItem } from '../data/marketplaceData';

interface MarketItemDetailModalProps {
  item: MarketItem | null;
  onClose: () => void;
  onVendorClick?: (vendorId: string) => void;
}

export function MarketItemDetailModal({ item, onClose, onVendorClick }: MarketItemDetailModalProps) {
  useEffect(() => {
    if (item) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [item]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!item) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
        >
          {/* Left Side - Image */}
          <div className="md:w-1/2 bg-slate-100 dark:bg-zinc-800 relative">
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-64 md:h-full object-cover"
            />
            {item.featured && (
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white shadow-lg">
                  Featured
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              title="Close"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm flex items-center justify-center hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-lg"
            >
              <X className="w-5 h-5 text-slate-900 dark:text-white" />
            </button>
          </div>

          {/* Right Side - Details */}
          <div className="md:w-1/2 flex flex-col overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    {item.title}
                  </h2>
                  <button title="Save to favorites" className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
                    <Heart className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  </button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="px-3 py-1 rounded-lg text-sm font-medium uppercase tracking-wide bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-500/20">
                    {item.category}
                  </span>
                  {item.condition && (
                    <span className="px-3 py-1 rounded-lg text-sm font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300">
                      {item.condition === 'like-new' ? 'Like New' : item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Price */}
              <div>
                <p className="text-4xl font-semibold text-purple-600 dark:text-purple-400">
                  ${item.price.toFixed(2)}
                </p>
              </div>

              {/* Seller Info */}
              <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Seller Information</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold">
                      {item.vendor.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          onVendorClick?.(item.vendorId);
                          onClose();
                        }}
                        className="text-sm font-medium text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-left"
                      >
                        {item.vendor}
                      </button>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Highland Park</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <MapPin className="w-4 h-4" />
                    <span>{item.distance} miles away</span>
                  </div>
                  {item.postedDate && (
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Posted {item.postedDate}
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Description</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {item.description || 'No description provided.'}
                </p>
              </div>

              {/* Location Preview */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Location</h3>
                <div className="h-32 bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Highland Park, {item.distance} mi away</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons - Sticky Footer */}
            <div className="mt-auto p-6 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="flex gap-3">
                <button className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Contact Seller
                </button>
                <button title="Share listing" className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
                  <Share2 className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </button>
                <button title="Report listing" className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
                  <Flag className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
