import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NodeDetailsModal, type NodeData } from './NodeDetailsModal';
import { useHub } from '../context/HubContext';
import type { HubMember } from '../types/hub';

interface NetworkMapProps {
  members: HubMember[];
}

// Hub marker — indigo square pin
const hubIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:5px;background:#7c3aed;border:2.5px solid #fff;box-shadow:0 2px 10px rgba(124,58,237,0.6);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Member marker — blue circle
const memberIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 6px rgba(59,130,246,0.5);"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]; // geographic center of US
const DEFAULT_ZOOM = 13;

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await resp.json();
    if (data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch {}
  return null;
}

/** Stable angular offset per member index so pins spread evenly around hub */
function memberOffset(index: number): [number, number] {
  const angle = (index * 137.508) % 360; // golden angle for even distribution
  const radius = 0.001 + (index % 4) * 0.0007; // ~100–380m spread
  return [
    Math.sin((angle * Math.PI) / 180) * radius,
    Math.cos((angle * Math.PI) / 180) * radius,
  ];
}

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, DEFAULT_ZOOM);
  }, [map, center]);
  return null;
}

export function NetworkMap({ members }: NetworkMapProps) {
  const { currentHub } = useHub();
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [geocoded, setGeocoded] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  // Track dark/light mode class on <html>
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Resolve hub coordinates: stored lat/lng → session cache → Nominatim geocode
  useEffect(() => {
    if (!currentHub) return;

    // 1. Use stored geocoded coords (set via LocationPicker in management screen)
    if (currentHub.lat && currentHub.lng) {
      setCenter([currentHub.lat, currentHub.lng]);
      setGeocoded(true);
      return;
    }

    // 2. Fall back to geocoding the location string
    if (!currentHub.location) return;

    // 2a. Check session cache to avoid repeat API calls
    const cacheKey = `citinet-geo:${currentHub.location}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const coords = JSON.parse(cached) as [number, number];
        setCenter(coords);
        setGeocoded(true);
        return;
      } catch {}
    }

    // 2b. Geocode via Nominatim and cache result
    setGeocoded(false);
    geocodeLocation(currentHub.location).then(coords => {
      if (coords) {
        sessionStorage.setItem(cacheKey, JSON.stringify(coords));
        setCenter(coords);
        setGeocoded(true);
      }
    });
  }, [currentHub?.lat, currentHub?.lng, currentHub?.location]);

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const hubNodeData: NodeData = {
    id: currentHub?.id || 'hub',
    type: 'infrastructure',
    name: currentHub?.name || 'Hub',
    status: 'online',
    location: currentHub?.location,
    connectedUsers: members.length,
    servicesHosted: ['API', 'Storage', 'Cache'],
    uptime: currentHub?.meta?.uptime,
  };

  return (
    <>
      {/* isolate creates a new stacking context so Leaflet's internal z-indexes (200–700)
          don't bleed out and sit above fixed modals on the page. */}
      <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 isolate">
        <MapContainer
          center={center}
          zoom={DEFAULT_ZOOM}
          style={{ width: '100%', height: '100%' }}
          zoomControl
          attributionControl
        >
          <TileLayer
            url={tileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapController center={center} />

          {/* Hub pin — shown once location is geocoded */}
          {geocoded && (
            <Marker
              position={center}
              icon={hubIcon}
              eventHandlers={{ click: () => setSelectedNode(hubNodeData) }}
            />
          )}

          {/* Member pins — spread around hub with stable offsets */}
          {geocoded && members.map((member, idx) => {
            const [latOff, lngOff] = memberOffset(idx);
            const pos: [number, number] = [center[0] + latOff, center[1] + lngOff];
            const nodeData: NodeData = {
              id: member.user_id,
              type: 'member',
              name: member.username,
              status: 'online',
              joinedDate: new Date(member.created_at).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              }),
            };
            return (
              <Marker
                key={member.user_id}
                position={pos}
                icon={memberIcon}
                eventHandlers={{ click: () => setSelectedNode(nodeData) }}
              />
            );
          })}
        </MapContainer>

        {/* Map legend */}
        <div className="absolute bottom-7 left-3 z-[1000] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-200 dark:border-zinc-700 pointer-events-none">
          <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-violet-600" />
              <span>Hub</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Members</span>
            </div>
          </div>
        </div>

        {/* Loading state before geocoding */}
        {!geocoded && currentHub?.location && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm pointer-events-none">
            <div className="text-xs text-slate-500 dark:text-slate-400">Locating hub…</div>
          </div>
        )}

        {/* No location configured */}
        {!currentHub?.location && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
            <div className="text-center px-4">
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">No location set</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Set a hub location to see it on the map</div>
            </div>
          </div>
        )}
      </div>

      <NodeDetailsModal node={selectedNode} onClose={() => setSelectedNode(null)} />
    </>
  );
}
