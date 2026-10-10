import { useEffect, useState } from 'react';
import { Calendar, ExternalLink, Globe, MapPin, Package } from 'lucide-react';
import { hubService } from '../services/hubService';
import { marketplaceService } from '../services/marketplaceService';
import { initiativesService } from '../services/initiativesService';
import { AvatarCircle } from './AvatarCircle';
import { AvatarFallback } from './icons';
import { AutoplayVideo } from './AutoplayVideo';
import { MiniMap } from './MiniMap';
import { fetchPlacePhoto, type PlacePhoto } from '../utils/placePhoto';
import { findNearestPanoramaxImage, type PanoramaxImage } from '../utils/panoramax';
import { geocodeLocation } from '../utils/geocoding';
import { peekCardVisual, writeCardVisual } from '../utils/cardVisualCache';
import { useHubGeoCenter } from '../hooks/useHubGeoCenter';
import type { HomeCardData } from '../utils/homeFeedSelection';

// ── Size limits for every card visual — the two numbers to change ────────────────────────────────
// Photos and videos always keep their OWN proportions (never cropped or stretched); these are only the box they
// have to fit inside. Anything we draw ourselves (maps, placeholders, banners, stickers) is a 4:3 box that uses
// the same limits, so the two always agree.
const MEDIA_MAX_HEIGHT = '460px';
const MEDIA_MAX_WIDTH = '100%'; // '100%' = as wide as the card allows; set e.g. '560px' to narrow everything
const STICKER_MAX_HEIGHT = '140px'; // stickers are illustrations, not photos: kept to their own, smaller height cap
const LIMITS = { '--media-max-h': MEDIA_MAX_HEIGHT, '--media-max-w': MEDIA_MAX_WIDTH, '--sticker-max-h': STICKER_MAX_HEIGHT } as React.CSSProperties;

/** Placeholders for items whose creator didn't upload a picture of their own (public/stickers/). */
const MARKETPLACE_STICKER = '/stickers/black-friday.png';
const INITIATIVE_STICKER = '/stickers/task-list.png';
const STICKER_CLASS = 'block mx-auto w-auto h-auto max-w-[50%] max-h-[var(--sticker-max-h)] object-contain py-2 select-none';

const MEDIA_CLASS = 'block mx-auto w-auto h-auto max-h-[var(--media-max-h)] max-w-[var(--media-max-w)] rounded-xl object-contain';
// 4:3 frame: width is the height limit x 4/3 (so a capped box keeps its shape instead of stretching wider than tall),
// and never wider than the width limit or the card.
const FRAME_CLASS = 'relative w-full mx-auto aspect-[4/3] max-w-[min(var(--media-max-w),calc(var(--media-max-h)*4/3))] rounded-xl overflow-hidden';

const isVideo = (name: string) => ['mp4', 'webm', 'mov'].includes(name.split('.').pop()?.toLowerCase() ?? '');

