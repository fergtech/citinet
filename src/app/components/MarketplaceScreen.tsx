import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Plus, Store, Loader2, AlertCircle, RefreshCw, X, Pencil, MoveVertical, ImagePlus, Check,
  Package, HandHelping, Apple, Cpu, CalendarDays, Palette, Sparkles, Bookmark,
  TrendingUp, ShieldCheck, Gift, Repeat, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marketplaceService } from '../services/marketplaceService';
import type { MarketplaceBannerConfig } from '../services/marketplaceService';
import { useHub } from '../context/HubContext';
import { useSavedIds } from '../hooks/useSavedIds';
import { hubService } from '../services/hubService';
import { CreateVendorModal } from './CreateVendorModal';
import { AddListingModal } from './AddListingModal';
import { ExchangeListingDetail } from './ExchangeListingDetail';
import type { HubListing, HubVendor } from '../types/hub';

interface MarketplaceScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
  onVendorClick?: (vendorId: string) => void;
}

const CATEGORIES = ['Goods', 'Services', 'Food', 'Electronics', 'Events', 'Arts & Crafts', 'Other'] as const;

const CATEGORY_META: Record<string, { Icon: React.ElementType; gradient: string }> = {
  'Goods':         { Icon: Package,      gradient: 'from-blue-500 to-indigo-600' },
  'Services':      { Icon: HandHelping,  gradient: 'from-violet-500 to-purple-600' },
  'Food':          { Icon: Apple,        gradient: 'from-rose-500 to-pink-600' },
  'Electronics':   { Icon: Cpu,          gradient: 'from-cyan-500 to-sky-600' },
  'Events':        { Icon: CalendarDays, gradient: 'from-amber-500 to-orange-600' },
  'Arts & Crafts': { Icon: Palette,      gradient: 'from-fuchsia-500 to-pink-600' },
  'Other':         { Icon: Sparkles,     gradient: 'from-slate-500 to-zinc-600' },
};

