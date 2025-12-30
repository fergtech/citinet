import { Users, MessageCircle, Settings, Radio, Image, Store, Sparkles } from 'lucide-react';
import { ReactNode } from 'react';
import { FeaturedCarousel } from './FeaturedCarousel';

interface DashboardProps {
  userName?: string;
  onNavigate: (screen: string) => void;
}

interface DashboardCardProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function DashboardCard({ icon, label, onClick }: DashboardCardProps) {
  return (
    <button
      onClick={onClick}
      className="aspect-square bg-card rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col items-start justify-between border border-border"
    >
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <div className="text-white">{icon}</div>
      </div>
      <span className="text-card-foreground">{label}</span>
    </button>
  );
}

export function Dashboard({ userName = "User", onNavigate }: DashboardProps) {
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-card-foreground font-black mb-6 text-2xl md:text-3xl lg:text-4xl">
            Hello, {userName}!
          </h1>
        </div>

        {/* Featured Carousel - Full Width */}
        <div className="mb-6 -mx-6 px-6 md:mx-0 md:px-0">
          <div className="max-w-7xl mx-auto">
            <FeaturedCarousel />
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
          <DashboardCard
            icon={<Image className="w-5 h-5" />}
            label="Feed"
            onClick={() => onNavigate('feed')}
          />
          <DashboardCard
            icon={<MessageCircle className="w-5 h-5" />}
            label="Messages"
            onClick={() => onNavigate('messages')}
          />
          <DashboardCard
            icon={<Users className="w-5 h-5" />}
            label="Community"
            onClick={() => onNavigate('community')}
          />
          <DashboardCard
            icon={<Radio className="w-5 h-5" />}
            label="Network"
            onClick={() => onNavigate('network')}
          />
          <DashboardCard
            icon={<Store className="w-5 h-5" />}
            label="Market"
            onClick={() => onNavigate('marketplace')}
          />
          <DashboardCard
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            onClick={() => onNavigate('settings')}
          />
        </div>

          {/* Marketplace Promotion Banner */}
          <div className="bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-2xl p-6 md:p-8 text-white shadow-md">
            <div className="flex items-start gap-4 md:gap-6">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 md:w-8 md:h-8" />
              </div>
              <div className="flex-1">
                <h3 className="mb-1 text-lg md:text-xl font-bold">Promote Your Business</h3>
                <p className="text-white/90 text-sm md:text-base mb-3 md:mb-4">
                  Reach your local community. List your business in the Highland Park marketplace.
                </p>
                <button
                  onClick={() => onNavigate('become-sponsor')}
                  className="px-4 py-2 md:px-6 md:py-3 bg-white text-purple-600 rounded-xl text-sm md:text-base font-medium hover:bg-white/95 transition-colors"
                >
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md md:max-w-lg">
        <div className="bg-slate-900/90 dark:bg-white/90 backdrop-blur-md rounded-2xl shadow-lg flex items-center justify-around p-4">
          <button
            onClick={() => onNavigate('post')}
            className="flex flex-col items-center gap-1 text-white dark:text-slate-900 hover:opacity-80 transition-opacity"
          >
            <Radio className="w-5 h-5" />
            <span className="text-xs">Post</span>
          </button>
          <div className="h-8 w-px bg-white/20 dark:bg-slate-900/20" />
          <button
            onClick={() => onNavigate('chat')}
            className="flex flex-col items-center gap-1 text-white dark:text-slate-900 hover:opacity-80 transition-opacity"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs">Chat</span>
          </button>
          <div className="h-8 w-px bg-white/20 dark:bg-slate-900/20" />
          <button
            onClick={() => onNavigate('signal')}
            className="flex flex-col items-center gap-1 text-white dark:text-slate-900 hover:opacity-80 transition-opacity"
          >
            <Radio className="w-5 h-5" />
            <span className="text-xs">Signal</span>
          </button>
        </div>
      </div>
    </div>
  );
}