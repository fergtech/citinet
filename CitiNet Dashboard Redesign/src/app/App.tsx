import { TopMenuBar } from './components/TopMenuBar';
import { AppLauncherCard } from './components/AppLauncherCard';
import { FeaturedCarousel } from './components/FeaturedCarousel';
import { ActivityCard } from './components/ActivityCard';
import { EventCard } from './components/EventCard';
import { InitiativeCard } from './components/InitiativeCard';
import {
  MessageSquare,
  Map,
  Store,
  Users,
  FileText,
  Calendar,
  Lightbulb,
  Settings,
  Bell,
  TrendingUp,
} from 'lucide-react';

export default function App() {
  const apps = [
    {
      id: 'discussions',
      title: 'Discussions',
      icon: MessageSquare,
      gradient: 'from-blue-600 to-blue-700',
      notificationCount: 3,
    },
    {
      id: 'atlas',
      title: 'Atlas',
      icon: Map,
      gradient: 'from-cyan-600 to-cyan-700',
    },
    {
      id: 'exchange',
      title: 'Exchange',
      icon: Store,
      gradient: 'from-emerald-600 to-emerald-700',
      notificationCount: 1,
    },
    {
      id: 'neighbors',
      title: 'Neighbors',
      icon: Users,
      gradient: 'from-violet-600 to-violet-700',
    },
    {
      id: 'resources',
      title: 'Resources',
      icon: FileText,
      gradient: 'from-amber-600 to-amber-700',
    },
    {
      id: 'events',
      title: 'Events',
      icon: Calendar,
      gradient: 'from-purple-600 to-purple-700',
      notificationCount: 2,
    },
    {
      id: 'initiatives',
      title: 'Initiatives',
      icon: Lightbulb,
      gradient: 'from-rose-600 to-rose-700',
    },
    {
      id: 'insights',
      title: 'Insights',
      icon: TrendingUp,
      gradient: 'from-indigo-600 to-indigo-700',
    },
    {
      id: 'notifications',
      title: 'Alerts',
      icon: Bell,
      gradient: 'from-pink-600 to-pink-700',
      notificationCount: 5,
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: Settings,
      gradient: 'from-slate-600 to-slate-700',
    },
  ];

  const featuredItems = [
    {
      id: '1',
      image: 'https://images.unsplash.com/photo-1768776179834-93e6cafc6d97?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBnYXRoZXJpbmclMjBvdXRkb29yJTIwZXZlbnR8ZW58MXx8fHwxNzc0ODc2MDA1fDA&ixlib=rb-4.1.0&q=80&w=1080',
      title: 'Community Festival Planning Underway',
      excerpt: 'Join us for our annual summer festival! We need volunteers for setup, activities, and coordination. This year promises to be the biggest yet.',
      author: {
        name: 'Sarah Mitchell',
        avatar: 'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbCUyMHdvbWFufGVufDF8fHx8MTc3NDg2Mjg0MHww&ixlib=rb-4.1.0&q=80&w=1080',
      },
    },
    {
      id: '2',
      image: 'https://images.unsplash.com/photo-1770982698865-10713fa6f73b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1cmJhbiUyMGdhcmRlbiUyMHN1c3RhaW5hYmxlJTIwZmFybWluZ3xlbnwxfHx8fDE3NzQ4NzYwMDZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
      title: 'Urban Garden Initiative Expands to Three New Locations',
      excerpt: 'Our community garden project is growing! Learn how you can get involved in sustainable urban farming and contribute to local food security.',
      author: {
        name: 'Marcus Chen',
        avatar: 'https://images.unsplash.com/photo-1605298046196-e205d0d699d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbCUyMG1hbnxlbnwxfHx8fDE3NzQ4NzYwMDd8MA&ixlib=rb-4.1.0&q=80&w=1080',
      },
    },
    {
      id: '3',
      image: 'https://images.unsplash.com/photo-1561136594-7f68413baa99?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsb2NhbCUyMG1hcmtldCUyMGZhcm1lcnMlMjBwcm9kdWNlfGVufDF8fHx8MTc3NDg3NjAwNnww&ixlib=rb-4.1.0&q=80&w=1080',
      title: 'Local Exchange Market Opens This Saturday',
      excerpt: 'Discover local artisans, farmers, and creators at our weekly exchange market. Support local businesses and connect with your neighbors.',
      author: {
        name: 'Emma Rodriguez',
        avatar: 'https://images.unsplash.com/photo-1624553945681-2fcf703ed2f4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMGRpdmVyc2UlMjBwZW9wbGV8ZW58MXx8fHwxNzc0ODc2MDA3fDA&ixlib=rb-4.1.0&q=80&w=1080',
      },
    },
  ];

  const recentActivity = [
    {
      id: '1',
      avatar: 'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbCUyMHdvbWFufGVufDF8fHx8MTc3NDg2Mjg0MHww&ixlib=rb-4.1.0&q=80&w=1080',
      name: 'Sarah Mitchell',
      action: 'added a post',
      title: 'Looking for recommendations on local plumbers',
      category: 'Discussions',
      time: '2h ago',
      accentColor: '#3b82f6',
    },
    {
      id: '2',
      avatar: 'https://images.unsplash.com/photo-1605298046196-e205d0d699d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbCUyMG1hbnxlbnwxfHx8fDE3NzQ4NzYwMDd8MA&ixlib=rb-4.1.0&q=80&w=1080',
      name: 'Marcus Chen',
      action: 'shared a file',
      title: 'Community Garden Planning Documents.pdf',
      category: 'Resources',
      time: '3h ago',
      accentColor: '#f59e0b',
    },
    {
      id: '3',
      avatar: 'https://images.unsplash.com/photo-1624553945681-2fcf703ed2f4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMGRpdmVyc2UlMjBwZW9wbGV8ZW58MXx8fHwxNzc0ODc2MDA3fDA&ixlib=rb-4.1.0&q=80&w=1080',
      name: 'Emma Rodriguez',
      action: 'listed an item',
      title: 'Vintage bicycle for sale - excellent condition',
      category: 'Exchange',
      time: '5h ago',
      accentColor: '#059669',
    },
    {
      id: '4',
      avatar: 'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbCUyMHdvbWFufGVufDF8fHx8MTc3NDg2Mjg0MHww&ixlib=rb-4.1.0&q=80&w=1080',
      name: 'David Park',
      action: 'joined',
      title: 'Welcome to the community!',
      category: 'Neighbors',
      time: '1d ago',
      accentColor: '#7c3aed',
    },
  ];

  const upcomingEvents = [
    {
      id: '1',
      title: 'Town Hall: Infrastructure Planning',
      date: 'Thu, Jan 9',
      time: '7:00 PM',
      location: 'Community Center',
      color: '#9333ea',
    },
    {
      id: '2',
      title: 'Weekend Farmers Market',
      date: 'Sat, Jan 11',
      time: '8:00 AM',
      location: 'Main Street Plaza',
      color: '#059669',
    },
    {
      id: '3',
      title: 'Neighborhood Cleanup Day',
      date: 'Sun, Jan 12',
      time: '9:00 AM',
      location: 'Park Entrance',
      color: '#06b6d4',
    },
  ];

  const initiatives = [
    {
      id: '1',
      title: 'Community Garden Initiative',
      memberCount: 12,
      memberAvatars: [
        'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?w=100',
        'https://images.unsplash.com/photo-1605298046196-e205d0d699d7?w=100',
        'https://images.unsplash.com/photo-1624553945681-2fcf703ed2f4?w=100',
      ],
      progress: 65,
      status: 'In Progress' as const,
      color: '#059669',
    },
    {
      id: '2',
      title: 'Free Tool Library Setup',
      memberCount: 8,
      memberAvatars: [
        'https://images.unsplash.com/photo-1624553945681-2fcf703ed2f4?w=100',
        'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?w=100',
      ],
      progress: 30,
      status: 'Planning' as const,
      color: '#f59e0b',
    },
    {
      id: '3',
      title: 'Youth Mentorship Program',
      memberCount: 15,
      memberAvatars: [
        'https://images.unsplash.com/photo-1605298046196-e205d0d699d7?w=100',
        'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?w=100',
        'https://images.unsplash.com/photo-1624553945681-2fcf703ed2f4?w=100',
      ],
      progress: 85,
      status: 'In Progress' as const,
      color: '#9333ea',
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Top Menu Bar */}
      <TopMenuBar
        hubName="Citinet"
        onlineCount={247}
        tunnelUrl="Citinet.local"
      />

      {/* Main Content */}
      <div className="pt-9">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-8">
          {/* Section: App Launcher Grid */}
          <section className="mb-12">
            <h2
              className="text-xl font-bold mb-6"
              style={{ color: 'var(--foreground)' }}
            >
              Apps
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {apps.map((app) => (
                <AppLauncherCard
                  key={app.id}
                  icon={app.icon}
                  title={app.title}
                  gradient={app.gradient}
                  notificationCount={app.notificationCount}
                />
              ))}
            </div>
          </section>

          {/* Section: Featured Carousel */}
          <section className="mb-12">
            <h2
              className="text-xl font-bold mb-6"
              style={{ color: 'var(--foreground)' }}
            >
              Featured
            </h2>
            <FeaturedCarousel items={featuredItems} />
          </section>

          {/* Two Column Layout: Activity & Events/Initiatives */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Recent Activity */}
            <div className="lg:col-span-2">
              <h2
                className="text-xl font-bold mb-6"
                style={{ color: 'var(--foreground)' }}
              >
                Recent Activity
              </h2>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <ActivityCard key={activity.id} {...activity} />
                ))}
              </div>
            </div>

            {/* Right Column: Events & Initiatives */}
            <div className="space-y-8">
              {/* Upcoming Events */}
              <div>
                <h2
                  className="text-xl font-bold mb-6"
                  style={{ color: 'var(--foreground)' }}
                >
                  Upcoming Events
                </h2>
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <EventCard key={event.id} {...event} />
                  ))}
                </div>
              </div>

              {/* Community Initiatives */}
              <div>
                <h2
                  className="text-xl font-bold mb-6"
                  style={{ color: 'var(--foreground)' }}
                >
                  Community Initiatives
                </h2>
                <div className="space-y-3">
                  {initiatives.map((initiative) => (
                    <InitiativeCard key={initiative.id} {...initiative} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

