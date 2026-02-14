import { X, Server, CheckCircle2, Zap, Wifi, Download, Settings, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface HostNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SETUP_STEPS = [
  {
    icon: Download,
    title: 'Download Node Software',
    description: 'Get the latest mesh node package for your device',
    details: 'Compatible with Raspberry Pi 4, PC, or dedicated hardware',
    status: 'ready' as const,
  },
  {
    icon: Settings,
    title: 'Configure Your Node',
    description: 'Set network name, choose bandwidth limits, and security settings',
    details: 'Recommended: 20% bandwidth share for optimal network health',
    status: 'ready' as const,
  },
  {
    icon: Wifi,
    title: 'Connect to Mesh',
    description: 'Join the local network and establish peer connections',
    details: 'Auto-discovery finds nearby nodes within ~300ft range',
    status: 'ready' as const,
  },
  {
    icon: Zap,
    title: 'Go Live',
    description: 'Activate your node and start contributing to the network',
    details: 'You\'ll earn reputation points and network credits',
    status: 'ready' as const,
  },
];

export function HostNodeModal({ isOpen, onClose }: HostNodeModalProps) {
  const [expandedStep, setExpandedStep] = useState<number>(0);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-[28px] max-w-2xl w-full max-h-[92vh] shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        {/* Clean Header - Light First */}
        <div className="relative px-8 pt-10 pb-8 bg-white dark:bg-zinc-900">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          
          <div className="max-w-md">
            <h3 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-3 leading-[1.1]">
              Host a Node
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
              Become a network contributor. Faster speeds, premium access, and reputation—just a few taps away.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-zinc-950">
          <div className="px-8 py-10 space-y-10">
            {/* HERO Benefits - Instagram/ChatGPT Style */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-10 shadow-sm border border-slate-200/60 dark:border-zinc-800/60">
              <div className="grid grid-cols-3 gap-8">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-[22px] bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                    <Zap className="w-10 h-10 text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-5xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
                      +50%
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Network Speed</p>
                  </div>
                </div>
                
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-[22px] bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
                    <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-5xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
                      Free
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Premium Access</p>
                  </div>
                </div>
                
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-[22px] bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
                    <span className="text-4xl leading-none">⭐</span>
                  </div>
                  <div>
                    <div className="text-5xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
                      Earn
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Reputation</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Steps - Meta/Instagram Card Style */}
            <div>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight px-1">
                Setup in 4 Easy Steps
              </h4>
              <div className="space-y-4">
                {SETUP_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const isExpanded = expandedStep === index;
                  
                  return (
                    <button
                      key={index}
                      onClick={() => setExpandedStep(isExpanded ? -1 : index)}
                      className="w-full group/step"
                    >
                      <div className={`relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm border ${
                        isExpanded 
                          ? 'border-emerald-500 dark:border-emerald-600 shadow-lg shadow-emerald-500/10' 
                          : 'border-slate-200/60 dark:border-zinc-800/60 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}>
                        {/* Step Header */}
                        <div className="flex items-center gap-5 p-6">
                          {/* Icon Badge */}
                          <div className="relative flex-shrink-0">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-md transition-all duration-300 ${
                              isExpanded
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 scale-105'
                                : 'bg-slate-100 dark:bg-zinc-800'
                            }`}>
                              <Icon className={`w-8 h-8 transition-colors duration-300 ${
                                isExpanded ? 'text-white' : 'text-slate-600 dark:text-slate-400'
                              }`} strokeWidth={2} />
                            </div>
                            {/* Number Badge */}
                            <div className={`absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-lg transition-all duration-300 ${
                              isExpanded
                                ? 'bg-emerald-600 text-white scale-110'
                                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            }`}>
                              {index + 1}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 text-left">
                            <h5 className={`font-bold transition-all duration-300 ${
                              isExpanded 
                                ? 'text-emerald-700 dark:text-emerald-400 text-lg mb-1' 
                                : 'text-slate-900 dark:text-white text-base mb-0.5'
                            }`}>
                              {step.title}
                            </h5>
                            <p className="text-[15px] text-slate-600 dark:text-slate-400 leading-relaxed">
                              {step.description}
                            </p>
                          </div>

                          {/* Chevron */}
                          <ChevronDown className={`w-6 h-6 text-slate-400 flex-shrink-0 transition-all duration-300 ${
                            isExpanded ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''
                          }`} />
                        </div>

                        {/* Expandable Details */}
                        <div className={`overflow-hidden transition-all duration-300 ${
                          isExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                        }`}>
                          <div className="px-6 pb-6 pt-2">
                            <div className="pl-[84px] -ml-px">
                              <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                                {step.details}
                              </p>
                              {index === 0 && isExpanded && (
                                <button className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[15px] font-semibold rounded-xl transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]">
                                  Download Now
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Requirements - Clean List */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-slate-200/60 dark:border-zinc-800/60">
              <h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                </div>
                Requirements
              </h4>
              <div className="grid grid-cols-2 gap-3.5 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-700 dark:text-slate-300">
                    <strong className="font-semibold text-slate-900 dark:text-white">8GB</strong> storage
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-700 dark:text-slate-300">
                    <strong className="font-semibold text-slate-900 dark:text-white">2GB</strong> RAM
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-700 dark:text-slate-300">
                    <strong className="font-semibold text-slate-900 dark:text-white">10 Mbps</strong> internet
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-700 dark:text-slate-300">
                    <strong className="font-semibold text-slate-900 dark:text-white">18+ hrs</strong> uptime/day
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Instagram/Meta Button Style */}
        <div className="p-6 bg-white dark:bg-zinc-900 border-t border-slate-200/60 dark:border-zinc-800/60">
          <div className="flex gap-3 mb-4">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-900 dark:text-white rounded-xl font-semibold text-[15px] transition-all active:scale-[0.98]"
            >
              Maybe Later
            </button>
            <button className="flex-1 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-[15px] shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98]">
              Start Setup
            </button>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 text-center font-medium">
            ⚡ Takes ~15 minutes · No technical knowledge required
          </p>
        </div>
      </div>
    </div>
  );
}
