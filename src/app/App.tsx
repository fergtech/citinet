import { useState } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Dashboard } from './components/Dashboard';
import { Feed } from './components/Feed';
import { PlaceholderScreen } from './components/PlaceholderScreen';

type Screen = 'welcome' | 'dashboard' | 'feed' | 'messages' | 'community' | 'network' | 'marketplace' | 'settings' | 'post' | 'chat' | 'signal' | 'become-sponsor';

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

  const handleGetStarted = () => {
    setCurrentScreen('dashboard');
  };

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen);
  };

  const handleBack = () => {
    setCurrentScreen('dashboard');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
      case 'dashboard':
        return <Dashboard userName="Alex" onNavigate={handleNavigate} />;
      case 'feed':
        return <Feed onBack={handleBack} />;
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
