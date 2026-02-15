import { X, Users, Clock, Server, Activity, MapPin } from 'lucide-react';

export interface NodeData {
  id: string;
  type: 'infrastructure' | 'member';
  name: string;
  status: 'online' | 'offline';
  
  // Infrastructure-specific
  uptime?: string;
  servicesHosted?: string[];
  connectedUsers?: number;
  location?: string;
  
  // Member-specific  
  avatar?: string;
  lastSeen?: string;
  joinedDate?: string;
}

interface NodeDetailsModalProps {
  node: NodeData | null;
  onClose: () => void;
}

export function NodeDetailsModal({ node, onClose }: NodeDetailsModalProps) {
  if (!node) return null;

  const isInfrastructure = node.type === 'infrastructure';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-zinc-800 dark:to-zinc-800/50 border-b border-slate-200 dark:border-zinc-700">
          <button
            onClick={onClose}
            aria-label="Close node details modal"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/80 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-900 flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </button>

          <div className="flex items-start gap-4">
            {isInfrastructure ? (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                <Server className="w-7 h-7 text-white" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xl font-bold">
                {node.avatar || node.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
                {node.name}
              </h3>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${
                  node.status === 'online' 
                    ? 'bg-green-100 dark:bg-green-900/30' 
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    node.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                  }`} />
                  <span className={`text-xs font-medium ${
                    node.status === 'online' 
                      ? 'text-green-700 dark:text-green-400' 
                      : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    {node.status.toUpperCase()}
                  </span>
                </div>
                <span className="px-2 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full">
                  {isInfrastructure ? 'Infrastructure' : 'Member'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isInfrastructure ? (
            <>
              {/* Infrastructure Details */}
              {node.location && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Location</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{node.location}</div>
                  </div>
                </div>
              )}

              {node.uptime && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Uptime</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{node.uptime}</div>
                  </div>
                </div>
              )}

              {node.connectedUsers !== undefined && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Connected Users</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{node.connectedUsers}</div>
                  </div>
                </div>
              )}

              {node.servicesHosted && node.servicesHosted.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">Services Hosted</div>
                    <div className="flex flex-wrap gap-1.5">
                      {node.servicesHosted.map((service, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs rounded-md"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Member Details */}
              {node.joinedDate && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Joined</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{node.joinedDate}</div>
                  </div>
                </div>
              )}

              {node.status === 'offline' && node.lastSeen && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Last Seen</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{node.lastSeen}</div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-zinc-800">
                <button className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm transition-colors">
                  Send Message
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
