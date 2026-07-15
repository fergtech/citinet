import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Share2, MessageCircle, Check, Loader2, Clock, Store } from 'lucide-react';
import { marketplaceService } from '../services/marketplaceService';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubListing, HubVendor } from '../types/hub';
import { formatPrice, formatRelative, ListingCard, KIND_META } from './MarketplaceScreen';

interface ExchangeListingDetailProps {
  listing: HubListing;
  hubSlug: string;
  allListings: HubListing[];
  onBack: () => void;
  onOpenListing: (listing: HubListing) => void;
  onVendorClick?: (vendorId: string) => void;
  onNavigate?: (screen: string) => void;
}

export function ExchangeListingDetail({ listing, hubSlug, allListings, onBack, onOpenListing, onVendorClick, onNavigate }: ExchangeListingDetailProps) {
  const { currentUser } = useHub();
  const kind = KIND_META[listing.price_type] ?? KIND_META.fixed;
  const imageUrl = listing.image_file_name ? marketplaceService.getListingImageUrl(hubSlug, listing.image_file_name) : null;

  const [vendor, setVendor] = useState<HubVendor | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    setVendor(null);
    setVendorLoading(true);
    marketplaceService.getVendor(hubSlug, listing.vendor_id)
      .then(res => setVendor(res.vendor))
      .catch(() => setVendor(null))
      .finally(() => setVendorLoading(false));
  }, [hubSlug, listing.vendor_id, listing.id]);

  const [saved, setSaved] = useState(() => {
    const ids = JSON.parse(localStorage.getItem('saved_listings') || '[]');
    return ids.includes(listing.id);
  });
  const [copied, setCopied] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState('');

  const toggleSave = () => {
    const ids: string[] = JSON.parse(localStorage.getItem('saved_listings') || '[]');
    const idx = ids.indexOf(listing.id);
    if (idx !== -1) ids.splice(idx, 1); else ids.push(listing.id);
    localStorage.setItem('saved_listings', JSON.stringify(ids));
    setSaved(!saved);
  };

  const handleShare = () => {
    const url = `${window.location.href.split('?')[0]}?item=${listing.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMessageSeller = async () => {
    if (!vendor?.owner_user_id || messaging) return;
    setMessaging(true);
    setMessageError('');
    try {
      const convo = await hubService.createConversation(hubSlug, 'dm', [vendor.owner_user_id]);
      sessionStorage.setItem('citinet-deeplink-message-conv', convo.id);
      onNavigate?.('messages');
    } catch (err: any) {
      setMessageError(err.message || 'Could not start conversation');
    } finally {
      setMessaging(false);
    }
  };

  const moreFromSeller = useMemo(
    () => allListings.filter(l => l.vendor_id === listing.vendor_id && l.id !== listing.id).slice(0, 3),
    [allListings, listing.vendor_id, listing.id]
  );

  const isOwnListing = !!currentUser?.hubUserId && vendor?.owner_user_id === currentUser.hubUserId;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-7">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 border cn-border cn-surface cn-text-2 text-sm font-semibold px-3.5 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Exchange
          </button>
          <div className="flex-1" />
          <button
            onClick={toggleSave}
            title={saved ? 'Remove from saved' : 'Save for later'}
            className="w-9 h-9 rounded-full flex items-center justify-center cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Bookmark className={`w-4 h-4 ${saved ? 'fill-purple-500 text-purple-500 dark:fill-purple-300 dark:text-purple-300' : ''}`} />
          </button>
          <button
            onClick={handleShare}
            title={copied ? 'Copied!' : 'Share'}
            className="w-9 h-9 rounded-full flex items-center justify-center cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-300" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-7 items-start">
          {/* Gallery */}
          <div className="rounded-2xl overflow-hidden border cn-border">
            <div className={`relative flex items-center justify-center bg-gradient-to-br ${kind.classes.includes('emerald') ? 'from-emerald-600/40' : 'from-purple-600/40'} via-zinc-900 to-zinc-950`} style={{ height: 340 }}>
              {imageUrl
                ? <img src={imageUrl} alt={listing.title} className="absolute inset-0 w-full h-full object-cover" />
                : <Store className="w-24 h-24 text-white/20" />
              }
              <span className={`absolute top-3.5 left-3.5 px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-sm ${kind.classes}`}>{kind.label}</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4.5" style={{ gap: 18 }}>
            <div>
              <div className="flex items-start gap-3">
                <h1 className="flex-1 text-2xl font-bold cn-text-1 tracking-tight leading-tight">{listing.title}</h1>
                <span className={`font-mono text-xl font-bold whitespace-nowrap ${listing.price_type === 'fixed' ? 'text-emerald-500 dark:text-emerald-300' : 'cn-text-1'}`}>{formatPrice(listing)}</span>
              </div>
              <div className="flex items-center gap-2.5 mt-2 text-xs cn-text-3">
                <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{formatRelative(listing.created_at)}</span>
                <span>·</span>
                <span className="uppercase tracking-wide font-semibold cn-text-2">{listing.category}</span>
                {listing.condition && <><span>·</span><span className="capitalize">{listing.condition.replace('-', ' ')}</span></>}
              </div>
            </div>

            {listing.description && (
              <p className="text-sm cn-text-2 leading-relaxed whitespace-pre-line">{listing.description}</p>
            )}

            {/* Seller card */}
            <div className="rounded-xl border cn-border cn-surface p-4">
              {vendorLoading ? (
                <div className="flex items-center gap-2 text-sm cn-text-4 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading seller…</div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    {listing.vendor_logo_file_name
                      ? <img src={marketplaceService.getVendorLogoUrl(hubSlug, listing.vendor_logo_file_name) ?? undefined} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                      : <span className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">{(listing.vendor_name ?? '?').charAt(0).toUpperCase()}</span>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold cn-text-1 truncate">{listing.vendor_name ?? 'Unknown seller'}</div>
                      <div className="text-xs cn-text-3 truncate">
                        {vendor?.category ? vendor.category : 'Hub member'}
                        {vendor?.created_at && ` · member since ${new Date(vendor.created_at).getFullYear()}`}
                      </div>
                    </div>
                    <button
                      onClick={() => onVendorClick?.(listing.vendor_id)}
                      className="text-xs font-semibold cn-text-2 border cn-border rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                    >
                      View
                    </button>
                  </div>
                </>
              )}
            </div>

            {moreFromSeller.length > 0 && (
              <div>
                <div className="text-sm font-semibold cn-text-2 mb-2.5">More from {listing.vendor_name?.split(' ')[0] ?? 'this seller'}</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {moreFromSeller.map(l => (
                    <ListingCard key={l.id} listing={l} hubSlug={hubSlug} onOpen={() => onOpenListing(l)} onVendorClick={onVendorClick} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 mt-6 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-4 pb-4 cn-glass border-t cn-border">
          <div className="flex items-center gap-2.5">
            {!isOwnListing && (
              <button
                onClick={handleMessageSeller}
                disabled={messaging || vendorLoading || !vendor?.owner_user_id}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {messaging ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Message seller
              </button>
            )}
          </div>
          {messageError && <p className="text-xs text-red-400 mt-2">{messageError}</p>}
        </div>
      </div>
    </div>
  );
}
