import { useState } from 'react';
import { ArrowRight, Shield, Users, FileText, Check, User, Tag } from 'lucide-react';
import { AmbientNodeMap } from './AmbientNodeMap';
import type { HubUser } from '../types/hub';

export type UserNodeData = HubUser;

interface NodeEntryFlowProps {
  onComplete: (userData: HubUser) => void;
  locationName: string;
}

const availableTags = [
  'Urban Planning', 'Education', 'Healthcare', 'Arts & Culture',
  'Technology', 'Environment', 'Small Business', 'Community Safety',
  'Housing', 'Transportation', 'Youth Programs', 'Senior Services'
];

const manifestoPrinciples = [
  {
    title: 'Local Ownership',
    description: 'This network is owned and governed by the community, not by corporations or external interests.'
  },
  {
    title: 'Chronological Feeds',
    description: 'Information appears in the order it was shared — not ranked by engagement algorithms.'
  },
  {
    title: 'Collective Moderation',
    description: 'Community standards are set and enforced by local members through transparent processes.'
  },
  {
    title: 'Privacy by Default',
    description: 'Your data stays local. No tracking, no profiling, no selling of personal information.'
  },
  {
    title: 'Participation Over Consumption',
    description: 'This is a civic space for community building, not a platform for passive content consumption.'
  }
];

export function NodeEntryFlow({ onComplete, locationName }: NodeEntryFlowProps) {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [agreedToManifesto, setAgreedToManifesto] = useState(false);

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleComplete = () => {
    onComplete({
      username: displayName.toLowerCase().replace(/\s+/g, ''),
      displayName,
      tags: selectedTags,
      role: 'participant',
      agreedToManifesto,
    });
  };

  const canProceedStep1 = displayName.trim().length >= 2;
  const canComplete = agreedToManifesto;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Progress */}
      <div className="sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-zinc-800 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-400'}`}>
              {step > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <div className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-purple-600' : 'bg-slate-200 dark:bg-zinc-700'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-400'}`}>
              2
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {step === 1 ? 'Your Profile' : 'Community Agreement'}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* ── Step 1: Identity ── */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
                Welcome to {locationName}
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 font-light max-w-xl mx-auto">
                Set up how you appear to your neighbors.
              </p>
            </div>

            {/* Ambient map */}
            <div className="w-full h-56 rounded-2xl overflow-hidden">
              <AmbientNodeMap nodeName={locationName} />
            </div>

            {/* Display Name */}
            <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-zinc-700">
              <label className="block mb-3">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Display Name</span>
                <span className="text-xs text-slate-400 ml-2">Required</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="How you'll appear to neighbors"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:border-purple-500 focus:outline-none transition-colors"
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-2">{displayName.length}/50 — No real name required, pseudonyms welcome.</p>
            </div>

            {/* Interests */}
            <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-zinc-700">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Community Interests</span>
                <span className="text-xs text-slate-400">Optional</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Select areas you care about — these show on your profile and help neighbors find common ground.
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
                canProceedStep1
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:scale-[1.02] active:scale-95'
                  : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
              }`}
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ── Step 2: Community Agreement ── */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
                How This Network Operates
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 font-light max-w-xl mx-auto">
                Not terms of service — shared principles.<br />
                <span className="text-sm text-slate-500 dark:text-slate-400">Understanding these is how trust is built.</span>
              </p>
            </div>

            <div className="space-y-3">
              {manifestoPrinciples.map((principle, i) => (
                <div key={i} className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-slate-200 dark:border-zinc-700">
                  <div className="flex items-start gap-3">
                    <Shield className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{principle.title}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-light leading-relaxed">{principle.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Agreement */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl p-6 border-2 border-purple-200 dark:border-purple-700">
              <label className="flex items-start gap-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToManifesto}
                  onChange={e => setAgreedToManifesto(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-2 border-purple-600 text-purple-600 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    I understand and agree to these community principles
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-light">
                    By joining, you commit to participating in good faith and respecting community standards.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-xl font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={!canComplete}
                className={`flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
                  canComplete
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:scale-[1.02] active:scale-95'
                    : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                }`}
              >
                <Users className="w-5 h-5" />
                Enter {locationName}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
