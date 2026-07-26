import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DotGrid } from './DotGrid';
import {
  Search, Send, Users, Loader2, AlertCircle,
  RefreshCw, Plus, MessageCircle, X, Check,
  Paperclip, File as FileIcon, Download, ArrowLeft, ChevronRight,
} from 'lucide-react';
import { SupportLauncher } from './SupportLauncher';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import { notificationsService } from '../services/notificationsService';
import type { HubConversation, HubMessage, HubMember } from '../types/hub';

interface MessagesScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
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

/** Same hash as getAvatarColor so the name label always matches the avatar tint. */
function getSenderNameColor(name: string): string {
  const colors = [
    'text-purple-500 dark:text-purple-400',
    'text-blue-500 dark:text-blue-400',
    'text-emerald-500 dark:text-emerald-400',
    'text-orange-500 dark:text-orange-400',
    'text-pink-500 dark:text-pink-400',
    'text-violet-500 dark:text-violet-400',
    'text-sky-500 dark:text-sky-400',
    'text-lime-600 dark:text-lime-400',
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
    const d = new Date(iso);
    const now = new Date();
    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return timeStr;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${timeStr}`;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${timeStr}`;
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${timeStr}`;
  } catch {
    return '';
  }
}

function formatDateSeparator(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  } catch {
    return '';
  }
}

function convoAvatarUserId(c: HubConversation, myUserId?: string): string | undefined {
  if (c.kind !== 'dm') return undefined;
  return c.members.find(m => m.user_id !== myUserId)?.user_id;
}

function AvatarBadge({
  slug,
  userId,
  name,
  sizeClass,
  textClass,
  radiusClass,
}: {
  slug: string;
  userId?: string;
  name: string;
  sizeClass: string;
  textClass: string;
  radiusClass: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarUrl = userId ? (hubService.getAvatarUrl(slug, userId) ?? undefined) : undefined;

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} ${radiusClass} object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${radiusClass} bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center text-white font-semibold ${textClass}`}>
      {getInitials(name)}
    </div>
  );
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
    hubService.fetchFileBlob(slug, fileName, mimeType)
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

