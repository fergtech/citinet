import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NodeDiscoveryScreen } from './components/NodeDiscoveryScreen';
import { NodeCreationWizard } from './components/NodeCreationWizard';
import { NodeEntryFlow } from './components/NodeEntryFlow';
import { Dashboard } from './components/Dashboard';
import { Feed } from './components/Feed';
import { NetworkScreen } from './components/NetworkScreen';
import { MarketplaceScreen } from './components/MarketplaceScreen';
import { PlaceholderScreen } from './components/PlaceholderScreen';
import { VendorProfileScreen, mockVendors } from './components/VendorProfileScreen';
import { marketItems } from './data/marketplaceData';
import { MessagesScreen } from './components/MessagesScreen';
import { ToolkitScreen } from './components/ToolkitScreen';
import { FilesScreen } from './components/FilesScreen';
import { NeighborsScreen } from './components/NeighborsScreen';
import { MySubmissionsScreen } from './components/MySubmissionsScreen';
import { ModerationQueueScreen } from './components/ModerationQueueScreen';
import { HubProvider, useHub } from './context/HubContext';
import { hubService } from './services/hubService';
import { getSubdomain, navigateToHub } from './utils/subdomain';
import type { Hub, HubUser } from './types/hub';

const screenTitles: Record<string, string> = {
  community: 'Community',
  settings: 'Settings',
  post: 'Create Post',
  chat: 'Chat',
  signal: 'Signal',
  'become-sponsor': 'Become a Sponsor'
};

const screenDescriptions: Record<string, string> = {
  community: 'Join discussions and participate in community forums.',
  settings: 'Manage your account and app preferences.',
  post: 'Share updates with your local community.',
  chat: 'Real-time messaging with community members.',
  signal: 'Broadcast urgent messages to nearby nodes.',
  'become-sponsor': 'Promote your business to the local mesh community.'
};

// ──────────────────────────────────────────────
// Onboarding Mode Routes (start.citinet.cloud)
// ──────────────────────────────────────────────

function WelcomeRoute() {
  const navigate = useNavigate();
  return (
    <WelcomeScreen
      onJoinNetwork={() => navigate('/join')}
      onCreateNetwork={() => navigate('/create')}
    />
  );
}

function JoinHubRoute() {
  const navigate = useNavigate();
  const { onHubJoined } = useHub();

  const handleHubFound = (hubSlug: string, _hubName: string, hub: Hub) => {
    onHubJoined(hub);
    const connection = hubService.getHubConnection(hubSlug);
    navigateToHub(hubSlug, connection ?? { hub });
  };

  return (
    <NodeDiscoveryScreen
      onNodeFound={handleHubFound}
      onBack={() => navigate('/')}
    />
  );
}

function CreateHubRoute() {
  const navigate = useNavigate();
  const { onHubJoined } = useHub();

  const handleComplete = async (_nodeId: string, nodeName: string) => {
    const hub = await hubService.joinHub('', { name: nodeName, node_id: '' });
    onHubJoined(hub);
    const connection = hubService.getHubConnection(hub.slug);
    navigateToHub(hub.slug, connection ?? { hub });
  };

  return <NodeCreationWizard onComplete={handleComplete} onBack={() => navigate('/')} />;
}

// ──────────────────────────────────────────────
// Hub Mode Routes (hubname.citinet.cloud/*)
// Hub slug comes from the subdomain, not URL params.
// ──────────────────────────────────────────────

function HubOnboardRoute() {
  const navigate = useNavigate();
  const { onOnboardingComplete } = useHub();
  const hubSlug = getSubdomain() ?? '';

  const connection = hubSlug ? hubService.getHubConnection(hubSlug) : null;
  const hubName = connection?.hub?.name || hubSlug || 'Community Hub';

  useEffect(() => {
    if (hubSlug && hubService.isOnboarded(hubSlug)) {
      navigate('/', { replace: true });
    }
  }, [hubSlug, navigate]);

  const handleOnboardingComplete = async (data: HubUser) => {
    if (!hubSlug) return;
    await hubService.completeOnboarding(hubSlug, data);
    onOnboardingComplete(hubSlug, data);
    navigate('/');
  };

  return <NodeEntryFlow onComplete={handleOnboardingComplete} locationName={hubName} />;
}

function HubDashboardRoute() {
  const navigate = useNavigate();
  const { currentHub, currentUser, leaveHub, loading } = useHub();
  const hubSlug = getSubdomain() ?? '';

  // Redirect to onboard if user hasn't completed registration for this hub
  useEffect(() => {
    if (loading) return;
    if (hubSlug && hubService.getHubConnection(hubSlug) && !hubService.isOnboarded(hubSlug)) {
      navigate('/onboard', { replace: true });
    }
  }, [loading, hubSlug, navigate]);

  const handleNavigate = (screen: string) => {
    navigate(`/${screen}`);
  };

  const handleLogout = () => {
    const slug = currentHub?.slug || hubSlug;
    if (slug) leaveHub(slug);
    window.location.href = 'https://start.citinet.cloud';
  };

  const userName = currentUser?.displayName || currentUser?.username || 'Neighbor';
  const nodeName = currentHub?.name || hubSlug || 'Community Hub';

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('citinet-node-name', nodeName);
  }

  return <Dashboard userName={userName} onNavigate={handleNavigate} onLogout={handleLogout} />;
}

function HubFeedRoute() {
  const navigate = useNavigate();
  return <Feed onBack={() => navigate('/')} />;
}

function HubNeighborsRoute() {
  const navigate = useNavigate();
  return <NeighborsScreen onBack={() => navigate('/')} />;
}

function HubFilesRoute() {
  const navigate = useNavigate();
  return <FilesScreen onBack={() => navigate('/')} />;
}

