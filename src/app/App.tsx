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
// Public Routes (no hub context required)
// ──────────────────────────────────────────────

function WelcomeRoute() {
  const navigate = useNavigate();
  const { currentHub, currentUser } = useHub();

  // If user is already connected to a hub and registered, redirect to their hub portal
  useEffect(() => {
    if (currentHub?.slug && currentUser?.username) {
      navigate(`/${currentHub.slug}`, { replace: true });
    }
  }, [currentHub, currentUser, navigate]);
  
  const handleJoinNetwork = () => {
    navigate('/join');
  };

  const handleCreateNetwork = () => {
    navigate('/create');
  };

  return <WelcomeScreen onJoinNetwork={handleJoinNetwork} onCreateNetwork={handleCreateNetwork} />;
}

function JoinHubRoute() {
  const navigate = useNavigate();
  const { onHubJoined } = useHub();
  
  const handleHubFound = (hubSlug: string, _hubName: string, hub: Hub) => {
    onHubJoined(hub);
    // User already signed up with username/password in the join flow —
    // go directly to the hub dashboard.
    navigate(`/${hubSlug}`, { replace: true });
  };

  const handleBack = () => {
    navigate('/');
  };

  return <NodeDiscoveryScreen onNodeFound={handleHubFound} onBack={handleBack} />;
}

function CreateHubRoute() {
  const navigate = useNavigate();
  const { onHubJoined } = useHub();
  
  const handleComplete = async (_nodeId: string, nodeName: string) => {
    // When creating a hub, the user enters hub info (name, location)
    // but the actual hub runs on physical hardware. The wizard just collects
    // the info and saves a local connection record.
    const hub = await hubService.joinHub('', { name: nodeName, node_id: '' });
    onHubJoined(hub);
    navigate(`/${hub.slug}/onboard`);
  };

  const handleBack = () => {
    navigate('/');
  };

  return <NodeCreationWizard onComplete={handleComplete} onBack={handleBack} />;
}

// ──────────────────────────────────────────────
// Hub-Scoped Routes (require :hubSlug param)
// ──────────────────────────────────────────────

function HubOnboardRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  const { onOnboardingComplete } = useHub();
  
  const connection = hubSlug ? hubService.getHubConnection(hubSlug) : null;
  const hubName = connection?.hub?.name || hubSlug || 'Community Hub';

  // If already onboarded, redirect to hub dashboard
  useEffect(() => {
    if (hubSlug && hubService.isOnboarded(hubSlug)) {
      navigate(`/${hubSlug}`, { replace: true });
    }
  }, [hubSlug, navigate]);

  const handleOnboardingComplete = async (data: HubUser) => {
    if (!hubSlug) return;
    await hubService.completeOnboarding(hubSlug, data);
    onOnboardingComplete(hubSlug, data);
    navigate(`/${hubSlug}`);
  };

  return <NodeEntryFlow onComplete={handleOnboardingComplete} locationName={hubName} />;
}

function HubDashboardRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  const { currentHub, currentUser, leaveHub, loading } = useHub();

  // If the hub slug was corrected (e.g., API returned the real hub name),
  // redirect to the canonical URL
  useEffect(() => {
    if (loading) return;
    if (currentHub?.slug && hubSlug && currentHub.slug !== hubSlug) {
      navigate(`/${currentHub.slug}`, { replace: true });
    }
  }, [currentHub?.slug, hubSlug, loading, navigate]);

  // Redirect to join if user has no account for this hub
  useEffect(() => {
    if (loading) return;
    if (hubSlug && !hubService.isOnboarded(hubSlug) && !currentHub?.slug) {
      navigate(`/join`, { replace: true });
    }
  }, [hubSlug, currentHub?.slug, loading, navigate]);

  const handleNavigate = (screen: string) => {
    navigate(`/${hubSlug}/${screen}`);
  };

  const handleLogout = () => {
    const slug = currentHub?.slug || hubSlug;
    if (slug) {
      leaveHub(slug);
    }
    navigate('/', { replace: true });
  };

  const userName = currentUser?.displayName || currentUser?.username || 'Neighbor';
  const nodeName = currentHub?.name || hubSlug || 'Community Hub';
  
  // Store for components that still read from sessionStorage
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('citinet-node-name', nodeName);
  }

  return <Dashboard userName={userName} onNavigate={handleNavigate} onLogout={handleLogout} />;
}

function HubFeedRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  return <Feed onBack={() => navigate(`/${hubSlug}`)} />;
}

function HubNeighborsRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  return <NeighborsScreen onBack={() => navigate(`/${hubSlug}`)} />;
}

function HubFilesRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  return <FilesScreen onBack={() => navigate(`/${hubSlug}`)} />;
}

function HubMessagesRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  return <MessagesScreen onBack={() => navigate(`/${hubSlug}`)} />;
}

function HubNetworkRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  
  const handleNavigate = (screen: string) => {
    navigate(`/${hubSlug}/${screen}`);
  };

  return <NetworkScreen onBack={() => navigate(`/${hubSlug}`)} onNavigate={handleNavigate} />;
}

function HubMarketplaceRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  
  const handleVendorClick = (vendorId: string) => {
    navigate(`/${hubSlug}/vendor/${vendorId}`);
  };

  return <MarketplaceScreen onBack={() => navigate(`/${hubSlug}`)} onVendorClick={handleVendorClick} />;
}

