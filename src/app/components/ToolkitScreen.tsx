import { useState, useMemo } from 'react';
import { ArrowLeft, Search, Plus, ExternalLink, Filter, X } from 'lucide-react';
import { toolkitService } from '../services/toolkitService';
import { Tool, ToolCategory, ToolTag } from '../types/toolkit';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { AddToolModal } from './AddToolModal';

interface ToolkitScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

const CATEGORIES: ToolCategory[] = [
  'Web Browsing',
  'Search',
  'Messaging',
  'Storage',
  'Productivity',
  'Creative Tools',
  'Developer Tools',
  'Open Hardware',
];

const AVAILABLE_TAGS: ToolTag[] = [
  'open-source',
  'privacy-focused',
  'decentralized',
  'encrypted',
  'community-owned',
  'self-hostable',
  'cross-platform',
  'mobile',
  'desktop',
  'web',
  'peer-to-peer',
];

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition-all">
      <div className="flex items-start gap-3 mb-3">
        {tool.icon ? (
          <img src={tool.icon} alt="" className="w-12 h-12 rounded-lg" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
            {tool.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 dark:text-white mb-1 truncate">
            {tool.name}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
            {tool.shortDescription}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {tool.tags.slice(0, 3).map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="text-xs capitalize"
          >
            {tag.replace(/-/g, ' ')}
          </Badge>
        ))}
        {tool.tags.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{tool.tags.length - 3}
          </Badge>
        )}
      </div>

      <Button
        size="sm"
        className="w-full"
        onClick={() => window.open(tool.websiteUrl, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink className="w-4 h-4" />
        Get
      </Button>
    </div>
  );
}

function CategorySection({ category, tools }: { category: ToolCategory; tools: Tool[] }) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{category}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}

export function ToolkitScreen({ onBack, onNavigate }: ToolkitScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<ToolTag[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddToolModal, setShowAddToolModal] = useState(false);

  // Get all tools
  const allTools = useMemo(() => toolkitService.getAllTools(), []);

  // Filter and search logic
  const filteredTools = useMemo(() => {
    let tools = allTools;

    // Apply search filter
    if (searchQuery.trim()) {
      tools = toolkitService.searchTools(searchQuery);
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      tools = tools.filter((tool) =>
        selectedTags.some((tag) => tool.tags.includes(tag))
      );
    }

    return tools;
  }, [allTools, searchQuery, selectedTags]);

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped: Record<ToolCategory, Tool[]> = {
      'Web Browsing': [],
      'Search': [],
      'Messaging': [],
      'Storage': [],
      'Productivity': [],
      'Creative Tools': [],
      'Developer Tools': [],
      'Open Hardware': [],
    };

    filteredTools.forEach((tool) => {
      tool.categories.forEach((category) => {
        grouped[category].push(tool);
      });
    });

    return grouped;
  }, [filteredTools]);

  const toggleTag = (tag: ToolTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
  };

  const hasActiveFilters = searchQuery.trim() !== '' || selectedTags.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-900 dark:text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Discover</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                People-first tools you can trust
              </p>
            </div>
            <Button onClick={() => setShowAddToolModal(true)}>
              <Plus className="w-4 h-4" />
              Add Tool
            </Button>
          </div>

          {/* Search and filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={selectedTags.length > 0 ? 'border-purple-600 text-purple-600' : ''}
            >
              <Filter className="w-4 h-4" />
              {selectedTags.length > 0 && `(${selectedTags.length})`}
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate('toolkit/my-submissions')}
            >
              My Submissions
            </Button>
          </div>

          {/* Tag filters */}
          {showFilters && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-zinc-900/50 rounded-lg border border-slate-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Filter by tags
                </span>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-purple-600 text-white'
                        : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:border-purple-600'
                    }`}
                  >
                    {tag.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active filters indicator */}
          {hasActiveFilters && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''} found
              </span>
              <button
                onClick={clearFilters}
                className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear filters
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {filteredTools.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {hasActiveFilters ? 'No tools found matching your filters' : 'No tools available'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
            {!hasActiveFilters && (
              <Button onClick={() => setShowAddToolModal(true)}>
                <Plus className="w-4 h-4" />
                Add the first tool
              </Button>
            )}
          </div>
        ) : (
          <>
            {CATEGORIES.map((category) => (
              <CategorySection
                key={category}
                category={category}
                tools={toolsByCategory[category]}
              />
            ))}
          </>
        )}
      </main>

      {/* Add Tool Modal */}
      {showAddToolModal && (
        <AddToolModal
          onClose={() => setShowAddToolModal(false)}
          onSuccess={() => {
            setShowAddToolModal(false);
            // Optionally navigate to My Submissions
            onNavigate('toolkit/my-submissions');
          }}
        />
      )}
    </div>
  );
}
