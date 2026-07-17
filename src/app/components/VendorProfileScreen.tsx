import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bookmark, Share2, Check, Loader2, MessageCircle, Pencil, Plus,
  ImagePlus, Globe, Link2, Phone, Mail, Clock, Package, Calendar, Tag, BadgeCheck,
  Eye, EyeOff, Trash2,
} from 'lucide-react';
import type { HubVendor, HubListing } from '../types/hub';
import { marketplaceService } from '../services/marketplaceService';
import { hubService } from '../services/hubService';
import { AddListingModal } from './AddListingModal';
import { CreateVendorModal } from './CreateVendorModal';
import { ListingCard } from './MarketplaceScreen';

interface VendorProfileScreenProps {
  vendor: HubVendor;
  listings: HubListing[];
  hubSlug: string;
  /** When set, media URLs are built from this base instead of the stored hub connection.
   *  Used when rendering from the public web (no auth session). */
  hubBaseUrl?: string;
  onBack: () => void;
  onItemClick: (listingId: string) => void;
  onNavigate?: (screen: string) => void;
}

function formatMemberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function formatStory(desc: string): string[] {
  if (!desc) return [];
  return desc.split('\n\n').filter(p => p.trim().length > 0);
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

export function VendorProfileScreen({ vendor: initialVendor, listings: initialListings, hubSlug, hubBaseUrl, onBack, onItemClick, onNavigate }: VendorProfileScreenProps) {
  const conn = hubService.getHubConnection(hubSlug);
  const currentUserId = conn?.user?.hubUserId;

  // Resolves a MinIO file name to a publicly-accessible URL.
  // In public/web mode (hubBaseUrl provided) we use the registry tunnel URL directly
  // since there is no stored hub connection to derive it from.
  const fileUrl = (fileName: string | null | undefined): string | null => {
    if (!fileName) return null;
    if (hubBaseUrl) return `${hubBaseUrl}/api/public/files/${encodeURIComponent(fileName)}`;
    return hubService.getPublicFileUrl(hubSlug, fileName);
  };
  const isOwner = !!currentUserId && currentUserId === initialVendor.owner_user_id;
  const canMessage = !isOwner && !hubBaseUrl && !!onNavigate;

  const [vendor, setVendor] = useState(initialVendor);
  const [listings, setListings] = useState(initialListings);
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
  const [copied, setCopied] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const bannerStyle = useMemo((): React.CSSProperties => {
    if (bannerPreview) return { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    if (vendor.banner_mode === 'image' && vendor.banner_image_file_name) {
      return { backgroundImage: `url(${fileUrl(vendor.banner_image_file_name)})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (vendor.banner_mode === 'solid' && vendor.banner_color) return { backgroundColor: vendor.banner_color };
    if (vendor.banner_mode === 'gradient' && vendor.banner_gradient_from && vendor.banner_gradient_to) {
      return { backgroundImage: `linear-gradient(135deg, ${vendor.banner_gradient_from}, ${vendor.banner_gradient_to})` };
    }
    return { backgroundImage: 'linear-gradient(135deg, #2563eb, #7c3aed)' };
  }, [bannerPreview, hubSlug, vendor.banner_color, vendor.banner_gradient_from, vendor.banner_gradient_to, vendor.banner_image_file_name, vendor.banner_mode]);

  const storyParagraphs = useMemo(() => formatStory(vendor.description ?? ''), [vendor.description]);
  const activeListings = listings.filter(l => l.is_active !== false);
  const inactiveListings = listings.filter(l => l.is_active === false);
  const hasContact = !!(vendor.contact_phone || vendor.contact_email || vendor.website || vendor.hours);

  // Doesn't create a conversation here — just hands off who to message. MessagesScreen
  // reuses an existing DM with this vendor if one exists, or opens a draft that only
  // becomes a real conversation once a message is actually sent.
  const handleMessageVendor = () => {
    if (!vendor.owner_user_id) return;
    sessionStorage.setItem('citinet-deeplink-message-peer', JSON.stringify({
      userId: vendor.owner_user_id,
      username: vendor.name,
    }));
    onNavigate?.('messages');
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      setLogoPreview(fileUrl(updated.logo_file_name));
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
      const updated = await marketplaceService.updateVendor(hubSlug, { banner_mode: 'image', banner_image_file_name: uploaded.name });
      setVendor(updated);
      URL.revokeObjectURL(previewUrl);
      setBannerPreview(fileUrl(updated.banner_image_file_name));
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      setBannerPreview(null);
      setVisualError(err?.message || 'Failed to update banner');
    } finally {
      setSavingVisual(null);
      e.target.value = '';
    }
  };

  const handleVendorUpdated = (updated: HubVendor) => { setVendor(updated); setShowEditVendor(false); };
  const handleListingCreated = (listing: HubListing) => { setListings(prev => [listing, ...prev]); setShowAddListing(false); };
  const handleListingUpdated = (updated: HubListing) => { setListings(prev => prev.map(l => l.id === updated.id ? updated : l)); setEditingListing(null); };

  const handleDeleteListing = async (listingId: string) => {
    if (!confirm('Delete this listing?')) return;
    try {
      await marketplaceService.deleteListing(hubSlug, listingId);
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch { /* silent */ }
  };

  const handleToggleActive = async (listing: HubListing) => {
    try {
      const updated = await marketplaceService.updateListing(hubSlug, listing.id, { is_active: !listing.is_active });
      setListings(prev => prev.map(l => l.id === updated.id ? updated : l));
    } catch { /* silent */ }
  };

  const handleToggleSave = () => {
    const saved = JSON.parse(localStorage.getItem('saved_vendors') || '[]');
    if (isSaved) { const idx = saved.indexOf(vendor.id); if (idx !== -1) saved.splice(idx, 1); }
    else saved.push(vendor.id);
    localStorage.setItem('saved_vendors', JSON.stringify(saved));
    setIsSaved(!isSaved);
  };

  const handleTogglePublic = async () => {
    if (!vendor.slug) return;
    setTogglingPublic(true);
    try {
      const updated = await marketplaceService.updateVendor(hubSlug, { web_public: !vendor.web_public });
      setVendor(updated);
    } finally { setTogglingPublic(false); }
  };

  const handleCopyPublicLink = () => {
    if (!vendor.slug) return;
    navigator.clipboard.writeText(marketplaceService.getVendorPublicUrl(hubSlug, vendor.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function ListingTile({ listing }: { listing: HubListing }) {
    return (
      <div className="relative">
        <ListingCard listing={listing} hubSlug={hubSlug} onOpen={() => onItemClick(listing.id)} />
        {isOwner && (
          <div className="flex items-center gap-1 mt-1.5 px-0.5">
            <button onClick={() => setEditingListing(listing)} title="Edit listing" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5 cn-text-3 transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={() => handleToggleActive(listing)} title={listing.is_active ? 'Hide listing' : 'Show listing'} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5 cn-text-3 transition-colors">
              {listing.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button onClick={() => handleDeleteListing(listing.id)} title="Delete listing" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg cn-surface-2 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 cn-text-3 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-7">
        {/* Top bar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 border cn-border cn-surface cn-text-2 text-sm font-semibold px-3.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Exchange
          </button>
          <div className="flex-1" />
          {isOwner && (
            <>
              <button
                onClick={() => setShowEditVendor(true)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold cn-text-2 border cn-border rounded-full px-3.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => setShowAddListing(true)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-full px-3.5 py-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add listing
              </button>
            </>
          )}
          <button
            onClick={handleToggleSave}
            title={isSaved ? 'Remove from saved' : 'Save vendor'}
            className="w-9 h-9 rounded-full flex items-center justify-center cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-purple-500 text-purple-500 dark:fill-purple-300 dark:text-purple-300' : ''}`} />
          </button>
          <button
            onClick={handleShare}
            title={copied ? 'Copied!' : 'Share'}
            className="w-9 h-9 rounded-full flex items-center justify-center cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-300" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl overflow-hidden cn-glass mb-4">
          <div
            className={`relative h-28 sm:h-36 ${isOwner ? 'cursor-pointer group' : ''}`}
            style={bannerStyle}
            onClick={() => isOwner && setShowBannerEditor(v => !v)}
          >
            {isOwner && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-semibold">
                  <ImagePlus className="w-3.5 h-3.5" /> Edit banner
                </span>
              </div>
            )}
          </div>
          <div className="px-5 sm:px-7 pb-5 pt-3 flex items-end gap-4 flex-wrap">
            {/* Only the (opaque) logo overlaps the banner — text always stays fully on the
                solid surface below it, so its color reads correctly regardless of banner color/theme. */}
            <div
              className={`relative w-[76px] h-[76px] sm:w-[92px] sm:h-[92px] rounded-2xl ring-4 ring-white dark:ring-zinc-900 shadow-lg overflow-hidden shrink-0 -mt-9 sm:-mt-11 ${isOwner ? 'cursor-pointer group' : ''}`}
              onClick={() => isOwner && logoInputRef.current?.click()}
            >
              {(logoPreview || vendor.logo_file_name)
                ? <img src={logoPreview ?? (fileUrl(vendor.logo_file_name) ?? undefined)} alt={vendor.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">{vendor.name.charAt(0).toUpperCase()}</div>
              }
              {isOwner && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  {savingVisual === 'logo' ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <ImagePlus className="w-5 h-5 text-white" />}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold cn-text-1 tracking-tight leading-tight">{vendor.name}</h1>
                <BadgeCheck className="w-4 h-4 text-purple-500 dark:text-purple-300 shrink-0" />
              </div>
              <p className="text-sm cn-text-3 mt-0.5">
                {vendor.category ? `${vendor.category} · ` : ''}Joined {formatMemberSince(vendor.created_at)}
              </p>
            </div>
            {canMessage && (
              <button
                onClick={handleMessageVendor}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors shrink-0"
              >
                <MessageCircle className="w-4 h-4" /> Message
              </button>
            )}
          </div>
        </div>

        {/* Owner: public link */}
        {isOwner && vendor.slug && (
          <div className="flex items-center gap-2 mb-6 px-1">
            <Globe className="w-3.5 h-3.5 cn-text-4 shrink-0" />
            <span className="text-xs cn-text-4 flex-1">{vendor.web_public ? 'Public — visible on the open web' : 'Private — hub members only'}</span>
            {vendor.web_public && (
              <button onClick={handleCopyPublicLink} className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors">
                <Link2 className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy link'}
              </button>
            )}
            <button
              onClick={handleTogglePublic}
              disabled={togglingPublic}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
                vendor.web_public ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'cn-surface-2 cn-text-3 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {togglingPublic ? <Loader2 className="w-3 h-3 animate-spin" /> : vendor.web_public ? 'Make private' : 'Make public'}
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl cn-glass p-3.5">
            <Package className="w-4 h-4 cn-text-4" />
            <div className="font-mono text-lg font-bold cn-text-1 mt-1.5">{activeListings.length}</div>
            <div className="text-[11px] cn-text-3 mt-0.5">Active listings</div>
          </div>
          <div className="rounded-xl cn-glass p-3.5">
            <Calendar className="w-4 h-4 cn-text-4" />
            <div className="text-sm font-bold cn-text-1 mt-1.5 truncate">{formatMemberSince(vendor.created_at)}</div>
            <div className="text-[11px] cn-text-3 mt-0.5">Member since</div>
          </div>
          <div className="rounded-xl cn-glass p-3.5">
            <Tag className="w-4 h-4 cn-text-4" />
            <div className="text-sm font-bold cn-text-1 mt-1.5 truncate">{vendor.category || '—'}</div>
            <div className="text-[11px] cn-text-3 mt-0.5">Category</div>
          </div>
        </div>

        {/* About */}
        {vendor.description && (
          <div className="rounded-xl cn-glass p-5 mb-6">
            <h2 className="text-sm font-semibold cn-text-2 mb-2">About</h2>
            <div className="space-y-3">
              {storyParagraphs.map((para, idx) => (
                <p key={idx} className="text-sm cn-text-2 leading-relaxed">{para}</p>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        {hasContact && (
          <div className="rounded-xl cn-glass p-5 mb-6">
            <h2 className="text-sm font-semibold cn-text-2 mb-3">Contact</h2>
            <div className="space-y-1">
              {vendor.contact_phone && (
                <a href={`tel:${vendor.contact_phone}`} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-sm cn-text-2">
                  <Phone className="w-4 h-4 cn-text-4 shrink-0" /> {vendor.contact_phone}
                </a>
              )}
              {vendor.contact_email && (
                <a href={`mailto:${vendor.contact_email}`} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-sm cn-text-2">
                  <Mail className="w-4 h-4 cn-text-4 shrink-0" /> {vendor.contact_email}
                </a>
              )}
              {vendor.website && (
                <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-sm cn-text-2 truncate">
                  <Globe className="w-4 h-4 cn-text-4 shrink-0" /> {vendor.website}
                </a>
              )}
              {vendor.hours && (
                <div className="flex items-center gap-3 px-2 py-2 text-sm cn-text-2">
                  <Clock className="w-4 h-4 cn-text-4 shrink-0" /> {vendor.hours}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Listings */}
        <div>
          <h2 className="text-sm font-semibold cn-text-2 mb-3">
            Listings {activeListings.length > 0 && <span className="cn-text-4 font-normal">({activeListings.length})</span>}
          </h2>
          {activeListings.length === 0 ? (
            <div className="rounded-xl cn-glass p-8 text-center">
              <Package className="w-8 h-8 cn-text-4 mx-auto mb-2" />
              <p className="text-sm cn-text-3">{isOwner ? 'No listings yet — add your first one.' : 'No active listings from this vendor.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {activeListings.map(listing => <ListingTile key={listing.id} listing={listing} />)}
            </div>
          )}

          {isOwner && inactiveListings.length > 0 && (
            <details className="group mt-6">
              <summary className="cursor-pointer text-sm font-semibold cn-text-2 mb-3 flex items-center gap-2">
                <span>Hidden ({inactiveListings.length})</span>
                <span className="group-open:rotate-180 transition-transform text-xs cn-text-4">▼</span>
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 opacity-60 mt-3">
                {inactiveListings.map(listing => <ListingTile key={listing.id} listing={listing} />)}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Floating mobile message button */}
      {canMessage && (
        <button
          onClick={handleMessageVendor}
          className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-lg flex items-center justify-center transition-colors"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Hidden inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />
      <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerFileChange} />

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

      {/* Banner editor */}
      {isOwner && showBannerEditor && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowBannerEditor(false)}>
          <div onClick={e => e.stopPropagation()} className="cn-surface border cn-border rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold cn-text-1">Banner Style</h3>

            <button type="button" onClick={() => bannerInputRef.current?.click()} className="w-full py-2 px-4 rounded-lg cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium cn-text-2 transition-colors">
              {savingVisual === 'banner' ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <ImagePlus className="w-4 h-4 inline mr-2" />}
              Upload Image
            </button>

            <div>
              <p className="text-xs font-medium cn-text-3 mb-2">Solid Colors</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_SOLID_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => saveVendorVisuals({ banner_mode: 'solid', banner_color: color }, 'banner')}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${vendor.banner_mode === 'solid' && vendor.banner_color === color ? 'border-slate-900 dark:border-white ring-2 ring-slate-300 dark:ring-zinc-600' : 'border-white/70 dark:border-zinc-700'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium cn-text-3 mb-2">Gradients</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_GRADIENTS.map(g => {
                  const selected = vendor.banner_mode === 'gradient' && vendor.banner_gradient_from === g.from && vendor.banner_gradient_to === g.to;
                  return (
                    <button
                      key={`${g.from}-${g.to}`}
                      type="button"
                      onClick={() => saveVendorVisuals({ banner_mode: 'gradient', banner_gradient_from: g.from, banner_gradient_to: g.to }, 'banner')}
                      className={`w-12 h-8 rounded-lg border-2 transition-all ${selected ? 'border-slate-900 dark:border-white ring-2 ring-slate-300 dark:ring-zinc-600' : 'border-white/70 dark:border-zinc-700'}`}
                      style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                    />
                  );
                })}
              </div>
            </div>

            {visualError && <p className="text-xs text-red-500 dark:text-red-400">{visualError}</p>}

            <button
              onClick={() => setShowBannerEditor(false)}
              className="w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
