import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Grid3x3, List, Plus, Store, Loader2, AlertCircle, RefreshCw, X, Package, Pencil, MoveVertical, ImagePlus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marketplaceService } from '../services/marketplaceService';
import type { MarketplaceBannerConfig } from '../services/marketplaceService';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { CreateVendorModal } from './CreateVendorModal';
import { AddListingModal } from './AddListingModal';
import { MarketItemDetailModal } from './MarketItemDetailModal';
import type { HubListing, HubVendor } from '../types/hub';

interface MarketplaceScreenProps {
  onBack: () => void;
  onVendorClick?: (vendorId: string) => void;
}

const CATEGORIES = ['All', 'Goods', 'Services', 'Food', 'Electronics', 'Events', 'Arts & Crafts', 'Other'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
] as const;

function formatPrice(listing: HubListing): string {
  if (listing.price_type === 'free') return 'Free';
  if (listing.price_type === 'contact') return 'Contact';
  if (listing.price == null) return 'Contact';
  const formatted = `$${Number(listing.price).toFixed(2)}`;
  if (listing.price_type === 'hourly') return `${formatted}/hr`;
  if (listing.price_type === 'negotiable') return `${formatted} OBO`;
  return formatted;
}

function formatRelative(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 86400) return 'Today';
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

export function MarketplaceScreen({ onBack, onVendorClick }: MarketplaceScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug ?? '';

  // Admin detection
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = !tunnelUrl || tunnelUrl.includes('localhost') || tunnelUrl.includes('127.0.0.1');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  const [listings, setListings] = useState<HubListing[]>([]);
  const [myVendor, setMyVendor] = useState<HubVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [selectedListing, setSelectedListing] = useState<HubListing | null>(null);
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [showAddListing, setShowAddListing] = useState(false);

  // ── Banner config state ──────────────────────────────────
  const [bannerConfig, setBannerConfig] = useState<MarketplaceBannerConfig>({});
  const [showBannerEdit, setShowBannerEdit] = useState(false);
  const [isRepositioning, setIsRepositioning] = useState(false);
  const [bannerY, setBannerY] = useState(50);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [pendingBannerFile, setPendingBannerFile] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const dragRef = useRef<{ startY: number; startPos: number } | null>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!slug) return;
    setLoading(true);
    setError('');
    try {
      const [fetchedListings, vendor, banner] = await Promise.all([
        marketplaceService.getListings(slug),
        marketplaceService.getMyVendor(slug).catch(() => null),
        marketplaceService.getBannerConfig(slug).catch((): MarketplaceBannerConfig => ({})),
      ]);
      setListings(fetchedListings);
      setMyVendor(vendor);
      setBannerConfig(banner);
      setBannerY(Number((banner as MarketplaceBannerConfig).marketplace_banner_position) || 50);
    } catch (err: any) {
      setError(err.message || 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [slug]);

  // ── Banner edit handlers ─────────────────────────────────
  const handleOpenBannerEdit = () => {
    setEditTitle(bannerConfig.marketplace_banner_title || '');
    setEditSubtitle(bannerConfig.marketplace_banner_subtitle || '');
    setBannerY(Number(bannerConfig.marketplace_banner_position) || 50);
    setPendingBannerFile(null);
    setBannerPreviewUrl(null);
    setBannerError('');
    setShowBannerEdit(true);
  };

  const handleCancelBannerEdit = () => {
    setShowBannerEdit(false);
    setIsRepositioning(false);
    setPendingBannerFile(null);
    setBannerPreviewUrl(null);
    setBannerY(Number(bannerConfig.marketplace_banner_position) || 50);
    setBannerError('');
  };

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerPreviewUrl(URL.createObjectURL(file));
    setUploadingBannerImage(true);
    setBannerError('');
    try {
      const uploaded = await hubService.uploadFile(slug, file, true);
      setPendingBannerFile(uploaded.name);
    } catch (err: any) {
      setBannerError('Image upload failed: ' + (err.message || 'unknown error'));
      setBannerPreviewUrl(null);
    } finally {
      setUploadingBannerImage(false);
    }
  };

  const handleSaveBanner = async () => {
    setSavingBanner(true);
    setBannerError('');
    try {
      const updates: Partial<MarketplaceBannerConfig> = {
        marketplace_banner_position: String(Math.round(bannerY)),
        marketplace_banner_title: editTitle.trim() || '',
        marketplace_banner_subtitle: editSubtitle.trim() || '',
      };
      if (pendingBannerFile) updates.marketplace_banner_image = pendingBannerFile;
      await marketplaceService.updateBannerConfig(slug, updates);
      setBannerConfig(prev => ({ ...prev, ...updates }));
      setShowBannerEdit(false);
      setIsRepositioning(false);
      setPendingBannerFile(null);
      setBannerPreviewUrl(null);
    } catch (err: any) {
      setBannerError(err.message || 'Failed to save banner');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleRemoveBannerImage = async () => {
    setSavingBanner(true);
    try {
      await marketplaceService.updateBannerConfig(slug, { marketplace_banner_image: '' });
      setBannerConfig(prev => ({ ...prev, marketplace_banner_image: undefined }));
      setPendingBannerFile(null);
      setBannerPreviewUrl(null);
    } catch { /* silent */ } finally {
      setSavingBanner(false);
    }
  };

  // ── Drag-to-reposition ───────────────────────────────────
  const handleBannerPointerDown = (e: React.PointerEvent) => {
    if (!isRepositioning) return;
    dragRef.current = { startY: e.clientY, startPos: bannerY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const handleBannerPointerMove = (e: React.PointerEvent) => {
    if (!isRepositioning || !dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    // Drag down → show more of top (decrease Y); drag up → show more of bottom (increase Y)
    setBannerY(Math.max(0, Math.min(100, dragRef.current.startPos - delta * 0.4)));
  };
  const handleBannerPointerUp = () => { dragRef.current = null; };

  // ── Resolved banner image URL ────────────────────────────
  const bannerImageUrl = bannerPreviewUrl
    ?? (pendingBannerFile ? hubService.getPublicFileUrl(slug, pendingBannerFile) : null)
    ?? (bannerConfig.marketplace_banner_image ? hubService.getPublicFileUrl(slug, bannerConfig.marketplace_banner_image) : null);

  const bannerTitle = (showBannerEdit ? editTitle : bannerConfig.marketplace_banner_title) || 'Buy, sell & trade with your neighbors';
  const bannerSubtitle = (showBannerEdit ? editSubtitle : bannerConfig.marketplace_banner_subtitle) || 'Everything local, right here.';

  const filtered = useMemo(() => {
    let items = listings;
    if (activeCategory !== 'All') {
      items = items.filter(l => l.category.toLowerCase() === activeCategory.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        l.vendor_name?.toLowerCase().includes(q)
      );
    }
    return [...items].sort((a, b) => {
      if (sortBy === 'price-low') return (a.price ?? Infinity) - (b.price ?? Infinity);
      if (sortBy === 'price-high') return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [listings, activeCategory, searchQuery, sortBy]);

  const handleVendorCreated = (vendor: HubVendor) => {
    setMyVendor(vendor);
    // Take the owner straight to their new vendor page
    onVendorClick?.(vendor.id);
  };

  const handleListingCreated = (listing: HubListing) => {
    setListings(prev => [listing, ...prev]);
  };

  const selectedImageUrl = selectedListing?.image_file_name
    ? marketplaceService.getListingImageUrl(slug, selectedListing.image_file_name)
    : null;
  const selectedVendorLogoUrl = selectedListing?.vendor_logo_file_name
    ? marketplaceService.getVendorLogoUrl(slug, selectedListing.vendor_logo_file_name)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="marketplace-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#marketplace-dots)" opacity="0.07"/>
        </svg>
      </div>
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 z-20 border-b border-slate-200 dark:border-zinc-800">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Left: title */}
            <div className="shrink-0">
              <h2 className="text-slate-900 dark:text-white text-xl font-bold leading-tight">Exchange</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{listings.length} listings</p>
            </div>

            {/* Center: search bar */}
            <div className="flex-1 flex justify-center px-2">
              <div className="relative w-full max-w-[700px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search listings…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Right: view toggle + sell button + close */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-lg p-1">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-zinc-700'}`}>
                  <Grid3x3 className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-zinc-700'}`}>
                  <List className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>

              {myVendor ? (
                <button
                  onClick={() => setShowAddListing(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Listing</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowCreateVendor(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors border border-slate-200 dark:border-zinc-700"
                >
                  <Store className="w-4 h-4" />
                  <span className="hidden sm:inline">Start Selling</span>
                </button>
              )}
              <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 max-w-5xl mx-auto w-full">

        {/* Hero Banner */}
        <div
          className={`relative overflow-hidden ${showBannerEdit ? 'rounded-t-2xl rounded-b-none mb-0' : 'rounded-2xl mb-5'} ${isRepositioning ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
          style={{ minHeight: 180 }}
          onPointerDown={handleBannerPointerDown}
          onPointerMove={handleBannerPointerMove}
          onPointerUp={handleBannerPointerUp}
        >
          {/* Background — custom image or CSS gradient */}
          {bannerImageUrl ? (
            <>
              <img
                src={bannerImageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: `center ${bannerY}%` }}
                draggable={false}
              />
              {/* Dark overlay so text stays readable regardless of image */}
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-zinc-900/30" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-900/60 via-purple-900/30 to-transparent" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-purple-700" />
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
              <div className="absolute right-12 -bottom-8 w-28 h-28 rounded-full bg-purple-400/20" />
              <div className="absolute -right-4 top-4 w-20 h-20 rounded-full bg-blue-400/15" />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-[0.12]">
                <Store className="w-28 h-28 text-white" />
              </div>
            </>
          )}

          {/* Reposition drag indicator */}
          {isRepositioning && (
            <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
              <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2 text-white text-sm font-semibold">
                <MoveVertical className="w-4 h-4" />
                Drag up or down to reposition
              </div>
            </div>
          )}

          {/* Content */}
          <div className="relative z-10 px-5 py-5 pr-14">
            <p className="text-[11px] font-bold text-blue-200 uppercase tracking-widest mb-1.5">Local Exchange</p>
            <h2 className="text-xl font-bold text-white leading-snug">{bannerTitle}</h2>
            <p className="text-sm text-blue-100/70 mt-1.5">{bannerSubtitle}</p>
          </div>

          {/* Admin: edit/close button */}
          {isAdmin && !isRepositioning && (
            <button
              onClick={showBannerEdit ? handleCancelBannerEdit : handleOpenBannerEdit}
              className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-colors"
              title={showBannerEdit ? 'Close editor' : 'Customize banner'}
            >
              {showBannerEdit ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Banner edit panel — admin only */}
        <AnimatePresence>
          {isAdmin && showBannerEdit && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="bg-zinc-900 border border-zinc-800 border-t-0 rounded-b-2xl px-4 py-4 mb-5 space-y-4"
            >
              {/* Image upload row */}
              <div className="flex items-start gap-3">
                <div
                  onClick={() => !uploadingBannerImage && bannerFileRef.current?.click()}
                  className="relative w-28 h-16 rounded-xl bg-zinc-800 border-2 border-dashed border-zinc-700 hover:border-purple-500 cursor-pointer overflow-hidden transition-colors flex items-center justify-center shrink-0"
                >
                  {bannerImageUrl ? (
                    <img src={bannerImageUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `center ${bannerY}%` }} />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-zinc-500">
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-[10px]">Upload</span>
                    </div>
                  )}
                  {uploadingBannerImage && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-semibold text-zinc-300">Cover Image</p>
                  <p className="text-[11px] text-zinc-500 leading-snug">Any image works — wide/landscape photos fill best. Tap the preview to change.</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {bannerImageUrl && (
                      <button
                        onClick={() => setIsRepositioning(r => !r)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isRepositioning ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                      >
                        <MoveVertical className="w-3 h-3" />
                        {isRepositioning ? 'Done' : 'Reposition'}
                      </button>
                    )}
                    {bannerConfig.marketplace_banner_image && !pendingBannerFile && (
                      <button onClick={handleRemoveBannerImage} disabled={savingBanner} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Text fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Heading</label>
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="Buy, sell & trade with your neighbors"
                    maxLength={80}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Subtext</label>
                  <input
                    value={editSubtitle}
                    onChange={e => setEditSubtitle(e.target.value)}
                    placeholder="Everything local, right here."
                    maxLength={100}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  />
                </div>
              </div>

              {bannerError && <p className="text-xs text-red-400">{bannerError}</p>}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveBanner}
                  disabled={savingBanner || uploadingBannerImage}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {savingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save
                </button>
                <button
                  onClick={handleCancelBannerEdit}
                  className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none mb-4 -mx-1 px-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-500'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort + count row */}
        {!loading && listings.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}
              {activeCategory !== 'All' && ` in ${activeCategory}`}
            </p>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading marketplace…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && listings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-44 h-44 rounded-2xl overflow-hidden mb-5 shadow-md ring-1 ring-black/5">
              <img
                src="/mohamed_hassan-store-4315394_1920.jpg"
                alt="Local Exchange"
                className="w-full h-full object-cover object-center"
              />
            </div>
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">Nothing listed yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
              Be the first to list something for your community — goods, services, food, events.
            </p>
            {myVendor ? (
              <button
                onClick={() => setShowAddListing(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Add Your First Listing
              </button>
            ) : (
              <button
                onClick={() => setShowCreateVendor(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <Store className="w-4 h-4" /> Create a Vendor Page
              </button>
            )}
          </div>
        )}

        {/* No results (filtered) */}
        {!loading && !error && listings.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No listings match your filters</p>
            <button onClick={() => { setSearchQuery(''); setActiveCategory('All'); }} className="mt-2 text-xs text-purple-600 hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {/* Listing grid */}
        {!loading && !error && filtered.length > 0 && (
          <AnimatePresence mode="popLayout">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.map((listing, i) => {
                  const imageUrl = listing.image_file_name
                    ? marketplaceService.getListingImageUrl(slug, listing.image_file_name)
                    : null;
                  return (
                    <motion.div
                      key={listing.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedListing(listing)}
                      className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition-all cursor-pointer group"
                    >
                      <div className="relative aspect-square bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20">
                        {imageUrl ? (
                          <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-10 h-10 text-purple-300 dark:text-purple-700" />
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2">
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-purple-600/90 backdrop-blur-sm text-white">
                            {listing.category}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 mb-1 leading-tight">{listing.title}</p>
                        <p className="text-purple-600 dark:text-purple-400 font-bold text-sm">{formatPrice(listing)}</p>
                        <button
                          onClick={e => { e.stopPropagation(); onVendorClick?.(listing.vendor_id); }}
                          className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors mt-0.5 truncate max-w-full block"
                        >
                          {listing.vendor_name}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((listing, i) => {
                  const imageUrl = listing.image_file_name
                    ? marketplaceService.getListingImageUrl(slug, listing.image_file_name)
                    : null;
                  return (
                    <motion.div
                      key={listing.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedListing(listing)}
                      className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md transition-all cursor-pointer flex gap-4 p-4"
                    >
                      <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 flex-shrink-0 overflow-hidden">
                        {imageUrl
                          ? <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-purple-300 dark:text-purple-700" /></div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{listing.title}</p>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 whitespace-nowrap">{listing.category}</span>
                        </div>
                        <p className="text-purple-600 dark:text-purple-400 font-bold text-base mb-1">{formatPrice(listing)}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <button onClick={e => { e.stopPropagation(); onVendorClick?.(listing.vendor_id); }} className="flex items-center gap-1.5 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                            {listing.vendor_logo_file_name
                              ? <img src={marketplaceService.getVendorLogoUrl(slug, listing.vendor_logo_file_name) ?? undefined} alt="" className="w-4 h-4 rounded-full object-cover" />
                              : <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold shrink-0">{(listing.vendor_name ?? '?').charAt(0).toUpperCase()}</span>
                            }
                            {listing.vendor_name}
                          </button>
                          <span>·</span>
                          <span>{formatRelative(listing.created_at)}</span>
                          {listing.condition && <><span>·</span><span className="capitalize">{listing.condition.replace('-', ' ')}</span></>}
                        </div>
                        {listing.description && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">{listing.description}</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        )}

        {/* Start selling CTA (if has listings but no vendor page) */}
        {!loading && !error && listings.length > 0 && !myVendor && (
          <div className="mt-8 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-5 border border-blue-200/50 dark:border-blue-700/30 text-center">
            <Store className="w-8 h-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Have something to sell?</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">Create a vendor page and list your products or services for the community.</p>
            <button
              onClick={() => setShowCreateVendor(true)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Start Selling
            </button>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* Modals */}
      <CreateVendorModal
        isOpen={showCreateVendor}
        hubSlug={slug}
        onClose={() => setShowCreateVendor(false)}
        onCreated={handleVendorCreated}
      />

      <AddListingModal
        isOpen={showAddListing}
        hubSlug={slug}
        onClose={() => setShowAddListing(false)}
        onCreated={handleListingCreated}
      />

      <MarketItemDetailModal
        item={selectedListing}
        imageUrl={selectedImageUrl ?? undefined}
        vendorLogoUrl={selectedVendorLogoUrl ?? undefined}
        onClose={() => setSelectedListing(null)}
        onVendorClick={onVendorClick}
      />
    </div>
  );
}
