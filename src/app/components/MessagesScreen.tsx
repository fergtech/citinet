import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Send, ArrowLeft, Users, Loader2, AlertCircle,
  RefreshCw, Plus, MessageCircle, X, Check,
  Paperclip, File as FileIcon, Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubConversation, HubMessage, HubMember } from '../types/hub';

interface MessagesScreenProps {
  onBack: () => void;
}

/** Staged file before sending */
interface StagedFile {
  file: File;
  previewUrl?: string;        // object URL for local preview
  type: 'image' | 'video' | 'audio' | 'file';
}

// ── helpers ──────────────────────────────────────────────

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'from-purple-500 to-indigo-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-violet-500 to-purple-500',
    'from-sky-500 to-blue-500',
    'from-lime-500 to-green-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Display name for a conversation */
function convoDisplayName(c: HubConversation, myUserId?: string): string {
  if (c.name) return c.name;
  if (c.kind === 'dm') {
    const other = c.members.find(m => m.user_id !== myUserId);
    return other?.username || 'Direct Message';
  }
  const names = c.members.slice(0, 3).map(m => m.username);
  return names.join(', ') || 'Group Chat';
}

const POLL_INTERVAL = 10_000;

/** Classify a file by its MIME type */
function classifyFile(file: File): 'image' | 'video' | 'audio' | 'file' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Video extensions for fallback detection */
const VIDEO_EXTS = new Set(['mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv', 'ogv', '3gp']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']);

/** Classify an attachment by MIME, with filename fallback */
function classifyMime(mime?: string, fileName?: string): 'image' | 'video' | 'audio' | 'file' {
  if (mime && mime !== 'application/octet-stream') {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
  }
  // Fallback: check file extension
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext && IMAGE_EXTS.has(ext)) return 'image';
    if (ext && VIDEO_EXTS.has(ext)) return 'video';
    if (ext && AUDIO_EXTS.has(ext)) return 'audio';
  }
  if (mime) {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
  }
  return 'file';
}

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/** Renders an image/video fetched with auth headers as a blob URL */
function AuthMedia({ slug, fileName, mimeType, alt, className, onClick }: {
  slug: string;
  fileName: string;
  mimeType: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    hubService.fetchFileBlob(slug, fileName)
      .then(url => { revoke = url; setBlobUrl(url); })
      .catch(() => setError(true));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [slug, fileName]);

  if (error) {
    return (
      <div className={`flex items-center gap-2 bg-slate-100 dark:bg-zinc-700 rounded-lg px-3 py-2 ${className || ''}`}>
        <FileIcon className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500">{fileName}</span>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 dark:bg-zinc-700 rounded-lg min-w-[80px] min-h-[60px] ${className || ''}`}>
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
      </div>
    );
  }

  const kind = classifyMime(mimeType, fileName);
  if (kind === 'video') {
    return <video src={blobUrl} controls className={className || ''} />;
  }
  if (kind === 'audio') {
    return (
      <div className="flex flex-col gap-1 bg-slate-100 dark:bg-zinc-700 rounded-lg px-3 py-2 min-w-[220px]">
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{fileName}</span>
        <audio src={blobUrl} controls className="w-full h-8" />
      </div>
    );
  }
  return <img src={blobUrl} alt={alt || fileName} className={className || ''} onClick={onClick} />;
}

// ── component ────────────────────────────────────────────

