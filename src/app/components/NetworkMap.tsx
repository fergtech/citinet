import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { NodeDetailsModal, type NodeData } from './NodeDetailsModal';

interface NetworkMapProps {
  activeMembers: number;
  onlineNow: number;
  onExpand?: () => void;
}

interface NetworkNode {
  id: string;
  gridX: number;
  gridY: number;
  pulsePhase: number;
  pulseSpeed: number;
  type: 'infrastructure' | 'member' | 'user';
  isOnline: boolean;
  hasActivity: boolean;
  data: NodeData;
}

// Mock data generator
const generateMockNodes = (activeMembers: number, onlineNow: number): NetworkNode[] => {
  const gridCols = 7;
  const gridRows = 5;
  const centerGridX = Math.floor(gridCols / 2);
  const centerGridY = Math.floor(gridRows / 2);
  
  const nodes: NetworkNode[] = [];
  const memberNames = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Quinn', 'Blake', 'Drew'];
  
  // Add 1-2 infrastructure nodes
  const infrastructureCount = Math.random() > 0.5 ? 2 : 1;
  for (let i = 0; i < infrastructureCount; i++) {
    nodes.push({
      id: `infra-${i}`,
      gridX: i === 0 ? 1 : gridCols - 2,
      gridY: Math.floor(gridRows / 2),
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.6,
      type: 'infrastructure',
      isOnline: true,
      hasActivity: true,
      data: {
        id: `infra-${i}`,
        type: 'infrastructure',
        name: `Node ${i === 0 ? 'North' : 'South'}`,
        status: 'online',
        uptime: `${Math.floor(Math.random() * 30 + 15)} days`,
        servicesHosted: ['Mesh Router', 'Local Storage', 'Relay'],
        connectedUsers: Math.floor(Math.random() * 20 + 10),
        location: i === 0 ? 'North District' : 'South District'
      }
    });
  }

  // Center node (the user)
  nodes.push({
    id: 'user',
    gridX: centerGridX,
    gridY: centerGridY,
    pulsePhase: 0,
    pulseSpeed: 0.8,
    type: 'user',
    isOnline: true,
    hasActivity: false,
    data: {
      id: 'user',
      type: 'member',
      name: 'You',
      status: 'online',
      joinedDate: 'January 2026',
    }
  });

  // Member nodes
  const visibleMembers = Math.min(activeMembers - 1, 10);
  const onlineCount = Math.max(0, onlineNow - 1);

  for (let i = 0; i < visibleMembers; i++) {
    let gridX: number;
    let gridY: number;
    do {
      gridX = Math.floor(Math.random() * gridCols);
      gridY = Math.floor(Math.random() * gridRows);
    } while (
      nodes.some(n => n.gridX === gridX && n.gridY === gridY)
    );

    const isOnline = i < onlineCount;
    const hasActivity = isOnline && Math.random() > 0.7;

    nodes.push({
      id: `member-${i}`,
      gridX,
      gridY,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.4 + Math.random() * 0.6,
      type: 'member',
      isOnline,
      hasActivity,
      data: {
        id: `member-${i}`,
        type: 'member',
        name: memberNames[i % memberNames.length],
        status: isOnline ? 'online' : 'offline',
        joinedDate: 'December 2025',
        lastSeen: !isOnline ? `${Math.floor(Math.random() * 24)} hours ago` : undefined,
      }
    });
  }

  return nodes;
};

