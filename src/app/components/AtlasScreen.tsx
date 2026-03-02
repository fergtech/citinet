import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Search, X, Trash2, MapPin, Filter } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useHub } from '../context/HubContext';
import { atlasService } from '../services/atlasService';
import { ATLAS_CATEGORIES, type AtlasPin, type AtlasPinCategory } from '../types/atlas';
import { AddPinModal } from './AddPinModal';

// ── Icon factory (cached) ──────────────────────────────────────────────────

const _iconCache = new Map<string, L.DivIcon>();

function getPinIcon(category: AtlasPinCategory, selected: boolean): L.DivIcon {
  const key = `${category}-${selected}`;
  if (_iconCache.has(key)) return _iconCache.get(key)!;
  const { markerColor, emoji } = ATLAS_CATEGORIES[category];
  const s = selected ? 36 : 28;
  const shadow = selected
    ? `box-shadow:0 0 0 3px white,0 0 0 6px ${markerColor};`
    : 'box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${markerColor};border:2.5px solid white;${shadow}display:flex;align-items:center;justify-content:center;font-size:${selected ? 17 : 14}px;cursor:pointer;">${emoji}</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -(s / 2) - 4],
  });
  _iconCache.set(key, icon);
  return icon;
}

// ── Internal map helpers ───────────────────────────────────────────────────

