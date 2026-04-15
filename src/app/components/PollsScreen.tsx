import { useState, useEffect, useCallback } from 'react';
import { Vote, Plus, X, Check, Lock, RefreshCw, Loader2, ChevronLeft, Clock, Link2, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { pollsService } from '../services/pollsService';
import { requestsService, type HubRequest } from '../services/requestsService';
import type { Poll } from '../types/poll';

interface PollsScreenProps {
  onBack: () => void;
}

function timeLeft(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0)  return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return `${Math.floor((diff % 3600000) / 60000)}m left`;
}

export function PollsScreen({ onBack }: PollsScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const tunnelUrl  = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isMod = currentUser?.hubRole === 'admin' || currentUser?.hubRole === 'moderator'
    || currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  const [polls, setPolls]     = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting]   = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPolls, setExpandedPolls] = useState<Set<string>>(new Set());
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | null>(null);

  // Create form
  const [question, setQuestion]   = useState('');
  const [options, setOptions]     = useState(['', '']);
  const [closesAt, setClosesAt]   = useState('');
  const [quorumPct, setQuorumPct] = useState(0);
  const [passPct, setPassPct]     = useState(50);
  const [linkedRequestId, setLinkedRequestId] = useState('');
  const [openRequests, setOpenRequests] = useState<HubRequest[]>([]);
  const [creating, setCreating]   = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await pollsService.list(hubSlug);
    setPolls(data);
    setLoading(false);
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showCreate || !isMod) return;
    requestsService.list(hubSlug).then(reqs =>
      setOpenRequests(reqs.filter(r => !['shipped','declined','approved'].includes(r.status)))
    ).catch(() => {});
  }, [showCreate, isMod, hubSlug]);

  const toggleExpand = (pollId: string) => {
    setExpandedPolls(prev => {
      const next = new Set(prev);
      next.has(pollId) ? next.delete(pollId) : next.add(pollId);
      return next;
    });
  };

  const copyPollLink = (pollId: string) => {
    const link = `${window.location.href.split('#')[0]}#poll=${pollId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopyLinkFeedback(pollId);
      setTimeout(() => setCopyLinkFeedback(null), 2000);
    });
  };

  async function handleVote(poll: Poll, optionIndex: number) {
    if (poll.closed || (poll.closes_at && new Date(poll.closes_at) < new Date())) return;
    setVoting(poll.id);
    const prev = polls;
    setPolls(ps => ps.map(p => {
      if (p.id !== poll.id) return p;
      const newCounts = [...p.vote_counts];
      if (p.my_vote != null) newCounts[p.my_vote] = Math.max(0, newCounts[p.my_vote] - 1);
      newCounts[optionIndex]++;
      const totalDelta = p.my_vote != null ? 0 : 1;
      return { ...p, vote_counts: newCounts, my_vote: optionIndex, total_votes: p.total_votes + totalDelta };
    }));
    try {
      await pollsService.vote(hubSlug, poll.id, optionIndex);
      load();
    } catch {
      setPolls(prev);
    } finally {
      setVoting(null);
    }
  }

  async function handleClose(pollId: string) {
    setClosing(pollId);
    try {
      await pollsService.close(hubSlug, pollId);
      load();
    } catch {}
    setClosing(null);
  }

  async function handleCreate() {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    setCreating(true);
    setCreateError('');
    try {
      await pollsService.create(hubSlug, {
        question:    question.trim(),
        options:     validOptions,
        closes_at:   closesAt || undefined,
        request_id:  linkedRequestId || undefined,
        quorum_pct:  quorumPct,
        pass_pct:    passPct,
      });
      setQuestion(''); setOptions(['', '']); setClosesAt('');
      setQuorumPct(0); setPassPct(50); setLinkedRequestId('');
      setShowCreate(false);
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create poll');
    } finally {
      setCreating(false);
    }
  }

  const activePoll  = polls.filter(p => !p.closed && !(p.closes_at && new Date(p.closes_at) < new Date()));
  const closedPolls = polls.filter(p => p.closed  || (p.closes_at && new Date(p.closes_at) < new Date()));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-20">
      {/* Header */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Vote className="w-5 h-5 text-indigo-500" />
              Community Polls
            </h1>
            <p className="text-xs text-slate-400 dark:text-zinc-500">{polls.length} poll{polls.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={load} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isMod && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> New Poll
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading polls…</span>
          </div>
        ) : polls.length === 0 ? (
          <div className="text-center py-20">
            <Vote className="w-10 h-10 text-slate-200 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400 dark:text-zinc-500">No polls yet</p>
            {isMod && <p className="text-xs text-slate-300 dark:text-zinc-600 mt-1">Create the first poll to get the community voting</p>}
          </div>
        ) : (
          <>
            {activePoll.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3">Open</h2>
                <div className="space-y-3">
                  {activePoll.map(poll => (
                    <PollCard key={poll.id} poll={poll} isMod={isMod}
                      voting={voting === poll.id} closing={closing === poll.id}
                      expanded={expandedPolls.has(poll.id)}
                      onToggleExpand={() => toggleExpand(poll.id)}
                      onVote={idx => handleVote(poll, idx)}
                      onClose={() => handleClose(poll.id)}
                      onCopyLink={() => copyPollLink(poll.id)}
                      copyLinkActive={copyLinkFeedback === poll.id}
                    />
                  ))}
                </div>
              </section>
            )}
            {closedPolls.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3">Closed</h2>
                <div className="space-y-3">
                  {closedPolls.map(poll => (
                    <PollCard key={poll.id} poll={poll} isMod={false}
                      voting={false} closing={false}
                      expanded={expandedPolls.has(poll.id)}
                      onToggleExpand={() => toggleExpand(poll.id)}
                      onVote={() => {}}
                      onClose={() => {}}
                      onCopyLink={() => copyPollLink(poll.id)}
                      copyLinkActive={copyLinkFeedback === poll.id}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Create Poll Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">New Poll</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Question */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Question <span className="text-indigo-400">*</span></label>
                <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
                  placeholder="What should the community decide?"
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-400 resize-none" />
              </div>

              {/* Options */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Options (2–5) <span className="text-indigo-400">*</span></label>
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={opt} onChange={e => setOptions(opts => opts.map((o, j) => j === i ? e.target.value : o))}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-400" />
                      {options.length > 2 && (
                        <button onClick={() => setOptions(opts => opts.filter((_, j) => j !== i))} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 5 && (
                    <button onClick={() => setOptions(opts => [...opts, ''])} className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-400 font-medium transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add option
                    </button>
                  )}
                </div>
              </div>

              {/* Pass criteria */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Quorum <span className="text-slate-300 dark:text-zinc-600 font-normal">(% of members)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100} value={quorumPct}
                      onChange={e => setQuorumPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400" />
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-300 dark:text-zinc-600 mt-1">0 = no quorum</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Pass threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={100} value={passPct}
                      onChange={e => setPassPct(Math.min(100, Math.max(1, parseInt(e.target.value) || 50)))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400" />
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-300 dark:text-zinc-600 mt-1">of votes cast</p>
                </div>
              </div>

              {/* Link to request */}
              {openRequests.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    <Link2 className="w-3 h-3 inline mr-1" />
                    Link to feature request (optional)
                  </label>
                  <select value={linkedRequestId} onChange={e => setLinkedRequestId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400">
                    <option value="">— None —</option>
                    {openRequests.map(r => (
                      <option key={r.id} value={r.id}>{r.problem.slice(0, 80)}{r.problem.length > 80 ? '…' : ''}</option>
                    ))}
                  </select>
                  {linkedRequestId && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                      If this poll passes, the linked request will auto-advance to "Approved"
                    </p>
                  )}
                </div>
              )}

              {/* Close date */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Close date (optional)</label>
                <input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400" />
              </div>

              {createError && <p className="text-xs text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{createError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-zinc-800">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={!question.trim() || options.filter(o => o.trim()).length < 2 || creating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : 'Create Poll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PollCardProps {
  poll:              Poll;
  isMod:             boolean;
  voting:            boolean;
  closing:           boolean;
  expanded:          boolean;
  onToggleExpand:    () => void;
  onVote:            (idx: number) => void;
  onClose:           () => void;
  onCopyLink:        () => void;
  copyLinkActive:    boolean;
}

function PollCard({
  poll, isMod, voting, closing, expanded, onToggleExpand, onVote, onClose, onCopyLink, copyLinkActive
}: PollCardProps) {
  const isClosed   = poll.closed || (poll.closes_at ? new Date(poll.closes_at) < new Date() : false);
  const hasVoted   = poll.my_vote != null;
  const showBars   = hasVoted || isClosed;
  const timeStr    = timeLeft(poll.closes_at);
  const totalVotes = poll.total_votes;
  const quorumMet  = poll.quorum_pct === 0 || (poll.member_count > 0 && totalVotes >= Math.ceil(poll.member_count * poll.quorum_pct / 100));
  const quorumPct  = poll.member_count > 0 ? Math.round((totalVotes / poll.member_count) * 100) : 0;

  // Compact view for closed OR not expanded
  const showCompact = !expanded && !isClosed;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden transition-all">
      {showCompact ? (
        // ── Compact header (closed polls are always expanded) ──
        <button
          onClick={onToggleExpand}
          className="w-full px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between gap-3"
        >
          <div className="flex-1 min-w-0 text-left">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{poll.question}</h3>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{totalVotes}</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">votes</div>
            </div>
            {timeStr && (
              <div className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span className="whitespace-nowrap">{timeStr}</span>
              </div>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </button>
      ) : (
        // ── Full expanded view ──
        <div className="p-5 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">{poll.question}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {isClosed ? (
                <div className="flex items-center gap-2">
                  {poll.passed === true ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
                    </span>
                  ) : poll.passed === false ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm">
                      <XCircle className="w-3.5 h-3.5" /> FAILED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400">
                      <Lock className="w-3 h-3" /> Closed
                    </span>
                  )}
                </div>
              ) : timeStr ? (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full">
                  <Clock className="w-3 h-3" /> {timeStr}
                </span>
              ) : null}
              {isMod && !isClosed && (
                <button
                  onClick={onClose}
                  disabled={closing}
                  className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors px-2 py-1"
                >
                  {closing ? '…' : 'Close'}
                </button>
              )}
              <button
                onClick={onCopyLink}
                className={`text-xs font-medium transition-all px-2 py-1 rounded ${
                  copyLinkActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="Copy link to poll"
              >
                {copyLinkActive ? '✓ Copied' : 'Share'}
              </button>
              {!isClosed && (
                <button
                  onClick={onToggleExpand}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                >
                  <ChevronDown className="w-4 h-4 rotate-180" />
                </button>
              )}
            </div>
          </div>

          {/* Linked request chip */}
          {poll.request_problem && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-lg w-fit max-w-full">
              <Link2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{poll.request_problem}</span>
            </div>
          )}

          {/* Vote options */}
          <div className="space-y-2">
            {poll.options.map((opt, i) => {
              const count    = poll.vote_counts[i] ?? 0;
              const pct      = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
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
                      isMyVote ? 'border-indigo-400/70 dark:border-indigo-500/50' : 'border-slate-200 dark:border-zinc-700'
                    } ${!showBars ? 'bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700' : ''}`}
                  >
                    <span className={`text-sm font-medium ${isMyVote ? 'text-indigo-700 dark:text-indigo-300 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {opt}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {showBars && (
                        <span className={`text-xs font-bold transition-colors ${atThreshold ? 'text-emerald-600 dark:text-emerald-400' : isMyVote ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-zinc-400'}`}>
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
          <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
              <span className="font-medium">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}{poll.member_count > 0 ? ` · ${quorumPct}% of members` : ''}</span>
              {poll.created_by_username && <span className="text-slate-400 dark:text-zinc-500">by {poll.created_by_username}</span>}
            </div>

            {/* Quorum progress bar */}
            {poll.quorum_pct > 0 && (
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-500 mb-1.5">
                  <span className="font-medium">Quorum {quorumMet ? <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">✓ met</span> : `${poll.quorum_pct}% needed`}</span>
                  <span>{Math.ceil(poll.member_count * poll.quorum_pct / 100)} votes needed</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${quorumMet ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-indigo-400 to-indigo-500'}`}
                    style={{ width: `${Math.min(100, quorumPct / poll.quorum_pct * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pass threshold note */}
            {!isClosed && !hasVoted && poll.pass_pct !== 50 && (
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 italic">
                Passes when a single option reaches {poll.pass_pct}% of votes cast
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
