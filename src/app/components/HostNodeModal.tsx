import { X, CheckCircle2, Server, Users, Shield, ChevronDown, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface HostNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (screen: string) => void;
}

const SETUP_STEPS = [
  {
    icon: Server,
    title: 'Name & configure your hub',
    description: 'Pick a hub name, set your neighborhood, choose public or local-only access',
    details: 'The setup wizard walks you through every option — no config files, no terminal knowledge needed.',
  },
  {
    icon: CheckCircle2,
    title: 'Download & run one script',
    description: 'We generate a fully pre-configured script for your OS',
    details: 'Windows (PowerShell) or Mac/Linux (bash). The script installs Docker, writes your config, and starts the hub stack — one paste in a terminal.',
  },
  {
    icon: Users,
    title: 'Share your join link',
    description: 'Neighbors open the link, create an account, and they\'re in',
    details: 'Local hubs share a LAN IP address. Tailscale-enabled hubs get a public HTTPS URL reachable from anywhere.',
  },
  {
    icon: Shield,
    title: 'You\'re the admin',
    description: 'Moderate content, manage members, and keep the space yours',
    details: 'Your data stays on your machine — no cloud provider, no third-party storage. Citinet is just the software.',
  },
];

export function HostNodeModal({ isOpen, onClose, onNavigate }: HostNodeModalProps) {
  const [expandedStep, setExpandedStep] = useState<number>(0);

  if (!isOpen) return null;

  const handleStart = () => {
    onClose();
    onNavigate?.('create');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-[28px] max-w-2xl w-full max-h-[92vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative px-8 pt-10 pb-8 bg-white dark:bg-zinc-900">
          <button
            onClick={onClose}
            aria-label="Close host a hub modal"
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>

          <div className="max-w-md">
            <h3 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-3 leading-[1.1]">
              Host a Hub
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
              Run a community hub from your own machine — your neighborhood's data stays on your hardware, not anyone else's servers.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-zinc-950">
          <div className="px-8 py-8 space-y-8">
            {/* Benefits row */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-sm border border-slate-200/60 dark:border-zinc-800/60">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: 'Your data', sublabel: 'stays local', color: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/20', emoji: '🔒' },
                  { label: 'Your rules', sublabel: 'you\'re admin', color: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/20', emoji: '⚡' },
                  { label: 'Free', sublabel: 'open source', color: 'from-blue-500 to-indigo-600', shadow: 'shadow-blue-500/20', emoji: '🌐' },
                ].map(({ label, sublabel, color, shadow, emoji }) => (
                  <div key={label} className="text-center space-y-3">
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${color} shadow-lg ${shadow}`}>
                      <span className="text-3xl leading-none">{emoji}</span>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{label}</div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{sublabel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-5 tracking-tight px-1">
                How it works — 4 steps
              </h4>
              <div className="space-y-3">
                {SETUP_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const isExpanded = expandedStep === index;
                  return (
                    <button
                      key={index}
                      onClick={() => setExpandedStep(isExpanded ? -1 : index)}
                      className="w-full"
                    >
                      <div className={`relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm border ${
                        isExpanded
                          ? 'border-purple-500 dark:border-purple-600 shadow-lg shadow-purple-500/10'
                          : 'border-slate-200/60 dark:border-zinc-800/60 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}>
                        <div className="flex items-center gap-4 p-5">
                          <div className="relative flex-shrink-0">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all duration-300 ${
                              isExpanded ? 'bg-gradient-to-br from-purple-500 to-blue-600 scale-105' : 'bg-slate-100 dark:bg-zinc-800'
                            }`}>
                              <Icon className={`w-7 h-7 transition-colors duration-300 ${
                                isExpanded ? 'text-white' : 'text-slate-600 dark:text-slate-400'
                              }`} strokeWidth={2} />
                            </div>
                            <div className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow transition-all duration-300 ${
                              isExpanded ? 'bg-purple-600 text-white' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            }`}>
                              {index + 1}
                            </div>
                          </div>

                          <div className="flex-1 text-left">
                            <h5 className={`font-bold transition-colors duration-300 ${
                              isExpanded
                                ? 'text-purple-700 dark:text-purple-400 text-base mb-0.5'
                                : 'text-slate-900 dark:text-white text-sm mb-0.5'
                            }`}>
                              {step.title}
                            </h5>
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
                              {step.description}
                            </p>
                          </div>

                          <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-all duration-300 ${
                            isExpanded ? 'rotate-180 text-purple-500' : ''
                          }`} />
                        </div>

                        <div className={`overflow-hidden transition-all duration-300 ${
                          isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                        }`}>
                          <div className="px-5 pb-5 pt-1">
                            <div className="pl-[72px]">
                              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                {step.details}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Requirements */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-sm border border-slate-200/60 dark:border-zinc-800/60">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                </div>
                What you need
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Docker', 'free, we link you to it'],
                  ['Any modern PC or Mac', 'even a Raspberry Pi 4'],
                  ['Broadband internet', '10 Mbps+ recommended'],
                  ['Machine stays on', 'at least while neighbors use it'],
                ].map(([title, note]) => (
                  <div key={title} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white dark:bg-zinc-900 border-t border-slate-200/60 dark:border-zinc-800/60">
          <div className="flex gap-3 mb-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-900 dark:text-white rounded-xl font-semibold text-sm transition-all"
            >
              Not now
            </button>
            <button
              onClick={handleStart}
              className="flex-1 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
            >
              Start Setup Wizard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Takes ~10 minutes · No terminal experience needed
          </p>
        </div>
      </div>
    </div>
  );
}
