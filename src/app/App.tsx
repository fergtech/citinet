import { useEffect, useState } from 'react';
import { ThemeProvider } from 'next-themes';
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
import { VendorProfileScreen } from './components/VendorProfileScreen';
import { marketplaceService } from './services/marketplaceService';
import { MessagesScreen } from './components/MessagesScreen';
import { ToolkitScreen } from './components/ToolkitScreen';
import { FilesScreen } from './components/FilesScreen';
import { NeighborsScreen } from './components/NeighborsScreen';
import { MySubmissionsScreen } from './components/MySubmissionsScreen';
import { ModerationQueueScreen } from './components/ModerationQueueScreen';
import { AtlasScreen } from './components/AtlasScreen';
import { InitiativesScreen } from './components/InitiativesScreen';
import { AccountScreen } from './components/AccountScreen';
import { HubManagementScreen } from './components/HubManagementScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { DiscoverScreen } from './components/DiscoverScreen';
import { ModLogScreen } from './components/ModLogScreen';
import { SpacesScreen } from './components/SpacesScreen';
import { NotesScreen } from './components/NotesScreen';
import { AssistantScreen } from './components/AssistantScreen';
import { ShareFilePage } from './components/ShareFilePage';
import { ShareNotePage } from './components/ShareNotePage';
import { ShareSpacePage } from './components/ShareSpacePage';
import { ShareVendorPage } from './components/ShareVendorPage';
import { PublicProfilePage } from './components/PublicProfilePage';
import { HubBackground } from './components/HubBackground';
import { HubLayout } from './components/HubLayout';
import { HubProvider, useHub } from './context/HubContext';
import { hubService } from './services/hubService';
import { getSubdomain, navigateToHub, hubPath, clearSubdomainCache } from './utils/subdomain';
import type { Hub, HubUser, HubVendor, HubListing } from './types/hub';

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
// Onboarding Mode Routes (no hub selected)
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
    // Probe the local hub API so we get real info and a 'connected' status
    const localUrl = 'http://localhost:9090';
    const probe = await hubService.probeHub(localUrl).catch(() => ({ success: false as const }));
    const fallbackInfo = { name: nodeName, node_id: `local-${Date.now()}` };
    const hub = await hubService.joinHub(
      localUrl,
      probe.success ? (probe.info ?? fallbackInfo) : fallbackInfo,
      probe.success ? probe.status : undefined,
    );
    // Mark this user as hub creator so onboarding can stamp them as admin
    sessionStorage.setItem('citinet-creator-for', hub.slug);
    onHubJoined(hub);
    const connection = hubService.getHubConnection(hub.slug);
    navigateToHub(hub.slug, connection ?? { hub });
  };

  return <NodeCreationWizard onComplete={handleComplete} onBack={() => navigate('/')} />;
}

// ──────────────────────────────────────────────
// Hub Mode Routes (hub selected via subdomain or query param)
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
      navigate(hubPath('/'), { replace: true });
    }
  }, [hubSlug, navigate]);

  const handleOnboardingComplete = async (data: HubUser) => {
    if (!hubSlug) return;
    // Hub creator gets admin flag stamped automatically
    const isCreator = sessionStorage.getItem('citinet-creator-for') === hubSlug;
    if (isCreator) sessionStorage.removeItem('citinet-creator-for');
    const finalData: HubUser = isCreator ? { ...data, isAdmin: true } : data;
    // completeOnboarding already called inside registerUser/loginUser — just update context
    onOnboardingComplete(hubSlug, finalData);
    // If the user arrived here via a "copy note" intent, route to notes so NotesScreen can execute the fork
    const pendingForkRaw = sessionStorage.getItem('citinet-pending-fork');
    if (pendingForkRaw) {
      try {
        const pending = JSON.parse(pendingForkRaw) as { noteId: string; hubSlug: string };
        if (pending.hubSlug === hubSlug) {
          navigate(hubPath('/notes'));
          return;
        }
      } catch { /* ignore malformed value */ }
    }
    navigate(hubPath('/'));
  };

  // A connection with a saved username already completed profile setup once —
  // landing here again means their session expired, not a fresh signup.
  const defaultMode: 'login' | 'signup' = connection?.user?.username ? 'login' : 'signup';

  return <NodeEntryFlow onComplete={handleOnboardingComplete} locationName={hubName} hubSlug={hubSlug} hub={connection?.hub} defaultMode={defaultMode} />;
}

