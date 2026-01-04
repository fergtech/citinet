import {
  Users, MessageCircle, Settings, Radio, Store,
  Calendar, AlertCircle, Lightbulb, Activity, MapPin, Clock
} from 'lucide-react';
import { ReactNode } from 'react';
import { FeaturedCarousel } from './FeaturedCarousel';

interface DashboardProps {
  userName?: string;
  onNavigate: (screen: string) => void;
}

interface NavigationCardProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function NavigationCard({ icon, label, onClick }: NavigationCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] p-4 flex items-center gap-3 border border-slate-200 dark:border-zinc-700"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
        <div className="text-white">{icon}</div>
      </div>
      <span className="text-sm font-bold text-slate-900 dark:text-white">{label}</span>
    </button>
  );
}

export function Dashboard({ userName = "Neighbor", onNavigate }: DashboardProps) {
  // Mock data for civic features
  const nodeStatus = {
    activeMembers: 47,
    onlineNow: 12,
    signalStrength: 'Strong'
  };

  const recentDiscussions = [
    {
      id: 1,
      type: 'Discussion',
      title: 'Proposed bike lane on Main Street',
      author: 'Sarah K.',
      timestamp: '2 hours ago',
      replies: 8
    },
    {
      id: 2,
      type: 'Announcement',
      title: 'Community meeting this Thursday at 7 PM',
      author: 'Highland Park Civic Association',
      timestamp: '5 hours ago',
      replies: 3
    },
    {
      id: 3,
      type: 'Request',
      title: 'Looking for volunteers for park cleanup',
      author: 'Maria G.',
      timestamp: '1 day ago',
      replies: 12
    }
  ];

  const upcomingEvents = [
    {
      id: 1,
      title: 'Town Hall: Infrastructure Planning',
      date: 'Thursday, Jan 9',
      time: '7:00 PM',
      location: 'Community Center'
    },
    {
      id: 2,
      title: 'Weekend Farmers Market',
      date: 'Saturday, Jan 11',
      time: '9:00 AM',
      location: 'Central Square'
    }
  ];

  const activeInitiatives = [
    {
      id: 1,
      title: 'Community Garden Expansion',
      participants: 23,
      status: 'In Progress'
    },
    {
      id: 2,
      title: 'Local Tool Library',
      participants: 15,
      status: 'Planning'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex relative">
      {/* Subtle mesh grid background pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08] pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dashboard-mesh" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-600 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dashboard-mesh)"/>
        </svg>
      </div>

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-72 lg:w-80 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-r border-slate-200/50 dark:border-zinc-800/50 sticky top-0 h-screen overflow-y-auto shrink-0 relative z-10">
        {/* User Identity */}
        <div className="p-6 border-b border-slate-200/50 dark:border-zinc-800/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{userName}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Highland Park</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Connected to local node</span>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <button
              onClick={() => onNavigate('feed')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <MessageCircle className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Discussions</span>
            </button>

            <button
              onClick={() => onNavigate('community')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Users className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Community</span>
            </button>

            <button
              onClick={() => onNavigate('marketplace')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Store className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Local Exchange</span>
            </button>

            <button
              onClick={() => onNavigate('network')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <Radio className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Network</span>
            </button>

            <button
              onClick={() => onNavigate('messages')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <MessageCircle className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Messages</span>
            </button>
          </div>

          {/* Node Status Mini Card - Wireframe Mesh Design */}
          <div className="mt-6 relative overflow-hidden bg-slate-950 dark:bg-black rounded-2xl p-5 border border-slate-800 dark:border-zinc-800 group">
            {/* Animated mesh grid background */}
            <div className="absolute inset-0 opacity-20">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="mesh-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="0.5" opacity="0.3"/>
                  </pattern>
                  <linearGradient id="mesh-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgb(139, 92, 246)" stopOpacity="0.1"/>
                    <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.1"/>
                  </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#mesh-grid)"/>
                <rect width="100%" height="100%" fill="url(#mesh-gradient)"/>
              </svg>
            </div>

            {/* 3D wireframe nodes */}
            <div className="absolute top-3 right-3 w-16 h-16 opacity-40 group-hover:opacity-60 transition-opacity">
              <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                {/* Connected node dots */}
                <circle cx="32" cy="12" r="2.5" fill="rgb(168, 85, 247)" className="animate-pulse"/>
                <circle cx="16" cy="32" r="2.5" fill="rgb(59, 130, 246)"/>
                <circle cx="48" cy="32" r="2.5" fill="rgb(139, 92, 246)"/>
                <circle cx="32" cy="52" r="2.5" fill="rgb(59, 130, 246)" className="animate-pulse" style={{animationDelay: '0.5s'}}/>
                {/* Connection lines */}
                <line x1="32" y1="12" x2="16" y2="32" stroke="rgb(139, 92, 246)" strokeWidth="1" opacity="0.5"/>
                <line x1="32" y1="12" x2="48" y2="32" stroke="rgb(139, 92, 246)" strokeWidth="1" opacity="0.5"/>
                <line x1="16" y1="32" x2="32" y2="52" stroke="rgb(139, 92, 246)" strokeWidth="1" opacity="0.5"/>
                <line x1="48" y1="32" x2="32" y2="52" stroke="rgb(139, 92, 246)" strokeWidth="1" opacity="0.5"/>
              </svg>
            </div>
            
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ring-2 ring-green-400/20"/>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Node Status</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-end justify-between group/stat hover:translate-x-0.5 transition-transform">
                  <div>
                    <div className="text-sm text-slate-500 mb-0.5 font-light">Members</div>
                    <div className="text-3xl font-bold text-white tracking-tight tabular-nums">{nodeStatus.activeMembers}</div>
                  </div>
                  <div className="h-8 w-12 mb-1">
                    <svg viewBox="0 0 48 32" className="w-full h-full opacity-30 group-hover/stat:opacity-50 transition-opacity">
                      <polyline points="0,24 8,20 16,22 24,12 32,16 40,8 48,10" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="2"/>
                    </svg>
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"/>

                <div className="flex items-end justify-between group/stat hover:translate-x-0.5 transition-transform">
                  <div>
                    <div className="text-sm text-slate-500 mb-0.5 font-light">Online</div>
                    <div className="text-3xl font-bold text-white tracking-tight tabular-nums">{nodeStatus.onlineNow}</div>
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="w-1 h-4 bg-purple-500/30 rounded-full"/>
                    <div className="w-1 h-6 bg-purple-500/50 rounded-full"/>
                    <div className="w-1 h-3 bg-purple-500/40 rounded-full"/>
                    <div className="w-1 h-5 bg-purple-500/60 rounded-full"/>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom accent line */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"/>
          </div>
        </nav>

        {/* Settings at Bottom */}
        <div className="p-4 border-t border-slate-200/50 dark:border-zinc-800/50">
          <button
            onClick={() => onNavigate('settings')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors text-left group"
          >
            <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 pb-24 overflow-x-hidden relative z-10">
        {/* Mobile Header - Only shown on mobile */}
        <div className="md:hidden bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-slate-900 dark:text-white font-semibold text-2xl mb-1 tracking-tight">
                  {userName}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
                  Highland Park Local Commons
                </p>
              </div>
              <button
                onClick={() => onNavigate('settings')}
                className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Header - Simpler, no user name since it's in sidebar */}
        <div className="hidden md:block bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
          <div className="px-8 py-5">
            <h1 className="text-slate-900 dark:text-white font-semibold text-2xl tracking-tight">
              Highland Park Local Commons
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
              What's happening in your neighborhood
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8 overflow-x-hidden">
          {/* Node Status - Mobile Only (Desktop has it in sidebar) */}
          <div className="md:hidden relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-500 to-blue-500 rounded-2xl p-4 shadow-xl text-white max-w-full">
            {/* Subtle texture overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
            
            <div className="relative flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-medium text-white/90">Network Active</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Node Status</h2>
              </div>
              <Activity className="w-8 h-8 text-white/80" />
            </div>

            <div className="relative grid grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-4">
                <div className="text-3xl font-semibold mb-1">{nodeStatus.activeMembers}</div>
                <div className="text-xs text-white/80 font-light">Active Members</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-4">
                <div className="text-3xl font-semibold mb-1">{nodeStatus.onlineNow}</div>
                <div className="text-xs text-white/80 font-light">Online Now</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-4">
                <div className="text-base font-semibold mb-1">{nodeStatus.signalStrength}</div>
                <div className="text-xs text-white/80 font-light">Signal</div>
              </div>
            </div>
          </div>
          {/* Featured Content - Curated by Admins/Mods */}
          <div className="max-w-full overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Featured</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-light">Curated by community moderators</span>
            </div>
            <FeaturedCarousel />
          </div>
          {/* Recent Local Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Recent Activity</h2>
            <button
              onClick={() => onNavigate('feed')}
              className="text-sm font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {recentDiscussions.map(discussion => (
              <div
                key={discussion.id}
                className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wide bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-500/20">
                        {discussion.type}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{discussion.timestamp}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1">{discussion.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                      <span>{discussion.author}</span>
                      <span>•</span>
                      <span>{discussion.replies} replies</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two Column Grid for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Upcoming Events</h2>
              <button
                onClick={() => onNavigate('community')}
                className="text-sm font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              >
                Calendar
              </button>
            </div>

            <div className="space-y-3">
              {upcomingEvents.map(event => (
                <div
                  key={event.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer"
                >
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1 truncate">{event.title}</h3>
                      <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span>{event.date} • {event.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />
                          <span>{event.location}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Initiatives */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 tracking-tight">Community Initiatives</h2>

            <div className="space-y-3">
              {activeInitiatives.map(initiative => (
                <div
                  key={initiative.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                        <Lightbulb className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{initiative.title}</h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 dark:text-slate-400">
                          <Users className="w-3 h-3" />
                          <span>{initiative.participants} participants</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      {initiative.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Cards - Only shown on mobile */}
        <div className="md:hidden pt-8 border-t border-slate-200 dark:border-zinc-800">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-700 dark:text-slate-400 mb-1">Navigate</h2>
            <p className="text-xs text-slate-500 dark:text-slate-500">Access network tools and features</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NavigationCard
              icon={<MessageCircle className="w-5 h-5" />}
              label="Discussions"
              onClick={() => onNavigate('feed')}
            />
            <NavigationCard
              icon={<Users className="w-5 h-5" />}
              label="Community"
              onClick={() => onNavigate('community')}
            />
            <NavigationCard
              icon={<Store className="w-5 h-5" />}
              label="Local Exchange"
              onClick={() => onNavigate('marketplace')}
            />
            <NavigationCard
              icon={<Radio className="w-5 h-5" />}
              label="Network"
              onClick={() => onNavigate('network')}
            />
            <NavigationCard
              icon={<MessageCircle className="w-5 h-5" />}
              label="Messages"
              onClick={() => onNavigate('messages')}
            />
          </div>
        </div>

        {/* Civic Action Bar - Mobile Only */}
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-20">
          <div className="bg-slate-900/95 dark:bg-zinc-800/95 backdrop-blur-lg rounded-2xl shadow-2xl flex items-center justify-around p-4 border border-slate-700/50">
            <button
              onClick={() => onNavigate('post')}
              className="flex flex-col items-center gap-1 text-white hover:text-purple-400 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-xs font-medium">Discuss</span>
            </button>
            <div className="h-8 w-px bg-slate-700" />
            <button
              onClick={() => onNavigate('chat')}
              className="flex flex-col items-center gap-1 text-white hover:text-purple-400 transition-colors"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs font-medium">Report</span>
            </button>
            <div className="h-8 w-px bg-slate-700" />
            <button
              onClick={() => onNavigate('signal')}
              className="flex flex-col items-center gap-1 text-white hover:text-red-400 transition-colors"
            >
              <Radio className="w-5 h-5" />
              <span className="text-xs font-medium">Signal</span>
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
