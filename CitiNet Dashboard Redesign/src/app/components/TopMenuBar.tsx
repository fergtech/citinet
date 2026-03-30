import { Wifi, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

interface TopMenuBarProps {
  hubName: string;
  onlineCount: number;
  tunnelUrl?: string;
}

export function TopMenuBar({ hubName, onlineCount, tunnelUrl }: TopMenuBarProps) {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-9 bg-[#0f172a] backdrop-blur-md z-50 px-4 flex items-center justify-between border-b border-white/5">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-white tracking-tight">
          {hubName}
        </h1>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <span className="text-xs text-slate-400 font-['IBM_Plex_Mono']">
            {onlineCount} online
          </span>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {tunnelUrl && (
          <button className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-slate-300 transition-colors">
            {tunnelUrl}
          </button>
        )}
        <button
          onClick={toggleTheme}
          className="p-1.5 hover:bg-white/10 rounded transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-3.5 h-3.5 text-slate-300" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-slate-300" />
          )}
        </button>
      </div>
    </div>
  );
}
