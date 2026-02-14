import { useState, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { toolkitService } from '../services/toolkitService';
import { ToolSubmission } from '../types/toolkit';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Label } from './ui/label';

interface ModerationQueueScreenProps {
  onBack: () => void;
}

function ReviewModal({
  submission,
  action,
  onClose,
  onConfirm,
}: {
  submission: ToolSubmission;
  action: 'approve' | 'reject';
  onClose: () => void;
  onConfirm: (notes?: string) => void;
}) {
  const [notes, setNotes] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === 'approve' ? 'Approve Tool' : 'Reject Submission'}
          </DialogTitle>
          <DialogDescription>
            {action === 'approve'
              ? 'This tool will be published to Discover immediately.'
              : 'The submitter will be notified of the rejection.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-lg">
            <h3 className="font-bold text-slate-900 dark:text-white mb-2">
              {submission.name}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {submission.shortDescription}
            </p>
          </div>

          {action === 'reject' && (
            <div>
              <Label htmlFor="notes">Rejection Notes (Optional)</Label>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                Provide feedback to help the submitter improve their recommendation
              </p>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Description needs more detail, URL is invalid, etc."
                rows={3}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm(notes || undefined)}
              className="flex-1"
              variant={action === 'reject' ? 'destructive' : 'default'}
            >
              {action === 'approve' ? 'Approve & Publish' : 'Reject'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SubmissionReviewCard({ submission, onReview }: { 
  submission: ToolSubmission;
  onReview: () => void;
}) {
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const handleApprove = () => {
    const userData = localStorage.getItem('citinet-user-data');
    const user = userData ? JSON.parse(userData) : null;
    const reviewerId = user?.displayName || 'moderator';
    const reviewerName = user?.displayName || 'Moderator';

    toolkitService.approveSubmission(submission.id, reviewerId, reviewerName);
    setShowApproveModal(false);
    onReview();
  };

  const handleReject = (notes?: string) => {
    const userData = localStorage.getItem('citinet-user-data');
    const user = userData ? JSON.parse(userData) : null;
    const reviewerId = user?.displayName || 'moderator';
    const reviewerName = user?.displayName || 'Moderator';

    toolkitService.rejectSubmission(submission.id, reviewerId, reviewerName, notes);
    setShowRejectModal(false);
    onReview();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
        {/* Header */}
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
        </div>

        {/* Description */}
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
          {submission.shortDescription}
        </p>

        {/* Categories and tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {submission.categories.map((category) => (
            <Badge key={category} variant="secondary" className="text-xs">
              {category}
            </Badge>
          ))}
          {submission.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs capitalize">
              {tag.replace(/-/g, ' ')}
            </Badge>
          ))}
        </div>

        {/* Rationale */}
        {submission.rationale && (
          <div className="mb-3 p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Why they recommended it:
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300 italic">
              "{submission.rationale}"
            </p>
          </div>
        )}

        {/* Submission metadata */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-4 pb-3 border-b border-slate-200 dark:border-zinc-800">
          <span>
            Submitted by <strong>{submission.submittedByName}</strong>
          </span>
          <span>{formatDate(submission.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowRejectModal(true)}
            className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </Button>
          <Button
            onClick={() => setShowApproveModal(true)}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approve & Publish
          </Button>
        </div>
      </div>

      {showApproveModal && (
        <ReviewModal
          submission={submission}
          action="approve"
          onClose={() => setShowApproveModal(false)}
          onConfirm={handleApprove}
        />
      )}

      {showRejectModal && (
        <ReviewModal
          submission={submission}
          action="reject"
          onClose={() => setShowRejectModal(false)}
          onConfirm={handleReject}
        />
      )}
    </>
  );
}

export function ModerationQueueScreen({ onBack }: ModerationQueueScreenProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Get pending submissions
  const pendingSubmissions = useMemo(
    () => toolkitService.getPendingSubmissions(),
    [refreshKey]
  );

  // Sort by date (oldest first for FIFO review)
  const sortedSubmissions = useMemo(
    () => [...pendingSubmissions].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
    [pendingSubmissions]
  );

  const handleReview = () => {
    // Trigger refresh
    setRefreshKey((prev) => prev + 1);
  };

  // Simple admin check (TODO: replace with real role system)
  // For now, allow access in development mode
  const isAdmin = true; // TODO: Implement role-based access control

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Access Denied
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            You don't have permission to access the moderation queue.
          </p>
          <Button onClick={onBack}>Go Back</Button>
        </div>
      </div>
    );
  }

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
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Moderation Queue
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Review and approve community tool submissions
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {pendingSubmissions.length} pending
            </Badge>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        {sortedSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              All caught up!
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              There are no pending tool submissions to review.
            </p>
            <Button onClick={onBack}>Back to Discover</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedSubmissions.map((submission) => (
              <SubmissionReviewCard
                key={submission.id}
                submission={submission}
                onReview={handleReview}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
