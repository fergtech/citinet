import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Bug, CircleHelp, Lightbulb, MessageSquareWarning, X } from 'lucide-react';
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
import { PollsScreen } from './components/PollsScreen';
import { ModLogScreen } from './components/ModLogScreen';
import { SpacesScreen } from './components/SpacesScreen';
import { NotesScreen } from './components/NotesScreen';
import { ShareFilePage } from './components/ShareFilePage';
import { ShareNotePage } from './components/ShareNotePage';
import { ShareSpacePage } from './components/ShareSpacePage';
import { ShareVendorPage } from './components/ShareVendorPage';
import { HubBackground } from './components/HubBackground';
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
    navigate(hubPath('/'));
  };

  return <NodeEntryFlow onComplete={handleOnboardingComplete} locationName={hubName} hubSlug={hubSlug} />;
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
    navigate(hubPath(`/${screen}`));
  };

  const handleLogout = () => {
    const slug = currentHub?.slug || hubSlug;
    if (slug) leaveHub(slug);
    clearSubdomainCache(); // ensure hub slug is always cleared regardless of leaveHub result
    window.location.href = window.location.origin + '/';
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
  return <Feed onBack={() => navigate(-1)} />;
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
  return <MessagesScreen onBack={() => navigate(-1)} />;
}

function HubNetworkRoute() {
  const navigate = useNavigate();
  return <NetworkScreen onBack={() => navigate(-1)} onNavigate={s => navigate(hubPath(`/${s}`))} />;
}

