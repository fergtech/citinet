import { useState, useMemo } from 'react';
import { CheckCircle2, AlertCircle, ArrowRight, Globe, Type, LayoutGrid, FileText, Tags, MessageSquare, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toolkitService } from '../services/toolkitService';
import { ToolCategory, ToolTag } from '../types/toolkit';
import {
  Dialog,
  DialogContent,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';

interface AddToolModalProps {
  onClose: () => void;
  onSuccess: () => void;
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

const TOTAL_STEPS = 5;

const STEP_META = [
  { label: 'Identity', icon: Type },
  { label: 'Categories', icon: LayoutGrid },
  { label: 'Description', icon: FileText },
  { label: 'Tags', icon: Tags },
  { label: 'Recommend', icon: MessageSquare },
];

/** Extract domain from a URL string, returns null if invalid */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:' || urlObj.protocol === 'http:') {
      return urlObj.hostname;
    }
    return null;
  } catch {
    return null;
  }
}

/** Get a favicon URL via Google's public favicon service */
function getFaviconUrl(domain: string, size: number = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function AddToolModal({ onClose, onSuccess }: AddToolModalProps) {
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    websiteUrl: '',
    shortDescription: '',
    rationale: '',
  });
  const [selectedCategories, setSelectedCategories] = useState<ToolCategory[]>([]);
  const [selectedTags, setSelectedTags] = useState<ToolTag[]>([]);
  const [error, setError] = useState('');
  const [faviconError, setFaviconError] = useState(false);

  // Derive domain and favicon URL from the current websiteUrl
  const domain = useMemo(() => extractDomain(formData.websiteUrl), [formData.websiteUrl]);
  const faviconUrl = useMemo(() => (domain ? getFaviconUrl(domain) : null), [domain]);

  // Reset favicon error state when URL changes
  const handleUrlChange = (url: string) => {
    setFormData({ ...formData, websiteUrl: url });
    setFaviconError(false);
  };

  const hasFavicon = !!faviconUrl && !faviconError;

  const validateUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:' || urlObj.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const validateStep = (): boolean => {
    setError('');
    switch (step) {
      case 1:
        if (!formData.name.trim()) {
          setError('Tool name is required');
          return false;
        }
        if (!formData.websiteUrl.trim()) {
          setError('Website URL is required');
          return false;
        }
        if (!validateUrl(formData.websiteUrl)) {
          setError('Please enter a valid URL (http:// or https://)');
          return false;
        }
        return true;
      case 2:
        if (selectedCategories.length === 0) {
          setError('Select at least one category');
          return false;
        }
        return true;
      case 3:
        if (!formData.shortDescription.trim()) {
          setError('Description is required');
          return false;
        }
        if (formData.shortDescription.length < 20) {
          setError('Description must be at least 20 characters');
          return false;
        }
        if (formData.shortDescription.length > 300) {
          setError('Description must be under 300 characters');
          return false;
        }
        return true;
      case 4:
        if (selectedTags.length === 0) {
          setError('Select at least one tag');
          return false;
        }
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;

    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      setError('');
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError('');
    } else {
      onClose();
    }
  };

  const handleSubmit = () => {
    const userData = localStorage.getItem('citinet-user-data');
    const user = userData ? JSON.parse(userData) : null;
    const userId = user?.displayName || 'anonymous';
    const userName = user?.displayName || 'Anonymous User';

    try {
      toolkitService.submitTool({
        name: formData.name.trim(),
        websiteUrl: formData.websiteUrl.trim(),
        categories: selectedCategories,
        shortDescription: formData.shortDescription.trim(),
        tags: selectedTags,
        rationale: formData.rationale.trim() || undefined,
        submittedBy: userId,
        submittedByName: userName,
      });

      setPhase('success');
    } catch {
      setError('Failed to submit tool. Please try again.');
    }
  };

  const toggleCategory = (category: ToolCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleTag = (tag: ToolTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  if (phase === 'success') {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Submission Received!
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Thanks for recommending a tool! Community moderators will review your submission
              before it appears publicly in Discover.
            </p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Button onClick={onSuccess} className="flex-1">
                View My Submissions
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const StepIcon = STEP_META[step - 1].icon;

  const stepTitles = [
    "What's the tool?",
    'What kind of tool is it?',
    'Describe it briefly',
    'What makes it special?',
    'Anything else?',
  ];

  const stepSubtitles = [
    'Give us the name and where to find it.',
    'Pick all the categories that fit.',
    'A sentence or two so people get the idea.',
    'Select the tags that apply.',
    'Optional — tell us why you recommend it.',
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Progress bar */}
        <div className="px-6 pt-10 pb-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Step {step} of {TOTAL_STEPS}
            </span>
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              {Math.round((step / TOTAL_STEPS) * 100)}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-1.5">
            <motion.div
              className="bg-gradient-to-r from-blue-600 to-purple-600 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Step header */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center gap-3 mb-1">
            {/* Step icon — swaps to favicon when available */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${
              hasFavicon
                ? 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700'
                : 'bg-gradient-to-br from-blue-600 to-purple-600'
            }`}>
              {hasFavicon ? (
                <img
                  src={faviconUrl!}
                  alt=""
                  className="w-7 h-7 object-contain"
                  onError={() => setFaviconError(true)}
                />
              ) : (
                <StepIcon className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                {stepTitles[step - 1]}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {stepSubtitles[step - 1]}
              </p>
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-4 min-h-[200px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step 1: Name + URL */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Tool Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Signal, Nextcloud, LibreOffice"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="websiteUrl">
                      <Globe className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                      Website URL
                    </Label>
                    <Input
                      id="websiteUrl"
                      type="url"
                      value={formData.websiteUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>

                  {/* Link preview card — appears when a valid URL is entered */}
                  {domain && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden"
                    >
                      {/* Top color accent bar */}
                      <div className="h-1 bg-gradient-to-r from-blue-600 to-purple-600" />
                      <div className="p-3 flex items-center gap-3">
                        {/* Favicon */}
                        <div className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {hasFavicon ? (
                            <img
                              src={faviconUrl!}
                              alt=""
                              className="w-7 h-7 object-contain"
                              onError={() => setFaviconError(true)}
                            />
                          ) : (
                            <Globe className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        {/* URL info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {formData.name || domain}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            {domain}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Step 2: Categories */}
              {step === 2 && (
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={`p-3 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                        selectedCategories.includes(category)
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                          : 'border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                    >
                      {selectedCategories.includes(category) && (
                        <CheckCircle2 className="w-4 h-4 inline mr-1.5 -mt-0.5 text-purple-600 dark:text-purple-400" />
                      )}
                      {category}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 3: Description */}
              {step === 3 && (
                <div>
                  <Textarea
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) =>
                      setFormData({ ...formData, shortDescription: e.target.value })
                    }
                    placeholder="Brief, factual description of what this tool does..."
                    rows={4}
                    autoFocus
                  />
                  <div className="flex justify-end mt-1.5">
                    <span className={`text-xs ${
                      formData.shortDescription.length > 300
                        ? 'text-red-500'
                        : 'text-slate-400'
                    }`}>
                      {formData.shortDescription.length}/300
                    </span>
                  </div>
                </div>
              )}

              {/* Step 4: Tags */}
              {step === 4 && (
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedTags.includes(tag)
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-600'
                      }`}
                    >
                      {tag.replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 5: Rationale (optional) + review */}
              {step === 5 && (
                <div className="space-y-4">
                  <Textarea
                    id="rationale"
                    value={formData.rationale}
                    onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                    placeholder="e.g., I've used this daily for years and it respects privacy..."
                    rows={3}
                    autoFocus
                  />

                  {/* Compact review summary */}
                  <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-blue-600 to-purple-600" />
                    <div className="p-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 mb-3">
                        {/* Favicon in review */}
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {hasFavicon ? (
                            <img
                              src={faviconUrl!}
                              alt=""
                              className="w-5 h-5 object-contain"
                              onError={() => setFaviconError(true)}
                            />
                          ) : (
                            <Globe className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {formData.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {domain || formData.websiteUrl}
                          </p>
                        </div>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                        {formData.shortDescription}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedCategories.map((c) => (
                          <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                        ))}
                        {selectedTags.map((t) => (
                          <Badge key={t} className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
                            {t.replace(/-/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Error message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-600 dark:text-red-400 mt-3 flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </motion.p>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 pb-6 pt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="flex-1"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            className="flex-1"
          >
            {step === TOTAL_STEPS ? (
              'Submit for Review'
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
