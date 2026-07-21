import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Search, Trash2, MapPin,
  Navigation, Bookmark, Share2, Check, Map as MapIcon, ImagePlus, Pencil,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { atlasService } from '../services/atlasService';
import { ATLAS_CATEGORIES, type AtlasPin, type AtlasPinCategory } from '../types/atlas';
import { LocationSearchInput } from './LocationSearchInput';
import { geocodeLocation, reverseGeocode, distanceMeters } from '../utils/geocoding';
import { fetchPlacePhoto, type PlacePhoto } from '../utils/placePhoto';

// ── Icon factory (cached) ──────────────────────────────────────────────────
// Teardrop-from-rotated-square marker matching the design system: a category-
// gradient diamond with the counter-rotated lucide icon centered inside it.

const _iconCache = new Map<string, L.DivIcon>();

function getPinIcon(category: AtlasPinCategory, selected: boolean): L.DivIcon {
  const key = `${category}-${selected}`;
  if (_iconCache.has(key)) return _iconCache.get(key)!;
  const cat = ATLAS_CATEGORIES[category];
  const s = selected ? 34 : 28;
  const iconPx = selected ? 16 : 13;
  const svg = renderToStaticMarkup(<cat.Icon size={iconPx} color="#fff" strokeWidth={2.5} />);
  const ring = selected
    ? 'box-shadow:0 0 0 3px #fff,0 3px 10px rgba(0,0,0,0.4);'
    : 'box-shadow:0 2px 8px rgba(0,0,0,0.35);';
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;border-radius:50% 50% 50% 0;background:${cat.gradientCss};transform:rotate(45deg);${ring}border:2px solid rgba(255,255,255,${selected ? '1' : '0.55'});display:flex;align-items:center;justify-content:center;cursor:pointer;">` +
      `<span style="transform:rotate(-45deg);display:flex">${svg}</span></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s],
    popupAnchor: [0, -s - 4],
  });
  _iconCache.set(key, icon);
  return icon;
}

// ── Internal map helpers ───────────────────────────────────────────────────

function MapCenterController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

function MapCenterTracker({ active, onCenterChange }: { active: boolean; onCenterChange: (c: [number, number]) => void }) {
  const map = useMap();
  useMapEvents({
    move: () => {
      if (!active) return;
      const c = map.getCenter();
      onCenterChange([c.lat, c.lng]);
    },
  });
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(isoDate));
}

function formatDistanceMiles(meters: number): string {
  const mi = meters / 1609.34;
  if (mi < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${mi.toFixed(1)} mi`;
}

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const SEARCH_HISTORY_KEY = 'citinet-atlas-search-history';
const SAVED_PINS_KEY = 'citinet-saved-atlas-pins';

// ── Place row (list) ────────────────────────────────────────────────────────