function HubDashboardRoute() {
  const navigate = useNavigate();
  const { currentHub, currentUser, loading } = useHub();
  const hubSlug = getSubdomain() ?? '';

  // Redirect to onboard if user hasn't completed registration for this hub
  useEffect(() => {
    if (loading) return;
    if (hubSlug && hubService.getHubConnection(hubSlug) && !hubService.isOnboarded(hubSlug)) {
      navigate('/onboard', { replace: true });
    }
  }, [loading, hubSlug, navigate]);

  const handleNavigate = (screen: string) => {
    navigate(hubPath(`/${screen}`));
  };

  const userName = currentUser?.displayName || currentUser?.username || 'Neighbor';
  const nodeName = currentHub?.name || hubSlug || 'Community Hub';

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('citinet-node-name', nodeName);
  }

  return <Dashboard userName={userName} onNavigate={handleNavigate} />;
}

function HubFeedRoute() {
  const navigate = useNavigate();
  return <Feed onBack={() => navigate(-1)} onNavigate={screen => navigate(hubPath(`/${screen}`))} />;
}

function HubNeighborsRoute() {
  const navigate = useNavigate();
  return (
    <NeighborsScreen
      onBack={() => navigate(-1)}
      onNavigate={screen => navigate(hubPath(`/${screen}`))}
      onViewProfile={userId => navigate(hubPath(`/profile/${userId}`))}
    />
  );
}

function HubProfileRoute() {
  const navigate = useNavigate();
  const params = useParams<{ userId: string }>();
  return (
    <ProfileScreen
      userId={params.userId ?? ''}
      onBack={() => navigate(-1)}
      onNavigate={screen => {
        // Account is a sibling of Profile — replace so toggling doesn't stack history
        const replace = screen === 'account';
        navigate(hubPath(`/${screen}`), { replace });
      }}
    />
  );
}

function HubFilesRoute() {
  const navigate = useNavigate();
  return <FilesScreen onBack={() => navigate(-1)} />;
}

function HubMessagesRoute() {
  const navigate = useNavigate();
  return <MessagesScreen onBack={() => navigate(-1)} onNavigate={(screen) => navigate(`/${screen}`)} />;
}

function HubNetworkRoute() {
  const navigate = useNavigate();
  return <NetworkScreen onBack={() => navigate(-1)} onNavigate={s => navigate(hubPath(`/${s}`))} />;
}

function HubModLogRoute() {
  const navigate = useNavigate();
  return <ModLogScreen onBack={() => navigate(-1)} />;
}

function HubSpacesRoute() {
  const navigate = useNavigate();
  return <SpacesScreen onBack={() => navigate(-1)} />;
}

function HubNotesRoute() {
  const navigate = useNavigate();
  const { noteId } = useParams<{ noteId?: string }>();
  return <NotesScreen onBack={() => navigate(-1)} initialNoteId={noteId} />;
}

function HubMarketplaceRoute() {
  const navigate = useNavigate();
  return (
    <MarketplaceScreen
      onBack={() => navigate(-1)}
      onNavigate={screen => navigate(hubPath(`/${screen}`))}
      onVendorClick={id => navigate(hubPath(`/vendor/${id}`))}
    />
  );
}

