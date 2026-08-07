import { useState } from 'react';
import { Clock, XCircle, LogOut, RefreshCw } from 'lucide-react';

interface PendingApprovalScreenProps {
  status: 'pending' | 'rejected';
  hubName: string;
  joinApprovalMode?: 'admin' | 'member_vote';
  onCheckAgain: () => Promise<boolean>;
  onSignOut: () => void;
}

export function PendingApprovalScreen({ status, hubName, joinApprovalMode, onCheckAgain, onSignOut }: PendingApprovalScreenProps) {
  const [checking, setChecking] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);

  const handleCheckAgain = async () => {
    setChecking(true);
    setStillWaiting(false);
    const approved = await onCheckAgain();
    setChecking(false);
    if (!approved) setStillWaiting(true);
  };

  const rejected = status === 'rejected';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${rejected ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600'}`}>
        {rejected ? <XCircle className="w-10 h-10 text-white" /> : <Clock className="w-10 h-10 text-white" />}
      </div>

      <h3 className="text-card-foreground text-lg font-semibold mb-2">
        {rejected ? 'Access request declined' : `Waiting on ${hubName}`}
      </h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        {rejected
          ? "The hub admin declined this account's access request. If you think this is a mistake, reach out to them directly."
          : joinApprovalMode === 'member_vote'
            ? "Your account has been created. Members are voting on your request, not just an admin — check back in a bit."
            : "Your account has been created but needs the hub admin's approval before you can get in. This usually doesn't take long."}
      </p>

      {!rejected && (
        <button
          onClick={handleCheckAgain}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 mb-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking…' : 'Check again'}
        </button>
      )}
      {stillWaiting && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Still waiting on approval.</p>
      )}

      <button
        onClick={onSignOut}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" /> Back to onboarding
      </button>
    </div>
  );
}
