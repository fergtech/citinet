import { useState, useMemo } from 'react';
import { X, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { ATLAS_CATEGORIES, type AtlasPinCategory } from '../types/atlas';

interface AddPinModalProps {
  position: [number, number];
  suggestedTitle?: string | null;
  onSave: (data: { title: string; description?: string; category: AtlasPinCategory }) => void;
  onClose: () => void;
}

// ── Smart category suggestion ──────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<AtlasPinCategory, string[]> = {
  meetup:         ['meet', 'meetup', 'hangout', 'gathering', 'bench', 'plaza', 'square', 'spot'],
  safety:         ['warning', 'alert', 'caution', 'flood', 'hazard', 'unsafe', 'broken', 'incident', 'crime', 'accident'],
  avoid:          ['avoid', 'danger', 'closed', 'blocked', 'abandoned', 'sketchy', 'stay away'],
  infrastructure: ['community center', 'hall', 'library', 'school', 'church', 'garden', 'facility', 'clinic', 'station'],
  poi:            ['coffee', 'cafe', 'café', 'restaurant', 'food', 'shop', 'store', 'market', 'bar',
                   'trail', 'fountain', 'museum', 'gallery', 'park', 'starbucks', 'landmark', 'monument'],
};

function suggestCategory(title: string): AtlasPinCategory | null {
  if (!title.trim()) return null;
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [AtlasPinCategory, string[]][]) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

// ── Mini-map marker icon ───────────────────────────────────────────────────

const MODAL_PIN_ICON = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#7c3aed;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// ── Component ──────────────────────────────────────────────────────────────

export function AddPinModal({ position, suggestedTitle, onSave, onClose }: AddPinModalProps) {
  const [title, setTitle] = useState(suggestedTitle ?? '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<AtlasPinCategory>('poi');
  const [isDark] = useState(() => document.documentElement.classList.contains('dark'));

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const categorySuggestion = useMemo(() => suggestCategory(title), [title]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() || undefined, category });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Pin</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Mini-map */}
          <div className="relative h-28 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-700">
            <MapContainer
              center={position}
              zoom={15}
              style={{ width: '100%', height: '100%' }}
              dragging={false}
              zoomControl={false}
              scrollWheelZoom={false}
              attributionControl={false}
              doubleClickZoom={false}
              keyboard={false}
            >
              <TileLayer url={tileUrl} />
              <Marker position={position} icon={MODAL_PIN_ICON} />
            </MapContainer>
            {/* Coords overlay */}
            <div className="absolute bottom-1.5 left-2 z-[400] pointer-events-none">
              <span className="text-[10px] font-mono text-white/90 bg-black/30 backdrop-blur-sm px-1.5 py-0.5 rounded">
                {position[0].toFixed(4)}, {position[1].toFixed(4)}
              </span>
            </div>
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
              {categorySuggestion && categorySuggestion !== category && (
                <button
                  type="button"
                  onClick={() => setCategory(categorySuggestion)}
                  className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                >
                  <span>{ATLAS_CATEGORIES[categorySuggestion].emoji}</span>
                  <span>Suggested: {ATLAS_CATEGORIES[categorySuggestion].label}</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(ATLAS_CATEGORIES) as [AtlasPinCategory, typeof ATLAS_CATEGORIES[AtlasPinCategory]][]).map(([key, cat]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    category === key
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                      : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="pin-title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="pin-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Rosa's Coffee Shop"
              maxLength={100}
              required
              autoFocus
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="pin-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="pin-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add a note for neighbors…"
              maxLength={300}
              rows={3}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              Add Pin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
