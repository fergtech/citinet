import { useState } from 'react';
import { PostCard } from './PostCard';
import { ArrowLeft } from 'lucide-react';

interface FeedProps {
  onBack: () => void;
}

const categories = ['All', 'Events', 'News', 'Community', 'Updates'];

const mockPosts = [
  {
    id: '1',
    variant: 'image' as const,
    category: 'EVENT',
    title: 'Community Meetup This Weekend',
    author: 'Sarah Chen',
    timestamp: '2h ago',
    content: 'Join us for a local mesh network workshop and community gathering.',
    mediaUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=450&fit=crop'
  },
  {
    id: '2',
    variant: 'video' as const,
    category: 'NEWS',
    title: 'Network Expansion Update',
    author: 'Mike Rodriguez',
    timestamp: '5h ago',
    content: 'Our mesh network now covers 50% more area! Watch the update video.',
    mediaUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=450&fit=crop'
  },
  {
    id: '3',
    variant: 'text' as const,
    category: 'COMMUNITY',
    title: 'Tips for Better Signal Strength',
    author: 'Alex Kim',
    timestamp: '1d ago',
    content: 'Here are some practical tips to improve your node\'s signal strength and connectivity. Position your antenna higher, avoid obstacles, and consider using a directional antenna for long-range connections.'
  },
  {
    id: '4',
    variant: 'image' as const,
    category: 'EVENT',
    title: 'Monthly Node Operators Meeting',
    author: 'Jamie Patel',
    timestamp: '2d ago',
    content: 'Discussion about network upgrades and new features coming soon.',
    mediaUrl: 'https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=800&h=450&fit=crop'
  }
];

export function Feed({ onBack }: FeedProps) {
  const [activeCategory, setActiveCategory] = useState('All');

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border z-10 p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h2 className="text-card-foreground">Feed</h2>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                activeCategory === category
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-card border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Feed Cards */}
      <div className="p-4 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockPosts.map((post) => (
            <PostCard key={post.id} {...post} />
          ))}
        </div>
      </div>
    </div>
  );
}
