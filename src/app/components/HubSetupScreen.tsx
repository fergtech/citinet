/**
 * Hub Setup Dashboard (Placeholder)
 * 
 * Shows hub startup status and provides basic configuration interface.
 * This is a simplified version; full admin panel will come later.
 */

import { ArrowLeft, CheckCircle, Circle, XCircle, ExternalLink, Server, Database, HardDrive, Network } from 'lucide-react';

interface HubSetupScreenProps {
  onBack: () => void;
}

type CheckStatus = 'success' | 'pending' | 'error';

interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  icon: React.ComponentType<{ className?: string }>;
}

export function HubSetupScreen({ onBack }: HubSetupScreenProps) {
  // TODO: These will be real checks in the future
  const checks: Check[] = [
    { id: 'docker', label: 'Docker running', status: 'pending', icon: Server },
    { id: 'services', label: 'Hub services started', status: 'pending', icon: Database },
    { id: 'storage', label: 'Storage configured', status: 'pending', icon: HardDrive },
    { id: 'tunnel', label: 'Public tunnel configured', status: 'pending', icon: Network },
  ];

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return <Circle className="w-5 h-5 text-slate-400 dark:text-slate-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600">
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <div className="p-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex items-center justify-center p-6 pt-0">
          <div className="w-full max-w-4xl space-y-6">
            {/* Header Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
                  Hub Setup Dashboard
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                  Monitor your hub's configuration and status
                </p>
              </div>

              {/* Setup Checklist */}
              <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-6 border-2 border-slate-200 dark:border-zinc-700 mb-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Setup Progress
                </h2>
                <div className="space-y-3">
                  {checks.map((check) => {
                    const Icon = check.icon;
                    return (
                      <div 
                        key={check.id}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-lg"
                      >
                        {getStatusIcon(check.status)}
                        <Icon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        <span className="text-slate-900 dark:text-white font-medium flex-1">
                          {check.label}
                        </span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {check.status === 'success' ? 'Ready' : 'Waiting...'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Placeholder Notice */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6 border-2 border-yellow-200 dark:border-yellow-800">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  ⚠️ Placeholder Screen
                </h3>
                <p className="text-sm text-yellow-900 dark:text-yellow-100 mb-4">
                  This is a simplified setup dashboard. The full admin panel with real-time status checks, 
                  service management, and hub configuration will be implemented in a future update.
                </p>
                <div className="space-y-2 text-sm text-yellow-900 dark:text-yellow-100">
                  <p><strong>Planned features:</strong></p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>Real-time Docker service status monitoring</li>
                    <li>Automatic health checks (API, database, storage)</li>
                    <li>Tunnel configuration interface (Tailscale, Cloudflare)</li>
                    <li>Hub registry registration</li>
                    <li>Service logs viewer</li>
                    <li>Configuration editor</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                Quick Actions
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                  href="http://localhost:9090/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors group"
                >
                  <ExternalLink className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">Check API Health</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">localhost:9090/health</p>
                  </div>
                </a>

                <a
                  href="http://localhost:9001"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors group"
                >
                  <ExternalLink className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">MinIO Console</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">localhost:9001</p>
                  </div>
                </a>

                <a
                  href="https://github.com/fergtech/citinet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors group"
                >
                  <ExternalLink className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">Documentation</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">GitHub Repository</p>
                  </div>
                </a>

                <a
                  href="https://github.com/fergtech/citinet/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors group"
                >
                  <ExternalLink className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">Get Help</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Community Discussions</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
