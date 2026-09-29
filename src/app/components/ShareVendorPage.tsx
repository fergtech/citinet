import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { fetchFromPublicHub } from '../utils/publicHubBase';
import { VendorProfileScreen } from './VendorProfileScreen';
import { ShareWallpaper } from './ShareWallpaper';
import type { HubVendor, HubListing } from '../types/hub';

interface PublicVendorData {
  vendor: HubVendor;
  listings: HubListing[];
}

export function ShareVendorPage() {
  const { hubSlug, vendorSlug } = useParams<{ hubSlug: string; vendorSlug: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<PublicVendorData | null>(null);
  const [hubBaseUrl, setHubBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hubSlug || !vendorSlug) { setError('Invalid link'); setLoading(false); return; }

    (async () => {
      const hit = await fetchFromPublicHub(hubSlug, new URLSearchParams(window.location.search).get('src'), `/api/public/vendors/${encodeURIComponent(vendorSlug)}`);
      if (!hit) { setError('This hub is not registered, is offline, or has no public address.'); return; }
      if (!hit.res.ok) { setError('This vendor profile is not publicly accessible or no longer exists.'); return; }
      setHubBaseUrl(hit.base);
      setData(await hit.res.json() as PublicVendorData);
    })().finally(() => setLoading(false));
  }, [hubSlug, vendorSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ShareWallpaper />
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShareWallpaper />
        <header className="border-b border-slate-900 px-6 py-4 flex items-baseline gap-1.5">
          <span className="text-lg font-bold tracking-tight cn-wordmark">citinet</span>
          <span className="text-xs text-zinc-500 font-medium">community network</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center max-w-sm mx-auto px-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-red-300">{error || 'Something went wrong.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* VendorProfileScreen's own root has no background of its own — in the
          authenticated app it relies on HubLayout mounting HubBackground
          behind it. Standalone here (no HubLayout), it needs its own header
          + wallpaper like the other public share pages, or it's just flat
          black with no chrome at all. */}
      <ShareWallpaper />
      <header className="border-b border-zinc-900 px-6 py-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tracking-tight cn-wordmark">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </header>
      <VendorProfileScreen
        vendor={data.vendor}
        listings={data.listings}
        hubSlug={hubSlug!}
        hubBaseUrl={hubBaseUrl}
        onBack={() => navigate('/')}
        onItemClick={() => {}}
      />
    </div>
  );
}
