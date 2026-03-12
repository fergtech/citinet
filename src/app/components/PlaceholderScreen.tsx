import { Construction, X } from 'lucide-react';

interface PlaceholderScreenProps {
  title: string;
  description?: string;
  onBack: () => void;
}

export function PlaceholderScreen({ title, description, onBack }: PlaceholderScreenProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <h2 className="text-card-foreground flex-1">{title}</h2>
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-4xl mx-auto w-full">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center mb-6">
          <Construction className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-card-foreground mb-2">Coming Soon</h3>
        <p className="text-muted-foreground max-w-sm">
          {description || `The ${title} feature is currently under development. Check back soon!`}
        </p>
      </div>
    </div>
  );
}
