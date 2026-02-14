import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NodeDiscoveryScreen } from './components/NodeDiscoveryScreen';
import { NodeCreationWizard } from './components/NodeCreationWizard';
import { NodeEntryFlow, UserNodeData } from './components/NodeEntryFlow';
import { Dashboard } from './components/Dashboard';
import { Feed } from './components/Feed';
import { NetworkScreen } from './components/NetworkScreen';
import { MarketplaceScreen } from './components/MarketplaceScreen';
import { PlaceholderScreen } from './components/PlaceholderScreen';
import { VendorProfileScreen, mockVendors } from './components/VendorProfileScreen';
import { marketItems } from './data/marketplaceData';
import { MessagesScreen } from './components/MessagesScreen';
import { ToolkitScreen } from './components/ToolkitScreen';
import { MySubmissionsScreen } from './components/MySubmissionsScreen';
import { ModerationQueueScreen } from './components/ModerationQueueScreen';

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

// Helper to get and set user data in localStorage
const getUserData = (): UserNodeData | null => {
  const data = localStorage.getItem('citinet-user-data');
  return data ? JSON.parse(data) : null;
};

const setUserData = (data: UserNodeData) => {
  localStorage.setItem('citinet-user-data', JSON.stringify(data));
};

// Helper to get and set selected node in localStorage
const getSelectedNode = (): { nodeId: string; nodeName: string } | null => {
  const data = localStorage.getItem('citinet-selected-node');
  return data ? JSON.parse(data) : null;
};

const setSelectedNode = (nodeId: string, nodeName: string) => {
  localStorage.setItem('citinet-selected-node', JSON.stringify({ nodeId, nodeName }));
};

function WelcomeRoute() {
  const navigate = useNavigate();
  
  const handleJoinNetwork = () => {
    navigate('/discover-node');
  };

  const handleCreateNetwork = () => {
    navigate('/create-node');
  };

  return <WelcomeScreen onJoinNetwork={handleJoinNetwork} onCreateNetwork={handleCreateNetwork} />;
}

function NodeDiscoveryRoute() {
  const navigate = useNavigate();
  
  const handleNodeFound = (nodeId: string, nodeName: string) => {
    setSelectedNode(nodeId, nodeName);
    navigate('/node-entry');
  };

  const handleBack = () => {
    navigate('/');
  };

  return <NodeDiscoveryScreen onNodeFound={handleNodeFound} onBack={handleBack} />;
}

function NodeCreationRoute() {
  const navigate = useNavigate();
  
  const handleComplete = (nodeId: string, nodeName: string) => {
    setSelectedNode(nodeId, nodeName);
    navigate('/node-entry');
  };

  const handleBack = () => {
    navigate('/');
  };

  return <NodeCreationWizard onComplete={handleComplete} onBack={handleBack} />;
}

function NodeEntryRoute() {
  const navigate = useNavigate();
  const selectedNode = getSelectedNode();
  const locationName = selectedNode?.nodeName || 'Highland Park';

  const handleNodeEntryComplete = (data: UserNodeData) => {
    setUserData(data);
    navigate('/dashboard');
  };

  return <NodeEntryFlow onComplete={handleNodeEntryComplete} locationName={locationName} />;
}

function DashboardRoute() {
  const navigate = useNavigate();
  const userData = getUserData();
  const selectedNode = getSelectedNode();

  const handleNavigate = (screen: string) => {
    navigate(`/${screen}`);
  };

  // Store node name in a way Dashboard can access it
  const nodeName = selectedNode?.nodeName || 'Highland Park';
  // Save to sessionStorage for Dashboard to access
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('citinet-node-name', nodeName);
  }

  return <Dashboard userName={userData?.displayName || 'Neighbor'} onNavigate={handleNavigate} />;
}

function FeedRoute() {
  const navigate = useNavigate();
  return <Feed onBack={() => navigate('/dashboard')} />;
}

function MessagesRoute() {
  const navigate = useNavigate();
  return <MessagesScreen onBack={() => navigate('/dashboard')} />;
}

function NetworkRoute() {
  const navigate = useNavigate();
  
  const handleNavigate = (screen: string) => {
    navigate(`/${screen}`);
  };

  return <NetworkScreen onBack={() => navigate('/dashboard')} onNavigate={handleNavigate} />;
}

function MarketplaceRoute() {
  const navigate = useNavigate();
  
  const handleVendorClick = (vendorId: string) => {
    navigate(`/vendor/${vendorId}`);
  };

  return <MarketplaceScreen onBack={() => navigate('/dashboard')} onVendorClick={handleVendorClick} />;
}

function VendorProfileRoute() {
  const navigate = useNavigate();
  const { vendorId } = useParams<{ vendorId: string }>();
  
  const vendor = mockVendors.find(v => v.id === vendorId);
  
  if (!vendor) {
    return <PlaceholderScreen title="Vendor Not Found" onBack={() => navigate('/marketplace')} />;
  }
  
  // Get all marketplace items for this vendor
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
    // Navigate back to marketplace with selected item
    navigate('/marketplace');
  };

  return (
    <VendorProfileScreen
      vendor={vendor}
      vendorListings={vendorListings}
      onBack={() => navigate('/marketplace')}
      onItemClick={handleItemClick}
    />
  );
}

function ToolkitRoute() {
  const navigate = useNavigate();
  
  const handleNavigate = (screen: string) => {
    navigate(`/${screen}`);
  };

  return <ToolkitScreen onBack={() => navigate('/dashboard')} onNavigate={handleNavigate} />;
}

function MySubmissionsRoute() {
  const navigate = useNavigate();
  
  return <MySubmissionsScreen onBack={() => navigate('/toolkit')} />;
}

function ModerationQueueRoute() {
  const navigate = useNavigate();
  
  return <ModerationQueueScreen onBack={() => navigate('/toolkit')} />;
}

function PlaceholderRoute({ screen }: { screen: string }) {
  const navigate = useNavigate();
  
  return (
    <PlaceholderScreen
      title={screenTitles[screen] || 'Screen'}
      description={screenDescriptions[screen]}
      onBack={() => navigate('/dashboard')}
    />
  );
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
      <div className="w-full">
        <Routes>
          <Route path="/" element={<WelcomeRoute />} />
          <Route path="/discover-node" element={<NodeDiscoveryRoute />} />
          <Route path="/create-node" element={<NodeCreationRoute />} />
          <Route path="/node-entry" element={<NodeEntryRoute />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/feed" element={<FeedRoute />} />
          <Route path="/messages" element={<MessagesRoute />} />
          <Route path="/network" element={<NetworkRoute />} />
          <Route path="/marketplace" element={<MarketplaceRoute />} />
          <Route path="/vendor/:vendorId" element={<VendorProfileRoute />} />
          <Route path="/toolkit" element={<ToolkitRoute />} />
          <Route path="/toolkit/my-submissions" element={<MySubmissionsRoute />} />
          <Route path="/toolkit/moderation" element={<ModerationQueueRoute />} />
          
          {/* Placeholder routes */}
          <Route path="/community" element={<PlaceholderRoute screen="community" />} />
          <Route path="/settings" element={<PlaceholderRoute screen="settings" />} />
          <Route path="/post" element={<PlaceholderRoute screen="post" />} />
          <Route path="/chat" element={<PlaceholderRoute screen="chat" />} />
          <Route path="/signal" element={<PlaceholderRoute screen="signal" />} />
          <Route path="/become-sponsor" element={<PlaceholderRoute screen="become-sponsor" />} />
          
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