function HubMessagesRoute() {
  const navigate = useNavigate();
  return <MessagesScreen onBack={() => navigate('/')} />;
}

function HubNetworkRoute() {
  const navigate = useNavigate();

  const handleNavigate = (screen: string) => {
    navigate(`/${screen}`);
  };

  return <NetworkScreen onBack={() => navigate('/')} onNavigate={handleNavigate} />;
}

function HubMarketplaceRoute() {
  const navigate = useNavigate();

  const handleVendorClick = (vendorId: string) => {
    navigate(`/vendor/${vendorId}`);
  };

  return <MarketplaceScreen onBack={() => navigate('/')} onVendorClick={handleVendorClick} />;
}

function HubVendorProfileRoute() {
  const navigate = useNavigate();
  const { vendorId } = useParams<{ vendorId: string }>();

  const vendor = mockVendors.find(v => v.id === vendorId);

  if (!vendor) {
    return <PlaceholderScreen title="Vendor Not Found" onBack={() => navigate('/marketplace')} />;
  }

  const vendorListings = marketItems
    .filter(item => item.vendorId === vendorId)
    .map(item => ({
      id: item.id,
      title: item.title,
      price: item.price,
      imageUrl: item.imageUrl,
      category: item.category,
      featured: item.featured
    }));

  return (
    <VendorProfileScreen
      vendor={vendor}
      vendorListings={vendorListings}
      onBack={() => navigate('/marketplace')}
      onItemClick={() => navigate('/marketplace')}
    />
  );
}

function HubToolkitRoute() {
  const navigate = useNavigate();

  const handleNavigate = (screen: string) => {
    navigate(`/${screen}`);
  };

  return <ToolkitScreen onBack={() => navigate('/')} onNavigate={handleNavigate} />;
}

function HubMySubmissionsRoute() {
  const navigate = useNavigate();
  return <MySubmissionsScreen onBack={() => navigate('/toolkit')} />;
}

function HubModerationQueueRoute() {
  const navigate = useNavigate();
  return <ModerationQueueScreen onBack={() => navigate('/toolkit')} />;
}

function HubPlaceholderRoute({ screen }: { screen: string }) {
  const navigate = useNavigate();
  return (
    <PlaceholderScreen
      title={screenTitles[screen] || 'Screen'}
      description={screenDescriptions[screen]}
      onBack={() => navigate('/')}
    />
  );
}

// ──────────────────────────────────────────────
// Hub Guard: ensures a connection exists for this hub subdomain
// ──────────────────────────────────────────────

function HubGuard({ children }: { children: React.ReactNode }) {
  const { currentHub, loading } = useHub();
  const hubSlug = getSubdomain();

  useEffect(() => {
    if (loading) return;
    if (currentHub) return;
    if (hubSlug && !hubService.getHubConnection(hubSlug)) {
      // Not joined: send to onboarding
      window.location.href = 'https://start.citinet.cloud';
    }
  }, [currentHub, loading, hubSlug]);

  return <>{children}</>;
}

// ──────────────────────────────────────────────
// Route Trees
// ──────────────────────────────────────────────

function OnboardingModeRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WelcomeRoute />} />
      <Route path="/join" element={<JoinHubRoute />} />
      <Route path="/create" element={<CreateHubRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HubModeRoutes() {
  return (
    <Routes>
      <Route path="/onboard" element={<HubGuard><HubOnboardRoute /></HubGuard>} />
      <Route path="/" element={<HubGuard><HubDashboardRoute /></HubGuard>} />
      <Route path="/feed" element={<HubGuard><HubFeedRoute /></HubGuard>} />
      <Route path="/neighbors" element={<HubGuard><HubNeighborsRoute /></HubGuard>} />
      <Route path="/files" element={<HubGuard><HubFilesRoute /></HubGuard>} />
      <Route path="/messages" element={<HubGuard><HubMessagesRoute /></HubGuard>} />
      <Route path="/network" element={<HubGuard><HubNetworkRoute /></HubGuard>} />
      <Route path="/marketplace" element={<HubGuard><HubMarketplaceRoute /></HubGuard>} />
      <Route path="/vendor/:vendorId" element={<HubGuard><HubVendorProfileRoute /></HubGuard>} />
      <Route path="/toolkit" element={<HubGuard><HubToolkitRoute /></HubGuard>} />
      <Route path="/toolkit/my-submissions" element={<HubGuard><HubMySubmissionsRoute /></HubGuard>} />
      <Route path="/toolkit/moderation" element={<HubGuard><HubModerationQueueRoute /></HubGuard>} />
      <Route path="/community" element={<HubGuard><HubPlaceholderRoute screen="community" /></HubGuard>} />
      <Route path="/settings" element={<HubGuard><HubPlaceholderRoute screen="settings" /></HubGuard>} />
      <Route path="/post" element={<HubGuard><HubPlaceholderRoute screen="post" /></HubGuard>} />
      <Route path="/chat" element={<HubGuard><HubPlaceholderRoute screen="chat" /></HubGuard>} />
      <Route path="/signal" element={<HubGuard><HubPlaceholderRoute screen="signal" /></HubGuard>} />
      <Route path="/become-sponsor" element={<HubGuard><HubPlaceholderRoute screen="become-sponsor" /></HubGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(matchMedia.matches);
    const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
    matchMedia.addEventListener('change', listener);
    return () => matchMedia.removeEventListener('change', listener);
  }, []);

  const subdomain = getSubdomain();

  return (
    <BrowserRouter>
      <HubProvider>
        <div className="w-full">
          {subdomain ? <HubModeRoutes /> : <OnboardingModeRoutes />}
        </div>
      </HubProvider>
    </BrowserRouter>
  );
}