export const KIND_META: Record<HubListing['price_type'], { label: string; classes: string }> = {
  fixed:      { label: 'For sale',   classes: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30' },
  negotiable: { label: 'Negotiable', classes: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30' },
  free:       { label: 'Free',       classes: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30' },
  hourly:     { label: 'Hourly',     classes: 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-500/30' },
  contact:    { label: 'Contact',    classes: 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-500/30' },
};

const TABS: { key: 'all' | HubListing['price_type']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fixed', label: 'For sale' },
  { key: 'negotiable', label: 'Negotiable' },
  { key: 'free', label: 'Free' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'contact', label: 'Contact' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
] as const;

export function formatPrice(listing: HubListing): string {
  if (listing.price_type === 'free') return 'Free';
  if (listing.price_type === 'contact') return 'Contact';
  if (listing.price == null) return 'Contact';
  const formatted = `$${Number(listing.price).toFixed(2)}`;
  if (listing.price_type === 'hourly') return `${formatted}/hr`;
  if (listing.price_type === 'negotiable') return `${formatted} OBO`;
  return formatted;
}

export function formatRelative(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function isFresh(iso: string): boolean {
  try { return Date.now() - new Date(iso).getTime() < 3_600_000; } catch { return false; }
}

/** A single listing card — reused in the main grid and in "more from this seller." */
export function ListingCard({ listing, hubSlug, onOpen, onVendorClick }: {
  listing: HubListing;
  hubSlug: string;
  onOpen: () => void;
  onVendorClick?: (vendorId: string) => void;
}) {
  const meta = CATEGORY_META[listing.category] ?? CATEGORY_META.Other;
  const kind = KIND_META[listing.price_type] ?? KIND_META.fixed;
  const imageUrl = listing.image_file_name ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name) : null;
  const vendorLogoUrl = listing.vendor_logo_file_name ? marketplaceService.getVendorLogoUrl(hubSlug, listing.vendor_logo_file_name) : null;
  // Account-level (hub_user_preferences) — see useSavedIds for why (this
  // was localStorage-only, so a save never followed the account across
  // devices/browsers).
  const { ids: savedIds, toggle: toggleSavedId } = useSavedIds('saved_listings', 'saved_listings');
  const saved = savedIds.includes(listing.id);
  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSavedId(listing.id);
  };

  return (
    <button
      onClick={onOpen}
      className="text-left flex flex-col overflow-hidden rounded-2xl cn-glass hover:border-black/15 dark:hover:border-white/15 transition-all group"
    >
      <div className={`relative h-26 flex items-center justify-center bg-gradient-to-br ${meta.gradient}`} style={{ height: 104 }}>
        {imageUrl
          ? <img src={imageUrl} alt={listing.title} className="absolute inset-0 w-full h-full object-cover" />
          : <meta.Icon className="w-9 h-9 text-white/90" />
        }
        <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-sm ${kind.classes}`}>{kind.label}</span>
        <button
          onClick={toggleSave}
          title="Save"
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center hover:bg-black/65 transition-colors"
        >
          <Bookmark className={`w-3.5 h-3.5 text-white ${saved ? 'fill-white' : ''}`} />
        </button>
        {isFresh(listing.created_at) && <span className="absolute bottom-2.5 right-3 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="flex-1 text-sm font-semibold cn-text-1 leading-snug line-clamp-1">{listing.title}</span>
          <span className={`font-mono text-sm font-bold whitespace-nowrap ${listing.price_type === 'fixed' ? 'text-emerald-500 dark:text-emerald-300' : 'cn-text-2'}`}>{formatPrice(listing)}</span>
        </div>
        {listing.description && <p className="text-xs cn-text-3 leading-snug line-clamp-2">{listing.description}</p>}
        <div className="flex items-center gap-2 mt-auto pt-1">
          {vendorLogoUrl
            ? <img src={vendorLogoUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
            : <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold shrink-0">{(listing.vendor_name ?? '?').charAt(0).toUpperCase()}</span>
          }
          <button
            onClick={e => { e.stopPropagation(); onVendorClick?.(listing.vendor_id); }}
            className="text-[11px] cn-text-2 hover:cn-text-1 transition-colors truncate flex-1 text-left"
          >
            {listing.vendor_name}
          </button>
          <span className="text-[10px] cn-text-4 whitespace-nowrap font-mono">{formatRelative(listing.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

export function MarketplaceScreen({ onBack, onNavigate, onVendorClick }: MarketplaceScreenProps) {
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
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['key']>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high'>('newest');

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

  // Deep-link: open a specific listing (e.g. arriving back from a vendor profile page)
  useEffect(() => {
    if (loading || selectedListing) return;
    const listingId = sessionStorage.getItem('citinet-deeplink-listing');
    if (!listingId) return;
    sessionStorage.removeItem('citinet-deeplink-listing');
    const found = listings.find(l => l.id === listingId);
    if (found) setSelectedListing(found);
  }, [loading, listings, selectedListing]);

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
    setBannerY(Math.max(0, Math.min(100, dragRef.current.startPos - delta * 0.4)));
  };
  const handleBannerPointerUp = () => { dragRef.current = null; };

  const bannerImageUrl = bannerPreviewUrl
    ?? (pendingBannerFile ? hubService.getPublicFileUrl(slug, pendingBannerFile) : null)
    ?? (bannerConfig.marketplace_banner_image ? hubService.getPublicFileUrl(slug, bannerConfig.marketplace_banner_image) : null);

  // ── Filtering / sorting ───────────────────────────────────
  const filtered = useMemo(() => {
    let items = listings;
    if (activeCategory !== 'All') {
      items = items.filter(l => l.category.toLowerCase() === activeCategory.toLowerCase());
    }
    if (activeTab !== 'all') {
      items = items.filter(l => l.price_type === activeTab);
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
  }, [listings, activeCategory, activeTab, searchQuery, sortBy]);

  // ── Right rail — real data derived from loaded listings ───
  const stats = useMemo(() => {
    const now = new Date();
    const freeThisMonth = listings.filter(l => l.price_type === 'free' && (() => {
      const d = new Date(l.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })()).length;
    const vendorIds = new Set(listings.map(l => l.vendor_id));
    return { active: listings.length, freeThisMonth, vendorCount: vendorIds.size };
  }, [listings]);

  const topVendors = useMemo(() => {
    const byVendor = new Map<string, { vendor_id: string; vendor_name: string; vendor_logo_file_name?: string; count: number }>();
    for (const l of listings) {
      const existing = byVendor.get(l.vendor_id);
      if (existing) existing.count++;
      else byVendor.set(l.vendor_id, { vendor_id: l.vendor_id, vendor_name: l.vendor_name ?? 'Vendor', vendor_logo_file_name: l.vendor_logo_file_name, count: 1 });
    }
    return Array.from(byVendor.values()).sort((a, b) => b.count - a.count).slice(0, 3);
  }, [listings]);

  const handleVendorCreated = (vendor: HubVendor) => {
    setMyVendor(vendor);
    onVendorClick?.(vendor.id);
  };

  const handleListingCreated = (listing: HubListing) => {
    setListings(prev => [listing, ...prev]);
  };

  const handlePostListing = () => {
    if (myVendor) setShowAddListing(true);
    else setShowCreateVendor(true);
  };

  // ── Inline detail view ─────────────────────────────────────
  if (selectedListing) {
    return (
      <ExchangeListingDetail
        listing={selectedListing}
        hubSlug={slug}
        allListings={listings}
        onBack={() => setSelectedListing(null)}
        onOpenListing={setSelectedListing}
        onVendorClick={onVendorClick}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-7 items-start">

          {/* ── Left: header + filters + grid ── */}
          <div className="flex flex-col gap-5 min-w-0">
            {/* Back */}
            <button
              onClick={onBack}
              className="md:hidden inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-slate-700 dark:hover:text-slate-200 transition-colors self-start"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shrink-0">
                <Store className="w-6 h-6 text-white" />
              </span>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight cn-text-1 leading-none">Exchange</h1>
                <p className="text-sm cn-text-3 mt-0.5">Buy, sell, lend & give - between neighbors</p>
              </div>
              <button
                onClick={handlePostListing}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                {myVendor ? 'Post a listing' : 'Start selling'}
              </button>
            </div>
            <button
              onClick={handlePostListing}
              className="sm:hidden w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              {myVendor ? 'Post a listing' : 'Start selling'}
            </button>

            {/* Hero banner — admin-configurable, real feature */}
            <div
              className={`relative overflow-hidden ${showBannerEdit ? 'rounded-t-2xl rounded-b-none mb-0' : 'rounded-2xl'} ${isRepositioning ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
              style={{ minHeight: 120 }}
              onPointerDown={handleBannerPointerDown}
              onPointerMove={handleBannerPointerMove}
              onPointerUp={handleBannerPointerUp}
            >
              {bannerImageUrl ? (
                <>
                  <img
                    src={bannerImageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ objectPosition: `center ${bannerY}%` }}
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/60 to-zinc-950/30" />
                </>
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/40 via-zinc-900 to-zinc-950" />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-[0.12]">
                    <Store className="w-24 h-24 text-white" />
                  </div>
                </>
              )}

              {isRepositioning && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
                  <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2 text-white text-sm font-semibold">
                    <MoveVertical className="w-4 h-4" />
                    Drag up or down to reposition
                  </div>
                </div>
              )}

              <div className="relative z-10 px-5 py-5 pr-14">
                <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest mb-1.5">Local Exchange</p>
                <h2 className="text-lg font-bold text-white leading-snug">{(showBannerEdit ? editTitle : bannerConfig.marketplace_banner_title) || 'Everything local, right here'}</h2>
                <p className="text-sm text-slate-300 mt-1">{(showBannerEdit ? editSubtitle : bannerConfig.marketplace_banner_subtitle) || ''}</p>
              </div>

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

            <AnimatePresence>
              {isAdmin && showBannerEdit && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="cn-surface border cn-border border-t-0 rounded-b-2xl px-4 py-4 -mt-5 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      onClick={() => !uploadingBannerImage && bannerFileRef.current?.click()}
                      className="relative w-28 h-16 rounded-xl cn-surface-2 border-2 border-dashed cn-border hover:border-purple-500 cursor-pointer overflow-hidden transition-colors flex items-center justify-center shrink-0"
                    >
                      {bannerImageUrl ? (
                        <img src={bannerImageUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `center ${bannerY}%` }} />
                      ) : (
                        <div className="flex flex-col items-center gap-1 cn-text-4">
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
                      <p className="text-xs font-semibold cn-text-2">Cover Image</p>
                      <p className="text-[11px] cn-text-4 leading-snug">Any image works — wide/landscape photos fill best. Tap the preview to change.</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {bannerImageUrl && (
                          <button
                            onClick={() => setIsRepositioning(r => !r)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isRepositioning ? 'bg-purple-600 text-white' : 'cn-surface-3 cn-text-2 hover:bg-black/10 dark:hover:bg-white/10'}`}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold cn-text-3 mb-1">Heading</label>
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        placeholder="Everything local, right here"
                        maxLength={80}
                        className="w-full px-3 py-2 cn-surface-2 border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-600/40"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold cn-text-3 mb-1">Subtext</label>
                      <input
                        value={editSubtitle}
                        onChange={e => setEditSubtitle(e.target.value)}
                        placeholder="Buy, sell & trade with your neighbors"
                        maxLength={100}
                        className="w-full px-3 py-2 cn-surface-2 border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-600/40"
                      />
                    </div>
                  </div>

                  {bannerError && <p className="text-xs text-red-400">{bannerError}</p>}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveBanner}
                      disabled={savingBanner || uploadingBannerImage}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-purple-500 transition-colors"
                    >
                      {savingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save
                    </button>
                    <button
                      onClick={handleCancelBannerEdit}
                      className="px-4 py-2 rounded-xl border cn-border cn-text-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            <div className="flex items-center gap-2.5 px-3.5 h-11 rounded-xl border cn-border cn-surface">
              <Search className="w-4 h-4 cn-text-4 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search the Exchange…"
                className="flex-1 bg-transparent outline-none text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="cn-text-4 hover:text-slate-700 dark:hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
              {CATEGORIES.map(cat => {
                const meta = CATEGORY_META[cat];
                const active = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(prev => prev === cat ? 'All' : cat)}
                    className={`inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                      active ? 'bg-purple-600 border-transparent text-white' : 'cn-surface cn-border cn-text-2 hover:border-black/20 dark:hover:border-white/20'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-white/20' : `bg-gradient-to-br ${meta.gradient}`}`}>
                      <meta.Icon className="w-3 h-3 text-white" />
                    </span>
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Tabs + sort */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-1 p-1 rounded-full cn-surface border cn-border overflow-x-auto no-scrollbar">
                {TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === t.key ? 'bg-purple-600 text-white' : 'cn-text-3 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {!loading && listings.length > 0 && (
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="text-xs cn-surface border cn-border cn-text-2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </div>

            {!loading && !error && (
              <p className="text-sm cn-text-3 -mt-2">
                <b className="font-mono cn-text-1">{filtered.length}</b> {filtered.length === 1 ? 'listing' : 'listings'}
              </p>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 cn-text-4">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">Loading marketplace…</p>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 cn-text-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm text-red-400">{error}</p>
                <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl cn-surface border cn-border text-sm cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && listings.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl cn-glass">
                <Store className="w-9 h-9 cn-text-4 mb-3" />
                <h3 className="text-base font-semibold cn-text-1 mb-1">Nothing listed yet</h3>
                <p className="text-sm cn-text-3 max-w-xs mb-5">Be the first to list something for the neighborhood.</p>
                <button
                  onClick={handlePostListing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 transition-colors"
                >
                  <Plus className="w-4 h-4" /> {myVendor ? 'Add your first listing' : 'Create a vendor page'}
                </button>
              </div>
            )}

            {/* No results after filtering */}
            {!loading && !error && listings.length > 0 && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 cn-text-4">
                <Search className="w-9 h-9 mb-3 opacity-30" />
                <p className="text-sm font-medium">No listings match your filters</p>
                <button
                  onClick={() => { setSearchQuery(''); setActiveCategory('All'); setActiveTab('all'); }}
                  className="mt-2 text-xs cn-text-3 hover:cn-text-1 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Grid */}
            {!loading && !error && filtered.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {filtered.map(listing => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    hubSlug={slug}
                    onOpen={() => setSelectedListing(listing)}
                    onVendorClick={onVendorClick}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Right rail ── */}
          <div className="hidden lg:flex flex-col gap-4 sticky top-7">
            <div className="rounded-2xl p-4 cn-glass">
              <div className="flex items-center gap-2 mb-3.5">
                <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-300" />
                <span className="text-[10px] font-bold uppercase tracking-wide cn-text-3">This hub</span>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 cn-text-4 shrink-0"><Store className="w-3.5 h-3.5" /></span>
                  <span className="flex-1 text-xs cn-text-2">Active listings</span>
                  <span className="font-mono text-sm font-bold cn-text-1">{stats.active}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Gift className="w-3.5 h-3.5 cn-text-4 shrink-0" />
                  <span className="flex-1 text-xs cn-text-2">Given free this month</span>
                  <span className="font-mono text-sm font-bold cn-text-1">{stats.freeThisMonth}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Repeat className="w-3.5 h-3.5 cn-text-4 shrink-0" />
                  <span className="flex-1 text-xs cn-text-2">Vendors on Exchange</span>
                  <span className="font-mono text-sm font-bold cn-text-1">{stats.vendorCount}</span>
                </div>
              </div>
            </div>

            {topVendors.length > 0 && (
              <div className="rounded-2xl p-4 cn-glass">
                <span className="text-[10px] font-bold uppercase tracking-wide cn-text-3">Community vendors</span>
                <div className="flex flex-col gap-1 mt-3">
                  {topVendors.map(v => (
                    <button
                      key={v.vendor_id}
                      onClick={() => onVendorClick?.(v.vendor_id)}
                      className="flex items-center gap-2.5 py-1.5 -mx-1 px-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      {v.vendor_logo_file_name
                        ? <img src={marketplaceService.getVendorLogoUrl(slug, v.vendor_logo_file_name) ?? undefined} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        : <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{v.vendor_name.charAt(0).toUpperCase()}</span>
                      }
                      <span className="flex-1 min-w-0 text-sm font-semibold cn-text-1 truncate">{v.vendor_name}</span>
                      <span className="font-mono text-xs cn-text-4">{v.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl p-4 cn-glass">
              <div className="flex gap-2.5">
                <ShieldCheck className="w-4.5 h-4.5 cn-text-3 shrink-0 mt-0.5" style={{ width: 18, height: 18 }} />
                <div>
                  <div className="text-sm font-semibold cn-text-1">Neighbors only</div>
                  <p className="mt-1 text-[11px] cn-text-3 leading-relaxed">Every seller is a verified member of this hub. Meet in public, pay in person.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
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
    </div>
  );
}
