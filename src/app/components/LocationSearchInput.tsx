import { useEffect, useRef, useState } from 'react';
import { Search, X, MapPin, Clock } from 'lucide-react';
import { searchGeocode, type NominatimResult } from '../utils/geocoding';

interface SearchHistoryItem {
  displayName: string;
  lat: number;
  lng: number;
}

interface LocationSearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (result: { lat: number; lng: number; label: string }) => void;
  hubCenter?: [number, number] | null;
  historyKey: string;
  placeholder?: string;
  className?: string;
  /** Override the input's own surface styling to match the caller's context
   * (defaults to Atlas's light/dark-dual style). */
  inputClassName?: string;
}

const DEFAULT_INPUT_CLASSES = 'w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500';

/** Reusable Nominatim-backed location search — the same search bar Atlas uses
 * to place pins, shared here so any composer can capture a real, precise
 * coordinate the same way. */
export function LocationSearchInput({ value, onChange, onSelect, hubCenter, historyKey, placeholder, className, inputClassName }: LocationSearchInputProps) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(historyKey) ?? '[]'); } catch { return []; }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (v: string) => {
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) {
      setResults([]);
      setShowDropdown(history.length > 0);
      return;
    }
    setShowDropdown(true);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const found = await searchGeocode(v, hubCenter ?? undefined);
      setResults(found);
      setLoading(false);
    }, 400);
  };

  const saveToHistory = (item: SearchHistoryItem) => {
    const updated = [item, ...history.filter(h => h.displayName !== item.displayName)].slice(0, 5);
    setHistory(updated);
    localStorage.setItem(historyKey, JSON.stringify(updated));
  };

  const handleResultClick = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const label = result.display_name.split(',')[0].trim();
    setShowDropdown(false);
    setResults([]);
    saveToHistory({ displayName: label, lat, lng });
    onSelect({ lat, lng, label });
  };

  const handleHistoryClick = (item: SearchHistoryItem) => {
    setShowDropdown(false);
    onSelect({ lat: item.lat, lng: item.lng, label: item.displayName });
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      {loading ? (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : value ? (
        <button
          type="button"
          onClick={() => { onChange(''); setResults([]); setShowDropdown(false); }}
          className="absolute right-3 top-1/2 -translate-y-1/2"
        >
          <X className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
        </button>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (history.length > 0 || results.length > 0) setShowDropdown(true); }}
        placeholder={placeholder ?? 'Search for a place, address, or landmark…'}
        className={inputClassName ?? DEFAULT_INPUT_CLASSES}
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden" style={{ zIndex: 1100 }}>
          {!value && history.length > 0 && (
            <>
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                <Clock className="w-3 h-3" /> Recent
              </div>
              {history.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleHistoryClick(item)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{item.displayName}</span>
                </button>
              ))}
            </>
          )}

          {value && results.length > 0 && results.map(result => (
            <button
              key={result.place_id}
              type="button"
              onClick={() => handleResultClick(result)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left transition-colors border-b border-slate-100 dark:border-zinc-800/50 last:border-0"
            >
              <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {result.display_name.split(',')[0]}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                  {result.display_name.split(',').slice(1, 3).join(', ').trim()}
                </p>
              </div>
            </button>
          ))}

          {value && !loading && results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No places found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
