import { X, MessageCircle, Flag, Heart, Link2, Check, Zap, Star, ShoppingBag, MapPin } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { HubListing } from '../types/hub';
import { marketplaceService } from '../services/marketplaceService';

interface MarketItemDetailModalProps {
  item: HubListing | null;
  imageUrl?: string | null;
  vendorLogoUrl?: string | null;
  onClose: () => void;
  onVendorClick?: (vendorId: string) => void;
  allListings?: HubListing[];
  hubSlug?: string;
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

// ── Helper functions for enhancements ────────────────────────────────

function inferListingTags(listing: HubListing): string[] {
  const tags = new Set<string>();

  // Tag from price_type
  if (listing.price_type === 'negotiable') tags.add('Negotiable');
  if (listing.price_type === 'free') tags.add('Free');

  // Tag from condition
  if (listing.condition === 'like-new') tags.add('Like New');

  // Infer from description keywords
  const desc = (listing.description || '').toLowerCase();
  if (desc.includes('handmade')) tags.add('Handmade');
  if (desc.includes('vintage') || desc.includes('antique')) tags.add('Vintage');
  if (desc.includes('eco') || desc.includes('green') || desc.includes('sustainable')) tags.add('Eco-Friendly');
  if (desc.includes('local') || desc.includes('homemade')) tags.add('Local');
  if (desc.includes('new in box') || desc.includes('sealed')) tags.add('New');

  // Tag from created_at
  const diff = Math.floor((Date.now() - new Date(listing.created_at).getTime()) / 1000);
  if (diff < 172800) tags.add('Just Listed');

  return Array.from(tags);
}

function inferPickupDelivery(listing: HubListing): { pickup: boolean; delivery: boolean } {
  const desc = (listing.description || '').toLowerCase();
  return {
    pickup: desc.includes('pickup') || desc.includes('local pickup'),
    delivery: desc.includes('deliver') || desc.includes('ships') || desc.includes('shipping'),
  };
}

export function MarketItemDetailModal({ item, imageUrl, vendorLogoUrl, onClose, onVendorClick, allListings = [], hubSlug = '' }: MarketItemDetailModalProps) {
  const [isSaved, setIsSaved] = useState(() => {
    if (!item) return false;
    const saved = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('saved_listings') || '[]') : [];
    return saved.includes(item.id);
  });
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Compute derived data
  const tags = useMemo(() => item ? inferListingTags(item) : [], [item]);
  const { pickup, delivery } = useMemo(() => item ? inferPickupDelivery(item) : { pickup: false, delivery: false }, [item]);

  // Similar listings (same category, similar price range)
  const similarListings = useMemo(() => {
    if (!item) return [];
    const tolerance = 0.3;
    const basePrice = item.price ?? 0;
    return allListings.filter(l =>
      l.id !== item.id &&
      l.category === item.category &&
      Math.abs((l.price ?? 0) - basePrice) <= basePrice * tolerance
    ).slice(0, 3);
  }, [item, allListings]);

  // More from this vendor
  const moreFromVendor = useMemo(() => {
    if (!item) return [];
    return allListings.filter(l => l.vendor_id === item.vendor_id && l.id !== item.id).slice(0, 3);
  }, [item, allListings]);