function HubVendorProfileRoute() {
  const navigate = useNavigate();
  const { hubSlug, vendorId } = useParams<{ hubSlug: string; vendorId: string }>();
  
  const vendor = mockVendors.find(v => v.id === vendorId);
  
  if (!vendor) {
    return <PlaceholderScreen title="Vendor Not Found" onBack={() => navigate(`/${hubSlug}/marketplace`)} />;
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
  
  const handleItemClick = (_itemId: string) => {
    navigate(`/${hubSlug}/marketplace`);
  };

  return (
    <VendorProfileScreen
      vendor={vendor}
      vendorListings={vendorListings}
      onBack={() => navigate(`/${hubSlug}/marketplace`)}
      onItemClick={handleItemClick}
    />
  );
}

function HubToolkitRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  
  const handleNavigate = (screen: string) => {
    navigate(`/${hubSlug}/${screen}`);
  };

  return <ToolkitScreen onBack={() => navigate(`/${hubSlug}`)} onNavigate={handleNavigate} />;
}

function HubMySubmissionsRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  
  return <MySubmissionsScreen onBack={() => navigate(`/${hubSlug}/toolkit`)} />;
}

function HubModerationQueueRoute() {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  
  return <ModerationQueueScreen onBack={() => navigate(`/${hubSlug}/toolkit`)} />;
}

function HubPlaceholderRoute({ screen }: { screen: string }) {
  const navigate = useNavigate();
  const { hubSlug } = useParams<{ hubSlug: string }>();
  
  return (
    <PlaceholderScreen
      title={screenTitles[screen] || 'Screen'}
      description={screenDescriptions[screen]}
      onBack={() => navigate(`/${hubSlug}`)}
    />
  );
}

// ──────────────────────────────────────────────
// Hub Guard: validates the :hubSlug param
// ──────────────────────────────────────────────

function HubGuard({ children }: { children: React.ReactNode }) {
  const { hubSlug } = useParams<{ hubSlug: string }>();
  const { currentHub, loading } = useHub();
  const navigate = useNavigate();

  useEffect(() => {
    // Don't make redirect decisions until context has loaded from storage
    if (loading) return;
    if (!hubSlug) return;
    // If the context has a hub (possibly re-keyed to a new slug), let the
    // dashboard route handle redirecting to the canonical slug.
    if (currentHub) return;
    // No hub in context AND nothing in storage — truly unknown slug
    if (!hubService.getHubConnection(hubSlug)) {
      navigate('/', { replace: true });
    }
  }, [hubSlug, currentHub, loading, navigate]);

  return <>{children}</>;
}

export default function App() {
  // Detect and apply user's color scheme preference
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(matchMedia.matches);
    const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
    matchMedia.addEventListener('change', listener);
    return () => matchMedia.removeEventListener('change', listener);
  }, []);

  return (
    <BrowserRouter>
      <HubProvider>
        <div className="w-full">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<WelcomeRoute />} />
            <Route path="/join" element={<JoinHubRoute />} />
            <Route path="/create" element={<CreateHubRoute />} />
            
            {/* Hub-scoped routes: citinet.vercel.app/:hubSlug/* */}
            <Route path="/:hubSlug/onboard" element={<HubGuard><HubOnboardRoute /></HubGuard>} />
            <Route path="/:hubSlug" element={<HubGuard><HubDashboardRoute /></HubGuard>} />
            <Route path="/:hubSlug/feed" element={<HubGuard><HubFeedRoute /></HubGuard>} />
            <Route path="/:hubSlug/neighbors" element={<HubGuard><HubNeighborsRoute /></HubGuard>} />
            <Route path="/:hubSlug/files" element={<HubGuard><HubFilesRoute /></HubGuard>} />
            <Route path="/:hubSlug/messages" element={<HubGuard><HubMessagesRoute /></HubGuard>} />
            <Route path="/:hubSlug/network" element={<HubGuard><HubNetworkRoute /></HubGuard>} />
            <Route path="/:hubSlug/marketplace" element={<HubGuard><HubMarketplaceRoute /></HubGuard>} />
            <Route path="/:hubSlug/vendor/:vendorId" element={<HubGuard><HubVendorProfileRoute /></HubGuard>} />
            <Route path="/:hubSlug/toolkit" element={<HubGuard><HubToolkitRoute /></HubGuard>} />
            <Route path="/:hubSlug/toolkit/my-submissions" element={<HubGuard><HubMySubmissionsRoute /></HubGuard>} />
            <Route path="/:hubSlug/toolkit/moderation" element={<HubGuard><HubModerationQueueRoute /></HubGuard>} />
            
            {/* Hub placeholder routes */}
            <Route path="/:hubSlug/community" element={<HubGuard><HubPlaceholderRoute screen="community" /></HubGuard>} />
            <Route path="/:hubSlug/settings" element={<HubGuard><HubPlaceholderRoute screen="settings" /></HubGuard>} />
            <Route path="/:hubSlug/post" element={<HubGuard><HubPlaceholderRoute screen="post" /></HubGuard>} />
            <Route path="/:hubSlug/chat" element={<HubGuard><HubPlaceholderRoute screen="chat" /></HubGuard>} />
            <Route path="/:hubSlug/signal" element={<HubGuard><HubPlaceholderRoute screen="signal" /></HubGuard>} />
            <Route path="/:hubSlug/become-sponsor" element={<HubGuard><HubPlaceholderRoute screen="become-sponsor" /></HubGuard>} />
            
            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </HubProvider>
    </BrowserRouter>
  );
}
