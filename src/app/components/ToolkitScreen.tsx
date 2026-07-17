import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, Search, Plus, ExternalLink, Filter, X, Shield, Check, Package, FileText } from 'lucide-react';
import { toolkitService } from '../services/toolkitService';
import { Tool, ToolTag } from '../types/toolkit';
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
    <div className="cn-glass rounded-2xl p-4 flex flex-col gap-3 transition-all hover:border-purple-400/40 dark:hover:border-purple-500/40">
      <div className="flex items-start gap-3">
        {tool.icon ? (
          <img src={tool.icon} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
        ) : (
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-base shrink-0">
            {tool.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold cn-text-1 truncate">{tool.name}</h3>
          <p className="text-xs cn-text-3 leading-relaxed line-clamp-2 mt-0.5">{tool.shortDescription}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {tool.tags.slice(0, 2).map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/8 cn-text-2 capitalize">
              {tag.replace(/-/g, ' ')}
            </span>
          ))}
          {tool.tags.length > 2 && <span className="text-[10px] cn-text-4 self-center">+{tool.tags.length - 2}</span>}
        </div>
        <a
          href={tool.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold shrink-0 transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Get
        </a>
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

  // Count per category (from filtered pool, for chip badges)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
    filteredTools.forEach((t) => t.categories.forEach((c) => { if (c in counts) counts[c]++; }));
    return counts;
  }, [filteredTools, categories]);

  // Flat, category-filtered result set for the grid
  const visibleTools = selectedCategory === 'all'
    ? filteredTools
    : filteredTools.filter((t) => t.categories.includes(selectedCategory));

  const hasActiveFilters = searchQuery.trim() !== '' || selectedTags.length > 0;

  const toggleTag = (tag: ToolTag) =>
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const clearFilters = () => { setSearchQuery(''); setSelectedTags([]); };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-7 items-start">

          {/* ── Left: header + search + filters + grid ── */}
          <div className="flex flex-col gap-5 min-w-0">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors self-start"
            >
              <ChevronLeft className="w-3.5 h-3.5" />{currentHub?.name ?? 'Hub'}
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shrink-0">
                <Package className="w-6 h-6 text-white" />
              </span>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight cn-text-1 leading-none">Resources</h1>
                <p className="text-sm cn-text-3 mt-0.5">Open-source & privacy-respecting tools, curated by residents</p>
              </div>
              <button
                onClick={() => setShowAddToolModal(true)}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Tool
              </button>
            </div>
            <button
              onClick={() => setShowAddToolModal(true)}
              className="sm:hidden w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Tool
            </button>

            {/* Utility links — always visible, not just on desktop */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('toolkit/my-submissions')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cn-text-2 hover:bg-black/5 dark:hover:bg-white/5 border cn-border transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                My Submissions
              </button>
              {isAdmin && (
                <button
                  onClick={() => onNavigate('toolkit/moderation')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-amber-300 dark:border-amber-700/60 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Review Queue
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools, tags…"
                className="w-full pl-9 pr-4 py-2.5 cn-surface border cn-border rounded-xl text-sm cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Category chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  selectedCategory === 'all'
                    ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30'
                    : 'bg-black/5 dark:bg-white/5 cn-text-3 border-transparent hover:border-black/10 dark:hover:border-white/10'
                }`}
              >
                All <span className="cn-mono">{filteredTools.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                    selectedCategory === cat
                      ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30'
                      : 'bg-black/5 dark:bg-white/5 cn-text-3 border-transparent hover:border-black/10 dark:hover:border-white/10'
                  }`}
                >
                  {cat}
                  {categoryCounts[cat] > 0 && <span className="cn-mono"> {categoryCounts[cat]}</span>}
                </button>
              ))}
              {isAdmin && !addingCategory && (
                <button
                  onClick={() => setAddingCategory(true)}
                  className="flex-none inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold cn-text-4 hover:text-purple-500 dark:hover:text-purple-400 border border-dashed cn-border transition-colors"
                >
                  <Plus className="w-3 h-3" /> New Category
                </button>
              )}
            </div>

            {addingCategory && (
              <div className="flex gap-1.5 -mt-2">
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
                  className="flex-1 h-9 px-3 text-xs cn-surface border cn-border rounded-lg cn-text-1 focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-0"
                />
                <button
                  onClick={handleCreateCategory}
                  className="w-9 h-9 rounded-lg bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition-colors shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setAddingCategory(false); setNewCatName(''); }}
                  className="w-9 h-9 rounded-lg border cn-border flex items-center justify-center cn-text-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Tag filter toggle + panel */}
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    selectedTags.length > 0
                      ? 'border-purple-400 dark:border-purple-500 text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20'
                      : 'cn-border cn-text-3 hover:border-black/15 dark:hover:border-white/15'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter by tag
                  {selectedTags.length > 0 && <span className="cn-mono">{selectedTags.length}</span>}
                </button>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-purple-500 dark:text-purple-400 hover:underline">
                    <X className="w-3 h-3" /> Clear filters
                  </button>
                )}
              </div>
              {showFilters && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {AVAILABLE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors border ${
                        selectedTags.includes(tag)
                          ? 'bg-purple-600 border-transparent text-white'
                          : 'cn-surface cn-border cn-text-2 hover:border-black/15 dark:hover:border-white/15'
                      }`}
                    >
                      {tag.replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid */}
            {visibleTools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
                  <Package className="w-8 h-8 cn-text-4" />
                </div>
                <p className="text-sm cn-text-2 mb-3">
                  {hasActiveFilters || selectedCategory !== 'all' ? 'No tools match your filters' : 'No tools in this category yet'}
                </p>
                {hasActiveFilters ? (
                  <button onClick={clearFilters} className="text-sm font-semibold text-purple-500 dark:text-purple-400 hover:underline">
                    Clear filters
                  </button>
                ) : (
                  <button
                    onClick={() => setShowAddToolModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add the first tool
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
              </div>
            )}
          </div>

          {/* ── Right rail ── */}
          <div className="hidden lg:flex flex-col gap-4 sticky top-7">
            <div className="rounded-2xl p-4 border cn-border cn-surface">
              <span className="text-[10px] font-bold uppercase tracking-wide cn-text-3">Library</span>
              <div className="flex items-center gap-6 mt-3">
                <div>
                  <div className="font-mono text-2xl font-bold cn-text-1">{allTools.length}</div>
                  <div className="text-[11px] cn-text-4">Tools</div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-bold text-emerald-500 dark:text-emerald-400">{categories.length}</div>
                  <div className="text-[11px] cn-text-4">Categories</div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
