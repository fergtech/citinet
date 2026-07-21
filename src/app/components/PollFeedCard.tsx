import { Vote, Check, Lock, Loader2, Clock, Link2, CheckCircle2, XCircle, Pencil, RotateCcw } from 'lucide-react';
import type { Poll } from '../types/poll';

export function timeLeft(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return `${Math.floor((diff % 3600000) / 60000)}m left`;
}

function formatTimestamp(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }
const AVATAR_COLORS = [
  'from-indigo-500 to-purple-600', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-500',
];
function avatarColorClass(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface PollFeedCardProps {
  poll: Poll;
  isMod: boolean;
  voting: boolean;
  closing: boolean;
  reopening: boolean;
  onVote: (idx: number) => void;
  onClose: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onCopyLink: () => void;
  copyLinkActive: boolean;
}

export function PollFeedCard({ poll, isMod, voting, closing, reopening, onVote, onClose, onReopen, onEdit, onCopyLink, copyLinkActive }: PollFeedCardProps) {
  const isClosed = poll.closed || (poll.closes_at ? new Date(poll.closes_at) < new Date() : false);
  const hasVoted = poll.my_vote != null;
  const showBars = hasVoted || isClosed;
  const timeStr = timeLeft(poll.closes_at);
  const totalVotes = poll.total_votes;
  const quorumMet = poll.quorum_pct === 0 || (poll.member_count > 0 && totalVotes >= Math.ceil(poll.member_count * poll.quorum_pct / 100));
  const quorumPct = poll.member_count > 0 ? Math.round((totalVotes / poll.member_count) * 100) : 0;
  const authorName = poll.created_by_username ?? 'Hub Team';

  return (
    <div className="cn-glass rounded-2xl overflow-hidden">
      <div className="p-4">
        {/* Header: avatar + author + category + time — matches feed post cards */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColorClass(authorName)} flex items-center justify-center text-white font-semibold text-sm shrink-0 select-none`}>
            {getInitials(authorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold cn-text-1">{authorName}</span>
              <span className="cn-mono text-[11px] cn-text-4">· {formatTimestamp(poll.created_at)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Vote className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
              <span className="text-[11px] cn-text-3">Poll</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isClosed ? (
              poll.passed === true ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
                </span>
              ) : poll.passed === false ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                  <XCircle className="w-3.5 h-3.5" /> FAILED
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full cn-surface-2 cn-text-3">
                  <Lock className="w-3 h-3" /> Closed
                </span>
              )
            ) : timeStr ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/20 rounded-full">
                <Clock className="w-3 h-3" /> {timeStr}
              </span>
            ) : null}
          </div>
        </div>

        {/* Question */}
        <h3 className="text-sm font-semibold cn-text-1 leading-snug mb-3">{poll.question}</h3>

        {/* Linked request chip */}
        {poll.request_problem && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-lg w-fit max-w-full mb-3">
            <Link2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{poll.request_problem}</span>
          </div>
        )}

        {/* Vote options */}
        <div className="space-y-2">
          {poll.options.map((opt, i) => {
            const count = poll.vote_counts[i] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMyVote = poll.my_vote === i;
            const isWinner = isClosed && count === Math.max(...poll.vote_counts) && count > 0;
            const atThreshold = showBars && pct >= poll.pass_pct;

            return (
              <button
                key={i}
                onClick={() => !isClosed && !voting && onVote(i)}
                disabled={isClosed || voting}
                className={`w-full relative text-left rounded-xl overflow-hidden transition-all ${isClosed || hasVoted ? 'cursor-default' : 'hover:shadow-md cursor-pointer'} ${isMyVote ? 'ring-2 ring-indigo-500/50' : ''}`}
              >
                {showBars && (
                  <div
                    className={`absolute inset-0 transition-all duration-700 ${
                      isWinner ? 'bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-900/20'
                      : isMyVote ? 'bg-gradient-to-r from-indigo-50 to-indigo-50/50 dark:from-indigo-900/30 dark:to-indigo-900/20'
                      : 'bg-gradient-to-r from-slate-50 to-slate-50/50 dark:from-zinc-800 dark:to-zinc-800/50'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <div
                  className={`relative flex items-center justify-between px-3.5 py-3 rounded-xl border transition-all ${
                    isMyVote ? 'border-indigo-400/70 dark:border-indigo-500/50' : 'cn-border'
                  } ${!showBars ? 'cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5' : ''}`}
                >
                  <span className={`text-sm font-medium ${isMyVote ? 'text-indigo-700 dark:text-indigo-300 font-semibold' : 'cn-text-2'}`}>
                    {opt}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {showBars && (
                      <span className={`text-xs font-bold transition-colors ${atThreshold ? 'text-emerald-600 dark:text-emerald-400' : isMyVote ? 'text-indigo-600 dark:text-indigo-400' : 'cn-text-4'}`}>
                        {pct}%
                      </span>
                    )}
                    {isMyVote && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                    {voting && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer: vote count + quorum bar */}
        <div className="mt-4 space-y-3 pt-3 border-t cn-border">
          <div className="flex items-center justify-between text-xs cn-text-3">
            <span className="font-medium">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}{poll.member_count > 0 ? ` · ${quorumPct}% of members` : ''}</span>
            {!isClosed && !hasVoted && poll.pass_pct !== 50 && (
              <span className="cn-text-4 italic">Passes at {poll.pass_pct}%</span>
            )}
          </div>

          {poll.quorum_pct > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] cn-text-4 mb-1.5">
                <span className="font-medium">Quorum {quorumMet ? <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">✓ met</span> : `${poll.quorum_pct}% needed`}</span>
                <span>{Math.ceil(poll.member_count * poll.quorum_pct / 100)} votes needed</span>
              </div>
              <div className="h-2 cn-surface-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${quorumMet ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-indigo-400 to-indigo-500'}`}
                  style={{ width: `${Math.min(100, quorumPct / poll.quorum_pct * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reaction-bar-style footer: share + mod close, matching PostCard's action row */}
      <div className="flex items-center gap-1 px-4 pb-3 pt-2 border-t cn-border">
        <button
          onClick={onCopyLink}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
            copyLinkActive ? 'text-emerald-600 dark:text-emerald-400' : 'cn-text-4 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          {copyLinkActive ? '✓ Copied' : 'Share'}
        </button>
        <div className="flex-1" />
        {isMod && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-text-4 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {isMod && (isClosed ? (
          <button
            onClick={onReopen}
            disabled={reopening}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-text-4 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold"
          >
            {reopening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RotateCcw className="w-3.5 h-3.5" /> Reopen</>}
          </button>
        ) : (
          <button
            onClick={onClose}
            disabled={closing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold"
          >
            {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Close poll'}
          </button>
        ))}
      </div>
    </div>
  );
}
