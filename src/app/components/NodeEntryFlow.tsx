import { useState } from 'react';
import { ArrowRight, Shield, Users, FileText, Check, User, Tag } from 'lucide-react';
import { AmbientNodeMap } from './AmbientNodeMap';
import type { HubUser } from '../types/hub';

// Kept for backward compatibility
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

const roles = [
  {
    id: 'participant',
    label: 'Participant',
    description: 'Stay informed and engaged with your local community',
    icon: User
  },
  {
    id: 'contributor',
    label: 'Contributor',
    description: 'Share knowledge, resources, and participate in discussions',
    icon: Users
  },
  {
    id: 'organizer',
    label: 'Organizer',
    description: 'Lead initiatives, coordinate events, and build projects',
    icon: FileText
  },
  {
    id: 'steward',
    label: 'Infrastructure / Steward',
    description: 'Help maintain the network and support community governance',
    icon: Shield
  }
];

const manifestoPrinciples = [
  {
    title: 'Local Ownership',
    description: 'This network is owned and governed by the community, not by corporations or external interests.'
  },
  {
    title: 'Chronological Feeds',
    description: 'Information appears in the order it was shared, not ranked by algorithms designed to maximize engagement.'
  },
  {
    title: 'Collective Moderation',
    description: 'Community standards are set and enforced by local members through transparent, democratic processes.'
  },
  {
    title: 'No Algorithmic Manipulation',
    description: 'What you see is determined by you and your neighbors, not by machine learning systems optimizing for attention.'
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
  const [selectedRole, setSelectedRole] = useState('');
  const [agreedToManifesto, setAgreedToManifesto] = useState(false);

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleComplete = () => {
    onComplete({
      username: displayName.toLowerCase().replace(/\s+/g, ''),
      displayName,
      tags: selectedTags,
      role: selectedRole,
      agreedToManifesto
    });
  };

  const canProceedStep1 = displayName.trim().length >= 2;
  const canProceedStep2 = selectedRole !== '';
  const canComplete = agreedToManifesto;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Progress Indicator */}
      <div className="sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-zinc-800 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-400'}`}>
              {step > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <div className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-purple-600' : 'bg-slate-200 dark:bg-zinc-700'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-400'}`}>
              {step > 2 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <div className={`flex-1 h-1 rounded-full ${step >= 3 ? 'bg-purple-600' : 'bg-slate-200 dark:bg-zinc-700'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 3 ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-400'}`}>
              3
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {step === 1 && 'Identity'}
            {step === 2 && 'Your Role'}
            {step === 3 && 'Community Agreement'}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Step 1: Identity */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
                Establish Your Presence
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 font-light max-w-xl mx-auto">
                Create your identity in the {locationName} local network.<br />
                <span className="text-sm text-slate-500 dark:text-slate-400">This is not a signup form. It's orientation.</span>
              </p>
            </div>

            {/* Display Name */}
            <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-zinc-700">
              <label className="block mb-3">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Display Name</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">(Required)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you'll appear to neighbors"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:border-purple-500 focus:outline-none transition-colors"
                maxLength={50}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                {displayName.length}/50 characters
              </p>
            </div>

            {/* Tags */}
            <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-zinc-700">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Interests & Skills</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">(Optional)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 font-light">
                Select areas where you have knowledge, interest, or expertise to connect with relevant community initiatives
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      selectedTags.includes(tag)
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy Notice */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-blue-200/50 dark:border-blue-700/50">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Privacy by Design</h3>
                  <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 font-light">
                    <li>• No real name required — pseudonyms welcome</li>
                    <li>• No algorithmic profiling or data mining</li>
                    <li>• Your information is visible only to local network members</li>
                    <li>• You control what you share and with whom</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 ${
                canProceedStep1
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                  : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
              }`}
            >
              Continue to Civic Role
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step 2: Role Selection */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
                Your Role in the Node
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 font-light max-w-xl mx-auto">
                This network already exists. You are joining something living.<br />
                <span className="text-sm text-slate-500 dark:text-slate-400">You are one of many, not alone.</span>
              </p>
            </div>

            {/* Ambient Node Map - Emotional Priming */}
            <div className="w-full h-80 md:h-96 mb-8">
              <AmbientNodeMap nodeName={locationName} />
            </div>

            {/* Role Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map(role => {
                const IconComponent = role.icon;
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`text-left p-6 rounded-2xl border-2 transition-all duration-300 ${
                      selectedRole === role.id
                        ? 'bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-purple-600 dark:border-purple-500 shadow-lg scale-[1.02]'
                        : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        selectedRole === role.id
                          ? 'bg-purple-600'
                          : 'bg-slate-100 dark:bg-zinc-700'
                      }`}>
                        <IconComponent className={`w-6 h-6 ${
                          selectedRole === role.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                          {role.label}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 font-light">
                          {role.description}
                        </p>
                      </div>
                      {selectedRole === role.id && (
                        <Check className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Role Note */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-blue-200/50 dark:border-blue-700/50">
              <p className="text-sm text-slate-700 dark:text-slate-300 font-light">
                <strong className="font-bold">Note:</strong> These roles do not limit what you can do in the network.
                They help us tailor your experience and suggest relevant opportunities for participation.
              </p>
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-xl font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all duration-300"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className={`flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 ${
                  canProceedStep2
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                    : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                }`}
              >
                Continue to Principles
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Community Manifesto */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
                How This Network Operates
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 font-light max-w-xl mx-auto">
                These are not terms of service. They're shared principles.<br />
                <span className="text-sm text-slate-500 dark:text-slate-400">Understanding these is how trust is built.</span>
              </p>
            </div>

            {/* Manifesto Principles */}
            <div className="space-y-4">
              {manifestoPrinciples.map((principle, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-zinc-700"
                >
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                    {principle.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 font-light leading-relaxed">
                    {principle.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Agreement Checkbox */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl p-6 border-2 border-purple-200 dark:border-purple-700">
              <label className="flex items-start gap-4 cursor-pointer group">
                <div className="flex-shrink-0 pt-1">
                  <input
                    type="checkbox"
                    checked={agreedToManifesto}
                    onChange={(e) => setAgreedToManifesto(e.target.checked)}
                    className="w-5 h-5 rounded border-2 border-purple-600 text-purple-600 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    I understand and agree to these community principles
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-light">
                    By joining this network, you commit to participating in good faith,
                    respecting community standards, and contributing to local governance when possible.
                  </p>
                </div>
              </label>
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-4 rounded-xl font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all duration-300"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={!canComplete}
                className={`flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 ${
                  canComplete
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                    : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                }`}
              >
                Enter {locationName}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
