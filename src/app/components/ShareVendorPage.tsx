import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { registryService } from '../services/registryService';
import { hubService } from '../services/hubService';
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

    const localConn = hubService.getHubConnection(hubSlug);
    const localTunnelUrl = localConn?.hub?.tunnelUrl;
    const isShell = (u: string) => !u || u === 'http://' || u === 'https://';

    const resolveBase = () => {
      if (localTunnelUrl && !isShell(localTunnelUrl)) return Promise.resolve(localTunnelUrl);
      return registryService.getHubBySlug(hubSlug).then(hub => {
        if (!hub?.tunnel_url) throw new Error('not_registered');
        return hub.tunnel_url;
      });
    };

    resolveBase().then(rawBase => {
      const base = rawBase.replace(/\/$/, '');
      setHubBaseUrl(base);
      return fetch(`${base}/api/public/vendors/${vendorSlug}`)
        .then(async r => {
          if (!r.ok) {
            setError('This vendor profile is not publicly accessible or no longer exists.');
            return;
          }
          setData(await r.json() as PublicVendorData);
        })
        .catch(() => setError('Could not reach the hub. It may be offline.'));
    }).catch(err => {
      setError(err?.message === 'not_registered'
        ? 'This hub is not registered or currently offline.'
        : 'Could not reach the hub registry.');
    }).finally(() => setLoading(false));
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
