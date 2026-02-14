import { useEffect, useRef } from 'react';

interface AmbientNodeMapProps {
  nodeName: string;
}

interface NetworkNode {
  gridX: number;
  gridY: number;
  pulsePhase: number;
  pulseSpeed: number;
  isCenter: boolean;
}

export function AmbientNodeMap({ nodeName }: AmbientNodeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<NetworkNode[]>([]);
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    window.addEventListener('resize', resize);

    // Grid configuration
    const gridCols = 9;
    const gridRows = 7;

    // Calculate center position in grid
    const centerGridX = Math.floor(gridCols / 2);
    const centerGridY = Math.floor(gridRows / 2);

    // Initialize nodes at grid intersections
    const nodes: NetworkNode[] = [];

    // Center node (the user)
    nodes.push({
      gridX: centerGridX,
      gridY: centerGridY,
      pulsePhase: 0,
      pulseSpeed: 0.8,
      isCenter: true,
    });

    // Place other members at random positions (8-10 members)
    const memberCount = Math.floor(Math.random() * 3) + 8;

    for (let i = 0; i < memberCount; i++) {
      // Random position in grid for variety
      const gridX = Math.floor(Math.random() * gridCols);
      const gridY = Math.floor(Math.random() * gridRows);

      nodes.push({
        gridX,
        gridY,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.4 + Math.random() * 0.6, // Varied pulse speeds
        isCenter: false,
      });
    }

    nodesRef.current = nodes;

    // Track mouse for subtle parallax
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left - rect.width / 2) / rect.width,
        y: (e.clientY - rect.top - rect.height / 2) / rect.height,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Grid configuration for positioning only (not drawn)
      const gridSize = 50;
      const gridCols = 9;
      const gridRows = 7;
      
      const gridWidth = gridCols * gridSize;
      const gridHeight = gridRows * gridSize;
      const gridStartX = (rect.width - gridWidth) / 2;
      const gridStartY = (rect.height - gridHeight) / 2;

      // Soft radial glow background (nebula/aurora effect)
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const bgGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, Math.max(rect.width, rect.height) * 0.6
      );
      bgGradient.addColorStop(0, 'rgba(147, 51, 234, 0.03)');
      bgGradient.addColorStop(0.5, 'rgba(96, 165, 250, 0.02)');
      bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Parallax offset (very subtle)
      const parallaxX = mouseRef.current.x * 8;
      const parallaxY = mouseRef.current.y * 8;

      // Draw nodes with organic, varied appearance
      nodesRef.current.forEach((node) => {
        node.pulsePhase += node.pulseSpeed * 0.015;
        const pulseScale = Math.sin(node.pulsePhase) * 0.2 + 0.8;

        // Gentle drift motion
        const driftX = Math.sin(node.pulsePhase * 0.5) * 4;
        const driftY = Math.cos(node.pulsePhase * 0.7) * 4;

        // Calculate position with drift and parallax
        const x = gridStartX + node.gridX * gridSize + driftX + parallaxX * 0.4;
        const y = gridStartY + node.gridY * gridSize + driftY + parallaxY * 0.4;

        if (node.isCenter) {
          // Center node (user) - larger, brighter
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 40 * pulseScale);
          gradient.addColorStop(0, 'rgba(147, 51, 234, 0.6)');
          gradient.addColorStop(0.4, 'rgba(147, 51, 234, 0.3)');
          gradient.addColorStop(1, 'rgba(147, 51, 234, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, 40 * pulseScale, 0, Math.PI * 2);
          ctx.fill();

          // Core with soft edge
          ctx.fillStyle = 'rgba(147, 51, 234, 0.9)';
          ctx.beginPath();
          ctx.arc(x, y, 6 * pulseScale, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Member nodes - varied size, opacity, and hue
          const sizeVariation = 0.6 + Math.sin(node.pulsePhase * 0.3) * 0.4;
          const opacityVariation = 0.4 + Math.sin(node.pulsePhase) * 0.3;
          
          // Vary between blue and purple hues
          const hueShift = Math.sin(node.pulsePhase * 0.2) * 30;
          const baseHue = 220 + hueShift; // Blue to purple range

          // Soft, blurred glow
          const glowSize = 25 * pulseScale * sizeVariation;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
          gradient.addColorStop(0, `hsla(${baseHue}, 80%, 65%, ${opacityVariation * 0.5})`);
          gradient.addColorStop(0.5, `hsla(${baseHue}, 80%, 65%, ${opacityVariation * 0.2})`);
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, glowSize, 0, Math.PI * 2);
          ctx.fill();

          // Core dot
          ctx.fillStyle = `hsla(${baseHue}, 80%, 70%, ${opacityVariation})`;
          ctx.beginPath();
          ctx.arc(x, y, 3 * pulseScale * sizeVariation, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
      />
      
      {/* Minimal overlay label - only appears on hover */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-500">
        <p className="text-[10px] text-slate-400/60 font-light tracking-wider uppercase">
          {nodeName} Network
        </p>
      </div>
    </div>
  );
}
