import { Calendar, ChevronRight } from 'lucide-react';

interface EventCardProps {
  title: string;
  date: string;
  time: string;
  location: string;
  color: string;
  onClick?: () => void;
}

export function EventCard({ title, date, time, location, color, onClick }: EventCardProps) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-start gap-3 p-4 rounded-[10px] transition-all hover:shadow-[var(--shadow-elevated)] text-left"
      style={{
        boxShadow: 'var(--shadow-base)',
        background: 'var(--surface)',
        border: `1px solid var(--border)`,
      }}
    >
      {/* Icon container */}
      <div
        className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}
      >
        <Calendar className="w-6 h-6" style={{ color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <h4 className="text-[15px] font-bold mb-1 line-clamp-1" style={{ color: 'var(--foreground)' }}>
          {title}
        </h4>

        {/* Date & Time */}
        <p
          className="text-[13px] font-['IBM_Plex_Mono'] mb-1"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          {date} · {time}
        </p>

        {/* Location */}
        <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
          {location}
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight
        className="w-4 h-4 flex-shrink-0 transition-all opacity-60 group-hover:opacity-100"
        style={{ color: 'var(--foreground-secondary)' }}
      />
    </button>
  );
}
