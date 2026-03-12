import { X, MessageCircle, Share2, Flag } from 'lucide-react';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { HubListing } from '../types/hub';

interface MarketItemDetailModalProps {
  item: HubListing | null;
  imageUrl?: string | null;
  vendorLogoUrl?: string | null;
  onClose: () => void;
  onVendorClick?: (vendorId: string) => void;
}

function formatPrice(listing: HubListing): string {
  if (listing.price_type === 'free') return 'Free';
  if (listing.price_type === 'contact') return 'Contact for Price';
  if (listing.price == null) return 'Contact for Price';
  const formatted = `$${Number(listing.price).toFixed(2)}`;
  if (listing.price_type === 'hourly') return `${formatted} / hr`;
  if (listing.price_type === 'negotiable') return `${formatted} OBO`;
  return formatted;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

export function MarketItemDetailModal({ item, imageUrl, vendorLogoUrl, onClose, onVendorClick }: MarketItemDetailModalProps) {
  useEffect(() => {
    document.body.style.overflow = item ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [item]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!item) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
        >
          {/* Left — image */}
          <div className="md:w-1/2 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 relative min-h-48">
            {imageUrl
              ? <img src={imageUrl} alt={item.title} className="w-full h-64 md:h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-purple-300 dark:text-purple-700 text-7xl font-bold select-none">
                  {item.title.charAt(0).toUpperCase()}
                </div>
            }
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm flex items-center justify-center hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-lg"
            >
              <X className="w-5 h-5 text-slate-900 dark:text-white" />
            </button>
          </div>

          {/* Right — details */}
          <div className="md:w-1/2 flex flex-col overflow-y-auto">
            <div className="p-6 space-y-5 flex-1">
              {/* Title + category */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-500/20">
                    {item.category}
                  </span>
                  {item.condition && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 capitalize">
                      {item.condition.replace('-', ' ')}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{item.title}</h2>
              </div>

              {/* Price */}
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{formatPrice(item)}</p>

              {/* Seller */}
              <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Seller</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                    {vendorLogoUrl
                      ? <img src={vendorLogoUrl} alt={item.vendor_name ?? ''} className="w-full h-full object-cover" />
                      : (item.vendor_name ?? '?').charAt(0).toUpperCase()
                    }
                  </div>
                  <div>
                    <button
                      onClick={() => { onVendorClick?.(item.vendor_id); onClose(); }}
                      className="text-sm font-semibold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-left"
                    >
                      {item.vendor_name ?? 'Unknown'}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Listed {formatDate(item.created_at)}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {item.description && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Description</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{item.description}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-slate-200 dark:border-zinc-800">
              <div className="flex gap-3">
                <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2">
                  <MessageCircle className="w-4 h-4" /> Contact Seller
                </button>
                <button title="Share" className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
                  <Share2 className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </button>
                <button title="Report" className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
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