export function NetworkMap({ activeMembers, onlineNow, onExpand }: NetworkMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<NetworkNode[]>([]);
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0, canvasX: 0, canvasY: 0 });
  const hoveredNodeRef = useRef<NetworkNode | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);

  // Sync state to ref
  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
  }, [hoveredNode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    // Delay initial resize to ensure parent has dimensions
    setTimeout(resize, 0);
    window.addEventListener('resize', resize);

    // Generate mock nodes
    nodesRef.current = generateMockNodes(activeMembers, onlineNow);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left - rect.width / 2) / rect.width,
        y: (e.clientY - rect.top - rect.height / 2) / rect.height,
        canvasX: e.clientX - rect.left,
        canvasY: e.clientY - rect.top
      };

      // Check if hovering over a node
      const gridSize = 35;
      const gridCols = 7;
      const gridRows = 5;
      const gridWidth = gridCols * gridSize;
      const gridHeight = gridRows * gridSize;
      const gridStartX = (rect.width - gridWidth) / 2;
      const gridStartY = (rect.height - gridHeight) / 2;

      let foundNode: NetworkNode | null = null;
      
      for (const node of nodesRef.current) {
        // Use BASE grid position for hit detection (ignore drift animation)
        const x = gridStartX + node.gridX * gridSize;
        const y = gridStartY + node.gridY * gridSize;
        
        const distance = Math.sqrt(
          Math.pow(mouseRef.current.canvasX - x, 2) + 
          Math.pow(mouseRef.current.canvasY - y, 2)
        );

        // Larger hitbox for easier clicking (20px instead of 15px)
        if (distance < 20) {
          foundNode = node;
          break;
        }
      }

      setHoveredNode(foundNode);
      canvas.style.cursor = foundNode ? 'pointer' : 'default';
    };

    const handleClick = (e: MouseEvent) => {
      const currentHoveredNode = hoveredNodeRef.current;
      
      if (onExpand && !currentHoveredNode) {
        onExpand();
        return;
      }

      if (currentHoveredNode) {
        e.stopPropagation();
        setSelectedNode(currentHoveredNode.data);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    // Animation
    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const gridSize = 35;
      const gridCols = 7;
      const gridRows = 5;
      const gridWidth = gridCols * gridSize;
      const gridHeight = gridRows * gridSize;
      const gridStartX = (rect.width - gridWidth) / 2;
      const gridStartY = (rect.height - gridHeight) / 2;

      // Soft background glow
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const bgGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, Math.max(rect.width, rect.height) * 0.5
      );
      bgGradient.addColorStop(0, 'rgba(147, 51, 234, 0.04)');
      bgGradient.addColorStop(0.5, 'rgba(96, 165, 250, 0.02)');
      bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Draw nodes
      nodesRef.current.forEach((node) => {
        node.pulsePhase += node.pulseSpeed * 0.02;
        const pulseScale = Math.sin(node.pulsePhase) * 0.2 + 0.8;

        const driftX = Math.sin(node.pulsePhase * 0.5) * 2;
        const driftY = Math.cos(node.pulsePhase * 0.7) * 2;

        // No parallax - nodes stay in position
        const x = gridStartX + node.gridX * gridSize + driftX;
        const y = gridStartY + node.gridY * gridSize + driftY;

        const isHovering = hoveredNode?.id === node.id;
        const hoverScale = isHovering ? 1.3 : 1;

        if (node.type === 'infrastructure') {
          // Infrastructure nodes - green/teal
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 30 * pulseScale * hoverScale);
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.7)');
          gradient.addColorStop(0.5, 'rgba(20, 184, 166, 0.4)');
          gradient.addColorStop(1, 'rgba(20, 184, 166, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, 30 * pulseScale * hoverScale, 0, Math.PI * 2);
          ctx.fill();

          // Core with square shape for infrastructure
          ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
          ctx.fillRect(x - 4 * hoverScale, y - 4 * hoverScale, 8 * hoverScale, 8 * hoverScale);
          
          // Hover glow
          if (isHovering) {
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 8, y - 8, 16, 16);
          }
        } else if (node.type === 'user') {
          // User node - purple
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 25 * pulseScale * hoverScale);
          gradient.addColorStop(0, 'rgba(147, 51, 234, 0.6)');
          gradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.3)');
          gradient.addColorStop(1, 'rgba(147, 51, 234, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, 25 * pulseScale * hoverScale, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(147, 51, 234, 0.95)';
          ctx.beginPath();
          ctx.arc(x, y, 5 * hoverScale, 0, Math.PI * 2);
          ctx.fill();

          if (isHovering) {
            ctx.strokeStyle = 'rgba(147, 51, 234, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          // Member nodes - online blue, offline gray (NEVER purple)
          const sizeVariation = 0.6 + Math.sin(node.pulsePhase * 0.3) * 0.4;
          
          let baseColor, opacity;
          if (node.isOnline) {
            // All online members are blue (activity adds rings, not color change)
            baseColor = '96, 165, 250';
            opacity = 0.5 + Math.sin(node.pulsePhase) * 0.3;
          } else {
            // Offline - dim gray
            baseColor = '148, 163, 184';
            opacity = 0.2;
          }

          const glowSize = 18 * pulseScale * sizeVariation * hoverScale;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
          gradient.addColorStop(0, `rgba(${baseColor}, ${opacity})`);
          gradient.addColorStop(0.5, `rgba(${baseColor}, ${opacity * 0.4})`);
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, glowSize, 0, Math.PI * 2);
          ctx.fill();

          // Core
          ctx.fillStyle = `rgba(${baseColor}, ${opacity * 1.2})`;
          ctx.beginPath();
          ctx.arc(x, y, 3 * pulseScale * sizeVariation * hoverScale, 0, Math.PI * 2);
          ctx.fill();

          // Hover ring
          if (isHovering) {
            ctx.strokeStyle = `rgba(${baseColor}, 0.8)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Activity pulse ring for active nodes (cyan/bright blue rings)
          if (node.hasActivity) {
            const ringScale = Math.sin(node.pulsePhase * 2) * 0.5 + 0.5;
            ctx.strokeStyle = `rgba(34, 211, 238, ${0.4 * (1 - ringScale)})`; // Cyan color
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 8 + ringScale * 6, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeMembers, onlineNow]); // Removed hoveredNode and onExpand from dependencies

  return (
    <>
      <div 
        className="relative w-full h-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/50 group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
        />
        
        {/* Hover tooltip */}
        {hoveredNode && (
          <div 
            className="absolute pointer-events-none z-10 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg px-3 py-2 shadow-xl"
            style={{
              left: `${mouseRef.current.canvasX}px`,
              top: `${mouseRef.current.canvasY - 40}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="text-xs font-medium text-white mb-0.5">{hoveredNode.data.name}</div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                hoveredNode.data.status === 'online' ? 'bg-green-400' : 'bg-slate-400'
              }`} />
              <span className="text-xs text-slate-300">
                {hoveredNode.type === 'infrastructure' ? 'Infrastructure Node' : 
                 hoveredNode.type === 'user' ? 'You' : 
                 hoveredNode.data.status}
              </span>
            </div>
          </div>
        )}

        {/* Expand button overlay */}
        {onExpand && (
          <div className={`absolute top-2 right-2 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            <div className="p-1.5 bg-slate-800/80 backdrop-blur-sm rounded-lg border border-slate-700/50">
              <Maximize2 className="w-3 h-3 text-slate-300" />
            </div>
          </div>
        )}

        {/* Status legend */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-slate-400 font-light">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span>You</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span>Infrastructure</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Online</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>Offline</span>
            </div>
          </div>
          {isHovered && !hoveredNode && (
            <span className="text-slate-300">Click nodes for details</span>
          )}
        </div>
      </div>

      <NodeDetailsModal 
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />
    </>
  );
}