function MapClickHandler({ enabled, onMapClick }: { enabled: boolean; onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => { if (enabled) onMapClick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function MapCenterController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

// ── Geocoding (same as NetworkMap) ─────────────────────────────────────────

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {}
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

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];

// ── Main screen ────────────────────────────────────────────────────────────

interface AtlasScreenProps {
  onBack: () => void;
}

export function AtlasScreen({ onBack }: AtlasScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const [pins, setPins] = useState<AtlasPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [geocoded, setGeocoded] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  // Placement mode
  const [placingPin, setPlacingPin] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number] | null>(null);

  // List filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AtlasPinCategory | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Scroll-to-selected in list
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load pins
  const loadPins = useCallback(async () => {
    if (hubSlug) setPins(await atlasService.getPins(hubSlug));
  }, [hubSlug]);

  useEffect(() => { loadPins(); }, [loadPins]);

  // Dark mode observer
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Geocode hub location → initial map center
  useEffect(() => {
    if (!currentHub) return;
    if (currentHub.lat && currentHub.lng) {
      setMapCenter([currentHub.lat, currentHub.lng]);
      setGeocoded(true);
      return;
    }
    if (!currentHub.location) return;
    const cacheKey = `citinet-geo:${currentHub.location}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { const c = JSON.parse(cached) as [number, number]; setMapCenter(c); setGeocoded(true); return; } catch {}
    }
    geocodeLocation(currentHub.location).then(coords => {
      if (coords) {
        sessionStorage.setItem(cacheKey, JSON.stringify(coords));
        setMapCenter(coords);
        setGeocoded(true);
      }
    });
  }, [currentHub?.lat, currentHub?.lng, currentHub?.location]);

  // Scroll list to selected pin
  useEffect(() => {
    if (!selectedPinId) return;
    const el = itemRefs.current[selectedPinId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedPinId]);

  const handlePinSelect = (pin: AtlasPin) => {
    setSelectedPinId(pin.id);
    setMapCenter([pin.latitude, pin.longitude]);
  };

  const handleMapClick = (lat: number, lng: number) => {
    setPendingPosition([lat, lng]);
    setPlacingPin(false);
  };

  const handleSavePin = async (data: { title: string; description?: string; category: AtlasPinCategory }) => {
    if (!pendingPosition || !hubSlug || !currentUser?.username) return;
    try {
      const pin = await atlasService.addPin(hubSlug, currentUser.username, {
        latitude: pendingPosition[0],
        longitude: pendingPosition[1],
        ...data,
      });
      setPendingPosition(null);
      await loadPins();
      setSelectedPinId(pin.id);
      setMapCenter([pin.latitude, pin.longitude]);
    } catch (err) {
      console.error('Failed to save pin:', err);
      setPendingPosition(null);
    }
  };

  const handleDeletePin = async (pinId: string) => {
    if (!hubSlug) return;
    await atlasService.deletePin(hubSlug, pinId);
    if (selectedPinId === pinId) setSelectedPinId(null);
    await loadPins();
  };

  const cancelPlacement = () => { setPlacingPin(false); setPendingPosition(null); };

  // Filtered pins for list
  const filteredPins = pins
    .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
    .filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 z-10 flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back"
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <div>
              <h2 className="text-slate-900 dark:text-white text-2xl font-semibold tracking-tight">Atlas</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-light">
                {pins.length} {pins.length === 1 ? 'pin' : 'pins'} on the map
              </p>
            </div>
          </div>
          <button
            onClick={() => { cancelPlacement(); setPlacingPin(true); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              placingPin
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            {placingPin ? 'Placing…' : 'Add Pin'}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className={`relative flex-shrink-0 h-[45vh] min-h-[300px] ${placingPin ? 'cursor-crosshair' : ''}`}>
        {/* Placement mode banner */}
        {placingPin && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-full shadow-lg">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span>Click the map to place your pin</span>
            <button onClick={cancelPlacement} className="ml-1 hover:opacity-75 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
            <MapClickHandler enabled={placingPin} onMapClick={handleMapClick} />

            {pins.map(pin => {
              const canDeletePopup = currentUser?.username === pin.authorUsername || currentUser?.isAdmin;
              return (
                <Marker
                  key={pin.id}
                  position={[pin.latitude, pin.longitude]}
                  icon={getPinIcon(pin.category, selectedPinId === pin.id)}
                  eventHandlers={{
                    click: () => handlePinSelect(pin),
                  }}
                >
                  <Popup>
                    <div className="text-sm min-w-[160px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span>{ATLAS_CATEGORIES[pin.category].emoji}</span>
                        <strong className="text-slate-900">{pin.title}</strong>
                      </div>
                      {pin.description && (
                        <p className="text-slate-600 mb-1.5">{pin.description}</p>
                      )}
                      <p className="text-xs text-slate-400">
                        @{pin.authorUsername} · {formatRelativeTime(pin.createdAt)}
                      </p>
                      {canDeletePopup && (
                        <button
                          onClick={() => handleDeletePin(pin.id)}
                          className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove pin
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* Geocoding state overlays */}
        {!geocoded && currentHub?.location && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm pointer-events-none">
            <p className="text-xs text-slate-500 dark:text-slate-400">Locating hub…</p>
          </div>
        )}
        {!currentHub?.location && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
            <div className="text-center px-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">Set a hub location to center the map</p>
            </div>
          </div>
        )}
      </div>

      {/* List section */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-5xl mx-auto w-full px-4 md:px-8">
        {/* Filter bar */}
        <div className="py-3 flex items-center gap-2 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search pins…"
              className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              categoryFilter !== 'all'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-zinc-600'
            }`}
          >
            <Filter className="w-4 h-4" />
            {categoryFilter === 'all' ? 'All' : ATLAS_CATEGORIES[categoryFilter].label}
          </button>
        </div>

        {/* Category filter chips */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 pb-3 flex-shrink-0">
            <button
              onClick={() => { setCategoryFilter('all'); setShowFilters(false); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                  : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              All
            </button>
            {(Object.entries(ATLAS_CATEGORIES) as [AtlasPinCategory, typeof ATLAS_CATEGORIES[AtlasPinCategory]][]).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => { setCategoryFilter(key); setShowFilters(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  categoryFilter === key
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Pin list */}
        <div ref={listRef} className="flex-1 overflow-y-auto pb-6 space-y-2">
          {filteredPins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              {pins.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">No pins yet</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Click <strong>Add Pin</strong> then tap the map to mark a spot
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No pins match your filter</p>
              )}
            </div>
          ) : (
            filteredPins.map(pin => {
              const cat = ATLAS_CATEGORIES[pin.category];
              const isSelected = selectedPinId === pin.id;
              const canDelete = currentUser?.username === pin.authorUsername || currentUser?.isAdmin;

              return (
                <div
                  key={pin.id}
                  ref={el => { itemRefs.current[pin.id] = el; }}
                  onClick={() => handlePinSelect(pin)}
                  className={`group flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-purple-400 dark:border-purple-600 bg-purple-50/60 dark:bg-purple-900/20 shadow-sm'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-sm'
                  }`}
                >
                  {/* Category emoji */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${cat.markerColor}20` }}
                  >
                    {cat.emoji}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{pin.title}</h4>
                      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${cat.badgeClass}`}>
                        {cat.label}
                      </span>
                    </div>
                    {pin.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 line-clamp-2">{pin.description}</p>
                    )}
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      @{pin.authorUsername} · {formatRelativeTime(pin.createdAt)}
                    </p>
                  </div>

                  {/* Delete */}
                  {canDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeletePin(pin.id); }}
                      aria-label="Delete pin"
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-300 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Pin modal */}
      {pendingPosition && (
        <AddPinModal
          position={pendingPosition}
          onSave={handleSavePin}
          onClose={() => setPendingPosition(null)}
        />
      )}
    </div>
  );
}
