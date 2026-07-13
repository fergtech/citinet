import { useState, useRef, useEffect, useCallback } from 'react';
import { DotGrid } from './DotGrid';
import { ArrowLeft, Bot, Send, Square, Info, Plus, MessageSquare, Trash2, X, Clock, Loader2, Check } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { aiService, type ChatMessage, type ConversationSummary, type PendingAction } from '../services/aiService';
import { MarkdownText } from '../utils/renderMarkdown';
import { SupportLauncher } from './SupportLauncher';

interface AssistantScreenProps {
  onBack: () => void;
}

const STARTERS = [
  "What's been going on in the community lately?",
  "Summarize the recent discussions for me.",
  "What is this hub about?",
];

// ── localStorage migration helpers ───────────────────────
// Reads any conversations left over from the old localStorage approach
// and returns them so we can migrate them to the hub DB on first load.
function drainLocalStorage(hubSlug: string): { title: string; messages: ChatMessage[] }[] {
  try {
    const key = `citinet-ai-${hubSlug}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const convos = JSON.parse(raw);
    if (!Array.isArray(convos) || convos.length === 0) return [];
    localStorage.removeItem(key);
    return convos
      .filter((c: { messages?: ChatMessage[] }) => Array.isArray(c.messages) && c.messages.length > 0)
      .map((c: { title?: string; messages: ChatMessage[] }) => ({ title: c.title || 'Imported conversation', messages: c.messages }));
  } catch { return []; }
}

// ── Date grouping ─────────────────────────────────────────
function groupByDate(convos: ConversationSummary[]) {
  const now = Date.now();
  const day = 86_400_000;
  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today',     items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier',   items: [] },
  ];
  for (const c of convos) {
    const age = now - new Date(c.updated_at).getTime();
    if (age < day)        groups[0].items.push(c);
    else if (age < 2*day) groups[1].items.push(c);
    else if (age < 7*day) groups[2].items.push(c);
    else                  groups[3].items.push(c);
  }
  return groups.filter(g => g.items.length > 0);
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-violet-400 dark:bg-violet-500 animate-bounce"
          // delays removed to avoid inline style lint rule; animation still visible
        />
      ))}
    </div>
  );
}

function ActionConfirmCard({ action, onConfirm, onCancel, confirming }: {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white dark:bg-zinc-900 border border-violet-300 dark:border-violet-700/60 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-700/40">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Ready to {action.preview.label} — does this look right?</p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {action.preview.fields.map(f => (
            <div key={f.key}>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{f.key}</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{f.value}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {confirming ? 'Running…' : `Confirm`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssistantScreen({ onBack }: AssistantScreenProps) {
  const { currentHub } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [convosLoading, setConvosLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [mightNeedAction, setMightNeedAction] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const activeConvoIdRef = useRef<string | null>(null);
  const freshConvos = useRef(new Set<string>()); // convos created locally — skip DB reload
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load conversation list + migrate localStorage ──────
  useEffect(() => {
    if (!hubSlug) return;
    (async () => {
      setConvosLoading(true);
      try {
        // Migrate any old localStorage conversations first
        const legacy = drainLocalStorage(hubSlug);
        for (const lc of legacy) {
          try {
            const created = await aiService.createConversation(hubSlug, lc.title);
            for (const msg of lc.messages) {
              if (msg.content.trim()) {
                await aiService.appendMessage(hubSlug, created.id, msg.role, msg.content);
              }
            }
          } catch { /* skip individual failures */ }
        }

        const list = await aiService.listConversations(hubSlug);
        setConvos(list);
        if (list.length > 0) {
          setActiveId(list[0].id);
        }
      } catch { /* show empty state */ }
      setConvosLoading(false);
    })();
  }, [hubSlug]);

  // ── Load messages when active conversation changes ─────
  useEffect(() => {
    if (!activeId || !hubSlug) { setMessages([]); return; }
    // Skip DB fetch for conversations we just created — messages already set optimistically
    if (freshConvos.current.has(activeId)) {
      freshConvos.current.delete(activeId);
      return;
    }
    activeConvoIdRef.current = activeId;
    setMessagesLoading(true);
    aiService.getConversation(hubSlug, activeId)
      .then(detail => {
        if (activeConvoIdRef.current === detail.id) {
          setMessages(detail.messages);
        }
      })
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [activeId, hubSlug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking, pendingAction]);

  // ── Update sidebar entry title/timestamp locally ───────
  const refreshConvoInList = useCallback((id: string, title?: string) => {
    setConvos(prev => prev.map(c =>
      c.id === id
        ? { ...c, title: title ?? c.title, updated_at: new Date().toISOString() }
        : c
    ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
  }, []);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function newConversation() {
    setActiveId(null);
    setMessages([]);
    setInput('');
    setError('');
    setSidebarOpen(false);
  }

  async function selectConvo(id: string) {
    abortRef.current?.abort();
    setThinking(false);
    setStreaming(false);
    setError('');
    setActiveId(id);
    setSidebarOpen(false);
  }

  async function deleteConvo(id: string) {
    await aiService.deleteConversation(hubSlug, id).catch(() => {});
    setConvos(prev => prev.filter(c => c.id !== id));
    if (activeId === id) {
      const next = convos.find(c => c.id !== id);
      setActiveId(next?.id ?? null);
    }
    setDeleteId(null);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming || thinking) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setError('');

    let currentId = activeId;

    // Create conversation on first message
    if (!currentId) {
      const title = content.length > 45 ? content.slice(0, 42) + '…' : content;
      try {
        const created = await aiService.createConversation(hubSlug, title);
        currentId = created.id;
        freshConvos.current.add(currentId); // prevent useEffect from overwriting optimistic messages
        setActiveId(currentId);
        activeConvoIdRef.current = currentId;
        setConvos(prev => [
          { id: created.id, title, updated_at: new Date().toISOString(), message_count: 0 },
          ...prev,
        ]);
      } catch {
        setError('Could not create conversation');
        return;
      }
    }

    const finalId = currentId;

    // Update title from first message if this is the first exchange
    if (messages.length === 0) {
      const title = content.length > 45 ? content.slice(0, 42) + '…' : content;
      refreshConvoInList(finalId, title);
      aiService.updateConversationTitle(hubSlug, finalId, title).catch(() => {});
    }

    // Optimistic UI
    const userMsg: ChatMessage = { role: 'user', content };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const history = [...messages, userMsg];
    setThinking(true);
    const actionSignals = ['create the post','create a post','write the post','write a post','make the post','make a post','post this','post it','publish this','publish it','share this to the feed','post for me','post on my behalf','create the poll','create a poll','make the poll','make a poll','start a poll','find posts about','search for posts','look up posts about','summarize the thread','summarize the replies'];
    setMightNeedAction(actionSignals.some(s => content.toLowerCase().includes(s)));
    let firstChunk = true;
    let fullResponse = '';

    // Persist user message
    aiService.appendMessage(hubSlug, finalId, 'user', content).catch(() => {});

    abortRef.current = aiService.chat(
      hubSlug,
      history,
      (chunk) => {
        if (firstChunk) { firstChunk = false; setThinking(false); setStreaming(true); }
        fullResponse += chunk;
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: fullResponse };
          return next;
        });
      },
      () => {
        setStreaming(false);
        setThinking(false);
        setMightNeedAction(false);
        refreshConvoInList(finalId);
        // Persist completed assistant message
        if (fullResponse) {
          aiService.appendMessage(hubSlug, finalId, 'assistant', fullResponse).catch(() => {});
        }
      },
      (err) => {
        setError(err);
        setStreaming(false);
        setThinking(false);
        setMightNeedAction(false);
        // Still persist whatever came through
        if (fullResponse) {
          aiService.appendMessage(hubSlug, finalId, 'assistant', fullResponse).catch(() => {});
        }
      },
      (action) => {
        // Action proposal — remove the empty assistant placeholder, show confirm card
        setMessages(prev => prev.slice(0, -1));
        setPendingAction(action);
        setThinking(false);
        setStreaming(false);
      },
    );
  }

  async function handleConfirmAction() {
    if (!pendingAction || !activeId) return;
    setConfirmingAction(true);
    try {
      const result = await aiService.executeAction(hubSlug, pendingAction.tool, pendingAction.args);
      const resultMsg: ChatMessage = { role: 'assistant', content: result };
      setMessages(prev => [...prev, resultMsg]);
      aiService.appendMessage(hubSlug, activeId, 'assistant', result).catch(() => {});
      refreshConvoInList(activeId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
    setPendingAction(null);
    setConfirmingAction(false);
  }

  function handleCancelAction() {
    const cancelMsg: ChatMessage = { role: 'assistant', content: 'No problem — action cancelled.' };
    setMessages(prev => [...prev, cancelMsg]);
    if (activeId) aiService.appendMessage(hubSlug, activeId, 'assistant', cancelMsg.content).catch(() => {});
    setPendingAction(null);
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
    setThinking(false);
    // Remove trailing empty assistant message if nothing was streamed yet
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
      return prev;
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const groups = groupByDate(convos);
  const empty = messages.length === 0 && !messagesLoading;

  const Sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={newConversation}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4 min-h-0">
        {convosLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : convos.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-600 text-center px-3 py-6">No conversations yet</p>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wider px-2 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(c => (
                  <div key={c.id} className="relative group">
                    <button
                      onClick={() => selectConvo(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${
                        c.id === activeId
                          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                      <span className="truncate leading-snug">{c.title}</span>
                    </button>
                    <button
                      onClick={() => setDeleteId(c.id)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/30 items-center justify-center flex md:hidden md:group-hover:flex transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-slate-200/50 dark:border-zinc-800/50">
        <SupportLauncher variant="sidebar" />
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-slate-50 dark:bg-zinc-950 overflow-hidden relative">

      <DotGrid />

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-60 shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-r border-slate-200 dark:border-zinc-800 z-10">
        {Sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <button onClick={() => setSidebarOpen(false)} title="Close history" aria-label="Close history" className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden" />
          <div className="fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800 shrink-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Conversations</p>
              <button onClick={() => setSidebarOpen(false)} title="Close" aria-label="Close" className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{Sidebar}</div>
          </div>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10">

        {/* Scroll container — header sticky inside so messages slide behind it */}
        <div className="flex-1 overflow-y-auto">

          {/* Header */}
          <div className="sticky top-0 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 z-10">
            <div className="px-4 py-3 flex items-center gap-3">
              <button onClick={onBack} title="Back" aria-label="Back" className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
              <button onClick={() => setSidebarOpen(true)} className="md:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors" title="History">
                <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">Hub Assistant</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{currentHub?.name}</p>
              </div>
              <button onClick={newConversation} className="md:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors" title="New">
                <Plus className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
              <button onClick={() => setShowPrivacy(v => !v)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors" title="Privacy info">
                <Info className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {showPrivacy && (
              <div className="px-4 pb-3">
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-medium">How this works</p>
                  <p>Runs entirely on your hub — no data leaves to any cloud AI service.</p>
                  <p>Conversations are stored on your hub so your history follows your account across any device or origin.</p>
                  <p>Private messages are <strong>never</strong> included unless you paste them yourself.</p>
                </div>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

            {messagesLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : empty ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">Hub Assistant</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Powered by your hub. Knows your community.</p>
                </div>
                <div className="w-full space-y-2">
                  {STARTERS.map(s => (
                    <button key={s} onClick={() => send(s)} className="w-full text-left px-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.filter((msg, i) =>
                // Skip empty assistant messages that aren't the active thinking turn
                !(msg.role === 'assistant' && !msg.content && !(thinking && i === messages.length - 1))
              ).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'
                  }`}>
                    {msg.role === 'user' ? msg.content : (
                      msg.content === '' && thinking && i === messages.length - 1
                        ? <div className="space-y-1.5">
                            <ThinkingDots />
                            {mightNeedAction && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">Working on it…</p>
                            )}
                          </div>
                        : <>
                            <MarkdownText content={msg.content} className="text-sm leading-relaxed" />
                            {streaming && i === messages.length - 1 && (
                              <span className="inline-block w-1.5 h-4 bg-violet-500 ml-0.5 rounded-sm animate-pulse align-middle" />
                            )}
                          </>
                    )}
                  </div>
                </div>
              ))
            )}

            {error && (
              <div className="flex justify-center">
                <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-800/40">{error}</p>
              </div>
            )}

            {pendingAction && (
              <ActionConfirmCard
                action={pendingAction}
                onConfirm={handleConfirmAction}
                onCancel={handleCancelAction}
                confirming={confirmingAction}
              />
            )}

            <div ref={bottomRef} />
          </div>
        </div>{/* end scroll container */}

        {/* Input — outside scroll, always pinned to bottom */}
        <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-t border-slate-200/50 dark:border-zinc-800/50 shrink-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(); }}
                onKeyDown={handleKey}
                placeholder="Ask anything about your community…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 dark:focus:border-violet-600 transition-all overflow-hidden"
                disabled={thinking || streaming}
              />
              {thinking || streaming ? (
                <button onClick={stop} className="w-10 h-10 rounded-xl bg-rose-500 hover:bg-rose-600 flex items-center justify-center transition-colors shrink-0" title="Stop">
                  <Square className="w-4 h-4 text-white fill-white" />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim()} className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0" title="Send">
                  <Send className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center mt-2">
              Runs on-hub · no cloud · history synced to your account
            </p>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteId && (
        <>
          <button onClick={() => setDeleteId(null)} title="Cancel delete" aria-label="Cancel delete" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 w-full max-w-xs space-y-4 shadow-xl">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Delete conversation?</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">This can't be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteId(null)} className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
                <button onClick={() => deleteConvo(deleteId)} className="flex-1 px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition-colors">Delete</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
