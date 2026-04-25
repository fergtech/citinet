import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, AlertCircle, Mail, Phone, Globe, Clock,
  MapPin, Package, ExternalLink,
} from 'lucide-react';
import { registryService } from '../services/registryService';
import type { HubVendor, HubListing } from '../types/hub';

interface PublicVendorData {
  vendor: HubVendor;
  listings: HubListing[];
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
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

function getBannerStyle(vendor: HubVendor, baseUrl: string): React.CSSProperties {
  if (vendor.banner_mode === 'image' && vendor.banner_image_file_name) {
    return {
      backgroundImage: `url(${baseUrl}/api/public/files/${encodeURIComponent(vendor.banner_image_file_name)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (vendor.banner_mode === 'solid' && vendor.banner_color) {
    return { backgroundColor: vendor.banner_color };
  }
  if (vendor.banner_mode === 'gradient' && vendor.banner_gradient_from && vendor.banner_gradient_to) {
    return { backgroundImage: `linear-gradient(135deg, ${vendor.banner_gradient_from}, ${vendor.banner_gradient_to})` };
  }
  return { backgroundImage: 'linear-gradient(135deg, #2563eb, #7c3aed)' };
}

export function ShareVendorPage() {
  const { hubSlug, vendorSlug } = useParams<{ hubSlug: string; vendorSlug: string }>();

  const [data, setData] = useState<PublicVendorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    if (!hubSlug || !vendorSlug) { setError('Invalid link'); setLoading(false); return; }

    registryService.getHubBySlug(hubSlug).then(hub => {
      if (!hub?.tunnel_url) {
        setError('This hub is not registered or currently offline.');
        setLoading(false);
        return;
      }
      const src = hub.tunnel_url.replace(/\/$/, '');
      setBaseUrl(src);
      return fetch(`${src}/api/public/vendors/${vendorSlug}`)
        .then(async r => {
          if (!r.ok) {
            setError('This vendor profile is not publicly accessible or no longer exists.');
            return;
          }
          setData(await r.json() as PublicVendorData);
        })
        .catch(() => setError('Could not reach the hub. It may be offline.'));
    }).catch(() => setError('Could not reach the hub registry.')).finally(() => setLoading(false));
  }, [hubSlug, vendorSlug]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tracking-tight text-white">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {loading && (
          <div className="flex flex-col items-center gap-3 mt-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="text-sm text-zinc-400">Loading vendor profile…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 mt-20 text-center max-w-sm mx-auto">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!loading && data && (() => {
          const { vendor, listings } = data;
          return (
            <div className="space-y-4">
              {/* Vendor card */}
              <div className="rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
                {/* Banner */}
                <div className="h-32 relative" style={getBannerStyle(vendor, baseUrl)}>
                  {vendor.logo_file_name && (
                    <div className="absolute -bottom-8 left-6">
                      <img
                        src={`${baseUrl}/api/public/files/${encodeURIComponent(vendor.logo_file_name)}`}
                        alt={vendor.name}
                        className="w-16 h-16 rounded-xl object-cover border-2 border-zinc-900 shadow-lg bg-zinc-800"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className={`bg-zinc-900 px-6 pb-5 ${vendor.logo_file_name ? 'pt-10' : 'pt-5'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h1 className="text-xl font-bold text-white">{vendor.name}</h1>
                      {vendor.category && (
                        <span className="text-xs font-medium text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded-full mt-1 inline-block">
                          {vendor.category}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {hubSlug}
                    </span>
                  </div>

                  {vendor.description && (
                    <p className="mt-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{vendor.description}</p>
                  )}

                  {/* Contact row */}
                  <div className="mt-4 flex flex-wrap gap-3">
                    {vendor.contact_email && (
                      <a href={`mailto:${vendor.contact_email}`}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                        <Mail className="w-3.5 h-3.5" /> {vendor.contact_email}
                      </a>
                    )}
                    {vendor.contact_phone && (
                      <a href={`tel:${vendor.contact_phone}`}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                        <Phone className="w-3.5 h-3.5" /> {vendor.contact_phone}
                      </a>
                    )}
                    {vendor.website && (
                      <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                        <Globe className="w-3.5 h-3.5" /> {vendor.website.replace(/^https?:\/\//, '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {vendor.hours && (
                      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Clock className="w-3.5 h-3.5" /> {vendor.hours}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Listings */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">
                  Listings · {listings.length}
                </p>

                {listings.length === 0 && (
                  <div className="text-center py-10 text-zinc-600 text-sm flex flex-col items-center gap-2">
                    <Package className="w-8 h-8 opacity-40" />
                    No active listings right now.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {listings.map(listing => {
                    const imgSrc = (listing as any).image_file_name
                      ? `${baseUrl}/api/public/files/${encodeURIComponent((listing as any).image_file_name)}`
                      : null;
                    return (
                      <div key={listing.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                        {imgSrc && (
                          <img src={imgSrc} alt={listing.title}
                            className="w-full h-36 object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-white leading-tight">{listing.title}</h3>
                            <span className="text-sm font-bold text-purple-400 shrink-0">{formatPrice(listing)}</span>
                          </div>
                          {listing.description && (
                            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{listing.description}</p>
                          )}
                          <p className="text-[11px] text-zinc-600 mt-2">{timeAgo(listing.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      <footer className="px-6 py-5 text-center">
        <p className="text-xs text-zinc-700">
          Vendor is a member of the <span className="text-zinc-500">{hubSlug}</span> community hub on citinet.
        </p>
      </footer>
    </div>
  );
}
