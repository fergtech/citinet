import { useState } from 'react';
import { ArrowLeft, ArrowRight, MapPin, Wifi, Download, CheckCircle, Server } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NodeData {
  name: string;
  location: string;
  zipCode: string;
  description: string;
}

interface NodeCreationWizardProps {
  onComplete: (nodeId: string, nodeName: string) => void;
  onBack: () => void;
}

export function NodeCreationWizard({ onComplete, onBack }: NodeCreationWizardProps) {
  const [step, setStep] = useState(1);
  const [nodeData, setNodeData] = useState<NodeData>({
    name: '',
    location: '',
    zipCode: '',
    description: ''
  });

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Complete setup
      const nodeId = nodeData.name.toLowerCase().replace(/\s+/g, '-');
      onComplete(nodeId, nodeData.name);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onBack();
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return nodeData.name.trim().length > 0;
      case 2:
        return nodeData.location.trim().length > 0 && nodeData.zipCode.trim().length > 0;
      case 3:
        return true; // Hardware info is optional
      case 4:
        return true; // Final review
      default:
        return false;
    }
  };

  const steps = [
    {
      title: 'Name This Node For Your Community',
      icon: MapPin,
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Node Name
            </label>
            <input
              type="text"
              placeholder="e.g., Highland Park, Eagle Rock, Downtown..."
              value={nodeData.name}
              onChange={(e) => setNodeData({ ...nodeData, name: e.target.value })}
              className="w-full p-4 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors"
              autoFocus
            />
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              This will be the name neighbors see when discovering your network
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              placeholder="Tell neighbors about your community..."
              value={nodeData.description}
              onChange={(e) => setNodeData({ ...nodeData, description: e.target.value })}
              className="w-full p-4 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors resize-none"
              rows={3}
            />
          </div>
        </div>
      )
    },
    {
      title: 'Set Your Location',
      icon: MapPin,
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Neighborhood or City
            </label>
            <input
              type="text"
              placeholder="e.g., Highland Park, Los Angeles"
              value={nodeData.location}
              onChange={(e) => setNodeData({ ...nodeData, location: e.target.value })}
              className="w-full p-4 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              ZIP Code
            </label>
            <input
              type="text"
              placeholder="90042"
              value={nodeData.zipCode}
              onChange={(e) => setNodeData({ ...nodeData, zipCode: e.target.value })}
              className="w-full p-4 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Helps neighbors discover your node when scanning nearby networks
            </p>
          </div>
        </div>
      )
    },
    {
      title: 'Hardware Requirements',
      icon: Server,
      content: (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-6 border-2 border-slate-200 dark:border-zinc-700">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
              Minimum Requirements:
            </h3>
            <ul className="space-y-3 text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Raspberry Pi 4</span> (2GB+ RAM recommended)
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">8GB+ microSD card</span> or USB storage
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Internet connection</span> (10 Mbps+ recommended)
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Optional:</span> Ethernet cable for stability
                </div>
              </li>
            </ul>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-800">
            <div className="flex items-start gap-3">
              <Wifi className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-900 dark:text-purple-100">
                <p className="font-medium mb-1">Low-cost, high-impact</p>
                <p>Total hardware cost: ~$50-100. Powers a community of 100+ neighbors.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Ready to Launch',
      icon: Download,
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              You're All Set!
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Your node configuration is ready
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-6 border-2 border-slate-200 dark:border-zinc-700 space-y-3">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Node Details:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Name:</span>
                <span className="font-medium text-slate-900 dark:text-white">{nodeData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Location:</span>
                <span className="font-medium text-slate-900 dark:text-white">{nodeData.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">ZIP Code:</span>
                <span className="font-medium text-slate-900 dark:text-white">{nodeData.zipCode}</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-2">Next Step: Install Node Software</p>
                <p className="mb-3">Download the citinet node software and follow the installation guide.</p>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm">
                  Download Installer
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const currentStep = steps[step - 1];
  const Icon = currentStep.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 relative overflow-hidden flex flex-col">
      {/* Background Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wizard-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M 0 150 Q 50 100 100 150 T 200 150" stroke="white" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wizard-pattern)" />
      </svg>

      {/* Header */}
      <div className="relative z-10 p-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 relative z-10"
          >
            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Step {step} of {totalSteps}
                </span>
                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                  {Math.round((step / totalSteps) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                <motion.div
                  className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(step / totalSteps) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Step Content */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {currentStep.title}
                </h2>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentStep.content}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 px-6 py-4 border-2 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {step === totalSteps ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Launch Node
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
