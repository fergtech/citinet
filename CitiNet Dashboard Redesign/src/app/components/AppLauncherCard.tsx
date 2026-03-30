import { LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface AppLauncherCardProps {
  icon: LucideIcon;
  title: string;
  gradient: string;
  notificationCount?: number;
  onClick?: () => void;
}

export function AppLauncherCard({ 
  icon: Icon, 
  title, 
  gradient, 
  notificationCount,
  onClick 
}: AppLauncherCardProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = () => {
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 150);
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className={`
        group relative w-full h-24 rounded-[10px] 
        bg-gradient-to-br ${gradient}
        transition-all duration-200
        hover:scale-[1.02] hover:shadow-[var(--shadow-elevated)]
        active:scale-[0.98]
        ${isPressed ? 'scale-[0.98]' : ''}
      `}
      style={{
        boxShadow: 'var(--shadow-base)',
      }}
    >
      {/* Inner glow effect */}
      <div className="absolute inset-0 rounded-[10px] bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Icon container */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
        <div className="relative w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-105 transition-transform">
          {/* Shine line */}
          <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-white/20 rounded-full" />
          <Icon className="w-6 h-6 text-white drop-shadow-lg" />
        </div>
        
        {/* Title */}
        <span className="text-[11px] font-medium text-white uppercase tracking-wider drop-shadow-md">
          {title}
        </span>
      </div>

      {/* Notification badge */}
      {notificationCount && notificationCount > 0 && (
        <div className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 bg-rose-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
          <span className="text-[10px] font-bold text-white">
            {notificationCount > 9 ? '9+' : notificationCount}
          </span>
        </div>
      )}
    </button>
  );
}
