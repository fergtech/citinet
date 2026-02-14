import { useState, useEffect } from 'react';
import { MapPin, Radio, Users, ArrowLeft, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Node {
  id: string;
  name: string;
  location: string;
  distance: number;
  members: number;
  signalStrength: 'strong' | 'medium' | 'weak';
  isOnline: boolean;
}

interface NodeDiscoveryScreenProps {
  onNodeFound: (nodeId: string, nodeName: string) => void;
  onBack: () => void;
}

export function NodeDiscoveryScreen({ onNodeFound, onBack }: NodeDiscoveryScreenProps) {
  const [searching, setSearching] = useState(true);
  const [nearbyNodes, setNearbyNodes] = useState<Node[]>([]);

  useEffect(() => {
    // Simulate scanning for local nodes
    setTimeout(() => {
      setNearbyNodes([
        {
          id: 'highland-park',
          name: 'Highland Park Local Commons',
          location: 'Highland Park, CA',
          distance: 0.3,
          members: 47,
          signalStrength: 'strong',
          isOnline: true
        },
        {
          id: 'eagle-rock',
          name: 'Eagle Rock Commons',
          location: 'Eagle Rock, CA',
          distance: 1.2,
          members: 23,
          signalStrength: 'medium',
          isOnline: true
        },
        {
          id: 'mount-washington',
          name: 'Mount Washington Network',
          location: 'Mount Washington, CA',
          distance: 2.1,
          members: 31,
          signalStrength: 'weak',
          isOnline: true
        }
      ]);
      setSearching(false);
    }, 2000);
  }, []);

  const getSignalIcon = (strength: string) => {
    const bars = strength === 'strong' ? 3 : strength === 'medium' ? 2 : 1;
    return (
      <div className="flex items-end gap-0.5">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={`w-1 rounded-full ${
              bar <= bars ? 'bg-green-500' : 'bg-slate-300 dark:bg-zinc-600'
            }`}
            style={{ height: `${bar * 4}px` }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 relative overflow-hidden flex flex-col">
      {/* Background Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="discovery-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M 0 150 Q 50 100 100 150 T 200 150" stroke="white" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#discovery-pattern)" />
      </svg>

      {/* Header */}
      <div className="relative z-10 p-6">
        <button
          onClick={onBack}
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
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                Finding Local Networks
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Scanning for citinet nodes in your area...
              </p>
            </div>

            {searching ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  Detecting nearby mesh nodes...
                </p>
              </div>
            ) : nearbyNodes.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <Radio className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  No Nodes Found
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  We couldn't detect any citinet nodes nearby.
                  <br />
                  You can be the first in your community!
                </p>
                <button
                  onClick={onBack}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
                >
                  Create a Node
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Found {nearbyNodes.length} {nearbyNodes.length === 1 ? 'network' : 'networks'} nearby
                </p>
                {nearbyNodes.map((node) => (
                  <motion.button
                    key={node.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => onNodeFound(node.id, node.name)}
                    className="w-full text-left p-5 border-2 border-slate-200 dark:border-zinc-700 rounded-2xl hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                            <MapPin className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {node.name}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              {node.location}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 ml-15">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            <span>{node.members} members</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            <span>{node.distance} mi away</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getSignalIcon(node.signalStrength)}
                        {node.isOnline && (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            Online
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