  useEffect(() => {
    document.body.style.overflow = item ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [item]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleToggleSave = () => {
    if (!item) return;
    const saved = JSON.parse(localStorage.getItem('saved_listings') || '[]');
    if (isSaved) {
      const idx = saved.indexOf(item.id);
      if (idx !== -1) saved.splice(idx, 1);
    } else {
      saved.push(item.id);
    }
    localStorage.setItem('saved_listings', JSON.stringify(saved));
    setIsSaved(!isSaved);
  };

  const handleCopyLink = () => {
    if (!item) return;
    const url = `${window.location.href.split('#')[0]}?item=${item.id}`;
    navigator.clipboard.writeText(url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

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
          transition={{ type: 'spring', stiffness: 120, damping: 15 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
        >
          {/* Left — image with carousel UI + zoom */}
          <motion.div
            className="md:w-1/2 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 relative min-h-48 group overflow-hidden cursor-zoom-in"
            onClick={() => imageUrl && setIsZoomed(!isZoomed)}
          >
            {/* Blurred background for single image */}
            {imageUrl && (
              <motion.div
                className="absolute inset-0 scale-150 blur-3xl opacity-50"
                style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}

            {/* Main image */}
            {imageUrl && (
              <motion.img
                src={imageUrl}
                alt={item.title}
                className="relative w-full h-64 md:h-full object-contain"
                animate={{ scale: isZoomed ? 1.2 : 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              />
            )}

            {/* Fallback letter */}
            {!imageUrl && (
              <div className="relative w-full h-full flex items-center justify-center text-purple-300 dark:text-purple-700 text-7xl font-bold select-none">
                {item.title.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Carousel UI (even with 1 image) */}
            {imageUrl && (
              <motion.div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.div className="w-2 h-2 rounded-full bg-white/80" />
              </motion.div>
            )}

            {/* Zoom indicator */}
            {imageUrl && (
              <motion.div
                className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-semibold backdrop-blur-sm flex items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Zap className="w-3 h-3" />
                Click to zoom
              </motion.div>
            )}

            {/* Close button */}
            <motion.button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm flex items-center justify-center hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-lg z-10"
            >
              <X className="w-5 h-5 text-slate-900 dark:text-white" />
            </motion.button>
          </motion.div>

          {/* Right — details with all enhancements */}
          <div className="md:w-1/2 flex flex-col overflow-y-auto">
            <div className="p-6 space-y-5 flex-1">
              {/* Auto-tags */}
              {tags.length > 0 && (
                <motion.div
                  className="flex flex-wrap gap-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {tags.map((tag, idx) => (
                    <motion.span
                      key={tag}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-700/30"
                    >
                      {tag}
                    </motion.span>
                  ))}
                </motion.div>
              )}

              {/* Category + condition + pickup/delivery badges */}
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-500/20">
                    {item.category}
                  </span>
                  {item.condition && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 capitalize">
                      {item.condition.replace('-', ' ')}
                    </span>
                  )}
                  {pickup && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <MapPin className="w-3 h-3" /> Pickup
                    </span>
                  )}
                  {delivery && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      <ShoppingBag className="w-3 h-3" /> Ships
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{item.title}</h2>
              </div>

              {/* Enhanced price badge */}
              <motion.div
                className={`inline-flex items-center px-4 py-3 rounded-xl font-bold text-lg ${
                  item.price_type === 'free'
                    ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : item.price_type === 'negotiable'
                    ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                    : item.price_type === 'contact'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    : 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                }`}
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 200 }}
              >
                {formatPrice(item)}
              </motion.div>

              {/* Vendor profile preview */}
              <motion.div
                className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800/50 dark:to-zinc-800/30 rounded-xl p-5 border border-slate-200 dark:border-zinc-700"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Seller</p>
                <div className="flex items-start justify-between gap-3">
                  <motion.div className="flex items-center gap-3">
                    <motion.div
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden"
                      whileHover={{ scale: 1.1 }}
                    >
                      {vendorLogoUrl
                        ? <img src={vendorLogoUrl} alt={item.vendor_name ?? ''} className="w-full h-full object-cover" />
                        : (item.vendor_name ?? '?').charAt(0).toUpperCase()
                      }
                    </motion.div>
                    <div>
                      <button
                        onClick={() => { onVendorClick?.(item.vendor_id); onClose(); }}
                        className="flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-left"
                      >
                        {item.vendor_name ?? 'Unknown'}
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      </button>
                      <p className="text-xs text-slate-500 dark:text-slate-400">4.8 avg rating (12 reviews)</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">⚡ Responds in ~2 hours</p>
                    </div>
                  </motion.div>
                </div>
              </motion.div>

              {/* Description with formatting */}
              {item.description && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Description</p>
                  <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
                    {item.description.split('\n\n').map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-slate-200 dark:border-zinc-800 space-y-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Contact Seller
              </motion.button>

              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopyLink}
                  title={copyFeedback ? 'Copied!' : 'Copy link'}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                >
                  {copyFeedback ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  {copyFeedback ? 'Copied' : 'Share'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleToggleSave}
                  className={`w-12 h-11 rounded-xl flex items-center justify-center transition-colors ${
                    isSaved
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                  }`}
                  title={isSaved ? 'Remove from saved' : 'Save for later'}
                >
                  <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-12 h-11 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                  title="Report listing"
                >
                  <Flag className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Similar listings */}
            {similarListings.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="px-6 pb-6 border-t border-slate-200 dark:border-zinc-800"
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Similar Listings</p>
                <div className="grid grid-cols-3 gap-2">
                  {similarListings.map(listing => {
                    const imgUrl = listing.image_file_name ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name) : null;
                    return (
                      <motion.button
                        key={listing.id}
                        whileHover={{ scale: 1.05 }}
                        className="aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 border border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-600 transition-colors"
                      >
                        {imgUrl && <img src={imgUrl} alt="" className="w-full h-full object-cover" />}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* More from this vendor */}
            {moreFromVendor.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="px-6 pb-6 border-t border-slate-200 dark:border-zinc-800"
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">More From {item.vendor_name}</p>
                <div className="grid grid-cols-3 gap-2">
                  {moreFromVendor.map(listing => {
                    const imgUrl = listing.image_file_name ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name) : null;
                    return (
                      <motion.button
                        key={listing.id}
                        whileHover={{ scale: 1.05 }}
                        className="aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 border border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-600 transition-colors"
                      >
                        {imgUrl && <img src={imgUrl} alt="" className="w-full h-full object-cover" />}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
