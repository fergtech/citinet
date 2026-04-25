import { useMemo, useRef, useState, useEffect } from 'react';
import { Clock, Phone, Globe, Mail, Package, Plus, Pencil, X, ImagePlus, Loader2, MessageCircle, Link, Heart, Star, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { HubVendor, HubListing } from '../types/hub';
import { marketplaceService } from '../services/marketplaceService';
import { hubService } from '../services/hubService';
import { AddListingModal } from './AddListingModal';
import { CreateVendorModal } from './CreateVendorModal';

interface VendorProfileScreenProps {
  vendor: HubVendor;
  listings: HubListing[];
  hubSlug: string;
  onBack: () => void;
  onItemClick: (listingId: string) => void;
}

function formatMemberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function formatPrice(listing: HubListing): string {
  if (listing.price_type === 'free') return 'Free';
  if (listing.price_type === 'contact') return 'Contact';
  if (listing.price == null) return 'Contact';
  const f = `$${Number(listing.price).toFixed(2)}`;
  if (listing.price_type === 'hourly') return `${f}/hr`;
  if (listing.price_type === 'negotiable') return `${f} OBO`;
  return f;
}

const BANNER_SOLID_COLORS = ['#0f766e', '#0369a1', '#1d4ed8', '#6d28d9', '#be123c', '#b45309', '#374151'];
const BANNER_GRADIENTS = [
  { from: '#2563eb', to: '#7c3aed' },
  { from: '#0f766e', to: '#2563eb' },
  { from: '#be123c', to: '#7c2d12' },
  { from: '#1d4ed8', to: '#0f766e' },
  { from: '#c2410c', to: '#be123c' },
  { from: '#374151', to: '#111827' },
];

// ── Helper functions ────────────────────────────────────

function getFeaturedListings(listings: HubListing[]): HubListing[] {
  if (listings.length === 0) return [];
  const sorted = [...listings].sort((a, b) => {
    const priceA = a.price ?? 0;
    const priceB = b.price ?? 0;
    return priceB - priceA;
  });
  return sorted.slice(0, 4);
}

function getVendorHighlights(vendor: HubVendor, listings: HubListing[]): { icon: string; label: string }[] {
  const highlights: { icon: string; label: string }[] = [];

  if (listings.length >= 5) highlights.push({ icon: '⭐', label: 'Trusted seller' });
  if (listings.length >= 10) highlights.push({ icon: '🔥', label: 'Popular vendor' });

  try {
    const daysSince = Math.floor((Date.now() - new Date(vendor.created_at).getTime()) / 86400000);
    if (daysSince < 30) highlights.push({ icon: '🆕', label: 'New member' });
    else highlights.push({ icon: '⏰', label: `Member ${formatMemberSince(vendor.created_at)}` });
  } catch { /* silent */ }

  if (vendor.category) highlights.push({ icon: '🏷️', label: vendor.category });
  if (vendor.hours) highlights.push({ icon: '🕐', label: 'Hours today' });

  return highlights.slice(0, 4);
}

function formatStory(desc: string): string[] {
  if (!desc) return [];
  return desc.split('\n\n').filter(p => p.trim().length > 0);
}

export function VendorProfileScreen({ vendor: initialVendor, listings: initialListings, hubSlug, onBack, onItemClick }: VendorProfileScreenProps) {
  const conn = hubService.getHubConnection(hubSlug);
  const currentUserId = conn?.user?.hubUserId;
  const isOwner = !!currentUserId && currentUserId === initialVendor.owner_user_id;

  // State
  const [vendor, setVendor] = useState(initialVendor);
  const [listings, setListings] = useState(initialListings);
  const [activeTab, setActiveTab] = useState<'overview' | 'listings' | 'about' | 'contact'>('overview');
  const [isStickySidebar, setIsStickySidebar] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState(false);
  const [showAddListing, setShowAddListing] = useState(false);
  const [editingListing, setEditingListing] = useState<HubListing | null>(null);
  const [savingVisual, setSavingVisual] = useState<'logo' | 'banner' | null>(null);
  const [visualError, setVisualError] = useState('');
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('saved_vendors') || '[]') : [];
    return saved.includes(initialVendor.id);
  });
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Observers & effects
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsStickySidebar(!entry.isIntersecting);
    }, { threshold: 0.5 });

    if (sidebarRef.current) observer.observe(sidebarRef.current);
    return () => observer.disconnect();
  }, []);

  // Computed data
  const bannerStyle = useMemo((): React.CSSProperties => {
    if (bannerPreview) {
      return { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (vendor.banner_mode === 'image' && vendor.banner_image_file_name) {
      const imageUrl = marketplaceService.getVendorBannerUrl(hubSlug, vendor.banner_image_file_name);
      return {
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (vendor.banner_mode === 'solid' && vendor.banner_color) {
      return { backgroundColor: vendor.banner_color };
    }
    if (vendor.banner_mode === 'gradient' && vendor.banner_gradient_from && vendor.banner_gradient_to) {
      return { backgroundImage: `linear-gradient(135deg, ${vendor.banner_gradient_from}, ${vendor.banner_gradient_to})` };
    }
    return { backgroundImage: 'linear-gradient(135deg, #2563eb, #7c3aed)' };
  }, [bannerPreview, hubSlug, vendor.banner_color, vendor.banner_gradient_from, vendor.banner_gradient_to, vendor.banner_image_file_name, vendor.banner_mode]);

  const featuredListings = useMemo(() => getFeaturedListings(listings), [listings]);
  const highlights = useMemo(() => getVendorHighlights(vendor, listings), [vendor, listings]);
  const storyParagraphs = useMemo(() => formatStory(vendor.description ?? ''), [vendor.description]);

  const activeListings = listings.filter(l => l.is_active !== false);
  const inactiveListings = listings.filter(l => l.is_active === false);

  // Handlers (kept from original)
  const saveVendorVisuals = async (updates: Partial<HubVendor>, savingTarget: 'logo' | 'banner') => {
    setSavingVisual(savingTarget);
    setVisualError('');
    try {
      const updated = await marketplaceService.updateVendor(hubSlug, updates);
      setVendor(updated);
    } catch (err: any) {
      setVisualError(err?.message || 'Failed to update vendor visuals');
    } finally {
      setSavingVisual(null);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setLogoPreview(previewUrl);
    setSavingVisual('logo');
    setVisualError('');
    try {
      const uploaded = await hubService.uploadFile(hubSlug, file, true);
      const updated = await marketplaceService.updateVendor(hubSlug, { logo_file_name: uploaded.name });
      setVendor(updated);
      URL.revokeObjectURL(previewUrl);
      const freshUrl = marketplaceService.getVendorLogoUrl(hubSlug, updated.logo_file_name ?? '');
      setLogoPreview(freshUrl);
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      setLogoPreview(null);
      setVisualError(err?.message || 'Failed to update logo');
    } finally {
      setSavingVisual(null);
      e.target.value = '';
    }
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setBannerPreview(previewUrl);
    setSavingVisual('banner');
    setVisualError('');
    try {
      const uploaded = await hubService.uploadFile(hubSlug, file, true);
      const updated = await marketplaceService.updateVendor(hubSlug, {
        banner_mode: 'image',
        banner_image_file_name: uploaded.name,
      });
      setVendor(updated);
      URL.revokeObjectURL(previewUrl);
      const freshUrl = marketplaceService.getVendorBannerUrl(hubSlug, updated.banner_image_file_name ?? '');
      setBannerPreview(freshUrl);
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      setBannerPreview(null);
      setVisualError(err?.message || 'Failed to update banner');
    } finally {
      setSavingVisual(null);
      e.target.value = '';
    }
  };

  const handleVendorUpdated = (updated: HubVendor) => {
    setVendor(updated);
    setShowEditVendor(false);
  };

  const handleListingCreated = (listing: HubListing) => {
    setListings(prev => [listing, ...prev]);
    setShowAddListing(false);
  };

  const handleListingUpdated = (updated: HubListing) => {
    setListings(prev => prev.map(l => l.id === updated.id ? updated : l));
    setEditingListing(null);
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!confirm('Delete this listing?')) return;
    try {
      await marketplaceService.deleteListing(hubSlug, listingId);
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch {
      // silent
    }
  };

  const handleToggleActive = async (listing: HubListing) => {
    try {
      const updated = await marketplaceService.updateListing(hubSlug, listing.id, { is_active: !listing.is_active });
      setListings(prev => prev.map(l => l.id === updated.id ? updated : l));
    } catch { /* silent */ }
  };

  const handleToggleSave = () => {
    const saved = JSON.parse(localStorage.getItem('saved_vendors') || '[]');
    if (isSaved) {
      const idx = saved.indexOf(vendor.id);
      if (idx !== -1) saved.splice(idx, 1);
    } else {
      saved.push(vendor.id);
    }
    localStorage.setItem('saved_vendors', JSON.stringify(saved));
    setIsSaved(!isSaved);
  };

  const handleTogglePublic = async () => {
    if (!vendor.slug) return;
    setTogglingPublic(true);
    try {
      const updated = await marketplaceService.updateVendor(hubSlug, { web_public: !vendor.web_public });
      setVendor(updated);
    } finally {
      setTogglingPublic(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!vendor.slug) return;
    navigator.clipboard.writeText(marketplaceService.getVendorPublicUrl(hubSlug, vendor.slug));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Hero Banner — Full Width */}
      <motion.div
        className="relative w-full h-72 bg-gradient-to-br from-blue-600 to-purple-600 overflow-hidden"
        style={bannerStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Gradient fade at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-50 dark:to-zinc-950" />

        {/* Banner Edit Overlay */}
        {isOwner && (
          <motion.div
            className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
            onClick={() => setShowBannerEditor(v => !v)}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/60 text-white font-semibold">
              <ImagePlus className="w-4 h-4" /> Edit Banner
            </div>
          </motion.div>
        )}

        {/* Logo Overlap (positioned absolutely) */}
        <motion.div
          className="absolute bottom-0 left-8 -translate-y-12"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div
            className={`relative w-32 h-32 rounded-2xl ring-4 ring-white dark:ring-zinc-900 shadow-lg ${isOwner ? 'cursor-pointer group' : ''}`}
            onClick={() => isOwner && logoInputRef.current?.click()}
          >
            {(logoPreview || vendor.logo_file_name)
              ? <img
                  src={logoPreview ?? (marketplaceService.getVendorLogoUrl(hubSlug, vendor.logo_file_name!) ?? undefined)}
                  alt={vendor.name}
                  className="w-full h-full object-cover rounded-2xl"
                />
              : <div className="w-full h-full rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-5xl font-bold">
                  {vendor.name.charAt(0).toUpperCase()}
                </div>
            }
            {isOwner && (
              <div className="absolute inset-0 rounded-2xl bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {savingVisual === 'logo'
                  ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                  : <ImagePlus className="w-6 h-6 text-white" />
                }
              </div>
            )}
          </div>
        </motion.div>

        {/* Close button */}
        <motion.button
          onClick={onBack}
          className="absolute top-4 right-4 w-10 h-10 rounded-lg bg-white/90 dark:bg-zinc-900/90 hover:bg-white dark:hover:bg-zinc-800 flex items-center justify-center shadow-lg"
          whileHover={{ scale: 1.1 }}
        >
          <X className="w-5 h-5 text-slate-900 dark:text-white" />
        </motion.button>
      </motion.div>

      {/* Storefront Header Bar */}
      <motion.div
        className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 backdrop-blur-sm"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{vendor.name}</h1>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">{vendor.category}</p>
              {highlights.slice(0, 2).map(h => (
                <span key={h.label} className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  {h.icon} {h.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              onClick={handleToggleSave}
              className={`p-2 rounded-lg transition-colors ${
                isSaved
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
            </motion.button>
            {isOwner && vendor.slug ? (
              vendor.web_public ? (
                <div className="flex items-center gap-1.5">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={handleCopyPublicLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium transition-colors"
                    title="Copy public link"
                  >
                    {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                    {linkCopied ? 'Copied!' : 'Copy link'}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={handleTogglePublic}
                    disabled={togglingPublic}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    title="Make private"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Public
                  </motion.button>
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={handleTogglePublic}
                  disabled={togglingPublic}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400 text-xs font-medium transition-colors disabled:opacity-50"
                  title="Make profile public"
                >
                  {togglingPublic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  Make public
                </motion.button>
              )
            ) : (
              <motion.button
                whileHover={{ scale: 1.1 }}
                className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400"
              >
                <Globe className="w-5 h-5" />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Main Content — 2 Column Layout */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Left Sidebar — Fixed/Sticky */}
        <motion.div
          ref={sidebarRef}
          className={`w-80 border-r border-slate-200 dark:border-zinc-800 p-6 space-y-6 ${
            isStickySidebar ? 'fixed left-0 top-0 h-screen w-80 overflow-y-auto bg-white dark:bg-zinc-900' : ''
          }`}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          {/* Contact Info Card */}
          <motion.div
            className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3"
            whileHover={{ y: -2 }}
          >
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Contact</h3>
            {vendor.contact_phone && (
              <a href={`tel:${vendor.contact_phone}`} className="flex items-center gap-3 text-sm text-purple-600 dark:text-purple-400 hover:underline">
                <Phone className="w-4 h-4" /> {vendor.contact_phone}
              </a>
            )}
            {vendor.contact_email && (
              <a href={`mailto:${vendor.contact_email}`} className="flex items-center gap-3 text-sm text-purple-600 dark:text-purple-400 hover:underline">
                <Mail className="w-4 h-4" /> {vendor.contact_email}
              </a>
            )}
            {vendor.website && (
              <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener" className="flex items-center gap-3 text-sm text-purple-600 dark:text-purple-400 hover:underline">
                <Globe className="w-4 h-4" /> Website
              </a>
            )}
            {vendor.hours && (
              <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <Clock className="w-4 h-4" /> {vendor.hours}
              </div>
            )}
          </motion.div>

          {/* About Card */}
          {vendor.description && (
            <motion.div
              className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4"
              whileHover={{ y: -2 }}
            >
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">About</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-4">{vendor.description}</p>
            </motion.div>
          )}

          {/* Buttons */}
          <div className="space-y-2 pt-4">
            {isOwner ? (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setShowEditVendor(true)}
                  className="w-full py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" /> Edit Profile
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setShowAddListing(true)}
                  className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Listing
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  className="w-full py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> Contact Vendor
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Follow
                </motion.button>
              </>
            )}
          </div>

          {/* Highlights */}
          <motion.div className="pt-4 space-y-2">
            {highlights.map((h, idx) => (
              <motion.div
                key={h.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
                className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
              >
                <span className="text-lg">{h.icon}</span> {h.label}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right Content Area */}
        <motion.div
          className="flex-1 p-6 space-y-6 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {/* Tabs */}
          <div className="flex gap-4 border-b border-slate-200 dark:border-zinc-800">
            {(['overview', 'listings', 'about', 'contact'] as const).map(tab => (
              <motion.button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-medium capitalize transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab}
              </motion.button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-6"
              >
                {/* Featured Listings Row */}
                {featuredListings.length > 0 && (
                  <motion.div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-500" /> Featured
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {featuredListings.map((listing, idx) => {
                        const imageUrl = listing.image_file_name
                          ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name)
                          : null;
                        return (
                          <motion.div
                            key={listing.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => !isOwner && onItemClick(listing.id)}
                            className="rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-800 hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer group"
                            whileHover={{ y: -4 }}
                          >
                            <div className="aspect-square bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 overflow-hidden">
                              {imageUrl && (
                                <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                              )}
                              {!imageUrl && <Package className="w-8 h-8 text-purple-300 dark:text-purple-700 absolute inset-1/2 -translate-x-1/2 -translate-y-1/2" />}
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-1">{listing.title}</p>
                              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">{formatPrice(listing)}</p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

              </motion.div>
            )}

            {activeTab === 'listings' && (
              <motion.div
                key="listings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                {activeListings.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400">
                      {isOwner ? 'No listings yet. Create your first one!' : 'No listings available'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activeListings.map((listing, idx) => {
                      const imageUrl = listing.image_file_name
                        ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name)
                        : null;
                      return (
                        <motion.div
                          key={listing.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => !isOwner && onItemClick(listing.id)}
                          className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer group"
                          whileHover={{ y: -4 }}
                        >
                          <div className="aspect-square bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 overflow-hidden relative">
                            {imageUrl && (
                              <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                            )}
                            {!imageUrl && <Package className="w-8 h-8 text-purple-300 dark:text-purple-700 absolute inset-1/2 -translate-x-1/2 -translate-y-1/2" />}
                          </div>
                          <div className="p-3">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1">{listing.title}</p>
                            <p className="text-xs text-purple-600 dark:text-purple-400 font-bold mb-2">{formatPrice(listing)}</p>
                            {isOwner && (
                              <div className="flex gap-1 pt-2 border-t border-slate-200 dark:border-zinc-700">
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  onClick={(e) => { e.stopPropagation(); setEditingListing(listing); }}
                                  className="flex-1 py-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                >
                                  Edit
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  onClick={(e) => { e.stopPropagation(); handleToggleActive(listing); }}
                                  className="flex-1 py-1 text-[10px] bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-zinc-600 transition-colors"
                                >
                                  {listing.is_active ? 'Hide' : 'Show'}
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteListing(listing.id); }}
                                  className="flex-1 py-1 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                >
                                  Delete
                                </motion.button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Hidden listings */}
                {isOwner && inactiveListings.length > 0 && (
                  <motion.div className="mt-8 pt-8 border-t border-slate-200 dark:border-zinc-800">
                    <details className="group">
                      <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>Hidden ({inactiveListings.length})</span>
                        <span className="group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 opacity-60">
                        {inactiveListings.map(listing => {
                          const imageUrl = listing.image_file_name
                            ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name)
                            : null;
                          return (
                            <div key={listing.id} className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800">
                              <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center">
                                {imageUrl && <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover" />}
                                {!imageUrl && <Package className="w-8 h-8 text-slate-400 dark:text-zinc-500" />}
                              </div>
                              <div className="p-3">
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2">{listing.title}</p>
                                <div className="flex gap-1 mt-2 pt-2 border-t border-slate-200 dark:border-zinc-700">
                                  <button onClick={() => setEditingListing(listing)} className="flex-1 py-1 text-[10px] bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 rounded transition-colors">Edit</button>
                                  <button onClick={() => handleToggleActive(listing)} className="flex-1 py-1 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors">Show</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </motion.div>
                )}
              </motion.div>
            )}

            {activeTab === 'about' && (
              <motion.div
                key="about"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-6 space-y-4"
              >
                {vendor.description ? (
                  storyParagraphs.map((para, idx) => (
                    <p key={idx} className="text-slate-700 dark:text-slate-300 leading-relaxed">{para}</p>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">No description yet</p>
                )}
              </motion.div>
            )}

            {activeTab === 'contact' && (
              <motion.div
                key="contact"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-4"
              >
                <motion.div className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-6 space-y-4">
                  {vendor.contact_phone && (
                    <a href={`tel:${vendor.contact_phone}`} className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                      <Phone className="w-5 h-5 text-purple-600" /> <span className="flex-1">{vendor.contact_phone}</span> <span className="text-xs text-slate-500">Call</span>
                    </a>
                  )}
                  {vendor.contact_email && (
                    <a href={`mailto:${vendor.contact_email}`} className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                      <Mail className="w-5 h-5 text-blue-600" /> <span className="flex-1">{vendor.contact_email}</span> <span className="text-xs text-slate-500">Email</span>
                    </a>
                  )}
                  {vendor.website && (
                    <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener" className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                      <Globe className="w-5 h-5 text-indigo-600" /> <span className="flex-1 truncate">{vendor.website}</span> <span className="text-xs text-slate-500">Visit</span>
                    </a>
                  )}
                  {vendor.hours && (
                    <div className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-lg">
                      <Clock className="w-5 h-5 text-amber-600" /> <span className="flex-1">{vendor.hours}</span>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Floating Contact Button — Mobile */}
      <motion.div className="md:hidden fixed bottom-6 right-6 z-50">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg flex items-center justify-center hover:bg-purple-700 transition-colors"
        >
          <MessageCircle className="w-6 h-6" />
        </motion.button>
      </motion.div>

      {/* Hidden inputs */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoFileChange}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBannerFileChange}
      />

      {/* Modals */}
      <CreateVendorModal
        isOpen={showEditVendor}
        hubSlug={hubSlug}
        existingVendor={vendor}
        onClose={() => setShowEditVendor(false)}
        onCreated={handleVendorUpdated}
      />

      <AddListingModal
        isOpen={showAddListing}
        hubSlug={hubSlug}
        onClose={() => setShowAddListing(false)}
        onCreated={handleListingCreated}
      />

      {editingListing && (
        <AddListingModal
          isOpen={true}
          hubSlug={hubSlug}
          existingListing={editingListing}
          onClose={() => setEditingListing(null)}
          onCreated={handleListingUpdated}
        />
      )}

      {/* Banner Editor Modal */}
      <AnimatePresence>
        {isOwner && showBannerEditor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowBannerEditor(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-xl p-6 max-w-sm w-full space-y-4"
            >
              <h3 className="font-bold text-slate-900 dark:text-white">Banner Style</h3>

              <button type="button" onClick={() => bannerInputRef.current?.click()} className="w-full py-2 px-4 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-sm font-medium transition-colors">
                {savingVisual === 'banner' ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <ImagePlus className="w-4 h-4 inline mr-2" />}
                Upload Image
              </button>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Solid Colors</p>
                <div className="flex flex-wrap gap-2">
                  {BANNER_SOLID_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => saveVendorVisuals({ banner_mode: 'solid', banner_color: color }, 'banner')}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${vendor.banner_mode === 'solid' && vendor.banner_color === color ? 'border-white ring-2 ring-slate-900 dark:ring-white' : 'border-white/70'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Gradients</p>
                <div className="flex flex-wrap gap-2">
                  {BANNER_GRADIENTS.map(g => {
                    const selected = vendor.banner_mode === 'gradient' && vendor.banner_gradient_from === g.from && vendor.banner_gradient_to === g.to;
                    return (
                      <button
                        key={`${g.from}-${g.to}`}
                        type="button"
                        onClick={() => saveVendorVisuals({ banner_mode: 'gradient', banner_gradient_from: g.from, banner_gradient_to: g.to }, 'banner')}
                        className={`w-12 h-8 rounded-lg border-2 transition-all ${selected ? 'border-white ring-2 ring-slate-900 dark:ring-white' : 'border-white/70'}`}
                        style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      />
                    );
                  })}
                </div>
              </div>

              {visualError && <p className="text-xs text-red-600 dark:text-red-400">{visualError}</p>}

              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={() => setShowBannerEditor(false)}
                className="w-full py-2 px-4 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium transition-colors"
              >
                Done
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