function HubVendorProfileRoute() {
  const navigate = useNavigate();
  const { vendorId } = useParams<{ vendorId: string }>();
  const { currentHub } = useHub();
  const slug = currentHub?.slug ?? '';

  const [data, setData] = useState<{ vendor: HubVendor; listings: HubListing[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug || !vendorId) return;
    marketplaceService.getVendor(slug, vendorId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug, vendorId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <PlaceholderScreen title="Vendor Not Found" onBack={() => navigate(-1)} />;
  }

  return (
    <VendorProfileScreen
      vendor={data.vendor}
      listings={data.listings}
      hubSlug={slug}
      onBack={() => navigate(-1)}
      onItemClick={(listingId) => {
        sessionStorage.setItem('citinet-deeplink-listing', listingId);
        navigate(hubPath('/marketplace'));
      }}
      onNavigate={screen => navigate(hubPath(`/${screen}`))}
    />
  );
}

function HubToolkitRoute() {
  const navigate = useNavigate();
  return <ToolkitScreen onBack={() => navigate(-1)} onNavigate={s => navigate(hubPath(`/${s}`))} />;
}

function HubMySubmissionsRoute() {
  const navigate = useNavigate();
  return <MySubmissionsScreen onBack={() => navigate(-1)} />;
}

function HubAtlasRoute() {
  const navigate = useNavigate();
  return <AtlasScreen onBack={() => navigate(-1)} />;
}

function HubInitiativesRoute() {
  const navigate = useNavigate();
  const { '*': initiativeId } = useParams();
  const id = initiativeId || undefined;
  return (
    <InitiativesScreen
      onBack={() => navigate(-1)}
      initialId={id}
      onOpenDetail={detailId => navigate(hubPath(`/initiatives/${detailId}`))}
      onBackToList={() => navigate(hubPath('/initiatives'), { replace: true })}
      onOpenSpace={spaceSlug => navigate(hubPath(`/spaces/${spaceSlug}`))}
    />
  );
}

function HubModerationQueueRoute() {
  const navigate = useNavigate();
  return <ModerationQueueScreen onBack={() => navigate(-1)} />;
}

function HubAccountRoute() {
  const navigate = useNavigate();
  return (
    <AccountScreen
      onBack={() => navigate(-1)}
      onNavigate={screen => {
        // Profile is a sibling of Account — replace so toggling doesn't stack history
        const replace = screen.startsWith('profile/');
        navigate(hubPath(`/${screen}`), { replace });
      }}
    />
  );
}

function HubManagementRoute() {
  const navigate = useNavigate();
  return <HubManagementScreen onBack={() => navigate(-1)} />;
}

function HubAssistantRoute() {
  const navigate = useNavigate();
  return <AssistantScreen onBack={() => navigate(-1)} />;
}

function HubDiscoverRoute() {
  const navigate = useNavigate();
  return (
    <DiscoverScreen
      onBack={() => navigate(-1)}
      onNavigate={s => navigate(hubPath(`/${s}`))}
      onViewProfile={userId => navigate(hubPath(`/profile/${userId}`))}
    />
  );
}

function HubPlaceholderRoute({ screen }: { screen: string }) {
  const navigate = useNavigate();
  return (
    <PlaceholderScreen
      title={screenTitles[screen] || 'Screen'}
      description={screenDescriptions[screen]}
      onBack={() => navigate(-1)}
    />
  );
}

// ──────────────────────────────────────────────
// Hub Guard: ensures a connection exists for this hub subdomain
// ──────────────────────────────────────────────

function HubGuard({ children }: { children: React.ReactNode }) {
  const { currentHub, currentUser, loading } = useHub();
  const hubSlug = getSubdomain();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (currentHub) {
      // Hub is known — check if the session is still valid.
      // currentUser is null after a session-expired event (401 response).
      // currentUser.authToken may also be missing when the periodic health check
      // re-populates currentUser from localStorage after the token was cleared.
      const sessionExpired = currentUser === null || !currentUser.authToken;
      if (sessionExpired && hubSlug && hubService.getHubConnection(hubSlug)) {
        navigate('/onboard', { replace: true });
      }
      return;
    }
    if (hubSlug && !hubService.getHubConnection(hubSlug)) {
      // No connection for this hub slug — clear the stale cache and return to welcome screen.
      clearSubdomainCache();
      window.location.href = window.location.origin + '/';
    }
  }, [currentHub, currentUser, loading, hubSlug, navigate]);

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
      {/* Public pages — no account required. Must be before the * catch-all. */}
      <Route path="/share/:hubSlug/:fileName" element={<ShareFilePage />} />
      <Route path="/share-note/:hubSlug/:noteId" element={<ShareNotePage />} />
      <Route path="/u/:hubSlug/:username" element={<PublicProfilePage />} />
      <Route path="/share-space/:hubSlug/:spaceSlug" element={<ShareSpacePage />} />
      <Route path="/v/:hubSlug/:vendorSlug" element={<ShareVendorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HubModeRoutes() {
  return (
    <>
    <HubBackground />
    <Routes>
      <Route path="/onboard" element={<HubGuard><HubOnboardRoute /></HubGuard>} />
      <Route path="/" element={<HubGuard><HubLayout><HubDashboardRoute /></HubLayout></HubGuard>} />
      <Route path="/feed" element={<HubGuard><HubLayout><HubFeedRoute /></HubLayout></HubGuard>} />
      <Route path="/feed/:postId" element={<HubGuard><HubLayout><HubFeedRoute /></HubLayout></HubGuard>} />
      <Route path="/neighbors" element={<HubGuard><HubLayout><HubNeighborsRoute /></HubLayout></HubGuard>} />
      <Route path="/files" element={<HubGuard><HubLayout><HubFilesRoute /></HubLayout></HubGuard>} />
      <Route path="/messages" element={<HubGuard><HubLayout><HubMessagesRoute /></HubLayout></HubGuard>} />
      <Route path="/network" element={<HubGuard><HubLayout><HubNetworkRoute /></HubLayout></HubGuard>} />
      <Route path="/marketplace" element={<HubGuard><HubLayout><HubMarketplaceRoute /></HubLayout></HubGuard>} />
      <Route path="/vendor/:vendorId" element={<HubGuard><HubLayout><HubVendorProfileRoute /></HubLayout></HubGuard>} />
      <Route path="/toolkit" element={<HubGuard><HubLayout><HubToolkitRoute /></HubLayout></HubGuard>} />
      <Route path="/toolkit/my-submissions" element={<HubGuard><HubLayout><HubMySubmissionsRoute /></HubLayout></HubGuard>} />
      <Route path="/toolkit/moderation" element={<HubGuard><HubLayout><HubModerationQueueRoute /></HubLayout></HubGuard>} />
      <Route path="/atlas" element={<HubGuard><HubLayout><HubAtlasRoute /></HubLayout></HubGuard>} />
      <Route path="/initiatives/*" element={<HubGuard><HubLayout><HubInitiativesRoute /></HubLayout></HubGuard>} />
      <Route path="/settings" element={<HubGuard><HubLayout><HubPlaceholderRoute screen="settings" /></HubLayout></HubGuard>} />
      <Route path="/post" element={<HubGuard><HubLayout><HubPlaceholderRoute screen="post" /></HubLayout></HubGuard>} />
      <Route path="/chat" element={<HubGuard><HubLayout><HubPlaceholderRoute screen="chat" /></HubLayout></HubGuard>} />
      <Route path="/signal" element={<HubGuard><HubLayout><HubPlaceholderRoute screen="signal" /></HubLayout></HubGuard>} />
      <Route path="/become-sponsor" element={<HubGuard><HubLayout><HubPlaceholderRoute screen="become-sponsor" /></HubLayout></HubGuard>} />
      <Route path="/account" element={<HubGuard><HubLayout><HubAccountRoute /></HubLayout></HubGuard>} />
      <Route path="/profile/:userId" element={<HubGuard><HubLayout><HubProfileRoute /></HubLayout></HubGuard>} />
      <Route path="/hub-management" element={<HubGuard><HubLayout><HubManagementRoute /></HubLayout></HubGuard>} />
      <Route path="/discover" element={<HubGuard><HubLayout><HubDiscoverRoute /></HubLayout></HubGuard>} />
      <Route path="/mod-log" element={<HubGuard><HubLayout><HubModLogRoute /></HubLayout></HubGuard>} />
      <Route path="/spaces" element={<HubGuard><HubLayout><HubSpacesRoute /></HubLayout></HubGuard>} />
      <Route path="/spaces/:spaceSlug" element={<HubGuard><HubLayout><HubSpacesRoute /></HubLayout></HubGuard>} />
      <Route path="/notes" element={<HubGuard><HubLayout><HubNotesRoute /></HubLayout></HubGuard>} />
      <Route path="/notes/:noteId" element={<HubGuard><HubLayout><HubNotesRoute /></HubLayout></HubGuard>} />
      <Route path="/assistant" element={<HubGuard><HubLayout><HubAssistantRoute /></HubLayout></HubGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

// ──────────────────────────────────────────────
// Hub origin auto-detection
// When the portal is bundled into the hub API and served directly
// (e.g. http://citinet:9090), probe /api/info at the current origin.
// If it responds, auto-connect to that hub so users land straight
// on the hub UI without any manual setup.
// ──────────────────────────────────────────────

function AppInner() {
  const isSharePath = window.location.pathname.startsWith('/share/') || window.location.pathname.startsWith('/share-note/') || window.location.pathname.startsWith('/share-space/') || window.location.pathname.startsWith('/v/') || window.location.pathname.startsWith('/u/');
  // /join and /create are explicit requests to reach the multi-hub portal (e.g. after
  // "Switch Hub" clears the local connection) — the same-origin auto-rejoin below must not
  // silently override that by re-joining the hub this domain happens to be served from.
  const isPortalPath = window.location.pathname === '/join' || window.location.pathname === '/create';
  const subdomain = isSharePath ? null : getSubdomain();
  const { onHubJoined } = useHub();
  const [probing, setProbing] = useState(!subdomain && !isSharePath && !isPortalPath);

  useEffect(() => {
    if (subdomain || isSharePath || isPortalPath) return;
    fetch('/api/info', { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? r.json() : null)
      .then(async info => {
        if (!info?.hub_slug) return;
        const hub = await hubService.joinHub(window.location.origin, info, undefined);
        onHubJoined(hub);
        navigateToHub(hub.slug, hubService.getHubConnection(hub.slug) ?? { hub });
      })
      .catch(() => {})
      .finally(() => setProbing(false));
  }, []);

  if (probing) return <div className="min-h-screen bg-white dark:bg-zinc-950" />;

  return (
    <div className="w-full">
      {subdomain ? <HubModeRoutes /> : <OnboardingModeRoutes />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="citinet-theme">
      <BrowserRouter>
        <HubProvider>
          <AppInner />
        </HubProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
