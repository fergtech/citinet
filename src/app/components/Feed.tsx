import { useState } from 'react';
import { PostCard } from './PostCard';
import { PostDetailModal } from './PostDetailModal';
import { ArrowLeft, Clock } from 'lucide-react';

interface FeedProps {
  onBack: () => void;
}

const postTypes = ['All', 'Discussion', 'Announcement', 'Project', 'Request'];

const mockDiscussions = [
  {
    id: '1',
    variant: 'text' as const,
    category: 'DISCUSSION',
    title: 'Proposed bike lane on Main Street - Input needed',
    author: 'Sarah K.',
    timestamp: '2 hours ago',
    content: 'The city is considering adding a protected bike lane on Main Street between 1st and 8th Ave. What are your thoughts on this proposal? How would it affect local businesses and residents?'
  },
  {
    id: '2',
    variant: 'image' as const,
    category: 'ANNOUNCEMENT',
    title: 'Community Town Hall - Thursday 7 PM',
    author: 'Highland Park Civic Association',
    timestamp: '5 hours ago',
    content: 'Join us for a discussion on local infrastructure planning, park improvements, and neighborhood priorities for 2026.',
    mediaUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=450&fit=crop'
  },
  {
    id: '3',
    variant: 'text' as const,
    category: 'REQUEST',
    title: 'Volunteers needed for community garden cleanup',
    author: 'Maria G.',
    timestamp: '1 day ago',
    content: 'We need 10-15 volunteers this Saturday morning to prepare the community garden for spring planting. Tools and refreshments provided. All skill levels welcome.'
  },
  {
    id: '4',
    variant: 'image' as const,
    category: 'PROJECT',
    title: 'Community Tool Library - Planning Phase',
    author: 'James T.',
    timestamp: '1 day ago',
    content: 'Interested in creating a shared tool library for Highland Park? Join our planning committee to discuss location, governance, and initial inventory.',
    mediaUrl: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=800&h=450&fit=crop'
  },
  {
    id: '5',
    variant: 'text' as const,
    category: 'DISCUSSION',
    title: 'Traffic concerns near Highland Elementary',
    author: 'Jennifer M.',
    timestamp: '2 days ago',
    content: 'Parents and neighbors: let\'s discuss the speeding issues on Oak Street during school hours. What solutions should we propose to the traffic committee?'
  },
  {
    id: '6',
    variant: 'text' as const,
    category: 'ANNOUNCEMENT',
    title: 'Local Farmers Market returns this Saturday',
    author: 'Highland Park Business District',
    timestamp: '2 days ago',
    content: 'Weekly farmers market begins January 11th at Central Square. 15+ local vendors confirmed. Every Saturday 9 AM - 2 PM through October.'
  },
  {
    id: '7',
    variant: 'image' as const,
    category: 'PROJECT',
    title: 'Community Garden Expansion - Help shape the plan',
    author: 'Green Highland Coalition',
    timestamp: '3 days ago',
    content: 'We have funding to expand the community garden by 40%. Come to our design workshop this Wednesday to help plan the new plots, paths, and common areas.',
    mediaUrl: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&h=450&fit=crop'
  },
  {
    id: '8',
    variant: 'text' as const,
    category: 'REQUEST',
    title: 'Seeking mentors for youth tech program',
    author: 'Highland Park Youth Center',
    timestamp: '3 days ago',
    content: 'Do you have skills in coding, robotics, or digital media? Our spring youth program needs volunteer mentors. 2 hours per week, ages 12-17. Training provided.'
  }
];

export function Feed({ onBack }: FeedProps) {
  const [activeType, setActiveType] = useState('All');
  const [selectedPost, setSelectedPost] = useState<typeof mockDiscussions[0] | null>(null);

  const filteredDiscussions = activeType === 'All'
    ? mockDiscussions
    : mockDiscussions.filter(post => post.category === activeType.toUpperCase());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-purple-50/20 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 pb-6">
      {/* Header */}
      <div className="sticky top-0 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 z-10">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              title="Back"
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <div className="flex-1">
              <h2 className="text-slate-900 dark:text-white font-semibold text-xl tracking-tight">Community Discussions</h2>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                <p className="text-xs text-slate-600 dark:text-slate-400 font-light">
                  Chronological order • Most recent first
                </p>
              </div>
            </div>
          </div>

          {/* Post Type Filters */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {postTypes.map((type) => (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-all duration-300 text-sm font-medium ${
                  activeType === type
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chronological Notice */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-blue-200/50 dark:border-blue-700/50 mb-6">
          <p className="text-sm text-slate-700 dark:text-slate-300 font-light">
            <strong className="font-semibold">No algorithms here.</strong> All discussions appear in the order they were posted.
            Nothing is hidden, ranked, or optimized for engagement.
          </p>
        </div>
      </div>

      {/* Discussion Cards */}
      <div className="px-4 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDiscussions.map((post) => (
            <div key={post.id} onClick={() => setSelectedPost(post)} className="cursor-pointer">
              <PostCard {...post} />
            </div>
          ))}
        </div>

        {filteredDiscussions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400 font-light">
              No {activeType.toLowerCase()} posts yet. Be the first to contribute!
            </p>
          </div>
        )}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          isOpen={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          {...selectedPost}
        />
      )}
    </div>
  );
}
