import { useState, useRef, useEffect, useCallback } from 'react';
import { DotGrid } from './DotGrid';
import { ArrowLeft, Bot, Send, Square, Info, Plus, MessageSquare, Trash2, X, Clock } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { aiService, type ChatMessage } from '../services/aiService';
import { MarkdownText } from '../utils/renderMarkdown';

interface AssistantScreenProps {
  onBack: () => void;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STARTERS = [
  "What's been going on in the community lately?",
  "Summarize the recent discussions for me.",
  "What is this hub about?",
];

function storageKey(hubSlug: string) {
  return `citinet-ai-${hubSlug}`;
}

function loadConvos(hubSlug: string): Conversation[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(hubSlug)) || '[]');
  } catch { return []; }
}

function saveConvos(hubSlug: string, convos: Conversation[]) {
  localStorage.setItem(storageKey(hubSlug), JSON.stringify(convos));
}

function groupByDate(convos: Conversation[]) {
  const now = Date.now();
  const day = 86_400_000;
  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today',     items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier',   items: [] },
  ];
  for (const c of convos) {
    const age = now - c.updatedAt;
    if (age < day)         groups[0].items.push(c);
    else if (age < 2*day)  groups[1].items.push(c);
    else if (age < 7*day)  groups[2].items.push(c);
    else                   groups[3].items.push(c);
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
          style={{ animationDelay: `${i * 120}ms`, animationDuration: '700ms' }}
        />
      ))}
    </div>
  );
}

export function AssistantScreen({ onBack }: AssistantScreenProps) {
  const { currentHub } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const [convos, setConvos] = useState<Conversation[]>(() => loadConvos(hubSlug));
  const [activeId, setActiveId] = useState<string | null>(() => loadConvos(hubSlug)[0]?.id ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConvo = convos.find(c => c.id === activeId) ?? null;
  const messages = activeConvo?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const updateConvo = useCallback((id: string, updater: (c: Conversation) => Conversation) => {
    setConvos(prev => {
      const next = prev.map(c => c.id === id ? updater(c) : c);
      saveConvos(hubSlug, next);
      return next;
    });
  }, [hubSlug]);

  function newConversation() {
    const id = crypto.randomUUID();
    const convo: Conversation = {
      id, title: 'New conversation',
      createdAt: Date.now(), updatedAt: Date.now(), messages: [],
    };
    setConvos(prev => { const next = [convo, ...prev]; saveConvos(hubSlug, next); return next; });
    setActiveId(id);
    setSidebarOpen(false);
    setInput('');
    setError('');
  }

  function selectConvo(id: string) {
    abortRef.current?.abort();
    setThinking(false);
    setStreaming(false);
    setError('');
    setActiveId(id);
    setSidebarOpen(false);
  }

  function deleteConvo(id: string) {
    setConvos(prev => { const next = prev.filter(c => c.id !== id); saveConvos(hubSlug, next); return next; });
    if (activeId === id) setActiveId(convos.find(c => c.id !== id)?.id ?? null);
    setDeleteId(null);
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming || thinking) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setError('');

    // Create conversation on first message
    let currentId = activeId;
    if (!currentId || !convos.find(c => c.id === currentId)) {
      currentId = crypto.randomUUID();
      const title = content.length > 45 ? content.slice(0, 42) + '…' : content;
      const convo: Conversation = {
        id: currentId, title,
        createdAt: Date.now(), updatedAt: Date.now(), messages: [],
      };
      setConvos(prev => { const next = [convo, ...prev]; saveConvos(hubSlug, next); return next; });
      setActiveId(currentId);
    }

    const finalId = currentId;
    const userMsg: ChatMessage = { role: 'user', content };

    // Title from first message if still default
    updateConvo(finalId, c => ({
      ...c,
      title: c.messages.length === 0 ? (content.length > 45 ? content.slice(0, 42) + '…' : content) : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg, { role: 'assistant', content: '' }],
    }));

    const history = [...messages, userMsg];
    setThinking(true);
    let firstChunk = true;

    abortRef.current = aiService.chat(
      hubSlug,
      history,
      (chunk) => {
        if (firstChunk) { firstChunk = false; setThinking(false); setStreaming(true); }
        updateConvo(finalId, c => {
          const msgs = [...c.messages];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + chunk };
          return { ...c, messages: msgs };
        });
      },
      () => { setStreaming(false); setThinking(false); },
      (err) => { setError(err); setStreaming(false); setThinking(false); },
    );
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
    setThinking(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const groups = groupByDate(convos);
  const empty = messages.length === 0;

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

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {convos.length === 0 ? (
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
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/30 items-center justify-center hidden group-hover:flex transition-colors"
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
    </div>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 overflow-hidden relative">

      <DotGrid />

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-60 shrink-0 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800">
        {Sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <button
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
          />
          <div className="fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800 shrink-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Conversations</p>
              <button onClick={() => setSidebarOpen(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {Sidebar}
            </div>
          </div>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Scroll container — header is sticky inside here so messages slide behind it */}
        <div className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 z-10">
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>

            {/* Mobile history toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
              title="Conversation history"
            >
              <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>

            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">Hub Assistant</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{currentHub?.name}</p>
            </div>

            <button
              onClick={newConversation}
              className="md:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
              title="New conversation"
            >
              <Plus className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>

            <button
              onClick={() => setShowPrivacy(v => !v)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
              title="Privacy info"
            >
              <Info className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {showPrivacy && (
            <div className="px-4 pb-3">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-medium">How this works</p>
                <p>Runs entirely on your hub — no data leaves to any cloud AI service.</p>
                <p>Context includes public hub posts and hub info. Private messages are <strong>never</strong> included unless you paste them yourself.</p>
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

            {empty && (
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
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'user' ? msg.content : (
                    msg.content === '' && thinking && i === messages.length - 1
                      ? <ThinkingDots />
                      : <>
                          <MarkdownText content={msg.content} className="text-sm leading-relaxed" />
                          {streaming && i === messages.length - 1 && (
                            <span className="inline-block w-1.5 h-4 bg-violet-500 ml-0.5 rounded-sm animate-pulse align-middle" />
                          )}
                        </>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="flex justify-center">
                <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-800/40">
                  {error}
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

        </div>{/* end scroll container */}

        {/* Input — outside scroll, always pinned to bottom */}
        <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-t border-slate-200/50 dark:border-zinc-800/50 shrink-0">
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
                <button
                  onClick={stop}
                  className="w-10 h-10 rounded-xl bg-rose-500 hover:bg-rose-600 flex items-center justify-center transition-colors shrink-0"
                  title="Stop"
                >
                  <Square className="w-4 h-4 text-white fill-white" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
                  title="Send"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center mt-2">
              Runs on-hub · no cloud · public hub content used as context
            </p>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteId && (
        <>
          <button onClick={() => setDeleteId(null)} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
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