function HubPollsRoute() {
  const navigate = useNavigate();
  return <PollsScreen onBack={() => navigate(-1)} />;
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
      onItemClick={() => navigate(-1)}
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
      // Hub is known — check if the session is still valid (auth token present).
      // currentUser is cleared by HubContext on session-expired events (401 responses).
      if (currentUser === null && hubSlug && hubService.getHubConnection(hubSlug)) {
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

function HubFloatingSupportLauncher() {
  const location = useLocation();
  const { currentHub } = useHub();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileBottomOffset, setMobileBottomOffset] = useState(0);
  const dragState = useRef({ active: false, startY: 0, startOffset: 0, moved: false });
  const suppressClickRef = useRef(false);

  const path = location.pathname || '/';
  const hideLauncher = path === '/' || path === '/onboard';
  const nodeName = currentHub?.name || getSubdomain() || 'Community Hub';

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 768);
    updateMobile();
    window.addEventListener('resize', updateMobile);
    return () => window.removeEventListener('resize', updateMobile);
  }, []);

  if (hideLauncher) return null;

  const getFeatureContext = () => {
    const firstSegment = path.toLowerCase().split('/').filter(Boolean)[0] ?? '';
    const labelMap: Record<string, string> = {
      feed: 'Discussions',
      discover: 'Discover',
      atlas: 'Atlas',
      marketplace: 'Exchange',
      neighbors: 'Neighbors',
      files: 'Files',
      initiatives: 'Initiatives',
      toolkit: 'Resources',
      network: 'Network',
      messages: 'Messages',
      account: 'Account',
      profile: 'Profile',
      settings: 'Settings',
      'hub-management': 'Hub Management',
      vendor: 'Vendor Profile',
      chat: 'Chat',
      signal: 'Signal',
      post: 'Create Post',
    };

    const featureName = labelMap[firstSegment] ?? (firstSegment ? `${firstSegment.charAt(0).toUpperCase()}${firstSegment.slice(1)}` : 'Dashboard');
    return { featureName };
  };

  const buildSupportUrl = (kind: 'help' | 'bug' | 'feature') => {
    const { featureName } = getFeatureContext();
    const params = new URLSearchParams();
    const contextText = [
      `Feature/Screen: ${featureName}`,
      `Route: ${path}`,
      `Hub: ${nodeName}`,
    ].join('\n');

    if (kind === 'help') {
      params.set('template', 'help.yml');
      params.set('title', `[Help] ${featureName}: `);
      params.set('question-summary', `Need help with ${featureName}`);
      params.set('additional-info', contextText);
    }

    if (kind === 'bug') {
      params.set('template', 'bug_report.yml');
      params.set('title', `[Bug] ${featureName}: `);
      params.set('what-happened', `Issue encountered in ${featureName}.`);
      params.set('steps-to-reproduce', `1. Open ${featureName}\n2. ...\n3. Observe issue`);
      params.set('additional-info', contextText);
    }

    if (kind === 'feature') {
      params.set('template', 'feature_request.yml');
      params.set('title', `[Feature] ${featureName}: `);
      params.set('feature-summary', `Enhance ${featureName}`);
      params.set('use-case', `While using ${featureName}, it would help if ...`);
      params.set('additional-info', contextText);
    }

    return `https://github.com/fergtech/citinet/issues/new?${params.toString()}`;
  };

  const openSupport = (kind: 'help' | 'bug' | 'feature') => {
    window.open(buildSupportUrl(kind), '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const clampOffset = (value: number) => {
    const maxOffset = Math.max(0, window.innerHeight - 180);
    return Math.max(0, Math.min(maxOffset, value));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobile || open) return;
    dragState.current.active = true;
    dragState.current.startY = e.clientY;
    dragState.current.startOffset = mobileBottomOffset;
    dragState.current.moved = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current.active || !isMobile || open) return;
    const deltaY = dragState.current.startY - e.clientY;
    if (Math.abs(deltaY) > 4) dragState.current.moved = true;
    setMobileBottomOffset(clampOffset(dragState.current.startOffset + deltaY));
  };

  const handlePointerEnd = () => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    if (dragState.current.moved) suppressClickRef.current = true;
  };

  return (
    <>
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          aria-label="Close support menu"
        />
      )}

      <div
        className="fixed left-4 md:left-6 md:bottom-6 z-50"
        style={{ bottom: isMobile ? `${16 + mobileBottomOffset}px` : undefined }}
      >
        {open && (
          <div className="mb-3 w-72 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Support</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Context will include this screen automatically</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-2 space-y-1">
              <button
                onClick={() => openSupport('help')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <CircleHelp className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Get Help</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Troubleshooting and support</p>
                </div>
              </button>

              <button
                onClick={() => openSupport('bug')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <Bug className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Report a Bug</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Report an issue on this feature</p>
                </div>
              </button>

              <button
                onClick={() => openSupport('feature')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Request a Feature</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Suggest an enhancement for this screen</p>
                </div>
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            setOpen(v => !v);
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center"
          aria-expanded={open}
          aria-label="Open support options"
          title="Support"
          style={{ touchAction: isMobile ? 'none' : 'auto' }}
        >
          <MessageSquareWarning className="w-4 h-4" />
        </button>
      </div>
    </>
  );
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
      <Route path="/atlas" element={<HubGuard><HubAtlasRoute /></HubGuard>} />
      <Route path="/initiatives/*" element={<HubGuard><HubInitiativesRoute /></HubGuard>} />
      <Route path="/settings" element={<HubGuard><HubPlaceholderRoute screen="settings" /></HubGuard>} />
      <Route path="/post" element={<HubGuard><HubPlaceholderRoute screen="post" /></HubGuard>} />
      <Route path="/chat" element={<HubGuard><HubPlaceholderRoute screen="chat" /></HubGuard>} />
      <Route path="/signal" element={<HubGuard><HubPlaceholderRoute screen="signal" /></HubGuard>} />
      <Route path="/become-sponsor" element={<HubGuard><HubPlaceholderRoute screen="become-sponsor" /></HubGuard>} />
      <Route path="/account" element={<HubGuard><HubAccountRoute /></HubGuard>} />
      <Route path="/profile/:userId" element={<HubGuard><HubProfileRoute /></HubGuard>} />
      <Route path="/hub-management" element={<HubGuard><HubManagementRoute /></HubGuard>} />
      <Route path="/discover" element={<HubGuard><HubDiscoverRoute /></HubGuard>} />
      <Route path="/polls" element={<HubGuard><HubPollsRoute /></HubGuard>} />
      <Route path="/mod-log" element={<HubGuard><HubModLogRoute /></HubGuard>} />
      <Route path="/spaces" element={<HubGuard><HubSpacesRoute /></HubGuard>} />
      <Route path="/spaces/:spaceSlug" element={<HubGuard><HubSpacesRoute /></HubGuard>} />
      <Route path="/notes" element={<HubGuard><HubNotesRoute /></HubGuard>} />
      <Route path="/notes/:noteId" element={<HubGuard><HubNotesRoute /></HubGuard>} />
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
  const isSharePath = window.location.pathname.startsWith('/share/') || window.location.pathname.startsWith('/share-note/') || window.location.pathname.startsWith('/share-space/') || window.location.pathname.startsWith('/v/');
  const subdomain = isSharePath ? null : getSubdomain();
  const { onHubJoined } = useHub();
  const [probing, setProbing] = useState(!subdomain && !isSharePath);

  useEffect(() => {
    if (subdomain || isSharePath) return;
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
      {subdomain ? <HubFloatingSupportLauncher /> : null}
    </div>
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

  return (
    <BrowserRouter>
      <HubProvider>
        <AppInner />
      </HubProvider>
    </BrowserRouter>
  );
}