export function MessagesScreen({ onBack, onNavigate }: MessagesScreenProps) {
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

  // Group members panel (view who's in a group chat, click through to their profile)
  const [showGroupMembers, setShowGroupMembers] = useState(false);

  // A conversation the user has opened (via "New Conversation", a profile's Message
  // button, or "Message seller") but hasn't sent anything in yet — exists only in
  // local state. It's only persisted to the backend on the first actual send, so
  // backing out without sending never leaves an empty conversation in anyone's list.
  const [draftConvo, setDraftConvo] = useState<HubConversation | null>(null);

  // Conversation IDs that have unread notifications — drives the purple dot per row
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Keep a live ref so loadMessages (memoized on slug) can always see current conversations
  const conversationsRef = useRef<HubConversation[]>([]);

  // Media attachment state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Lightbox state — clicking an image opens it full-screen
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const swipeBackRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    lastX: 0,
    lastY: 0,
  });
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
      conversationsRef.current = convos;
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

  // Fetch unread conversation IDs for per-conversation dot indicators.
  // Runs on mount so dots appear whether the user tapped the badge or navigated directly.
  useEffect(() => {
    if (!slug) return;
    notificationsService.getUnread(slug).then(notifications => {
      const convIds = notifications
        .filter(n => n.type === 'message' && n.ref_id)
        .map(n => n.ref_id!);
      setUnreadConvIds(new Set(convIds));
    }).catch(() => {});
  }, [slug]);

  // Deep-link: auto-select a specific conversation when arriving from a notification badge tap.
  useEffect(() => {
    const convId = sessionStorage.getItem('citinet-deeplink-message-conv');
    if (!convId || conversations.length === 0 || selectedId) return;
    sessionStorage.removeItem('citinet-deeplink-message-conv');
    setSelectedId(convId);
    // Mark this conversation read immediately — don't wait for getUnread to resolve
    notificationsService.markReadByRef(slug, convId).catch(() => {});
    setUnreadConvIds(prev => { const next = new Set(prev); next.delete(convId); return next; });
  }, [conversations, selectedId, slug]);

  // Deep-link: arriving from a "Message" button elsewhere (profile, exchange listing) with
  // no conversation created yet — reuse an existing DM with that person if one exists,
  // otherwise open a draft. Waits for the initial conversation list to finish loading so
  // the "does a DM already exist" check is accurate even for a user with zero conversations.
  useEffect(() => {
    if (loading || selectedId) return;
    const raw = sessionStorage.getItem('citinet-deeplink-message-peer');
    if (!raw) return;
    sessionStorage.removeItem('citinet-deeplink-message-peer');
    try {
      const { userId, username } = JSON.parse(raw) as { userId: string; username: string };
      if (userId) startDm(userId, username || 'Neighbor');
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, conversations, selectedId]);

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
      const convo = conversationsRef.current.find(c => c.id === convoId);
      const msgs = await hubService.getMessages(slug, convoId, 100, undefined, convo?.members);
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
    // Drafts only exist locally — nothing to fetch, and the id isn't a real conversation yet.
    if (selectedId && !selectedId.startsWith('draft')) {
      loadMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId, loadMessages]);

  // Poll messages for active conversation
  useEffect(() => {
    if (!selectedId || !slug || selectedId.startsWith('draft')) return;
    const timer = setInterval(() => loadMessages(selectedId, true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [selectedId, slug, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── select conversation + per-conversation read marking ──
  const handleSelectConversation = (convId: string) => {
    setSelectedId(convId);
    setDraftConvo(null);
    if (unreadConvIds.has(convId)) {
      setUnreadConvIds(prev => { const next = new Set(prev); next.delete(convId); return next; });
      notificationsService.markReadByRef(slug, convId).catch(() => {});
    }
  };

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
      let convoId = selectedId;
      let members = selectedConvo?.members;

      // First message in a draft thread — this is the moment it actually becomes a
      // real conversation. Reuses an existing DM server-side if one raced into
      // existence in the meantime, so this never creates a duplicate.
      if (draftConvo && selectedId === draftConvo.id) {
        const peerIds = draftConvo.members.filter(m => m.user_id !== myUserId).map(m => m.user_id);
        const real = await hubService.createConversation(slug, draftConvo.kind, peerIds, draftConvo.name);
        convoId = real.id;
        members = real.members;
        setConversations(prev => [real, ...prev]);
        setDraftConvo(null);
        setSelectedId(real.id);
      }

      let msg: HubMessage;
      if (hasFiles) {
        setUploadProgress(`Uploading ${filesToSend.length} file${filesToSend.length > 1 ? 's' : ''}…`);
        msg = await hubService.sendMessageWithMedia(
          slug,
          convoId,
          text,
          filesToSend.map(sf => sf.file),
          members,
        );
        setUploadProgress(null);
      } else {
        msg = await hubService.sendMessage(slug, convoId, text, members);
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

  // Full hub member directory (bio/headline/role) — loaded once and shared between
  // the "new conversation" picker and the group members panel.
  const ensureMembersLoaded = async () => {
    if (members.length > 0) return;
    setMembersLoading(true);
    try {
      const m = await hubService.listMembers(slug);
      setMembers(m.filter(x => x.user_id !== myUserId));
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  // ── new conversation flow ─────────────────────────────
  const openNewConvo = async () => {
    setShowNewConvo(true);
    setSelectedMembers([]);
    setGroupName('');
    setMemberSearch('');
    await ensureMembersLoaded();
  };

  const openGroupMembers = async () => {
    setShowGroupMembers(true);
    await ensureMembersLoaded();
  };

  const toggleMember = (member: HubMember) => {
    setSelectedMembers(prev =>
      prev.some(m => m.user_id === member.user_id)
        ? prev.filter(m => m.user_id !== member.user_id)
        : [...prev, member]
    );
  };

  /** Opens a DM thread without touching the backend — reuses an existing conversation
   * with this person if one exists, otherwise opens a local-only draft. Nothing is
   * persisted until the first message is actually sent (see handleSend). */
  const startDm = (userId: string, username: string) => {
    const existing = conversations.find(c => c.kind === 'dm' && c.members.some(m => m.user_id === userId));
    if (existing) {
      setDraftConvo(null);
      setSelectedId(existing.id);
      return;
    }
    const draftId = `draft:${userId}`;
    setDraftConvo({
      id: draftId,
      kind: 'dm',
      members: [
        { user_id: myUserId, username: currentUser?.username || currentUser?.displayName || 'You' },
        { user_id: userId, username },
      ],
      created_by: myUserId,
      created_at: new Date().toISOString(),
      updated_at: undefined,
    });
    setSelectedId(draftId);
  };

  const handleCreateConversation = () => {
    if (selectedMembers.length === 0 || !slug) return;
    if (selectedMembers.length === 1) {
      startDm(selectedMembers[0].user_id, selectedMembers[0].username);
    } else {
      const draftId = `draft-group:${Date.now()}`;
      setDraftConvo({
        id: draftId,
        kind: 'group',
        name: groupName.trim() || undefined,
        members: [
          { user_id: myUserId, username: currentUser?.username || currentUser?.displayName || 'You' },
          ...selectedMembers.map(m => ({ user_id: m.user_id, username: m.username })),
        ],
        created_by: myUserId,
        created_at: new Date().toISOString(),
        updated_at: undefined,
      });
      setSelectedId(draftId);
    }
    setShowNewConvo(false);
  };

  // ── derived ───────────────────────────────────────────
  // Drafts live outside `conversations` on purpose — they must never show in the
  // sidebar list, only in the currently-open thread.
  const selectedConvo = conversations.find(c => c.id === selectedId)
    ?? (draftConvo && draftConvo.id === selectedId ? draftConvo : undefined);
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

  const isMobileViewport = () => typeof window !== 'undefined' && window.innerWidth < 768;

  const handleThreadTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport() || e.touches.length !== 1) return;
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input, button, a, video, audio')) return;

    const touch = e.touches[0];
    swipeBackRef.current = {
      tracking: true,
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      lastX: touch.clientX,
      lastY: touch.clientY,
    };
  };

  const handleThreadTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeBackRef.current.tracking || e.touches.length !== 1) return;
    const touch = e.touches[0];
    swipeBackRef.current.lastX = touch.clientX;
    swipeBackRef.current.lastY = touch.clientY;
  };

  const handleThreadTouchEnd = () => {
    if (!swipeBackRef.current.tracking || !isMobileViewport()) {
      swipeBackRef.current.tracking = false;
      return;
    }

    const { startX, startY, lastX, lastY, startTime } = swipeBackRef.current;
    swipeBackRef.current.tracking = false;

    const dx = lastX - startX;
    const dy = Math.abs(lastY - startY);
    const elapsedMs = Math.max(Date.now() - startTime, 1);
    const velocityX = dx / elapsedMs;

    const isSwipeRight = dx > 72 && dy < 88 && (velocityX > 0.42 || dx > 140);
    if (isSwipeRight) {
      setSelectedId(null);
      setDraftConvo(null);
    }
  };

  const handleThreadTouchCancel = () => {
    swipeBackRef.current.tracking = false;
  };

  // ── render: loading ───────────────────────────────────
  if (loading) {
    return (
      <div className="h-full bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
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
      <div className="h-full bg-gradient-to-b from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex items-center justify-center px-6">
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
    <div className="h-full bg-slate-50 dark:bg-zinc-950 flex relative overflow-hidden">
      <DotGrid />

      {/* ── Lightbox Overlay ──
          Portaled to <body>: HubLayout's content area (where this screen renders) is
          `position: relative; z-index: 10`, which starts its own stacking context — no
          z-index on anything inside it can ever out-rank HubLayout's chrome (top bar /
          sidebar / bottom dock, all z-30) as long as it's nested inside that z-10 wrapper.
          Escaping via a portal is what actually lets this render above the chrome. */}
      {createPortal(
        <AnimatePresence>
          {lightboxUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm p-4"
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
        </AnimatePresence>,
        document.body
      )}

      {/* ── New Conversation Modal ── */}
      <AnimatePresence>
        {showNewConvo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 dark:bg-black/40 backdrop-blur-sm p-4"
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
                          <AvatarBadge
                            slug={slug}
                            userId={member.user_id}
                            name={member.username}
                            sizeClass="w-9 h-9"
                            radiusClass="rounded-lg"
                            textClass="text-xs"
                          />
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
                  disabled={selectedMembers.length === 0}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:from-blue-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  {selectedMembers.length > 1 ? 'Create Group' : 'Start DM'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Group Members Panel ── */}
      <AnimatePresence>
        {showGroupMembers && selectedConvo?.kind === 'group' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 dark:bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowGroupMembers(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Group Members <span className="text-slate-400 dark:text-slate-500 font-normal text-sm">({selectedConvo.members.length})</span>
                </h2>
                <button onClick={() => setShowGroupMembers(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors" title="Close group members">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-2 overflow-y-auto">
                {membersLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-purple-500" /></div>
                ) : (
                  selectedConvo.members.map(participant => {
                    const isSelf = participant.user_id === myUserId;
                    const detail = members.find(m => m.user_id === participant.user_id);
                    const displayName = isSelf
                      ? (currentUser?.displayName || currentUser?.username || 'You')
                      : (detail?.display_name || participant.username);
                    return (
                      <button
                        key={participant.user_id}
                        onClick={() => {
                          if (isSelf || !onNavigate) return;
                          if (selectedId) sessionStorage.setItem('citinet-deeplink-message-conv', selectedId);
                          setShowGroupMembers(false);
                          onNavigate(`profile/${participant.user_id}`);
                        }}
                        disabled={isSelf || !onNavigate}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <AvatarBadge
                          slug={slug}
                          userId={participant.user_id}
                          name={participant.username}
                          sizeClass="w-10 h-10"
                          radiusClass="rounded-xl"
                          textClass=""
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{displayName}</span>
                            {isSelf && <span className="text-[10px] text-slate-400 shrink-0">(You)</span>}
                            {!isSelf && detail && detail.role !== 'member' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shrink-0 uppercase">
                                {detail.role}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {!isSelf && (detail?.profile_headline || detail?.bio) || `@${participant.username}`}
                          </p>
                        </div>
                        {!isSelf && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conversations Sidebar ── */}
      <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-r border-slate-200/50 dark:border-zinc-800/50 relative z-10`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200/50 dark:border-zinc-800/50">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </button>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight flex-1">Messages</h1>
            <button
              onClick={openNewConvo}
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex items-center justify-center transition-all shadow-lg shrink-0"
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
                const avatarUserId = convoAvatarUserId(convo, myUserId);
                const preview = convo.lastMessage?.body;
                const isUnread = unreadConvIds.has(convo.id);
                return (
                  <motion.button
                    key={convo.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => handleSelectConversation(convo.id)}
                    className={`w-full p-3.5 flex items-start gap-3.5 transition-all rounded-2xl mb-1.5 ${
                      selectedId === convo.id
                        ? 'bg-purple-50 dark:bg-purple-900/20'
                        : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30 active:bg-slate-100 dark:active:bg-zinc-800/50'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <AvatarBadge
                        slug={slug}
                        userId={avatarUserId}
                        name={displayName}
                        sizeClass="w-12 h-12"
                        radiusClass="rounded-xl"
                        textClass=""
                      />
                      {isUnread && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-500 ring-2 ring-white dark:ring-zinc-900" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <h3 className={`font-semibold text-[15px] truncate ${isUnread ? 'text-purple-700 dark:text-purple-300' : 'text-slate-900 dark:text-white'}`}>
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

        {/* Support — sticky to sidebar bottom */}
        <div
          className="shrink-0 px-3 border-t border-slate-200/50 dark:border-zinc-800/50"
          style={{ paddingTop: '0.5rem', paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <SupportLauncher variant="sidebar" />
        </div>
      </aside>

      {/* ── Chat Area ── */}
      {selectedId && selectedConvo ? (
        <div
          className={`flex-1 flex flex-col relative z-10 ${selectedId ? 'flex' : 'hidden md:flex'}`}
          onTouchStart={handleThreadTouchStart}
          onTouchMove={handleThreadTouchMove}
          onTouchEnd={handleThreadTouchEnd}
          onTouchCancel={handleThreadTouchCancel}
          style={{ touchAction: 'pan-y' }}
        >
          {/* Chat Header — Sticky */}
          <div
            className="sticky top-0 z-30 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 flex items-center justify-between"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top))',
              paddingBottom: '1rem',
              paddingLeft: '1rem',
              paddingRight: '1rem',
            }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setSelectedId(null); setDraftConvo(null); }}
                aria-label="Back to conversations"
                className="md:hidden w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>

              <div className="relative">
                <AvatarBadge
                  slug={slug}
                  userId={convoAvatarUserId(selectedConvo, myUserId)}
                  name={convoDisplayName(selectedConvo, myUserId)}
                  sizeClass="w-10 h-10"
                  radiusClass="rounded-xl"
                  textClass=""
                />
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
                {selectedConvo.kind === 'group' ? (
                  <button
                    onClick={openGroupMembers}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:underline transition-colors"
                  >
                    {selectedConvo.members.length} members
                  </button>
                ) : (
                  <p className="text-xs text-slate-600 dark:text-slate-400">Direct message</p>
                )}
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
              (() => {
                const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                let lastDate = '';
                return sorted.map((msg) => {
                  const isMe = msg.sender_id === myUserId;
                  const msgDate = new Date(msg.created_at).toDateString();
                  const showSeparator = msgDate !== lastDate;
                  lastDate = msgDate;
                  return (
                    <React.Fragment key={msg.id}>
                      {showSeparator && (
                        <div className="flex items-center gap-3 my-1 select-none">
                          <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
                          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 px-1">
                            {formatDateSeparator(msg.created_at)}
                          </span>
                          <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
                        </div>
                      )}
                    <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {/* Avatar for all non-me messages — clickable → profile */}
                      {!isMe && (
                        <button
                          className="flex-shrink-0 self-end rounded-lg hover:opacity-80 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-purple-400"
                          onClick={() => {
                            if (!msg.sender_id || !onNavigate) return;
                            // Persist the open conversation so returning from profile restores it
                            if (selectedId) sessionStorage.setItem('citinet-deeplink-message-conv', selectedId);
                            onNavigate(`profile/${msg.sender_id}`);
                          }}
                          title={`View ${msg.sender_username ?? 'profile'}`}
                          disabled={!msg.sender_id || !onNavigate}
                        >
                          <AvatarBadge
                            slug={slug}
                            userId={msg.sender_id}
                            name={msg.sender_username || '?'}
                            sizeClass="w-7 h-7"
                            radiusClass="rounded-lg"
                            textClass="text-[10px]"
                          />
                        </button>
                      )}
                      <div className="max-w-[72%] md:max-w-[58%]">
                        {/* Colored sender name in group chats — clickable → profile */}
                        {!isMe && selectedConvo.kind === 'group' && msg.sender_username && (
                          <button
                            className="text-[11px] font-semibold mb-0.5 ml-1 hover:underline focus:outline-none"
                            onClick={() => {
                              if (!msg.sender_id || !onNavigate) return;
                              if (selectedId) sessionStorage.setItem('citinet-deeplink-message-conv', selectedId);
                              onNavigate(`profile/${msg.sender_id}`);
                            }}
                            disabled={!msg.sender_id || !onNavigate}
                          >
                            <span className={getSenderNameColor(msg.sender_username)}>{msg.sender_username}</span>
                          </button>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            isMe
                              ? 'bg-purple-600 dark:bg-purple-500 text-white rounded-br-sm'
                              : 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 rounded-bl-sm'
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
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
                    </React.Fragment>
                  );
                });
              })()
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-t border-slate-200/50 dark:border-zinc-800/50"
            style={{
              paddingTop: '0.625rem',
              paddingLeft: '0.75rem',
              paddingRight: '0.75rem',
              paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
            }}
          >
            <div
              className={`flex items-end gap-1.5 ${isDragging ? 'ring-2 ring-purple-400 bg-purple-50/40 dark:bg-purple-900/10' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex-1 relative">
                {/* Attachment preview strip - now above the textarea */}
                {stagedFiles.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {stagedFiles.map((sf, i) => (
                      <div key={i} className="relative group">
                        {sf.type === 'image' ? (
                          <img
                            src={sf.previewUrl}
                            alt={sf.file.name}
                            className="max-w-[140px] max-h-[100px] rounded-lg border border-purple-300 shadow-sm"
                          />
                        ) : sf.type === 'video' ? (
                          <video
                            src={sf.previewUrl}
                            className="max-w-[140px] max-h-[100px] rounded-lg border border-purple-300 shadow-sm"
                            controls
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5 border border-purple-300">
                            <FileIcon className="w-4 h-4 text-purple-400" />
                            <span className="text-xs truncate max-w-[120px]">{sf.file.name}</span>
                          </div>
                        )}
                        <button
                          className="absolute top-0.5 right-0.5 bg-white/80 hover:bg-white/90 rounded-full p-0.5 shadow group-hover:scale-110 transition"
                          onClick={() => removeStagedFile(i)}
                          title="Remove"
                        >
                          <X className="w-3 h-3 text-purple-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Upload progress */}
                {uploadProgress && (
                  <div className="mb-1.5 text-xs text-purple-600 dark:text-purple-400">{uploadProgress}</div>
                )}
                {/* Send error */}
                {sendError && (
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
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
                  placeholder="Type a message…"
                  title="Message input"
                  rows={1}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all resize-none max-h-[100px] min-h-[38px] leading-tight"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 flex items-center justify-center transition-all shadow-sm shrink-0"
                title="Attach file"
                disabled={sending || stagedFiles.length >= MAX_ATTACHMENTS}
              >
                <Paperclip className="w-4 h-4 text-white" />
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
                className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-zinc-700 dark:disabled:to-zinc-600 flex items-center justify-center transition-all disabled:cursor-not-allowed shadow-sm disabled:shadow-none shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
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
