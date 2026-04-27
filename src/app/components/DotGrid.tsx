import { useId } from 'react';

interface DotGridProps {
  className?: string;
  opacity?: number;
}

export function DotGrid({ className, opacity = 0.12 }: DotGridProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className={`fixed inset-0 pointer-events-none z-0 ${className ?? ''}`}>
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={uid} x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-400 dark:text-purple-300" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${uid})`} opacity={opacity} />
      </svg>
    </div>
  );
}