function MediaBlock({ hubSlug, fileName, alt, thumb = true }: { hubSlug: string; fileName: string; alt: string; thumb?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  if (isVideo(fileName)) {
    const src = hubService.getPublicFileUrl(hubSlug, fileName);
    return src ? <AutoplayVideo src={src} className={MEDIA_CLASS} onError={() => setFailed(true)} /> : null;
  }
  const src = hubService.getPublicFileUrl(hubSlug, fileName, { thumb });
  return src ? <img src={src} alt={alt} loading="lazy" className={MEDIA_CLASS} onError={() => setFailed(true)} /> : null;
}

/** A big soft "sticker" for when there's nothing better to show. */
function Sticker({ icon: Icon, tone }: { icon: React.ElementType; tone: string }) {
  return (
    <div className={`${FRAME_CLASS} flex items-center justify-center ${tone}`}>
      <Icon className="w-20 h-20 text-white/90" strokeWidth={1.5} />
    </div>
  );
}

// ── Atlas ─────────────────────────────────────────────────────────────────────
// Precedence matches the pin detail: the pin's own photo (handled by the caller) >
// place photo (Wikidata/Wikimedia) > Panoramax street-level still > non-interactive
// mini-map > location sticker if the map can't load. Looked up once per pin and
// cached (memory + localStorage): Home reloads constantly and these are third-party
// calls whose answer for a coordinate doesn't change.
type AtlasLookup = { place: PlacePhoto | null; pano: PanoramaxImage | null };

function AtlasVisual({ pin }: { pin: NonNullable<HomeCardData['atlasPin']> }) {
  const cacheKey = `atlas:${pin.latitude.toFixed(5)},${pin.longitude.toFixed(5)}:${pin.title.trim().toLowerCase()}`;
  const initial = peekCardVisual<AtlasLookup>(cacheKey);
  const [lookup, setLookup] = useState<AtlasLookup | null>(initial ?? null);
  const [resolved, setResolved] = useState(initial !== undefined);
  const [mapFailed, setMapFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const hit = peekCardVisual<AtlasLookup>(cacheKey);
    if (hit !== undefined) { setLookup(hit); setResolved(true); return; }
    let cancelled = false;
    (async () => {
      const [place, pano] = await Promise.all([
        fetchPlacePhoto(pin.latitude, pin.longitude, pin.title).catch(() => null),
        findNearestPanoramaxImage(pin.latitude, pin.longitude).catch(() => null),
      ]);
      // Both-null is stored as an explicit miss (shorter TTL).
      writeCardVisual(cacheKey, place || pano ? { place, pano } : null);
      if (cancelled) return;
      setLookup(place || pano ? { place, pano } : null);
      setResolved(true);
    })();
    return () => { cancelled = true; };
  }, [cacheKey, pin.latitude, pin.longitude, pin.title]);

  const photoUri = lookup?.place?.url ?? lookup?.pano?.thumbnailUrl ?? null;
  const credit = lookup?.place ? lookup.place.attribution : lookup?.pano ? 'Street view via Panoramax' : null;

  if (photoUri && !imgFailed) {
    return (
      <div className="relative">
        <img src={photoUri} alt={pin.title} loading="lazy" className={MEDIA_CLASS} onError={() => setImgFailed(true)} />
        {credit && <span className="absolute left-1.5 bottom-1.5 text-[10px] font-semibold text-white bg-black/55 rounded-md px-1.5 py-0.5">{credit}</span>}
      </div>
    );
  }
  if (mapFailed) return <Sticker icon={MapPin} tone="bg-gradient-to-br from-emerald-500 to-teal-600" />;
  // Hold the map-sized box while lookups are still pending so the card doesn't jump.
  return (
    <div className={`${FRAME_CLASS} bg-black/5 dark:bg-white/5`}>
      {resolved && <MiniMap lat={pin.latitude} lng={pin.longitude} className="absolute inset-0" onFail={() => setMapFailed(true)} />}
    </div>
  );
}

// ── Event ─────────────────────────────────────────────────────────────────────
// Precedence: a location we can place on a map (the event's linked/matching pin, its
// own coordinates, else a cached geocode of its location text) → mini-map; else the
// event's own photo/video; else the calendar sticker. While a location is still being
// geocoded the card holds a map-sized empty box rather than flashing the photo/sticker
// and then swapping to the map.
function EventVisual({ card, hubSlug }: { card: HomeCardData; hubSlug: string }) {
  const { location, lat, lng, pin } = card.event!;
  const hubCenter = useHubGeoCenter();
  const geoKey = location?.trim() ? `geo:${location.trim().toLowerCase()}` : null;
  const direct: [number, number] | null = pin ? [pin.latitude, pin.longitude] : lat != null && lng != null ? [lat, lng] : null;
  const known = !direct && geoKey ? peekCardVisual<[number, number]>(geoKey) : undefined;
  const [state, setState] = useState<{ status: 'pending' | 'none' | 'found'; coords: [number, number] | null }>(
    direct ? { status: 'found', coords: direct }
      : known !== undefined ? (known ? { status: 'found', coords: known } : { status: 'none', coords: null })
      : { status: location?.trim() ? 'pending' : 'none', coords: null },
  );
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (direct) { setState({ status: 'found', coords: direct }); return; }
    if (!location?.trim() || !geoKey) { setState({ status: 'none', coords: null }); return; }
    const cached = peekCardVisual<[number, number]>(geoKey);
    if (cached !== undefined) { setState(cached ? { status: 'found', coords: cached } : { status: 'none', coords: null }); return; }
    let cancelled = false;
    setState({ status: 'pending', coords: null });
    geocodeLocation(location.trim(), hubCenter ?? undefined)
      .then((coords) => {
        // Cached once (memory + localStorage): the answer for a location text doesn't change,
        // and Nominatim asks clients to be sparing.
        writeCardVisual(geoKey, coords);
        if (!cancelled) setState(coords ? { status: 'found', coords } : { status: 'none', coords: null });
      })
      .catch(() => { if (!cancelled) setState({ status: 'none', coords: null }); }); // failed request: not cached, retried next load
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hubCenter is a fresh array each render; location/pin/coords identify the source.
  }, [location, pin?.id, lat, lng]);

  if ((state.status === 'pending' || state.status === 'found') && !mapFailed) {
    return (
      <div className={`${FRAME_CLASS} bg-black/5 dark:bg-white/5`}>
        {state.status === 'found' && state.coords && (
          <MiniMap lat={state.coords[0]} lng={state.coords[1]} className="absolute inset-0" onFail={() => setMapFailed(true)} />
        )}
      </div>
    );
  }
  if (card.mediaFileName) return <MediaBlock hubSlug={hubSlug} fileName={card.mediaFileName} alt={card.title} />;
  return <Sticker icon={Calendar} tone="bg-gradient-to-br from-amber-500 to-orange-600" />;
}

