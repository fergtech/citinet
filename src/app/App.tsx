import { useState, useEffect } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NodeEntryFlow, UserNodeData } from './components/NodeEntryFlow';
import { Dashboard } from './components/Dashboard';
import { Feed } from './components/Feed';
import { NetworkScreen } from './components/NetworkScreen';
import { MarketplaceScreen } from './components/MarketplaceScreen';
import { PlaceholderScreen } from './components/PlaceholderScreen';
import { VendorProfileScreen, mockVendors } from './components/VendorProfileScreen';
import { marketItems } from './data/marketplaceData';
import { MessagesScreen } from './components/MessagesScreen';

type Screen = 'welcome' | 'nodeEntry' | 'dashboard' | 'feed' | 'messages' | 'community' | 'network' | 'marketplace' | 'vendor-profile' | 'settings' | 'post' | 'chat' | 'signal' | 'become-sponsor';

const screenTitles: Record<string, string> = {
  messages: 'Messages',
  community: 'Community',
  network: 'Network',
  marketplace: 'Marketplace',
  settings: 'Settings',
  post: 'Create Post',
  chat: 'Chat',
  signal: 'Signal',
  'become-sponsor': 'Become a Sponsor'
};

const screenDescriptions: Record<string, string> = {
  messages: 'Connect with your neighbors and local community members.',
  community: 'Join discussions and participate in community forums.',
  network: 'View network status and manage your mesh node.',
  marketplace: 'Discover local businesses and services in Highland Park.',
  settings: 'Manage your account and app preferences.',
  post: 'Share updates with your local community.',
  chat: 'Real-time messaging with community members.',
  signal: 'Broadcast urgent messages to nearby nodes.',
  'become-sponsor': 'Promote your business to the local mesh community.'
};


export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [userData, setUserData] = useState<UserNodeData | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const locationName = 'Highland Park';

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

  const handleGetStarted = () => {
    setCurrentScreen('nodeEntry');
  };

  const handleNodeEntryComplete = (data: UserNodeData) => {
    setUserData(data);
    setCurrentScreen('dashboard');
  };

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen);
  };

  const handleBack = () => {
    setCurrentScreen('dashboard');
  };

  const handleVendorClick = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setCurrentScreen('vendor-profile');
  };

  const handleItemClickFromVendor = (_itemId: string) => {
    // Navigate back to marketplace with selected item
    // For now, just go back to marketplace
    setCurrentScreen('marketplace');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
      case 'nodeEntry':
        return <NodeEntryFlow onComplete={handleNodeEntryComplete} locationName={locationName} />;
      case 'dashboard':
        return <Dashboard userName={userData?.displayName || 'Neighbor'} onNavigate={handleNavigate} />;
      case 'feed':
        return <Feed onBack={handleBack} />;
      case 'messages':
        return <MessagesScreen onBack={handleBack} />;
      case 'network':
        return <NetworkScreen onBack={handleBack} onNavigate={handleNavigate} />;
      case 'marketplace':
        return <MarketplaceScreen onBack={handleBack} onVendorClick={handleVendorClick} />;
      case 'vendor-profile': {
        const vendor = mockVendors.find(v => v.id === selectedVendorId);
        if (!vendor) return <PlaceholderScreen title="Vendor Not Found" onBack={handleBack} />;
        
        // Get all marketplace items for this vendor
        const vendorListings = marketItems
          .filter(item => item.vendorId === selectedVendorId)
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
            onBack={() => setCurrentScreen('marketplace')}
            onItemClick={handleItemClickFromVendor}
          />
        );
      }
      default:
        return (
          <PlaceholderScreen
            title={screenTitles[currentScreen] || 'Screen'}
            description={screenDescriptions[currentScreen]}
            onBack={handleBack}
          />
        );
    }
  };

  return (
    <div className="w-full">
      {renderScreen()}
    </div>
  );
}