export function MessagesScreen({ onBack }: MessagesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug || '';
  const myUserId = currentUser?.hubUserId || '';

  // ── state ──────────────────────────────────────────────
  const [conversations, setConversations] = useState<HubConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // New conversation flow
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [members, setMembers] = useState<HubMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<HubMember[]>([]);
  const [groupName, setGroupName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Media attachment state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Lightbox state — clicking an image opens it full-screen
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const closeLightbox = () => {
    if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
    setLightboxUrl(null);
  };

  // ── load conversations ────────────────────────────────
  const loadConversations = useCallback(async (silent = false) => {
    if (!slug) return;
    if (!silent) setLoading(true);
    try {
      const convos = await hubService.listConversations(slug);
      setConversations(convos);
      setError(null);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load conversations');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Poll conversations
  useEffect(() => {
    if (!slug) return;
    const timer = setInterval(() => loadConversations(true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [slug, loadConversations]);

  // ── load messages for selected conversation ───────────
  const loadMessages = useCallback(async (convoId: string, silent = false) => {
    if (!slug || !convoId) return;
    if (!silent) setMsgsLoading(true);
    try {
      const msgs = await hubService.getMessages(slug, convoId, 100);
      // Preserve locally-known attachments if the server response omits them
      setMessages(prev => msgs.map(m => {
        const existing = prev.find(p => p.id === m.id);
        if (existing?.attachments?.length && !m.attachments?.length) {
          return { ...m, attachments: existing.attachments };
        }
        return m;
      }));
    } catch (err: any) {
      console.error('Failed to load messages:', err);
    } finally {
      if (!silent) setMsgsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId, loadMessages]);

  // Poll messages for active conversation
  useEffect(() => {
    if (!selectedId || !slug) return;
    const timer = setInterval(() => loadMessages(selectedId, true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [selectedId, slug, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── send message ──────────────────────────────────────
  const handleSend = async () => {
    const text = messageText.trim();
    const hasFiles = stagedFiles.length > 0;
    if ((!text && !hasFiles) || !selectedId || !slug || sending) return;

    setSending(true);
    setSendError(null);
    setMessageText('');
    const filesToSend = [...stagedFiles];
    clearStagedFiles();

    try {
      let msg: HubMessage;
      if (hasFiles) {
        setUploadProgress(`Uploading ${filesToSend.length} file${filesToSend.length > 1 ? 's' : ''}…`);
        msg = await hubService.sendMessageWithMedia(
          slug,
          selectedId,
          text,
          filesToSend.map(sf => sf.file),
        );
        setUploadProgress(null);
      } else {
        msg = await hubService.sendMessage(slug, selectedId, text);
      }
      setMessages(prev => [...prev, msg]);
      loadConversations(true);
    } catch (err: any) {
      console.error('Failed to send:', err);
      setMessageText(text);
      setUploadProgress(null);
      setSendError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // ── media attachment helpers ──────────────────────────
  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    setStagedFiles(prev => {
      const remaining = MAX_ATTACHMENTS - prev.length;
      const toAdd = incoming.slice(0, remaining);
      const staged: StagedFile[] = toAdd
        .filter(f => f.size <= MAX_FILE_SIZE)
        .map(f => {
          const type = classifyFile(f);
          const previewUrl = (type === 'image' || type === 'video')
            ? URL.createObjectURL(f)
            : undefined;
          return { file: f, previewUrl, type };
        });
      return [...prev, ...staged];
    });
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles(prev => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearStagedFiles = () => {
    stagedFiles.forEach(sf => { if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl); });
    setStagedFiles([]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  /** Open an attachment in the lightbox or trigger download */
  const previewAttachment = async (att: { file_name: string; mime_type: string }) => {
    const kind = classifyMime(att.mime_type, att.file_name);
    if (kind === 'file') {
      hubService.downloadFile(slug, att.file_name);
      return;
    }
    try {
      const blobUrl = await hubService.fetchFileBlob(slug, att.file_name);
      setLightboxUrl(blobUrl);
    } catch (err) {
      console.error('Preview failed:', err);
    }
  };

  // ── new conversation flow ─────────────────────────────
  const openNewConvo = async () => {
    setShowNewConvo(true);
    setSelectedMembers([]);
    setGroupName('');
    setMemberSearch('');
    if (members.length === 0) {
      setMembersLoading(true);
      try {
        const m = await hubService.listMembers(slug);
        setMembers(m.filter(x => x.user_id !== myUserId));
      } catch (err) {
        console.error('Failed to load members:', err);
      } finally {
        setMembersLoading(false);
      }
    }
  };

  const toggleMember = (member: HubMember) => {
    setSelectedMembers(prev =>
      prev.some(m => m.user_id === member.user_id)
        ? prev.filter(m => m.user_id !== member.user_id)
        : [...prev, member]
    );
  };

  const handleCreateConversation = async () => {
    if (selectedMembers.length === 0 || !slug) return;
    setCreating(true);
    try {
      const kind = selectedMembers.length === 1 ? 'dm' as const : 'group' as const;
      const ids = selectedMembers.map(m => m.user_id);
      const name = kind === 'group' ? groupName.trim() || undefined : undefined;
      const convo = await hubService.createConversation(slug, kind, ids, name);
      setConversations(prev => [convo, ...prev]);
      setSelectedId(convo.id);
      setShowNewConvo(false);
    } catch (err: any) {
      console.error('Failed to create conversation:', err);
    } finally {
      setCreating(false);
    }
  };

  // ── derived ───────────────────────────────────────────
  const selectedConvo = conversations.find(c => c.id === selectedId);
  const filteredConversations = conversations.filter(c =>
    convoDisplayName(c, myUserId).toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredMembers = members.filter(m =>
    m.username.toLowerCase().includes(memberSearch.toLowerCase())
  );

  // ── keyboard shortcut ─────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── render: loading ───────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading conversations…</p>
        </div>
      </div>
    );
  }

  // ── render: error (network/connectivity vs real error) ────
  if (error) {
    const isOffline = error.includes('Failed to fetch') || error.includes('tunnel') || error.includes('timed out');
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <MessageCircle className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          {isOffline ? (
            <>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No messages yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Messages will appear here once the hub API is reachable and other members join.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-red-500 mb-4">{error}</p>
              <button
                onClick={() => loadConversations()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex relative overflow-hidden">
      {/* Mesh background */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08] pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="messages-mesh" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-600 dark:text-purple-400" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#messages-mesh)" />
        </svg>
      </div>

      {/* ── Lightbox Overlay ── */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={closeLightbox}
          >
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors"
              title="Close preview"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New Conversation Modal ── */}
      <AnimatePresence>
        {showNewConvo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowNewConvo(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Conversation</h2>
                <button onClick={() => setShowNewConvo(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors" title="Close new conversation">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Selected member chips */}
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedMembers.map(m => (
                      <span
                        key={m.user_id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium"
                      >
                        {m.username}
                        <button onClick={() => toggleMember(m)} className="ml-0.5 hover:text-purple-900 dark:hover:text-purple-100" title="Toggle member">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Group name field (when 2+ selected) */}
                {selectedMembers.length > 1 && (
                  <input
                    type="text"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    placeholder="Group name (optional)"
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                )}

                {/* Search members */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search neighbors..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                </div>

                {/* Member list */}
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {membersLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-purple-500" /></div>
                  ) : filteredMembers.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-6">No neighbors found</p>
                  ) : (
                    filteredMembers.map(member => {
                      const selected = selectedMembers.some(m => m.user_id === member.user_id);
                      return (
                        <button
                          key={member.user_id}
                          onClick={() => toggleMember(member)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                            selected ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${getAvatarColor(member.username)} flex items-center justify-center text-white text-xs font-semibold`}>
                            {getInitials(member.username)}
                          </div>
                          <span className="flex-1 text-left text-sm font-medium text-slate-900 dark:text-white">{member.username}</span>
                          {selected && <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-zinc-800">
                <button
                  onClick={handleCreateConversation}
                  disabled={selectedMembers.length === 0 || creating}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:from-blue-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  {creating ? 'Creating…' : selectedMembers.length > 1 ? 'Create Group' : 'Start DM'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conversations Sidebar ── */}
      <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-r border-slate-200/50 dark:border-zinc-800/50 relative z-10`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200/50 dark:border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Messages</h1>
            </div>
            <button
              onClick={openNewConvo}
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex items-center justify-center transition-all shadow-lg"
              title="New conversation"
            >
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageCircle className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {searchQuery ? 'No matching conversations' : 'No conversations yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={openNewConvo}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Start a conversation
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredConversations.map((convo) => {
                const displayName = convoDisplayName(convo, myUserId);
                const preview = convo.lastMessage?.body;
                return (
                  <motion.button
                    key={convo.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedId(convo.id)}
                    className={`w-full p-3.5 flex items-start gap-3.5 transition-all rounded-2xl mb-1.5 ${
                      selectedId === convo.id
                        ? 'bg-purple-50 dark:bg-purple-900/20'
                        : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30 active:bg-slate-100 dark:active:bg-zinc-800/50'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarColor(displayName)} flex items-center justify-center text-white font-semibold`}>
                        {getInitials(displayName)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <h3 className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">
                          {displayName}
                        </h3>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 font-medium">
                          {formatTimestamp(convo.lastMessage?.created_at || convo.updated_at || convo.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {convo.kind === 'group' && (
                          <>
                            <Users className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-[11px] text-slate-500 dark:text-slate-500">
                              {convo.members.length}
                            </span>
                            <span className="text-slate-400 dark:text-slate-600">·</span>
                          </>
                        )}
                        {(preview || convo.lastMessage?.attachments?.length) ? (
                          <p className="text-[13px] text-slate-600 dark:text-slate-400 truncate flex-1">
                            {preview || (convo.lastMessage?.attachments?.length
                              ? `${convo.lastMessage.attachments.length === 1 ? 'Sent an attachment' : `Sent ${convo.lastMessage.attachments.length} attachments`}`
                              : '')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </aside>

      {/* ── Chat Area ── */}
      {selectedId && selectedConvo ? (
        <div className={`flex-1 flex flex-col relative z-10 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {/* Chat Header */}
          <div className="p-4 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Back to conversations"
                className="md:hidden w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>

              <div className="relative">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(convoDisplayName(selectedConvo, myUserId))} flex items-center justify-center text-white font-semibold`}>
                  {getInitials(convoDisplayName(selectedConvo, myUserId))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white">
                    {convoDisplayName(selectedConvo, myUserId)}
                  </h2>
                  {selectedConvo.kind === 'group' && (
                    <Users className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {selectedConvo.kind === 'group'
                    ? `${selectedConvo.members.length} members`
                    : 'Direct message'}
                </p>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {msgsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageCircle className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet — say hello!</p>
              </div>
            ) : (
              [...messages]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((msg) => {
                  const isMe = msg.sender_id === myUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] md:max-w-[60%]">
                        {/* Sender name in groups */}
                        {!isMe && selectedConvo.kind === 'group' && msg.sender_username && (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5 ml-1">
                            {msg.sender_username}
                          </p>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            isMe
                              ? 'bg-purple-600 dark:bg-purple-500 text-white rounded-br-sm'
                              : 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 rounded-bl-sm'
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.attachments.map((att) => {
                                const kind = classifyMime(att.mime_type, att.file_name);
                                if (kind === 'image' || kind === 'video' || kind === 'audio') {
                                  return (
                                    <AuthMedia
                                      key={att.id}
                                      slug={slug}
                                      fileName={att.file_name}
                                      mimeType={att.mime_type}
                                      alt={att.file_name}
                                      className="max-w-[240px] max-h-[180px] rounded-lg cursor-pointer border border-slate-200 dark:border-zinc-700 object-cover"
                                      onClick={() => previewAttachment(att)}
                                    />
                                  );
                                }
                                // Other files
                                return (
                                  <div key={att.id} className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 rounded-lg px-2 py-1 border border-slate-200 dark:border-zinc-700">
                                    <FileIcon className="w-4 h-4 text-slate-400" />
                                    <span className="text-xs truncate max-w-[120px]">{att.file_name}</span>
                                    <button
                                      className="ml-1 text-purple-600 dark:text-purple-400 hover:underline text-xs"
                                      onClick={() => hubService.downloadFile(slug, att.file_name)}
                                      title={`Download ${att.file_name}`}
                                    >
                                      <Download className="w-4 h-4 inline" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                          {formatMessageTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-t border-slate-200/50 dark:border-zinc-800/50">
            <div
              className={`flex items-end gap-3 ${isDragging ? 'ring-2 ring-purple-400 bg-purple-50/40 dark:bg-purple-900/10' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex-1 relative">
                {/* Attachment preview strip - now above the textarea */}
                {stagedFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {stagedFiles.map((sf, i) => (
                      <div key={i} className="relative group">
                        {sf.type === 'image' ? (
                          <img
                            src={sf.previewUrl}
                            alt={sf.file.name}
                            className="max-w-[220px] max-h-[160px] rounded-xl border border-purple-300 shadow-sm"
                          />
                        ) : sf.type === 'video' ? (
                          <video
                            src={sf.previewUrl}
                            className="max-w-[220px] max-h-[160px] rounded-xl border border-purple-300 shadow-sm"
                            controls
                          />
                        ) : (
                          <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 rounded-xl px-4 py-2 border border-purple-300">
                            <FileIcon className="w-6 h-6 text-purple-400" />
                            <span className="text-base truncate max-w-[160px]">{sf.file.name}</span>
                          </div>
                        )}
                        <button
                          className="absolute top-1 right-1 bg-white/80 hover:bg-white/90 rounded-full p-1 shadow group-hover:scale-110 transition"
                          onClick={() => removeStagedFile(i)}
                          title="Remove"
                        >
                          <X className="w-4 h-4 text-purple-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Upload progress */}
                {uploadProgress && (
                  <div className="mb-2 text-xs text-purple-600 dark:text-purple-400">{uploadProgress}</div>
                )}
                {/* Send error */}
                {sendError && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{sendError}</span>
                    <button onClick={() => setSendError(null)} title="Dismiss error" className="ml-auto text-red-400 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Type your message..."
                  title="Message input"
                  rows={1}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all resize-none max-h-[120px] min-h-[48px]"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 flex items-center justify-center transition-all shadow-lg"
                title="Attach file"
                disabled={sending || stagedFiles.length >= MAX_ATTACHMENTS}
              >
                <Paperclip className="w-5 h-5 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx"
                title="Attach files"
                placeholder="Attach files"
              />
              <button
                onClick={handleSend}
                disabled={sending || (!messageText.trim() && stagedFiles.length === 0)}
                aria-label="Send message"
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-zinc-700 dark:disabled:to-zinc-600 flex items-center justify-center transition-all disabled:cursor-not-allowed shadow-lg disabled:shadow-none"
              >
                {sending ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Send className="w-5 h-5 text-white" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Press Enter to send, Shift+Enter for new line. Drag & drop or click the paperclip to attach files.
            </p>
          </div>
        </div>
      ) : (
        /* ── Empty State (Desktop) ── */
        <div className="hidden md:flex flex-1 items-center justify-center relative z-10">
          <div className="text-center max-w-md px-8">
            <div className="w-24 h-24 mx-auto mb-6 relative">
              <svg viewBox="0 0 96 96" className="w-full h-full opacity-20">
                <defs>
                  <pattern id="empty-mesh" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="96" height="96" fill="url(#empty-mesh)" />
                <circle cx="48" cy="48" r="30" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="2" />
                <path d="M 30 48 Q 39 38, 48 48 T 66 48" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="2" />
                <circle cx="48" cy="38" r="2" fill="rgb(139, 92, 246)" />
              </svg>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Choose a conversation from the sidebar to start messaging your neighbors and community groups
            </p>
            <button
              onClick={openNewConvo}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
            >
              <Plus className="w-4 h-4" /> New Conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