// ── Marketplace ───────────────────────────────────────────────────────────────
// The vendor's own picture if they uploaded one (and it loads); otherwise ALWAYS the marketplace sticker — never a
// generated category block. The sticker keeps its own proportions (it is transparent, so no box behind it).
function ListingVisual({ card, url, onStickerFallback }: { card: HomeCardData; url: string | null; onStickerFallback: () => void }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) return <img src={url} alt={card.title} loading="lazy" className={MEDIA_CLASS} onError={() => { setFailed(true); onStickerFallback(); }} />;
  return (
    <img
      src={MARKETPLACE_STICKER}
      alt=""
      aria-hidden="true"
      className={STICKER_CLASS}
      draggable={false}
    />
  );
}

// ── Initiative ────────────────────────────────────────────────────────────────
// What the initiative's creator made: an uploaded banner image (shown at its own proportions, like any media), or a
// custom gradient they chose. If they set neither — or the image won't load — ALWAYS the initiative sticker; never a
// category stock photo or a generated icon block.
function InitiativeVisual({ ini, hubSlug, onStickerFallback }: { ini: NonNullable<HomeCardData['initiative']>; hubSlug: string; onStickerFallback: () => void }) {
  const [bannerFailed, setBannerFailed] = useState(false);
  if (ini.hasBannerImage && !bannerFailed) {
    return (
      <img
        src={initiativesService.getBannerUrl(hubSlug, ini.initiativeId) ?? undefined}
        alt=""
        loading="lazy"
        className={MEDIA_CLASS}
        onError={() => { setBannerFailed(true); onStickerFallback(); }}
      />
    );
  }
  if (ini.bannerMode === 'gradient' && ini.gradientFrom && ini.gradientTo) {
    return <div className={FRAME_CLASS} style={{ background: `linear-gradient(135deg, ${ini.gradientFrom}, ${ini.gradientTo})` }} />;
  }
  return <img src={INITIATIVE_STICKER} alt="" aria-hidden="true" className={STICKER_CLASS} draggable={false} />;
}

// ── The card ──────────────────────────────────────────────────────────────────
interface Props {
  card: HomeCardData;
  hubSlug: string;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  onOpen: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenVendor: (vendorId: string) => void;
}

