import { useState } from 'react';
import { X, CheckCircle, Sparkles } from 'lucide-react';
import { requestsService, type RequestData, type RequestScope, type RequestPriority } from '../services/requestsService';

interface FeatureRequestModalProps {
  hubSlug: string;
  onClose: () => void;
}

export function FeatureRequestModal({ hubSlug, onClose }: FeatureRequestModalProps) {
  const [problem, setProblem]               = useState('');
  const [whoItHelps, setWhoItHelps]         = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [dataInvolved, setDataInvolved]     = useState<RequestData>('none');
  const [scope, setScope]                   = useState<RequestScope>('hub_only');
  const [priority, setPriority]             = useState<RequestPriority>('nice_to_have');
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  async function handleSubmit() {
    if (!problem.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestsService.submit(hubSlug, {
        problem:         problem.trim(),
        whoItHelps:      whoItHelps.trim() || undefined,
        expectedOutcome: expectedOutcome.trim() || undefined,
        dataInvolved,
        scope,
        priority,
        type:            'feature',
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Suggest a Feature</h2>
              <p className="text-xs text-white/50">Help shape what gets built next</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white mb-1">Request submitted</h3>
              <p className="text-sm text-white/50 max-w-xs">
                Your suggestion has been sent to the hub admin. They'll review it and keep things moving.
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <div className="overflow-y-auto max-h-[70vh]">
            <div className="px-6 py-5 space-y-5">

              {/* Problem — required */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  What problem should this solve? <span className="text-indigo-400">*</span>
                </label>
                <textarea
                  value={problem}
                  onChange={e => setProblem(e.target.value)}
                  rows={3}
                  placeholder="Describe the friction or gap you're running into..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/60 resize-none transition-colors"
                />
              </div>

              {/* Who it helps */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  Who does this help?
                </label>
                <input
                  type="text"
                  value={whoItHelps}
                  onChange={e => setWhoItHelps(e.target.value)}
                  placeholder="e.g. All members, admins, newcomers..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
              </div>

              {/* Expected outcome */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  What would success look like?
                </label>
                <textarea
                  value={expectedOutcome}
                  onChange={e => setExpectedOutcome(e.target.value)}
                  rows={2}
                  placeholder="Describe the outcome if this feature existed..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/60 resize-none transition-colors"
                />
              </div>

              {/* Row: Data + Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Data involved</label>
                  <select
                    value={dataInvolved}
                    onChange={e => setDataInvolved(e.target.value as RequestData)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-colors"
                  >
                    <option value="none">None</option>
                    <option value="public">Public data</option>
                    <option value="private">Private / sensitive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as RequestPriority)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-colors"
                  >
                    <option value="nice_to_have">Nice to have</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-2">Scope</label>
                <div className="flex gap-3">
                  {([
                    { value: 'hub_only',  label: 'This hub only',  desc: 'Local improvement' },
                    { value: 'all_hubs',  label: 'All hubs',       desc: 'Network-wide feature' },
                  ] as { value: RequestScope; label: string; desc: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setScope(opt.value)}
                      className={`flex-1 text-left px-3.5 py-2.5 rounded-lg border transition-all ${
                        scope === opt.value
                          ? 'border-indigo-500/60 bg-indigo-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-medium">{opt.label}</div>
                      <div className="text-[10px] text-white/35 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-zinc-900/80">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!problem.trim() || submitting}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Submit suggestion'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
