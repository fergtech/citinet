import { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeft, Search, Plus, ExternalLink, Filter, X, Shield, Check } from 'lucide-react';
import { toolkitService } from '../services/toolkitService';
import { Tool, ToolTag } from '../types/toolkit';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { AddToolModal } from './AddToolModal';
import { useHub } from '../context/HubContext';

interface ToolkitScreenProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

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
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
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
          <Badge key={tag} variant="outline" className="text-xs capitalize">
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

function CategorySection({ category, tools }: { category: string; tools: Tool[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{category}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>(() => toolkitService.getCategories());
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const newCatInputRef = useRef<HTMLInputElement>(null);
  const { currentUser, currentHub } = useHub();
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  const allTools = useMemo(() => toolkitService.getAllTools(), []);

  // Focus the new-category input when it appears
  useEffect(() => {
    if (addingCategory) newCatInputRef.current?.focus();
  }, [addingCategory]);

  const handleCreateCategory = () => {
    const trimmed = newCatName.trim();
    if (trimmed) {
      toolkitService.addCategory(trimmed);
      setCategories(toolkitService.getCategories());
    }
    setAddingCategory(false);
    setNewCatName('');
  };

  // Search + tag filtered tools
  const filteredTools = useMemo(() => {
    let tools = allTools;
    if (searchQuery.trim()) tools = toolkitService.searchTools(searchQuery);
    if (selectedTags.length > 0) tools = tools.filter((t) => selectedTags.some((tag) => t.tags.includes(tag)));
    return tools;
  }, [allTools, searchQuery, selectedTags]);

  // Count per category (from filtered pool, for sidebar badges)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
    filteredTools.forEach((t) => t.categories.forEach((c) => { if (c in counts) counts[c]++; }));
    return counts;
  }, [filteredTools, categories]);

  // Tools to actually render (category-filtered on top of search/tag filters)
  const toolsByCategory = useMemo(() => {
    const grouped: Record<string, Tool[]> = Object.fromEntries(categories.map((c) => [c, []]));
    const pool = selectedCategory === 'all'
      ? filteredTools
      : filteredTools.filter((t) => t.categories.includes(selectedCategory));
    pool.forEach((t) => t.categories.forEach((c) => { if (c in grouped) grouped[c].push(t); }));
    return grouped;
  }, [filteredTools, selectedCategory, categories]);

  const visibleCategories = selectedCategory === 'all'
    ? categories.filter((c) => toolsByCategory[c]?.length > 0)
    : (toolsByCategory[selectedCategory]?.length > 0 ? [selectedCategory] : []);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedTags.length > 0;
  const totalVisible = visibleCategories.reduce((n, c) => n + toolsByCategory[c].length, 0);

  const toggleTag = (tag: ToolTag) =>
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const clearFilters = () => { setSearchQuery(''); setSelectedTags([]); };

  const handleCategorySelect = (cat: string | 'all') => {
    setSelectedCategory(cat);
    // Close tag filter panel when switching categories
    setShowFilters(false);
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shrink-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-900 dark:text-white" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">Discover</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">People-first tools you can trust</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => setShowAddToolModal(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Tool</span>
              </Button>
            </div>
          </div>

          {/* Search + tag filter toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={selectedTags.length > 0 ? 'border-purple-600 text-purple-600' : ''}
            >
              <Filter className="w-4 h-4" />
              {selectedTags.length > 0 && <span>{selectedTags.length}</span>}
            </Button>
          </div>

          {/* Tag filter panel */}
          {showFilters && (
            <div className="mt-3 p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Filter by tag</span>
                {selectedTags.length > 0 && (
                  <button onClick={() => setSelectedTags([])} className="text-xs text-purple-600 hover:text-purple-700">
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-purple-600 text-white'
                        : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:border-purple-400'
                    }`}
                  >
                    {tag.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active filter summary */}
          {hasActiveFilters && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {totalVisible} result{totalVisible !== 1 ? 's' : ''}
              </span>
              <button onClick={clearFilters} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1">
                <X className="w-3 h-3" />
                Clear
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile: horizontal category chips */}
      <div className="md:hidden bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shrink-0 overflow-x-auto">
        <div className="flex gap-2 px-4 py-2 w-max">
          {/* Nav actions */}
          <button
            onClick={() => onNavigate('toolkit/my-submissions')}
            className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            My Submissions
          </button>
          {isAdmin && (
            <button
              onClick={() => onNavigate('toolkit/moderation')}
              className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" />
              Review Queue
            </button>
          )}
          {/* Divider */}
          <div className="w-px bg-slate-200 dark:bg-zinc-700 self-stretch my-1 mx-1" />
          <button
            onClick={() => handleCategorySelect('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
          >
            All
            <span className={`ml-1.5 text-xs ${selectedCategory === 'all' ? 'text-purple-200' : 'text-slate-400 dark:text-slate-500'}`}>
              {filteredTools.length}
            </span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategorySelect(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {cat}
              {categoryCounts[cat] > 0 && (
                <span className={`ml-1.5 text-xs ${selectedCategory === cat ? 'text-purple-200' : 'text-slate-400 dark:text-slate-500'}`}>
                  {categoryCounts[cat]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto py-3 px-2">
          {/* My Submissions + Review Queue links on mobile-hidden header become sidebar items */}
          <div className="px-2 mb-4 space-y-1">
            <button
              onClick={() => onNavigate('toolkit/my-submissions')}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              My Submissions
            </button>
            {isAdmin && (
              <button
                onClick={() => onNavigate('toolkit/moderation')}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2"
              >
                <Shield className="w-3.5 h-3.5" />
                Review Queue
              </button>
            )}
          </div>

          <div className="px-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
              Categories
            </span>
          </div>

          {/* All */}
          <button
            onClick={() => handleCategorySelect('all')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
              selectedCategory === 'all'
                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <span>All</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal ${
              selectedCategory === 'all'
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
            }`}>
              {filteredTools.length}
            </span>
          </button>

          {/* Category list */}
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategorySelect(cat)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                selectedCategory === cat
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="truncate text-left">{cat}</span>
              {categoryCounts[cat] > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ml-1 font-normal ${
                  selectedCategory === cat
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {categoryCounts[cat]}
                </span>
              )}
            </button>
          ))}

          {/* Admin: create new category */}
          {isAdmin && (
            <div className="px-2 mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              {addingCategory ? (
                <div className="flex gap-1">
                  <input
                    ref={newCatInputRef}
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateCategory();
                      if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(''); }
                    }}
                    placeholder="Category name"
                    className="flex-1 h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-0"
                  />
                  <button
                    onClick={handleCreateCategory}
                    className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition-colors shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setAddingCategory(false); setNewCatName(''); }}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-400 dark:text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Category
                </button>
              )}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-6">
            {visibleCategories.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-500 dark:text-slate-400 mb-4">
                  {hasActiveFilters ? 'No tools match your filters' : 'No tools in this category yet'}
                </p>
                {hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
                ) : (
                  <Button onClick={() => setShowAddToolModal(true)}>
                    <Plus className="w-4 h-4" />
                    Add the first tool
                  </Button>
                )}
              </div>
            ) : (
              visibleCategories.map((cat) => (
                <CategorySection key={cat} category={cat} tools={toolsByCategory[cat]} />
              ))
            )}
          </div>
        </main>
      </div>

      {showAddToolModal && (
        <AddToolModal
          onClose={() => setShowAddToolModal(false)}
          onSuccess={() => {
            setShowAddToolModal(false);
            onNavigate('toolkit/my-submissions');
          }}
        />
      )}
    </div>
  );
}
