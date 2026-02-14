import { useMemo } from 'react';
import { ArrowLeft, Clock, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { toolkitService } from '../services/toolkitService';
import { ToolSubmission } from '../types/toolkit';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface MySubmissionsScreenProps {
  onBack: () => void;
}

function SubmissionCard({ submission }: { submission: ToolSubmission }) {
  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      label: 'Pending Review',
    },
    approved: {
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      label: 'Approved',
    },
    rejected: {
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      label: 'Rejected',
    },
  };

  const config = statusConfig[submission.status];
  const StatusIcon = config.icon;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 hover:shadow-md transition-shadow">
      {/* Header with status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">
            {submission.name}
          </h3>
          <a
            href={submission.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1"
          >
            {submission.websiteUrl}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${config.bgColor} border ${config.borderColor}`}
        >
          <StatusIcon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
        {submission.shortDescription}
      </p>

      {/* Categories and tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {submission.categories.map((category) => (
          <Badge key={category} variant="secondary" className="text-xs">
            {category}
          </Badge>
        ))}
        {submission.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs capitalize">
            {tag.replace(/-/g, ' ')}
          </Badge>
        ))}
        {submission.tags.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{submission.tags.length - 3}
          </Badge>
        )}
      </div>

      {/* Rationale */}
      {submission.rationale && (
        <div className="mb-3 p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Why you recommended it:
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{submission.rationale}</p>
        </div>
      )}

      {/* Reviewer notes (if rejected) */}
      {submission.status === 'rejected' && submission.reviewerNotes && (
        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400 mb-1">Reviewer notes:</p>
          <p className="text-sm text-red-700 dark:text-red-300">{submission.reviewerNotes}</p>
        </div>
      )}

      {/* Footer with dates */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-zinc-800">
        <span>Submitted {formatDate(submission.createdAt)}</span>
        {submission.reviewedAt && (
          <span>Reviewed {formatDate(submission.reviewedAt)}</span>
        )}
      </div>
    </div>
  );
}

export function MySubmissionsScreen({ onBack }: MySubmissionsScreenProps) {
  // Get current user
  const userData = localStorage.getItem('citinet-user-data');
  const user = userData ? JSON.parse(userData) : null;
  const userId = user?.displayName || 'anonymous';

  // Get user's submissions
  const submissions = useMemo(
    () => toolkitService.getUserSubmissions(userId),
    [userId]
  );

  // Sort by date (newest first)
  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [submissions]
  );

  const stats = useMemo(() => {
    return {
      total: submissions.length,
      pending: submissions.filter((s) => s.status === 'pending').length,
      approved: submissions.filter((s) => s.status === 'approved').length,
      rejected: submissions.filter((s) => s.status === 'rejected').length,
    };
  }, [submissions]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-900 dark:text-white" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                My Submissions
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Track the status of your tool submissions
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        {/* Stats */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats.total}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Total</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 p-4">
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                {stats.pending}
              </div>
              <div className="text-xs text-yellow-600 dark:text-yellow-500">Pending</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {stats.approved}
              </div>
              <div className="text-xs text-green-600 dark:text-green-500">Approved</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-4">
              <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                {stats.rejected}
              </div>
              <div className="text-xs text-red-600 dark:text-red-500">Rejected</div>
            </div>
          </div>
        )}

        {/* Submissions list */}
        {sortedSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              No submissions yet
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Recommend tools to help your community discover people-first alternatives.
            </p>
            <Button onClick={onBack}>
              Browse Discover
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedSubmissions.map((submission) => (
              <SubmissionCard key={submission.id} submission={submission} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