export function HomeActivityCard({ card, hubSlug, currentUserId, currentUserAvatarUrl, onOpen, onOpenProfile, onOpenVendor }: Props) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const [stickerFallbackFailed, setStickerFallbackFailed] = useState(false);
  const listingImageUrl = card.listing && card.mediaFileName
    ? marketplaceService.getListingImageUrl(hubSlug, card.mediaFileName)
    : null;
  const hasInitiativeGradient = Boolean(card.initiative?.bannerMode === 'gradient' && card.initiative.gradientFrom && card.initiative.gradientTo);
  const stickerFallback = Boolean(
    (card.listing && (!listingImageUrl || stickerFallbackFailed))
    || (card.initiative && ((!card.initiative.hasBannerImage && !hasInitiativeGradient) || (stickerFallbackFailed && !hasInitiativeGradient))),
  );

  let visual: React.ReactNode = null;
  if (card.event) visual = <EventVisual card={card} hubSlug={hubSlug} />;
  else if (card.listing) visual = <ListingVisual card={card} url={listingImageUrl} onStickerFallback={() => setStickerFallbackFailed(true)} />;
  else if (card.initiative) visual = <InitiativeVisual
    ini={card.initiative}
    hubSlug={hubSlug}
    onStickerFallback={() => { if (!hasInitiativeGradient) setStickerFallbackFailed(true); }}
  />;
  else if (card.mediaFileName) visual = <MediaBlock hubSlug={hubSlug} fileName={card.mediaFileName} alt={card.title} />;
  else if (card.atlasPin) visual = <AtlasVisual pin={card.atlasPin} />;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={LIMITS}
      className="text-left cursor-pointer p-4 cn-glass cn-glass-hover rounded-2xl hover:border-black/15 dark:hover:border-white/15 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
    >
      <p className="cn-eyebrow">
        {card.label}
        {card.highlight && (
          <span
            className="normal-case tracking-normal font-medium"
            title="Shown ahead of newer posts because it got more likes or replies than most in your hub."
          >
            {' · '}{card.highlight}
          </span>
        )}
      </p>
      {stickerFallback && visual && <div className="mt-2">{visual}</div>}
      <p className="text-[15px] font-semibold cn-text-1 mt-0.5 line-clamp-2">{card.title}</p>
      {card.caption && <p className="text-sm cn-text-3 mt-1 line-clamp-3">{card.caption}</p>}

      {visual && !stickerFallback && <div className="mt-3">{visual}</div>}

      {card.external && (
        <p className="mt-3 inline-flex items-center gap-1.5 max-w-full text-xs cn-text-3">
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{card.external.host || card.external.sourceLabel}</span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-70" aria-label="Opens in a new tab" />
        </p>
      )}
      {card.listing && (
        <button onClick={stop(() => onOpenVendor(card.listing!.vendor.id))} className="mt-3 inline-flex items-center gap-2 max-w-full text-xs cn-text-3 hover:underline">
          {card.listing.vendor.logoFileName
            ? <img src={marketplaceService.getVendorLogoUrl(hubSlug, card.listing.vendor.logoFileName) ?? undefined} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
            : <AvatarFallback className="w-5 h-5 rounded-full shrink-0" name={card.listing.vendor.name} />}
          <span className="truncate">{card.listing.vendor.name}</span>
        </button>
      )}
      {card.authorUsername && card.authorId && (
        <button onClick={stop(() => onOpenProfile(card.authorId!))} className="mt-3 inline-flex items-center gap-2 text-xs cn-text-3 hover:underline">
          <AvatarCircle
            authorId={card.authorId}
            authorUsername={card.authorUsername}
            authorAvatarUrl={hubService.getAvatarUrl(hubSlug, card.authorId) ?? undefined}
            currentUserId={currentUserId}
            currentUserAvatarUrl={currentUserAvatarUrl}
            size="sm"
          />
          <span>@{card.authorUsername}</span>
        </button>
      )}
      {/* Same byline when we only know the person's name (initiative activity rows can lack a user id): not linkable, still shown. */}
      {card.authorUsername && !card.authorId && (
        <span className="mt-3 inline-flex items-center gap-2 text-xs cn-text-3">
          <AvatarFallback className="w-7 h-7 text-[10px] rounded-full shrink-0" name={card.authorUsername} />
          <span>{/\s/.test(card.authorUsername) ? card.authorUsername : `@${card.authorUsername}`}</span>
        </span>
      )}
    </div>
  );
}

export function HomeFeedSkeleton() {
  return (
    <div className="space-y-3 mb-10" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="p-4 cn-glass rounded-2xl animate-pulse">
          <div className="h-2.5 w-16 rounded cn-surface-3" />
          <div className="h-4 w-2/3 rounded cn-surface-3 mt-2" />
          <div className="h-3 w-full rounded cn-surface-3 mt-2" />
          <div className="h-32 w-full rounded-xl cn-surface-3 mt-3" />
        </div>
      ))}
    </div>
  );
}

// Re-exported so the Dashboard can show a neutral icon for an empty state without another import.
export { Package as EmptyFeedIcon };
