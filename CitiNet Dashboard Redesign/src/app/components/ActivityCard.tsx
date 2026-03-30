import { ChevronRight } from 'lucide-react';

interface ActivityCardProps {
  avatar: string;
  name: string;
  action: string;
  title: string;
  category: string;
  time: string;
  accentColor: string;
  onClick?: () => void;
}

export function ActivityCard({
  avatar,
  name,
  action,
  title,
  category,
  time,
  accentColor,
  onClick,
}: ActivityCardProps) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-3 p-4 rounded-[10px] transition-all hover:bg-black/5 dark:hover:bg-white/5"
      style={{
        boxShadow: 'var(--shadow-base)',
        background: 'var(--surface)',
      }}
    >
      {/* Color-coded left bar */}
      <div
        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
        style={{ background: accentColor }}
      />

      {/* Avatar */}
      <img
        src={avatar}
        alt={name}
        className="w-11 h-11 rounded-full flex-shrink-0 ml-2"
      />

      {/* Content */}
      <div className="flex-1 text-left min-w-0">
        {/* Action text */}
        <p className="text-sm mb-1">
          <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
            {name}
          </span>{' '}
          <span style={{ color: accentColor }}>
            {action}
          </span>
        </p>

        {/* Title/snippet */}
        <p
          className="text-[13px] line-clamp-1 mb-1"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          {title}
        </p>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-[11px] font-['IBM_Plex_Mono']" style={{ color: 'var(--foreground-secondary)' }}>
          <span>in {category}</span>
          <span>·</span>
          <span>{time}</span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight
        className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0"
        style={{ color: 'var(--foreground-secondary)' }}
      />
    </button>
  );
}