function PlaceRow({ pin, distanceLabel, canDelete, onSelect, onDelete }: {
  pin: AtlasPin;
  distanceLabel: string | null;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const cat = ATLAS_CATEGORIES[pin.category];
  return (
    <div
      onClick={onSelect}
      className="group flex items-center gap-3 p-3 rounded-xl border cn-border cn-glass hover:border-black/15 dark:hover:border-white/15 cursor-pointer transition-all"
    >
      <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center shrink-0`}>
        <cat.Icon className="w-4 h-4 text-white" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold cn-text-1 truncate">{pin.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/8 cn-text-2">{cat.label}</span>
          {distanceLabel && <span className="cn-mono text-[11px] cn-text-4">{distanceLabel}</span>}
        </div>
      </div>
      {canDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete pin"
          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      <ChevronRight className="w-4 h-4 cn-text-4 shrink-0" />
    </div>
  );
}

// ── Place detail panel ───────────────────────────────────────────────────────

function PlaceDetailPanel({ pin, hubSlug, distanceLabel, canDelete, canEdit, saved, onBack, onDelete, onToggleSave, onEdit }: {
  pin: AtlasPin;
  hubSlug: string;
  distanceLabel: string | null;
  canDelete: boolean;
  canEdit: boolean;
  saved: boolean;
  onBack: () => void;
  onDelete: () => void;
  onToggleSave: () => void;
  onEdit: () => void;
}) {
  const cat = ATLAS_CATEGORIES[pin.category];
  const [copied, setCopied] = useState(false);
  const [photo, setPhoto] = useState<PlacePhoto | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [userPhotoFailed, setUserPhotoFailed] = useState(false);

  // A user-uploaded photo (set at pin creation) is authoritative — only fall back
  // to the Wikidata/Wikimedia lookup when the pin has none of its own.
  const userPhotoUrl = pin.imageFileName ? hubService.getPublicFileUrl(hubSlug, pin.imageFileName) : null;

  useEffect(() => {
    if (userPhotoUrl) return;
    let cancelled = false;
    setPhoto(null);
    setPhotoFailed(false);
    fetchPlacePhoto(pin.latitude, pin.longitude, pin.title).then(p => {
      if (!cancelled) setPhoto(p);
    });
    return () => { cancelled = true; };
  }, [pin.latitude, pin.longitude, pin.title, userPhotoUrl]);

  const handleShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('pin', pin.id);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDirections = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors self-start">
        <ChevronLeft className="w-3.5 h-3.5" />All places
      </button>

      {userPhotoUrl && !userPhotoFailed ? (
        <div className="relative h-32 sm:h-36 rounded-2xl overflow-hidden shadow-md">
          <img
            src={userPhotoUrl}
            alt={pin.title}
            className="w-full h-full object-cover"
            onError={() => setUserPhotoFailed(true)}
          />
        </div>
      ) : photo && !photoFailed ? (
        <div className="relative h-32 sm:h-36 rounded-2xl overflow-hidden shadow-md">
          <img
            src={photo.url}
            alt={pin.title}
            className="w-full h-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
          {photo.sourceUrl && (
            <a
              href={photo.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded-md bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              {photo.attribution}
            </a>
          )}
        </div>
      ) : (
        <div className={`h-32 sm:h-36 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-md`}>
          <cat.Icon className="w-10 h-10 text-white" />
        </div>
      )}

      <div>
        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 mb-2">
          {cat.label}
        </span>
        <h1 className="text-xl font-bold cn-text-1 tracking-tight">{pin.title}</h1>
        <div className="text-xs cn-text-3 mt-1.5">
          {distanceLabel ? `${distanceLabel} away · ` : ''}pinned {formatRelativeTime(pin.createdAt)}
        </div>
      </div>

      {pin.description && (
        <p className="text-sm leading-relaxed cn-text-2">{pin.description}</p>
      )}

      <div className="cn-glass rounded-xl p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-xs shrink-0">
          {pin.authorUsername.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold cn-text-1 truncate">@{pin.authorUsername}</div>
          <div className="text-[11px] cn-text-4">Added this pin</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleDirections}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
        >
          <Navigation className="w-3.5 h-3.5" />
          Directions
        </button>
        <button
          onClick={onToggleSave}
          title={saved ? 'Remove from saved' : 'Save'}
          className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-2 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
        >
          <Bookmark className={`w-4 h-4 ${saved ? 'fill-purple-300 text-purple-300' : ''}`} />
        </button>
        <button
          onClick={handleShare}
          title={copied ? 'Copied!' : 'Share'}
          className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-2 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
        </button>
        {canEdit && (
          <button
            onClick={onEdit}
            title="Edit pin"
            className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-2 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            title="Remove pin"
            className="w-10 h-10 rounded-xl cn-glass flex items-center justify-center cn-text-3 hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Create-pin flow (details → review → success) ────────────────────────────
// Location is chosen beforehand via the real map's drop-here mode, so unlike the
// design mock this panel skips straight to details — no separate location step.

const CATEGORY_KEYWORDS: Record<AtlasPinCategory, string[]> = {
  meetup:         ['meet', 'meetup', 'hangout', 'gathering', 'bench', 'plaza', 'square', 'spot'],
  safety:         ['warning', 'alert', 'caution', 'flood', 'hazard', 'unsafe', 'broken', 'incident', 'crime', 'accident'],
  avoid:          ['avoid', 'danger', 'closed', 'blocked', 'abandoned', 'sketchy', 'stay away'],
  infrastructure: ['community center', 'hall', 'library', 'school', 'church', 'facility', 'clinic', 'station'],
  poi:            ['coffee', 'cafe', 'café', 'restaurant', 'food', 'shop', 'store', 'market', 'bar',
                   'trail', 'fountain', 'museum', 'gallery', 'starbucks', 'landmark', 'monument'],
  aid:            ['fridge', 'pantry', 'food bank', 'free food', 'mutual aid', 'donation', 'giveaway', 'tool library', 'clothing swap'],
  green:          ['garden', 'park', 'green space', 'community garden', 'orchard', 'planter', 'meadow', 'trees'],
};

function suggestCategory(title: string): AtlasPinCategory | null {
  if (!title.trim()) return null;
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [AtlasPinCategory, string[]][]) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

type CreateStep = 'details' | 'review' | 'success';

/** Handles both "drop a new pin" and "edit an existing pin" — pass `editingPin`
 * for the latter. Editing skips the review/success steps (it's a quick correction,
 * not a new-place ceremony) and saves straight from the single details form. */
function PinFormPanel({ position, hubSlug, editingPin, suggestedTitle, category, onCategoryChange, onPublish, onCancel, onDone }: {
  position: [number, number];
  hubSlug: string;
  editingPin?: AtlasPin;
  suggestedTitle: string | null;
  category: AtlasPinCategory;
  onCategoryChange: (c: AtlasPinCategory) => void;
  onPublish: (data: { title: string; description?: string; category: AtlasPinCategory; imageFileName?: string }) => Promise<AtlasPin>;
  onCancel: () => void;
  onDone: (pin: AtlasPin) => void;
}) {
  const isEditing = !!editingPin;
  const [step, setStep] = useState<CreateStep>('details');
  const [title, setTitle] = useState(editingPin?.title ?? suggestedTitle ?? '');
  const [description, setDescription] = useState(editingPin?.description ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    editingPin?.imageFileName ? hubService.getPublicFileUrl(hubSlug, editingPin.imageFileName) : null
  );
  const [imageRemoved, setImageRemoved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedPin, setPublishedPin] = useState<AtlasPin | null>(null);

  const imagePreviewRef = useRef<string | null>(null);
  imagePreviewRef.current = imagePreview;
  useEffect(() => () => { if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current); }, []);

  const handleImageSelect = (file: File) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageRemoved(true);
  };

  const cat = ATLAS_CATEGORIES[category];
  const categorySuggestion = useMemo(() => suggestCategory(title), [title]);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      let imageFileName = editingPin?.imageFileName;
      if (imageFile) {
        const uploaded = await hubService.uploadFile(hubSlug, imageFile, true);
        imageFileName = uploaded.name;
      } else if (imageRemoved) {
        imageFileName = undefined;
      }
      const pin = await onPublish({ title: title.trim(), description: description.trim() || undefined, category, imageFileName });
      if (isEditing) {
        onDone(pin);
      } else {
        setPublishedPin(pin);
        setStep('success');
      }
    } catch {
      setError('Something went wrong — try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors"
        >
          {step === 'success' ? <X className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          {step === 'success' ? 'Close' : 'Cancel'}
        </button>
        {step !== 'success' && !isEditing && (
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 rounded-full transition-all ${step === 'details' ? 'w-4 bg-purple-500' : 'w-1.5 bg-black/10 dark:bg-white/15'}`} />
            <span className={`h-1.5 rounded-full transition-all ${step === 'review' ? 'w-4 bg-purple-500' : 'w-1.5 bg-black/10 dark:bg-white/15'}`} />
          </div>
        )}
      </div>

      {step === 'details' && (
        <>
          <div>
            <h2 className="text-lg font-bold cn-text-1">{isEditing ? 'Edit pin' : 'Add details'}</h2>
            <p className="text-xs cn-text-3 mt-1">
              {isEditing ? 'Update the details for this pin.' : 'Your pin will be placed exactly where you positioned it on the map.'}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold cn-text-3 mb-1.5">Name</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Free Little Library"
              autoFocus
              className="w-full px-3 py-2.5 cn-surface border cn-border rounded-lg text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold cn-text-3">Category</label>
              {categorySuggestion && categorySuggestion !== category && (
                <button
                  type="button"
                  onClick={() => onCategoryChange(categorySuggestion)}
                  className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Suggested: {ATLAS_CATEGORIES[categorySuggestion].label}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(ATLAS_CATEGORIES) as [AtlasPinCategory, typeof ATLAS_CATEGORIES[AtlasPinCategory]][]).map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => onCategoryChange(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                    category === key
                      ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30'
                      : 'bg-black/5 dark:bg-white/5 cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                  }`}
                >
                  <c.Icon className="w-3 h-3" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold cn-text-3 mb-1.5">
              Description <span className="font-normal cn-text-4">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="What should neighbors know about this place?"
              className="w-full px-3 py-2.5 cn-surface border cn-border rounded-lg text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold cn-text-3 mb-1.5">
              Photo <span className="font-normal cn-text-4">(optional)</span>
            </label>
            {imagePreview ? (
              <div className="relative h-20 rounded-lg overflow-hidden">
                <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-11 rounded-lg border border-dashed cn-border hover:border-purple-400 dark:hover:border-purple-500 cursor-pointer transition-colors">
                <ImagePlus className="w-3.5 h-3.5 cn-text-4" />
                <span className="text-xs cn-text-4">Add a photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
                />
              </label>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={isEditing ? handlePublish : () => setStep('review')}
            disabled={!title.trim() || publishing}
            className="w-full px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {isEditing ? (publishing ? 'Saving…' : 'Save changes') : 'Review pin'}
          </button>
        </>
      )}

      {step === 'review' && (
        <>
          <h2 className="text-lg font-bold cn-text-1">Review &amp; publish</h2>
          <div className="cn-glass rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center shrink-0`}>
                  <cat.Icon className="w-4 h-4 text-white" />
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold cn-text-1 truncate">{title.trim() || 'Untitled place'}</div>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/8 cn-text-2">{cat.label}</span>
              </div>
            </div>
            {description.trim() && <p className="text-xs leading-relaxed cn-text-3">{description.trim()}</p>}
            <p className="cn-mono text-[10px] cn-text-4">{position[0].toFixed(4)}, {position[1].toFixed(4)}</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setStep('details')}
              className="flex-1 px-4 py-2.5 rounded-xl border cn-border text-sm font-medium cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {publishing ? 'Publishing…' : 'Publish pin'}
            </button>
          </div>
        </>
      )}

      {step === 'success' && publishedPin && (
        <>
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <span className="w-[52px] h-[52px] rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
              <Check className="w-6 h-6 text-white" />
            </span>
            <h2 className="text-lg font-bold cn-text-1">Pin published</h2>
            <p className="text-xs cn-text-3">Neighbors nearby can see it on Atlas now.</p>
          </div>
          <div className="cn-glass rounded-xl p-3 flex items-center gap-3">
            <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center shrink-0`}>
              <cat.Icon className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold cn-text-1 truncate">{publishedPin.title}</div>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/8 cn-text-2">{cat.label}</span>
            </div>
          </div>
          <button
            onClick={() => onDone(publishedPin)}
            className="w-full px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

interface AtlasScreenProps {
  onBack: () => void;
}

export function AtlasScreen({ onBack }: AtlasScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const { resolvedTheme } = useTheme();

  const [pins, setPins] = useState<AtlasPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [geocoded, setGeocoded] = useState(false);
  const [hubGeoCenter, setHubGeoCenter] = useState<[number, number] | null>(null);

  // Drop-here placement mode
  const [placingPin, setPlacingPin] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number] | null>(null);
  // Reuses the same create-flow panel/position state for editing an existing pin
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [dropHereCenter, setDropHereCenter] = useState<[number, number] | null>(null);
  const [nearbyPlace, setNearbyPlace] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [createCategory, setCreateCategory] = useState<AtlasPinCategory>('poi');

  // Location search — dropdown/results/history are owned by <LocationSearchInput>
  const [locationQuery, setLocationQuery] = useState('');

  // A location referenced elsewhere (e.g. an EVENT post) with no nearby pin yet
  const [unregisteredLocation, setUnregisteredLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);

  // Pin list filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AtlasPinCategory | 'all'>('all');
  const [savedOnly, setSavedOnly] = useState(false);

  // Saved/bookmarked pins — persisted across sessions, shared between the detail
  // panel's bookmark toggle and the "Saved" filter chip in the list view.
  const [savedPinIds, setSavedPinIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_PINS_KEY) || '[]'); } catch { return []; }
  });

  const toggleSavedPin = (pinId: string) => {
    setSavedPinIds(prev => {
      const next = prev.includes(pinId) ? prev.filter(id => id !== pinId) : [...prev, pinId];
      localStorage.setItem(SAVED_PINS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPins = useCallback(async () => {
    if (hubSlug) setPins(await atlasService.getPins(hubSlug));
  }, [hubSlug]);

  useEffect(() => { loadPins(); }, [loadPins]);

  useEffect(() => {
    if (pins.length === 0) return;
    const deeplink = sessionStorage.getItem('citinet-deeplink-pin');
    if (!deeplink) return;
    sessionStorage.removeItem('citinet-deeplink-pin');
    const target = pins.find(p => p.id === deeplink);
    if (target) handlePinSelect(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  useEffect(() => {
    if (pins.length === 0) return;
    const focusPin = sessionStorage.getItem('citinet-focus-pin');
    if (!focusPin) return;
    sessionStorage.removeItem('citinet-focus-pin');
    const target = pins.find(p => p.id === focusPin);
    if (target) handlePinSelect(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // A pin shared via the detail panel's Share button — carried as a real ?pin= URL
  // param (unlike the sessionStorage deep-links above) so it survives a fresh load
  // in another tab/device. Consumed once, then stripped from the URL.
  useEffect(() => {
    if (pins.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const sharedPinId = params.get('pin');
    if (!sharedPinId) return;
    const target = pins.find(p => p.id === sharedPinId);
    if (target) handlePinSelect(target);
    params.delete('pin');
    const newSearch = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // A post (or other feature) linked to raw coordinates, not an existing pin id.
  // If something's already pinned nearby, treat it the same as a real pin deep-link;
  // otherwise center the map there and offer to add a pin — never create one silently.
  useEffect(() => {
    if (pins.length === 0) return;
    const raw = sessionStorage.getItem('citinet-deeplink-coords');
    if (!raw) return;
    sessionStorage.removeItem('citinet-deeplink-coords');
    try {
      const { lat, lng, label } = JSON.parse(raw) as { lat: number; lng: number; label: string };
      const nearby = pins.find(p => distanceMeters(lat, lng, p.latitude, p.longitude) <= 100);
      if (nearby) {
        handlePinSelect(nearby);
      } else {
        setMapCenter([lat, lng]);
        setUnregisteredLocation({ lat, lng, label });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // A location we couldn't auto-geocode (e.g. a generic venue name with no city/state
  // context) — pre-fill the search box so the user can pick the right result themselves
  // instead of the "view in Atlas" link just doing nothing.
  useEffect(() => {
    const q = sessionStorage.getItem('citinet-deeplink-atlas-search');
    if (!q) return;
    sessionStorage.removeItem('citinet-deeplink-atlas-search');
    setLocationQuery(q);
  }, []);

  useEffect(() => {
    if (!currentHub) return;
    if (currentHub.lat && currentHub.lng) {
      const c: [number, number] = [currentHub.lat, currentHub.lng];
      setMapCenter(c); setHubGeoCenter(c); setGeocoded(true);
      return;
    }
    if (!currentHub.location) return;
    const cacheKey = `citinet-geo:${currentHub.location}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { const c = JSON.parse(cached) as [number, number]; setMapCenter(c); setHubGeoCenter(c); setGeocoded(true); return; } catch {}
    }
    geocodeLocation(currentHub.location).then(coords => {
      if (coords) {
        sessionStorage.setItem(cacheKey, JSON.stringify(coords));
        setMapCenter(coords); setHubGeoCenter(coords); setGeocoded(true);
      }
    });
  }, [currentHub?.lat, currentHub?.lng, currentHub?.location]);

  const handlePinSelect = (pin: AtlasPin) => {
    setSelectedPinId(pin.id);
    setMapCenter([pin.latitude, pin.longitude]);
  };

  // ── Drop-here placement ──────────────────────────────────────────────────

  const enterPlacingMode = () => {
    cancelPlacement();
    setUnregisteredLocation(null);
    setPlacingPin(true);
    setDropHereCenter(mapCenter);
    reverseGeocode(mapCenter[0], mapCenter[1]).then(n => setNearbyPlace(n));
  };

  const handleDropHereCenterChange = useCallback((center: [number, number]) => {
    setDropHereCenter(center);
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = setTimeout(async () => {
      const name = await reverseGeocode(center[0], center[1]);
      setNearbyPlace(name);
    }, 600);
  }, []);

  const handleDropHereConfirm = () => {
    if (!dropHereCenter) return;
    setPendingPosition(dropHereCenter);
    setSuggestedTitle(nearbyPlace);
    setCreateCategory('poi');
    setPlacingPin(false);
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
  };

  const cancelPlacement = () => {
    setPlacingPin(false);
    setPendingPosition(null);
    setDropHereCenter(null);
    setNearbyPlace(null);
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
  };

  // ── Location search ──────────────────────────────────────────────────────

  const handleLocationSelect = (result: { lat: number; lng: number; label: string }) => {
    setMapCenter([result.lat, result.lng]);
    setLocationQuery('');
    setUnregisteredLocation(null);
    setPendingPosition([result.lat, result.lng]);
    setSuggestedTitle(result.label);
    setCreateCategory('poi');
  };

  // ── Pin CRUD ─────────────────────────────────────────────────────────────

  const startEditPin = (pin: AtlasPin) => {
    setEditingPinId(pin.id);
    setPendingPosition([pin.latitude, pin.longitude]);
    setSuggestedTitle(null);
    setCreateCategory(pin.category);
  };

  /** Creates or updates a pin (editingPinId decides which) but leaves the panel's
   * own step logic in charge of what happens next — for creation it advances to a
   * 'success' step and calls `finishCreate` once the user is done there; edits skip
   * straight to `finishCreate` themselves. */
  const handleFormSubmit = async (data: { title: string; description?: string; category: AtlasPinCategory; imageFileName?: string }): Promise<AtlasPin> => {
    if (!hubSlug) throw new Error('Not ready');
    if (editingPinId) {
      const pin = await atlasService.updatePin(hubSlug, editingPinId, data);
      await loadPins();
      return pin;
    }
    if (!pendingPosition || !currentUser?.username) throw new Error('Not ready to publish');
    const pin = await atlasService.addPin(hubSlug, currentUser.username, {
      latitude: pendingPosition[0],
      longitude: pendingPosition[1],
      ...data,
    });
    await loadPins();
    return pin;
  };

  const finishCreate = (pin: AtlasPin) => {
    setPendingPosition(null);
    setSuggestedTitle(null);
    setEditingPinId(null);
    setSelectedPinId(pin.id);
    setMapCenter([pin.latitude, pin.longitude]);
  };

  const cancelCreate = () => {
    setPendingPosition(null);
    setSuggestedTitle(null);
    setEditingPinId(null);
  };

  const handleDeletePin = async (pinId: string) => {
    if (!hubSlug) return;
    await atlasService.deletePin(hubSlug, pinId);
    if (selectedPinId === pinId) setSelectedPinId(null);
    await loadPins();
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedPin = selectedPinId ? pins.find(p => p.id === selectedPinId) ?? null : null;
  const rightPanelActive = !!selectedPin || !!pendingPosition;

  const filteredPins = pins
    .filter(p => !savedOnly || savedPinIds.includes(p.id))
    .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
    .filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const distanceTo = (pin: AtlasPin) =>
    hubGeoCenter ? formatDistanceMiles(distanceMeters(hubGeoCenter[0], hubGeoCenter[1], pin.latitude, pin.longitude)) : null;

  // Moderation (delete) stays available to admins; editing someone else's pin content
  // does not — a mod can remove a bad pin, but shouldn't be able to rewrite it.
  const canDeletePin = (pin: AtlasPin) => currentUser?.username === pin.authorUsername || !!currentUser?.isAdmin;
  const canEditPin = (pin: AtlasPin) => currentUser?.username === pin.authorUsername;

  const tileUrl = resolvedTheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-7 items-start">

          {/* ── Left: back + header + search + map ── */}
          <div className={rightPanelActive ? 'hidden lg:flex lg:flex-col gap-5 min-w-0' : 'flex flex-col gap-5 min-w-0'}>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors self-start"
            >
              <ChevronLeft className="w-3.5 h-3.5" />{currentHub?.name ?? 'Hub'}
            </button>

            <div className="flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md shrink-0"
                style={{ background: 'var(--cn-grad-atlas)' }}
              >
                <MapIcon className="w-6 h-6 text-white" />
              </span>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight cn-text-1 leading-none">Atlas</h1>
                <p className="text-sm cn-text-3 mt-0.5">{pins.length} {pins.length === 1 ? 'pin' : 'pins'} on the map</p>
              </div>
              <button
                onClick={placingPin ? cancelPlacement : enterPlacingMode}
                className={`hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                  placingPin ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                <Plus className="w-4 h-4" />
                {placingPin ? 'Placing…' : 'Drop a pin'}
              </button>
            </div>
            <button
              onClick={placingPin ? cancelPlacement : enterPlacingMode}
              className={`sm:hidden w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                placingPin ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              {placingPin ? 'Placing…' : 'Drop a pin'}
            </button>

            {/* Location search */}
            <LocationSearchInput
              value={locationQuery}
              onChange={setLocationQuery}
              onSelect={handleLocationSelect}
              hubCenter={hubGeoCenter}
              historyKey={SEARCH_HISTORY_KEY}
              inputClassName="w-full pl-9 pr-8 py-2.5 cn-surface border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            {/* Map */}
            <div className="relative rounded-2xl overflow-hidden border cn-border h-[260px] lg:h-[560px]">
              <div className="w-full h-full isolate">
                <MapContainer
                  center={mapCenter}
                  zoom={14}
                  style={{ width: '100%', height: '100%' }}
                  zoomControl={!placingPin}
                  attributionControl
                >
                  <TileLayer
                    url={tileUrl}
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  />
                  <MapCenterController center={mapCenter} />
                  <MapCenterTracker active={placingPin} onCenterChange={handleDropHereCenterChange} />

                  {pins.map(pin => (
                    <Marker
                      key={pin.id}
                      position={[pin.latitude, pin.longitude]}
                      icon={getPinIcon(pin.category, selectedPinId === pin.id)}
                      eventHandlers={{ click: () => handlePinSelect(pin) }}
                    />
                  ))}

                  {pendingPosition && (
                    <Marker position={pendingPosition} icon={getPinIcon(createCategory, true)} />
                  )}
                </MapContainer>
              </div>

              {/* Drop-here overlay */}
              {placingPin && (
                <>
                  <div
                    className="absolute left-1/2 top-1/2 z-[1000] pointer-events-none"
                    style={{ transform: 'translate(-50%, -100%)' }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#7c3aed', border: '3px solid white',
                      boxShadow: '0 0 0 4px rgba(124,58,237,0.25), 0 4px 14px rgba(0,0,0,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>📍</div>
                    <div className="w-0.5 h-3 bg-purple-600 mx-auto opacity-70" />
                  </div>

                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-[280px]">
                    <div className="px-3 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-full shadow-lg border cn-border text-xs font-medium cn-text-2 truncate">
                      {nearbyPlace ? `Near: ${nearbyPlace}` : 'Pan the map to position your pin'}
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5">
                    <button
                      onClick={cancelPlacement}
                      className="px-4 py-2.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border cn-border text-sm font-medium cn-text-2 shadow-lg hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDropHereConfirm}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold shadow-lg transition-colors"
                    >
                      <MapPin className="w-4 h-4" />
                      Place pin here
                    </button>
                  </div>
                </>
              )}

              {/* Referenced location with no nearby pin yet — offer to add one, never automatic */}
              {unregisteredLocation && !placingPin && (
                <>
                  <div
                    className="absolute left-1/2 top-1/2 z-[1000] pointer-events-none"
                    style={{ transform: 'translate(-50%, -100%)' }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(113,113,122,0.85)', border: '2.5px dashed white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                    }}>📍</div>
                  </div>
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-[280px]">
                    <div className="px-3 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-full shadow-lg border cn-border text-xs font-medium cn-text-2 truncate">
                      {unregisteredLocation.label} · nothing pinned here yet
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5">
                    <button
                      onClick={() => setUnregisteredLocation(null)}
                      className="px-4 py-2.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border cn-border text-sm font-medium cn-text-2 shadow-lg hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => {
                        setPendingPosition([unregisteredLocation.lat, unregisteredLocation.lng]);
                        setSuggestedTitle(unregisteredLocation.label);
                        setCreateCategory('poi');
                        setUnregisteredLocation(null);
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold shadow-lg transition-colors"
                    >
                      <MapPin className="w-4 h-4" />
                      Add pin here
                    </button>
                  </div>
                </>
              )}

              {/* Hub geocoding overlays */}
              {!geocoded && currentHub?.location && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm pointer-events-none">
                  <p className="text-xs cn-text-3">Locating hub…</p>
                </div>
              )}
              {!currentHub?.location && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
                  <p className="text-sm cn-text-3">Set a hub location to center the map</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: pin list or place detail ── */}
          {/* Bounded to the viewport + sticky on desktop so a long pin list scrolls
              internally instead of pushing the whole page; mobile keeps normal flow. */}
          <div className="lg:sticky lg:top-7 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:pr-1 no-scrollbar">
            {pendingPosition ? (
              <PinFormPanel
                position={pendingPosition}
                hubSlug={hubSlug}
                editingPin={editingPinId ? pins.find(p => p.id === editingPinId) : undefined}
                suggestedTitle={suggestedTitle}
                category={createCategory}
                onCategoryChange={setCreateCategory}
                onPublish={handleFormSubmit}
                onCancel={cancelCreate}
                onDone={finishCreate}
              />
            ) : selectedPin ? (
              <PlaceDetailPanel
                pin={selectedPin}
                hubSlug={hubSlug}
                distanceLabel={distanceTo(selectedPin)}
                canDelete={canDeletePin(selectedPin)}
                canEdit={canEditPin(selectedPin)}
                saved={savedPinIds.includes(selectedPin.id)}
                onBack={() => setSelectedPinId(null)}
                onDelete={() => handleDeletePin(selectedPin.id)}
                onToggleSave={() => toggleSavedPin(selectedPin.id)}
                onEdit={() => startEditPin(selectedPin)}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {/* Search pins */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search pins…"
                    className="w-full pl-9 pr-8 py-2.5 cn-surface border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <X className="w-3.5 h-3.5 cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300" />
                    </button>
                  )}
                </div>

                {/* Category chips */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setSavedOnly(s => !s)}
                    className={`flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      savedOnly
                        ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30'
                        : 'bg-black/5 dark:bg-white/5 cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                    }`}
                  >
                    <Bookmark className={`w-3 h-3 ${savedOnly ? 'fill-purple-300' : ''}`} />
                    Saved{savedPinIds.length > 0 ? ` (${savedPinIds.length})` : ''}
                  </button>
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      categoryFilter === 'all'
                        ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30'
                        : 'bg-black/5 dark:bg-white/5 cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                    }`}
                  >
                    All places
                  </button>
                  {(Object.entries(ATLAS_CATEGORIES) as [AtlasPinCategory, typeof ATLAS_CATEGORIES[AtlasPinCategory]][]).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setCategoryFilter(key)}
                      className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        categoryFilter === key
                          ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30'
                          : 'bg-black/5 dark:bg-white/5 cn-text-3 cn-border hover:border-black/15 dark:hover:border-white/15'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <span className="text-xs cn-text-3">
                  <b className="cn-mono cn-text-1">{filteredPins.length}</b> {filteredPins.length === 1 ? 'place' : 'places'} pinned
                </span>

                {/* Place cards */}
                <div className="flex flex-col gap-2">
                  {filteredPins.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
                        <MapPin className="w-8 h-8 cn-text-4" />
                      </div>
                      {pins.length === 0 ? (
                        <>
                          <p className="text-sm font-medium cn-text-2 mb-1">No pins yet</p>
                          <p className="text-xs cn-text-4">
                            Search for a place above or click <strong>Drop a pin</strong> to mark a spot
                          </p>
                        </>
                      ) : savedOnly ? (
                        <>
                          <p className="text-sm font-medium cn-text-2 mb-1">No saved pins</p>
                          <p className="text-xs cn-text-4">
                            Tap the <Bookmark className="w-3 h-3 inline -mt-0.5" /> icon on a pin's detail view to save it here
                          </p>
                        </>
                      ) : (
                        <p className="text-sm cn-text-3">No pins match your filter</p>
                      )}
                    </div>
                  ) : (
                    filteredPins.map(pin => (
                      <PlaceRow
                        key={pin.id}
                        pin={pin}
                        distanceLabel={distanceTo(pin)}
                        canDelete={canDeletePin(pin)}
                        onSelect={() => handlePinSelect(pin)}
                        onDelete={() => handleDeletePin(pin.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
