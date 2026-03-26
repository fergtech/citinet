import { useMemo, useRef, useState } from 'react';
import { Clock, Phone, Globe, Mail, Store, Package, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, ImagePlus, Loader2, Palette } from 'lucide-react';
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

export function VendorProfileScreen({ vendor: initialVendor, listings: initialListings, hubSlug, onBack, onItemClick }: VendorProfileScreenProps) {
  const conn = hubService.getHubConnection(hubSlug);
  const currentUserId = conn?.user?.hubUserId;
  const isOwner = !!currentUserId && currentUserId === initialVendor.owner_user_id;

  const [vendor, setVendor] = useState(initialVendor);
  const [listings, setListings] = useState(initialListings);
  const [showEditVendor, setShowEditVendor] = useState(false);
  const [showAddListing, setShowAddListing] = useState(false);
  const [editingListing, setEditingListing] = useState<HubListing | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingVisual, setSavingVisual] = useState<'logo' | 'banner' | null>(null);
  const [visualError, setVisualError] = useState('');
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const bannerStyle = useMemo((): React.CSSProperties => {
    if (bannerPreview) {
      return { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (vendor.banner_mode === 'image' && vendor.banner_image_file_name) {
      const imageUrl = marketplaceService.getVendorBannerUrl(hubSlug, vendor.banner_image_file_name);
      if (imageUrl) {
        return {
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
      }
    }
    if (vendor.banner_mode === 'solid' && vendor.banner_color) {
      return { backgroundColor: vendor.banner_color };
    }
    if (vendor.banner_mode === 'gradient' && vendor.banner_gradient_from && vendor.banner_gradient_to) {
      return { backgroundImage: `linear-gradient(135deg, ${vendor.banner_gradient_from}, ${vendor.banner_gradient_to})` };
    }
    return { backgroundImage: 'linear-gradient(135deg, #2563eb, #7c3aed)' };
  }, [bannerPreview, hubSlug, vendor.banner_color, vendor.banner_gradient_from, vendor.banner_gradient_to, vendor.banner_image_file_name, vendor.banner_mode]);

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
      // Swap blob for real URL so preview stays stable while vendor state updates
      URL.revokeObjectURL(previewUrl);
      const freshUrl = marketplaceService.getVendorLogoUrl(hubSlug, updated.logo_file_name ?? '');
      setLogoPreview(freshUrl);
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      setLogoPreview(null);
      setVisualError(err?.message || 'Failed to update logo image');
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
      // Swap blob for real URL so preview stays stable while vendor state updates
      URL.revokeObjectURL(previewUrl);
      const freshUrl = marketplaceService.getVendorBannerUrl(hubSlug, updated.banner_image_file_name ?? '');
      setBannerPreview(freshUrl);
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      setBannerPreview(null);
      setVisualError(err?.message || 'Failed to update banner image');
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
    setDeletingId(listingId);
    try {
      await marketplaceService.deleteListing(hubSlug, listingId);
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch {
      // silent fail — listing stays
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (listing: HubListing) => {
    try {
      const updated = await marketplaceService.updateListing(hubSlug, listing.id, { is_active: !listing.is_active });
      setListings(prev => prev.map(l => l.id === updated.id ? updated : l));
    } catch { /* silent */ }
  };

  const activeListings = listings.filter(l => l.is_active !== false);
  const inactiveListings = listings.filter(l => l.is_active === false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="vendor-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#vendor-dots)" opacity="0.07"/>
        </svg>
      </div>
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex-1 truncate">{vendor.name}</h1>
          {isOwner && (
            <button
              onClick={() => setShowEditVendor(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <Pencil className="w-4 h-4" /> Edit Page
            </button>
          )}
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

          {/* Hero card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div
              className={`h-32 relative ${isOwner ? 'cursor-pointer' : ''}`}
              style={bannerStyle}
              onClick={() => isOwner && setShowBannerEditor(v => !v)}
              role={isOwner ? 'button' : undefined}
              aria-label={isOwner ? 'Edit banner' : undefined}
            >
              {isOwner && (
                <>
                  <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs font-semibold">
                      {savingVisual === 'banner' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      Edit Banner
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowBannerEditor(v => !v); }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 hover:bg-black/65 text-white transition-colors"
                    title="Customize banner"
                    aria-label="Customize banner"
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            <div className="px-6 pb-6">
              <div className="flex items-end gap-4 mb-4">
                <div
                  className={`relative -mt-16 ${isOwner ? 'cursor-pointer group' : ''}`}
                  onClick={() => isOwner && logoInputRef.current?.click()}
                  role={isOwner ? 'button' : undefined}
                  aria-label={isOwner ? 'Edit vendor avatar' : undefined}
                >
                  {(logoPreview || vendor.logo_file_name)
                    ? <img
                        src={logoPreview ?? (marketplaceService.getVendorLogoUrl(hubSlug, vendor.logo_file_name!) ?? undefined)}
                        alt={vendor.name}
                        className="w-24 h-24 rounded-2xl object-cover ring-4 ring-white dark:ring-zinc-900 shadow-lg"
                      />
                    : <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-white dark:ring-zinc-900 shadow-lg">
                        {vendor.name.charAt(0).toUpperCase()}
                      </div>
                  }
                  {isOwner && (
                    <div className="absolute inset-0 rounded-2xl bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ring-4 ring-white dark:ring-zinc-900">
                      {savingVisual === 'logo'
                        ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                        : <ImagePlus className="w-5 h-5 text-white" />
                      }
                    </div>
                  )}
                </div>
                <div className="mb-2 flex-1 min-w-0">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{vendor.name}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{vendor.category}</p>
                </div>
              </div>

              {isOwner && showBannerEditor && (
                <div className="mb-4 rounded-xl border border-slate-200 dark:border-zinc-700 p-3 bg-slate-50 dark:bg-zinc-800/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Banner Style</p>
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={savingVisual === 'banner'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-60"
                    >
                      {savingVisual === 'banner' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      Upload Image
                    </button>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Solid Colors</p>
                    <div className="flex flex-wrap gap-2">
                      {BANNER_SOLID_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => saveVendorVisuals({ banner_mode: 'solid', banner_color: color }, 'banner')}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${vendor.banner_mode === 'solid' && vendor.banner_color === color ? 'border-white ring-2 ring-slate-900 dark:ring-white' : 'border-white/70 dark:border-zinc-700'}`}
                          style={{ backgroundColor: color }}
                          title={`Solid ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Gradients</p>
                    <div className="flex flex-wrap gap-2">
                      {BANNER_GRADIENTS.map(g => {
                        const selected = vendor.banner_mode === 'gradient' && vendor.banner_gradient_from === g.from && vendor.banner_gradient_to === g.to;
                        return (
                          <button
                            key={`${g.from}-${g.to}`}
                            type="button"
                            onClick={() => saveVendorVisuals({ banner_mode: 'gradient', banner_gradient_from: g.from, banner_gradient_to: g.to }, 'banner')}
                            className={`w-10 h-7 rounded-lg border-2 transition-all ${selected ? 'border-white ring-2 ring-slate-900 dark:ring-white' : 'border-white/70 dark:border-zinc-700'}`}
                            style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                            title="Choose gradient"
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {visualError && (
                <p className="mb-4 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{visualError}</p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{listings.length}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Listings</div>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatMemberSince(vendor.created_at).split(' ')[0]}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Member Since</div>
                </div>
              </div>

              {isOwner ? (
                <button
                  onClick={() => setShowAddListing(true)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Listing
                </button>
              ) : (
                <button className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2">
                  <Store className="w-4 h-4" /> Contact Vendor
                </button>
              )}
            </div>
          </div>

          {/* About */}
          {vendor.description && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">About</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{vendor.description}</p>
            </div>
          )}

          {/* Contact */}
          {(vendor.contact_phone || vendor.contact_email || vendor.website || vendor.hours) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Contact</h3>
              <div className="space-y-3">
                {vendor.contact_phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-purple-500 shrink-0" />
                    <a href={`tel:${vendor.contact_phone}`} className="text-purple-600 dark:text-purple-400 hover:underline">{vendor.contact_phone}</a>
                  </div>
                )}
                {vendor.contact_email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-purple-500 shrink-0" />
                    <a href={`mailto:${vendor.contact_email}`} className="text-purple-600 dark:text-purple-400 hover:underline">{vendor.contact_email}</a>
                  </div>
                )}
                {vendor.website && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="w-4 h-4 text-purple-500 shrink-0" />
                    <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">{vendor.website}</a>
                  </div>
                )}
                {vendor.hours && (
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-purple-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">{vendor.hours}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Listings */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Listings ({activeListings.length})
              </h3>
              {isOwner && (
                <button
                  onClick={() => setShowAddListing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-semibold hover:bg-purple-200 dark:hover:bg-purple-500/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New Listing
                </button>
              )}
            </div>

            {activeListings.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isOwner ? 'No listings yet — add your first one above.' : 'No listings yet'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {activeListings.map(listing => {
                  const imageUrl = listing.image_file_name
                    ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name)
                    : null;
                  return (
                    <div
                      key={listing.id}
                      className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700 transition-all group relative"
                    >
                      <div
                        onClick={() => !isOwner && onItemClick(listing.id)}
                        className={`relative aspect-square bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 ${!isOwner ? 'cursor-pointer' : ''}`}
                      >
                        {imageUrl
                          ? <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-purple-300 dark:text-purple-700" /></div>
                        }
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1">{listing.title}</p>
                        <p className="text-purple-600 dark:text-purple-400 font-bold text-sm">{formatPrice(listing)}</p>

                        {isOwner && (
                          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-200 dark:border-zinc-700">
                            <button
                              onClick={() => setEditingListing(listing)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(listing)}
                              title={listing.is_active ? 'Deactivate' : 'Activate'}
                              className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                              {listing.is_active
                                ? <ToggleRight className="w-4 h-4 text-green-500" />
                                : <ToggleLeft className="w-4 h-4 text-slate-400" />
                              }
                            </button>
                            <button
                              onClick={() => handleDeleteListing(listing.id)}
                              disabled={deletingId === listing.id}
                              className="p-1 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inactive/hidden listings — owner only */}
          {isOwner && inactiveListings.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
              <h3 className="text-base font-bold text-slate-500 dark:text-slate-400 mb-4">
                Hidden ({inactiveListings.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 opacity-60">
                {inactiveListings.map(listing => (
                  <div key={listing.id} className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800">
                    <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center">
                      <Package className="w-8 h-8 text-slate-400 dark:text-zinc-500" />
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 mb-1">{listing.title}</p>
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-200 dark:border-zinc-700">
                        <button
                          onClick={() => setEditingListing(listing)}
                          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(listing)}
                          title="Re-activate"
                          className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <ToggleLeft className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteListing(listing.id)}
                          disabled={deletingId === listing.id}
                          className="p-1 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

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

      {/* Edit vendor modal */}
      <CreateVendorModal
        isOpen={showEditVendor}
        hubSlug={hubSlug}
        existingVendor={vendor}
        onClose={() => setShowEditVendor(false)}
        onCreated={handleVendorUpdated}
      />

      {/* Add listing modal */}
      <AddListingModal
        isOpen={showAddListing}
        hubSlug={hubSlug}
        onClose={() => setShowAddListing(false)}
        onCreated={handleListingCreated}
      />

      {/* Edit listing modal */}
      {editingListing && (
        <AddListingModal
          isOpen={true}
          hubSlug={hubSlug}
          existingListing={editingListing}
          onClose={() => setEditingListing(null)}
          onCreated={handleListingUpdated}
        />
      )}
    </div>
  );
}
