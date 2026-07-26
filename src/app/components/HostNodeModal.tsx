import { X, Server, Wifi, Power } from 'lucide-react';

interface HostNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (screen: string) => void;
}

const REQUIREMENTS = [
  { icon: Server, text: 'A machine to run it on — a spare PC, old laptop, or Raspberry Pi all work, via Docker' },
  { icon: Wifi, text: 'A stable internet connection at that location' },
  { icon: Power, text: "Willingness to keep it running — the hub goes offline if the machine does" },
];

export function HostNodeModal({ isOpen, onClose, onNavigate }: HostNodeModalProps) {
  if (!isOpen) return null;

  const handleStart = () => {
    onClose();
    onNavigate?.('create');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="cn-surface border cn-border rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5 text-white" />
          </span>
          <h2 className="flex-1 text-lg font-bold cn-text-1">Host a node</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors shrink-0">
            <X className="w-4 h-4 cn-text-3" />
          </button>
        </div>

        <p className="text-sm cn-text-2 leading-relaxed">
          Hosting a hub keeps your community's data on your own hardware, not a company's server. Here's what it takes:
        </p>

        <div className="flex flex-col gap-3">
          {REQUIREMENTS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg cn-surface-2 flex items-center justify-center shrink-0 text-purple-500 dark:text-purple-300">
                <Icon className="w-4 h-4" />
              </span>
              <p className="text-sm cn-text-2 leading-snug pt-1.5">{text}</p>
            </div>
          ))}
        </div>

        <button
          onClick={handleStart}
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
