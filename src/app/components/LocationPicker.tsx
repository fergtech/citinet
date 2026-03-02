/**
 * LocationPicker — Nominatim-backed location autocomplete.
 *
 * Calls the free OpenStreetMap Nominatim API as the user types, shows a
 * dropdown of real place suggestions, and emits a structured LocationResult
 * (display name + lat/lng + optional postcode) on selection.
 *
 * Usage:
 *   <LocationPicker
 *     defaultValue={currentHub.location}
 *     onSelect={result => { if (result) doSomething(result); }}
 *   />
 */

import { useState, useRef, useEffect } from 'react';
import { MapPin, Search, Loader2, CheckCircle } from 'lucide-react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LocationResult {
  /** Human-readable place name, e.g. "Highland Park, Los Angeles, California" */
  displayName: string;
  lat: number;
  lng: number;
  /** Postal/ZIP code from Nominatim address detail, when available */
  postcode?: string;
}

// ─── Nominatim raw shape (minimal) ───────────────────────────────────────────

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
  };
}

/** Build a concise display name from Nominatim address fields. */
function toShortLabel(item: NominatimItem): string {
  const a = item.address || {};
  const parts: string[] = [];

  const neighborhood = a.suburb || a.neighbourhood || a.quarter;
  const city = a.city || a.town || a.municipality || a.village;

  if (neighborhood) parts.push(neighborhood);
  if (city && city !== neighborhood) parts.push(city);
  if (a.state) parts.push(a.state);

  // Fall back to first 3 comma-separated parts of full display_name
  return parts.length >= 2
    ? parts.join(', ')
    : item.display_name.split(',').slice(0, 3).join(',').trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LocationPickerProps {
  /** Pre-fill the input (e.g. when editing an existing hub location) */
  defaultValue?: string;
  /** Called with the selected result, or null when the user clears / modifies the text */
  onSelect: (result: LocationResult | null) => void;
  placeholder?: string;
  /** Override the input's className (uses wizard style by default) */
  inputClassName?: string;
}

export function LocationPicker({
  defaultValue = '',
  onSelect,
  placeholder = 'Search neighborhood or city…',
  inputClassName,
}: LocationPickerProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!defaultValue);
  const [activeIdx, setActiveIdx] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  const search = async (q: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
        { signal: abortRef.current.signal, headers: { 'Accept-Language': 'en' } }
      );
      const data: NominatimItem[] = await res.json();
      const mapped = data.map(item => ({
        displayName: toShortLabel(item),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        postcode: item.address?.postcode,
      }));
      setResults(mapped);
      setOpen(mapped.length > 0);
      setActiveIdx(-1);
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        setResults([]);
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (value: string) => {
    setQuery(value);
    setSelected(false);
    onSelect(null);
    setActiveIdx(-1);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(value.trim()), 300);
  };

  const pick = (result: LocationResult) => {
    setQuery(result.displayName);
    setSelected(true);
    setOpen(false);
    setResults([]);
    onSelect(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) pick(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const defaultInputClass = `w-full p-3.5 pr-10 border-2 rounded-xl
    text-slate-900 dark:text-white bg-white dark:bg-zinc-800
    focus:outline-none transition-colors ${
    selected
      ? 'border-green-500 dark:border-green-600'
      : 'border-slate-200 dark:border-zinc-700 focus:border-purple-500'
  }`;

  return (
    <div className="relative">
      {/* Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          autoComplete="off"
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0 && !selected) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputClassName ?? defaultInputClass}
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading
            ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            : selected
              ? <CheckCircle className="w-4 h-4 text-green-500" />
              : <Search className="w-4 h-4 text-slate-400" />}
        </span>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
          {results.map((r, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={() => pick(r)}
              className={`w-full text-left px-4 py-3 flex items-start gap-2.5 text-sm
                border-b border-slate-100 dark:border-zinc-700 last:border-0 transition-colors ${
                idx === activeIdx
                  ? 'bg-purple-50 dark:bg-purple-900/20'
                  : 'hover:bg-slate-50 dark:hover:bg-zinc-700'
              }`}
            >
              <MapPin className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
              <span className="text-slate-800 dark:text-slate-200">{r.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {/* "No results" hint */}
      {!selected && query.trim().length >= 2 && !loading && !open && results.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 ml-1">
          No places found — try a different search
        </p>
      )}

      {/* "Select from list" nudge when user has typed but not selected */}
      {!selected && query.trim().length >= 2 && !loading && results.length > 0 && !open && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 ml-1">
          Select a location from the suggestions to continue
        </p>
      )}
    </div>
  );
}
