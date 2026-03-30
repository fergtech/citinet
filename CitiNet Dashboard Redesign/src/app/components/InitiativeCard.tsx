import { Lightbulb, ChevronRight } from 'lucide-react';

interface InitiativeCardProps {
  title: string;
  memberCount: number;
  memberAvatars: string[];
  progress: number;
  status: 'In Progress' | 'Planning' | 'Completed';
  color: string;
  onClick?: () => void;
}

export function InitiativeCard({
  title,
  memberCount,
  memberAvatars,
  progress,
  status,
  color,
  onClick,
}: InitiativeCardProps) {
  const statusColors = {
    'In Progress': '#3b82f6',
    'Planning': '#f59e0b',
    'Completed': '#059669',
  };

  return (
    <button
      onClick={onClick}
      className="group w-full p-4 rounded-[10px] transition-all hover:shadow-[var(--shadow-elevated)] text-left relative overflow-hidden"
      style={{
        boxShadow: 'var(--shadow-base)',
        background: 'var(--surface)',
        border: `1px solid var(--border)`,
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: `linear-gradient(to bottom, ${color}, ${color}80)` }}
      />

      {/* Header with icon */}
      <div className="flex items-start gap-3 mb-3 ml-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}20` }}
        >
          <Lightbulb className="w-5 h-5" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="text-[15px] font-bold line-clamp-2" style={{ color: 'var(--foreground)' }}>
            {title}
          </h4>
        </div>

        {/* Arrow */}
        <ChevronRight
          className="w-4 h-4 flex-shrink-0 transition-all opacity-60 group-hover:opacity-100"
          style={{ color: 'var(--foreground-secondary)' }}
        />
      </div>

      {/* Members and progress */}
      <div className="ml-2 space-y-2">
        {/* Member avatars */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {memberAvatars.slice(0, 4).map((avatar, index) => (
              <img
                key={index}
                src={avatar}
                alt=""
                className="w-6 h-6 rounded-full border-2 border-[var(--surface)]"
              />
            ))}
          </div>
          <span
            className="text-xs font-['IBM_Plex_Mono']"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            {memberCount} members
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px]" style={{ color: 'var(--foreground-secondary)' }}>
              Progress
            </span>
            <span
              className="text-xs font-['IBM_Plex_Mono'] font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              {progress}%
            </span>
          </div>
          <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(to right, ${color}, ${color}80)`,
              }}
            />
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--foreground-secondary)' }}>
            Status:
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
            style={{
              background: `${statusColors[status]}20`,
              color: statusColors[status],
            }}
          >
            {status}
          </span>
        </div>
      </div>
    </button>
  );
}
