import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  File, FileText, FileImage, FileVideo, FileAudio, FileArchive,
  MonitorPlay, Table2, Download, Search, Loader2, AlertCircle, RefreshCw,
  HardDrive, Upload, Trash2, Globe, Lock, X, Eye, Link2, Users, Check,
  Star, List, LayoutGrid, ArrowUpDown, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubFile, HubMember } from '../types/hub';

interface FilesScreenProps {
  onBack: () => void;
}

type FileTab = 'all' | 'mine' | 'starred' | 'shared';
type ViewMode = 'list' | 'grid';
type SortKey = 'recent' | 'name' | 'size';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 86400 / 30)}mo ago`;
  } catch { return ''; }
}

function isRecent(file: HubFile): boolean {
  if (!file.uploaded_at) return false;
  return Date.now() - new Date(file.uploaded_at).getTime() < 7 * 24 * 60 * 60 * 1000;
}

// ── File kind mapping ─────────────────────────────────────────────────────────

type FileKind = 'pdf' | 'doc' | 'sheet' | 'image' | 'slides' | 'zip' | 'audio' | 'video' | 'other';

const KIND_CFG: Record<FileKind, {
  Icon: React.ElementType;
  grad: string;
  label: string;
}> = {
  pdf:    { Icon: FileText,    grad: 'from-rose-500 to-pink-600',      label: 'PDF' },
  doc:    { Icon: FileText,    grad: 'from-blue-500 to-blue-600',      label: 'Doc' },
  sheet:  { Icon: Table2,      grad: 'from-emerald-500 to-teal-600',   label: 'Sheet' },
  image:  { Icon: FileImage,   grad: 'from-indigo-500 to-indigo-600',  label: 'Image' },
  slides: { Icon: MonitorPlay, grad: 'from-purple-500 to-violet-600',  label: 'Slides' },
  zip:    { Icon: FileArchive, grad: 'from-fuchsia-500 to-violet-600', label: 'Archive' },
  audio:  { Icon: FileAudio,   grad: 'from-cyan-500 to-sky-600',       label: 'Audio' },
  video:  { Icon: FileVideo,   grad: 'from-purple-500 to-violet-600',  label: 'Video' },
  other:  { Icon: File,        grad: 'from-slate-500 to-slate-600',    label: 'File' },
};

function getKind(file: HubFile): FileKind {
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  const mime = file.mime_type || '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext) || mime.startsWith('text/')) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) return 'sheet';
  if (['ppt', 'pptx'].includes(ext) || mime.includes('presentation')) return 'slides';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext) || mime.startsWith('image/')) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogv'].includes(ext) || mime.startsWith('video/')) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext) || mime.startsWith('audio/')) return 'audio';
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(ext)) return 'zip';
  return 'other';
}

function getPreviewCategory(file: HubFile): 'image' | 'video' | 'audio' | 'pdf' | 'other' {
  const kind = getKind(file);
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'audio';
  if (kind === 'pdf') return 'pdf';
  return 'other';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FileKindBadge({ file, size = 40 }: { file: HubFile; size?: number }) {
  const { Icon, grad } = KIND_CFG[getKind(file)];
  const iconSize = Math.round(size * 0.45);
  return (
    <span
      className={`flex items-center justify-center rounded-xl bg-gradient-to-br ${grad} shrink-0 shadow-sm`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon style={{ width: iconSize, height: iconSize }} className="text-white" />
    </span>
  );
}

function KindChip({ file }: { file: HubFile }) {
  const { label } = KIND_CFG[getKind(file)];
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold cn-surface-2 cn-text-3 leading-none shrink-0">
      {label}
    </span>
  );
}

function UploaderChip({
  file, slug, memberMap, myUserId,
}: {
  file: HubFile; slug: string; memberMap: Map<string, HubMember>; myUserId: string;
}) {
  const ownerId = file.owner_id || '';
  const isMe = ownerId === myUserId;
  const member = ownerId ? memberMap.get(ownerId) : undefined;
  const name = isMe ? 'You' : (member?.display_name || member?.username || file.uploaded_by || '');
  if (!name) return null;

  const avatarSrc = ownerId ? hubService.getAvatarUrl(slug, ownerId) : null;
  const initials = name.slice(0, 1).toUpperCase();

  return (
    <span className="inline-flex items-center gap-1 shrink-0 max-w-[120px]">
      <span className="relative w-4 h-4 rounded-full overflow-hidden shrink-0 cn-surface-3 flex items-center justify-center">
        <span className="text-[7px] font-bold cn-text-2 select-none">{initials}</span>
        {avatarSrc && (
          <img
            src={avatarSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </span>
      <span className="text-[10px] cn-text-4 truncate">{name}</span>
    </span>
  );
}

function StorageCard({ files }: { files: HubFile[] }) {
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);

  return (
    <div className="rounded-2xl cn-glass p-4">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-semibold uppercase tracking-widest cn-text-3">Hub storage</span>
      </div>
      <div className="font-mono text-2xl font-bold cn-text-1 leading-none">
        {formatFileSize(totalBytes)}
        <span className="text-sm cn-text-3 font-semibold ml-1">used</span>
      </div>
      <div className="mt-3 text-xs cn-text-4">
        {files.length} {files.length === 1 ? 'file' : 'files'} · stored on your hub node
      </div>
    </div>
  );
}

function RecentUploadsCard({ files, myUserId }: { files: HubFile[]; myUserId: string }) {
  // Defense in depth: only ever show a file here if it's visible to everyone
  // (hub-public or web-public) or it's mine. Never show another member's
  // private upload, even if this component is ever fed an unfiltered list.
  const visible = files.filter(f => f.is_public || f.web_public || f.owner_id === myUserId);
  const recent = [...visible].sort((a, b) =>
    new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime()
  ).slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <div className="rounded-2xl cn-glass p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-widest cn-text-3">Just uploaded</span>
      </div>
      <div className="flex flex-col gap-3">
        {recent.map(f => (
          <div key={f.id} className="overflow-hidden flex items-center gap-3">
            <FileKindBadge file={f} size={30} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold cn-text-1 truncate">{f.name || 'Unnamed'}</p>
              <p className="text-[10px] font-mono cn-text-4 mt-0.5">{timeAgo(f.uploaded_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeBreakdownCard({ files }: { files: HubFile[] }) {
  const counts = files.reduce((acc, f) => {
    const k = getKind(f);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const rows = [
    { key: 'image',   label: 'Images',     Icon: FileImage,   grad: 'from-indigo-500 to-indigo-600' },
    { key: 'doc',     label: 'Documents',  Icon: FileText,    grad: 'from-blue-500 to-blue-600' },
    { key: 'sheet',   label: 'Sheets',     Icon: Table2,      grad: 'from-emerald-500 to-teal-600' },
    { key: 'pdf',     label: 'PDFs',       Icon: FileText,    grad: 'from-rose-500 to-pink-600' },
    { key: 'video',   label: 'Videos',     Icon: FileVideo,   grad: 'from-purple-500 to-violet-600' },
    { key: 'audio',   label: 'Audio',      Icon: FileAudio,   grad: 'from-cyan-500 to-sky-600' },
    { key: 'zip',     label: 'Archives',   Icon: FileArchive, grad: 'from-fuchsia-500 to-violet-600' },
  ].filter(r => (counts[r.key] || 0) > 0);

  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl cn-glass p-4">
      <span className="text-[10px] font-semibold uppercase tracking-widest cn-text-3">By type</span>
      <div className="mt-3 flex flex-col gap-1">
        {rows.map(({ key, label, Icon, grad }) => (
          <div key={key} className="flex items-center gap-3 py-1">
            <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center shrink-0`}>
              <Icon className="w-3.5 h-3.5 text-white" />
            </span>
            <span className="text-sm cn-text-2 flex-1">{label}</span>
            <span className="font-mono text-xs cn-text-4">{counts[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FilesScreen({ onBack }: FilesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug || '';
  const myUserId = currentUser?.hubUserId || '';

  // ── data state ──────────────────────────────────────────────────────────────
  const [allFiles, setAllFiles] = useState<HubFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [memberMap, setMemberMap] = useState<Map<string, HubMember>>(new Map());

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<FileTab>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // starred — persisted per hub in localStorage
  const [starred, setStarred] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(`citinet-starred-${slug}`);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });
  const toggleStar = (id: string) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(`citinet-starred-${slug}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIsPublicRef = useRef(false);

  // drag-and-drop
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef(0);

  // delete + visibility
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [visPopoverId, setVisPopoverId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // lightbox
  const [previewFile, setPreviewFile] = useState<HubFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewUrlIsBlobRef = useRef(false);

  // ── fetch ────────────────────────────────────────────────────────────────────
  const fetchFiles = useCallback(async (showRefresh = false) => {
    if (!slug) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      setAllFiles(await hubService.listFiles(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // fetch members once to resolve uploader names + avatars
  useEffect(() => {
    if (!slug) return;
    hubService.listMembers(slug)
      .then(members => {
        const map = new Map<string, HubMember>();
        members.forEach(m => map.set(m.user_id, m));
        setMemberMap(map);
      })
      .catch(() => {}); // silent — uploader info is display-only
  }, [slug]);

  // deep-link: auto-open once list loads
  useEffect(() => {
    if (allFiles.length === 0) return;
    const deeplink = sessionStorage.getItem('citinet-deeplink-file');
    if (!deeplink) return;
    sessionStorage.removeItem('citinet-deeplink-file');
    const target = allFiles.find(f => f.name === deeplink);
    if (target) openPreview(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFiles]);

  // ── derived lists ─────────────────────────────────────────────────────────────
  const tabFiles = useMemo(() => {
    switch (tab) {
      case 'mine':    return allFiles.filter(f => f.owner_id === myUserId);
      case 'starred': return allFiles.filter(f => starred.has(f.id));
      case 'shared':  return allFiles.filter(f => f.is_public || f.web_public);
      default:        return allFiles;
    }
  }, [tab, allFiles, starred, myUserId]);

  const tabCounts = useMemo(() => ({
    all:     allFiles.length,
    mine:    allFiles.filter(f => f.owner_id === myUserId).length,
    starred: allFiles.filter(f => starred.has(f.id)).length,
    shared:  allFiles.filter(f => f.is_public || f.web_public).length,
  }), [allFiles, starred, myUserId]);

  const displayed = useMemo(() => {
    let list = search.trim()
      ? tabFiles.filter(f =>
          (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
          f.description?.toLowerCase().includes(search.toLowerCase())
        )
      : tabFiles;
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      return new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime();
    });
  }, [tabFiles, search, sortBy]);

  // ── upload ────────────────────────────────────────────────────────────────────
  const triggerUpload = (isPublic: boolean) => {
    uploadIsPublicRef.current = isPublic;
    setShowUploadMenu(false);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !slug) return;
    setUploading(true); setUploadProgress(0); setUploadError('');
    try {
      const uploaded = await hubService.uploadFile(slug, file, uploadIsPublicRef.current, setUploadProgress);
      setAllFiles(prev => [uploaded, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false); setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── drag-and-drop ─────────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (--dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragging(false); }
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0; setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && slug) setDroppedFile(file);
  };

  const uploadDroppedFile = async (isPublic: boolean) => {
    if (!droppedFile || !slug) return;
    const file = droppedFile;
    setDroppedFile(null); setUploading(true); setUploadProgress(0); setUploadError('');
    try {
      const uploaded = await hubService.uploadFile(slug, file, isPublic, setUploadProgress);
      setAllFiles(prev => [uploaded, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally { setUploading(false); setUploadProgress(0); }
  };

  // ── delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (file: HubFile) => {
    if (!slug) return;
    setDeletingId(file.id);
    try {
      await hubService.deleteFile(slug, file.name);
      setAllFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err) { console.error('Delete failed:', err); }
    finally { setDeletingId(null); }
  };

  // ── visibility ────────────────────────────────────────────────────────────────
  const handleSetVisibility = async (file: HubFile, target: 'private' | 'hub' | 'web') => {
    if (!slug) return;
    setVisPopoverId(null); setTogglingId(file.id);
    try {
      await hubService.setFileVisibility(slug, file.name, target);
      setAllFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, is_public: target !== 'private', web_public: target === 'web' } : f
      ));
    } catch (err) { console.error('Set visibility failed:', err); }
    finally { setTogglingId(null); }
  };

  const handleCopyLink = (file: HubFile) => {
    const link = hubService.getPublicShareLink(slug, file.name);
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(prev => prev === file.id ? null : prev), 2000);
    });
  };

  // ── download ──────────────────────────────────────────────────────────────────
  const handleDownload = (file: HubFile) => hubService.downloadFile(slug, file.name || 'download');

  // ── preview ───────────────────────────────────────────────────────────────────
  const openPreview = async (file: HubFile) => {
    const cat = getPreviewCategory(file);
    if (cat === 'other') { handleDownload(file); return; }
    setPreviewFile(file); setPreviewError(''); setPreviewUrl(null);
    if (file.is_public) {
      const url = hubService.getPublicFileUrl(slug, file.name);
      if (url) { previewUrlIsBlobRef.current = false; setPreviewUrl(url); setPreviewLoading(false); return; }
    }
    setPreviewLoading(true);
    try {
      const BLOB_LIMIT = 100 * 1024 * 1024;
      if (file.size > BLOB_LIMIT) {
        previewUrlIsBlobRef.current = false;
        setPreviewUrl(await hubService.getFileStreamUrl(slug, file.name));
      } else {
        previewUrlIsBlobRef.current = true;
        setPreviewUrl(await hubService.fetchFileBlob(slug, file.name));
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally { setPreviewLoading(false); }
  };

  const closePreview = () => {
    if (previewUrl && previewUrlIsBlobRef.current) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null); setPreviewUrl(null); setPreviewError('');
  };

  // ── tab config ────────────────────────────────────────────────────────────────
  const TABS: { key: FileTab; label: string }[] = [
    { key: 'all',     label: 'All files' },
    { key: 'mine',    label: 'My uploads' },
    { key: 'shared',  label: 'Hub shared' },
    { key: 'starred', label: 'Starred' },
  ];

  const VIS_OPTS = [
    { key: 'private' as const, Icon: Lock,  color: 'text-blue-400',    label: 'Private',             sub: 'Only you can see this' },
    { key: 'hub'     as const, Icon: Users, color: 'text-amber-400',   label: 'Hub members',         sub: 'Requires a hub account' },
    { key: 'web'     as const, Icon: Globe, color: 'text-emerald-400', label: 'Anyone with the link', sub: 'No account needed' },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} title="Select file" />

      {/* Click-away overlays */}
      {showUploadMenu && <div className="fixed inset-0 z-20" onClick={() => setShowUploadMenu(false)} />}
      {showSortMenu && <div className="fixed inset-0 z-20" onClick={() => setShowSortMenu(false)} />}
      {visPopoverId && <div className="fixed inset-0 z-10" onClick={() => setVisPopoverId(null)} />}

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-7 items-start">

          {/* Left: header + tabs + file list */}
          <div>
            {/* Back */}
            <button
              onClick={onBack}
              className="md:hidden flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0 mb-4"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>

            {/* Title + Upload/Refresh — same row */}
            <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </span>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight cn-text-1 leading-none">Files</h1>
                  <p className="text-sm cn-text-3 mt-0.5">Shared community files · members only</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {uploading && (
                  <div className="flex items-center gap-2 cn-surface-2 rounded-lg px-3 py-1.5">
                    <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    <div className="w-16 h-1.5 cn-surface-3 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span className="text-[10px] font-mono cn-text-3 w-7">{uploadProgress}%</span>
                  </div>
                )}
                <div className="relative">
                  <button
                    onClick={() => setShowUploadMenu(!showUploadMenu)}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span className="hidden sm:inline">Upload</span>
                  </button>
                  <AnimatePresence>
                    {showUploadMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        className="absolute right-0 top-11 w-52 cn-surface border cn-border rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <button onClick={() => triggerUpload(false)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left">
                          <Lock className="w-4 h-4 text-blue-400" />
                          <div><p className="text-sm font-medium cn-text-1">Private</p><p className="text-[11px] cn-text-3">Only you can see this</p></div>
                        </button>
                        <div className="border-t cn-border" />
                        <button onClick={() => triggerUpload(true)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left">
                          <Users className="w-4 h-4 text-amber-400" />
                          <div><p className="text-sm font-medium cn-text-1">Hub members</p><p className="text-[11px] cn-text-3">Visible to hub members</p></div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={() => fetchFiles(true)}
                  disabled={refreshing}
                  className="w-9 h-9 rounded-lg cn-surface-2 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 cn-text-2 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 overflow-x-auto no-scrollbar mb-5 border-b cn-border">
              {TABS.map(t => {
                const active = tab === t.key;
                const count = tabCounts[t.key];
                return (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setSearch(''); }}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap relative transition-colors ${
                      active ? 'cn-text-1' : 'cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    {t.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      active ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'cn-surface-2 cn-text-4'
                    }`}>{count}</span>
                    {active && (
                      <motion.div
                        layoutId="files-tab-bar"
                        className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Upload error */}
            {uploadError && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-300 flex-1">{uploadError}</p>
                <button onClick={() => setUploadError('')} className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30" title="Dismiss upload error">
                  <X className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                </button>
              </div>
            )}

            {/* Search */}
            {allFiles.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 cn-text-4" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search files…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border cn-border cn-surface cn-text-1 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-600/40 focus:outline-none text-sm transition-colors"
                />
              </div>
            )}

            {/* Toolbar */}
            {!loading && tabFiles.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm cn-text-4">
                  <span className="font-mono font-semibold cn-text-2">{displayed.length}</span> {displayed.length === 1 ? 'file' : 'files'}
                </span>
                <div className="flex-1" />
                {/* Sort */}
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu(s => !s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cn-border cn-surface cn-text-2 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    {sortBy === 'recent' ? 'Recent' : sortBy === 'name' ? 'Name' : 'Size'}
                  </button>
                  <AnimatePresence>
                    {showSortMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        className="absolute right-0 top-9 w-36 cn-surface border cn-border rounded-xl shadow-xl z-50 overflow-hidden py-1"
                      >
                        {([['recent', 'Recent'], ['name', 'Name'], ['size', 'Size']] as [SortKey, string][]).map(([k, l]) => (
                          <button
                            key={k}
                            onClick={() => { setSortBy(k); setShowSortMenu(false); }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                              sortBy === k ? 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10' : 'cn-text-2 hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                          >
                            {l}
                            {sortBy === k && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* View toggle */}
                <span className="inline-flex gap-0.5 p-1 rounded-lg cn-surface border cn-border">
                  {([['list', List], ['grid', LayoutGrid]] as [ViewMode, React.ElementType][]).map(([v, Icon]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`w-7 h-6 rounded-md flex items-center justify-center transition-colors ${
                        view === v ? 'cn-surface-3 cn-text-1' : 'cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300'
                      }`}
                      title={v}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </span>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 cn-text-4">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">Loading files…</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && !error.includes('Failed to fetch') && !error.includes('tunnel') && !error.includes('timed out') && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-300">Could not load files</p>
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>
                    <button onClick={() => fetchFiles()} className="mt-2 text-xs font-medium text-red-600 dark:text-red-300 underline hover:no-underline">Try again</button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && tabFiles.length === 0 && (!error || error.includes('Failed to fetch') || error.includes('tunnel') || error.includes('timed out')) && (
              <div className="flex flex-col items-center justify-center py-20 cn-text-4">
                <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center mb-5">
                  <svg className="w-8 h-8 text-amber-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </span>
                <p className="text-base font-semibold cn-text-2 mb-1">
                  {tab === 'starred' ? 'No starred files yet'
                    : tab === 'mine' ? 'No uploads yet'
                    : tab === 'shared' ? 'No shared files yet'
                    : 'No files yet'}
                </p>
                <p className="text-sm mb-6 text-center max-w-xs">
                  {tab === 'starred' ? 'Star any file to pin it here for quick access.'
                    : tab === 'mine' ? 'Files you upload — private to you unless you share them.'
                    : tab === 'shared' ? 'Files visible to all hub members will appear here.'
                    : 'Upload files to store them on the hub.'}
                </p>
                {(tab === 'all' || tab === 'mine' || tab === 'shared') && (
                  <button
                    onClick={() => triggerUpload(tab === 'shared')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white text-sm font-semibold shadow-sm hover:from-amber-600 hover:to-orange-700 transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    {tab === 'shared' ? 'Share a file' : 'Upload a file'}
                  </button>
                )}
              </div>
            )}

            {/* No search results */}
            {!loading && !error && tabFiles.length > 0 && displayed.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 cn-text-4">
                <Search className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium cn-text-3">No files match "{search}"</p>
              </div>
            )}

            {/* ── List view ── */}
            {!loading && displayed.length > 0 && view === 'list' && (
              <AnimatePresence mode="popLayout">
                <div className="flex flex-col gap-2 w-full max-w-[680px]">
                  {displayed.map((file, index) => {
                    const isOwner = file.owner_id === myUserId;
                    const isDeleting = deletingId === file.id;
                    const isStarred = starred.has(file.id);
                    const fresh = isRecent(file);
                    const vis = file.web_public ? 'web' : file.is_public ? 'hub' : 'private';
                    const isVisOpen = visPopoverId === file.id;

                    return (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ delay: index * 0.025 }}
                        className={`group w-full overflow-visible flex items-center gap-3 p-3 rounded-2xl cn-glass hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer ${isVisOpen ? 'z-20' : 'z-0'}`}
                        onClick={() => openPreview(file)}
                      >
                        <FileKindBadge file={file} size={42} />

                        <div className="flex-1 min-w-0" onClick={() => openPreview(file)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold cn-text-1 truncate min-w-0 max-w-full">{file.name || 'Unnamed file'}</span>
                            {fresh && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <KindChip file={file} />
                            {file.size > 0 && <span className="font-mono text-[10px] cn-text-4 shrink-0">{formatFileSize(file.size)}</span>}
                            {file.uploaded_at && <span className="text-[10px] cn-text-4 shrink-0">· {timeAgo(file.uploaded_at)}</span>}
                            <UploaderChip file={file} slug={slug} memberMap={memberMap} myUserId={myUserId} />
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          {/* Star */}
                          <button
                            onClick={() => toggleStar(file.id)}
                            title={isStarred ? 'Unstar' : 'Star'}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            <Star className={`w-4 h-4 transition-colors ${isStarred ? 'text-amber-400 fill-amber-400' : 'cn-text-4 group-hover:text-slate-500 dark:group-hover:text-zinc-400'}`} />
                          </button>

                          {/* Preview */}
                          {getPreviewCategory(file) !== 'other' && (
                            <button onClick={() => openPreview(file)} title="Preview" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                              <Eye className="w-4 h-4 cn-text-4" />
                            </button>
                          )}

                          {/* Visibility (owner only) */}
                          {isOwner && (
                            <div className="relative">
                              <button
                                onClick={() => setVisPopoverId(isVisOpen ? null : file.id)}
                                disabled={togglingId === file.id}
                                title="Change visibility"
                                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                              >
                                {togglingId === file.id ? (
                                  <Loader2 className="w-4 h-4 cn-text-3 animate-spin" />
                                ) : vis === 'web' ? (
                                  <Globe className="w-4 h-4 text-emerald-400" />
                                ) : vis === 'hub' ? (
                                  <Users className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <Lock className="w-4 h-4 text-blue-400" />
                                )}
                              </button>
                              <AnimatePresence>
                                {isVisOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                    transition={{ duration: 0.12 }}
                                    className="absolute right-0 top-10 w-56 cn-surface border cn-border rounded-xl shadow-xl z-50 overflow-hidden"
                                  >
                                    <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide cn-text-4">Who can access</p>
                                    {VIS_OPTS.map((opt, i) => (
                                      <React.Fragment key={opt.key}>
                                        {i > 0 && <div className="border-t cn-border" />}
                                        <button
                                          onClick={() => handleSetVisibility(file, opt.key)}
                                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                            vis === opt.key ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/40'
                                          }`}
                                        >
                                          <opt.Icon className={`w-4 h-4 ${opt.color} shrink-0`} />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium cn-text-1 leading-tight">{opt.label}</p>
                                            <p className="text-[11px] cn-text-4 leading-tight mt-0.5">{opt.sub}</p>
                                          </div>
                                          {vis === opt.key && <Check className="w-3.5 h-3.5 cn-text-3 shrink-0" />}
                                        </button>
                                      </React.Fragment>
                                    ))}
                                    {vis === 'web' && (
                                      <>
                                        <div className="border-t cn-border mx-3 my-1" />
                                        <button
                                          onClick={() => { handleCopyLink(file); setVisPopoverId(null); }}
                                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-900/20 transition-colors text-left mb-1"
                                        >
                                          {copiedId === file.id ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                                          <p className="text-sm font-medium text-emerald-400">{copiedId === file.id ? 'Copied!' : 'Copy link'}</p>
                                        </button>
                                      </>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* Download */}
                          <button onClick={() => handleDownload(file)} title="Download" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <Download className="w-4 h-4 cn-text-4" />
                          </button>

                          {/* Delete (owner only) */}
                          {isOwner && (
                            <button
                              onClick={() => handleDelete(file)}
                              disabled={isDeleting}
                              title="Delete"
                              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-900/30 transition-colors disabled:opacity-50"
                            >
                              {isDeleting ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatePresence>
            )}

            {/* ── Grid view ── */}
            {!loading && displayed.length > 0 && view === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-[680px]">
                {displayed.map((file, index) => {
                  const { grad } = KIND_CFG[getKind(file)];
                  const { Icon } = KIND_CFG[getKind(file)];
                  const fresh = isRecent(file);
                  return (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="group rounded-2xl cn-glass hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer overflow-hidden"
                      onClick={() => openPreview(file)}
                    >
                      <div className={`relative h-20 bg-gradient-to-br ${grad} flex items-center justify-center`}>
                        <Icon className="w-8 h-8 text-white/80" />
                        {fresh && <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                        <button
                          onClick={e => { e.stopPropagation(); toggleStar(file.id); }}
                          className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title={starred.has(file.id) ? 'Unstar file' : 'Star file'}
                        >
                          <Star className={`w-3 h-3 ${starred.has(file.id) ? 'text-amber-400 fill-amber-400' : 'text-white/70'}`} />
                        </button>
                      </div>
                      <div className="p-3 min-w-0">
                        <p className="text-xs font-semibold cn-text-1 truncate max-w-full">{file.name || 'Unnamed'}</p>
                        <p className="font-mono text-[10px] cn-text-4 mt-1 truncate">{formatFileSize(file.size)} · {timeAgo(file.uploaded_at)}</p>
                        <div className="mt-1.5">
                          <UploaderChip file={file} slug={slug} memberMap={memberMap} myUserId={myUserId} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right rail (desktop only) ── */}
          <div className="hidden lg:flex flex-col gap-4 sticky top-7">
            <StorageCard files={allFiles} />
            <RecentUploadsCard files={allFiles} myUserId={myUserId} />
            <TypeBreakdownCard files={allFiles} />
          </div>
        </div>
      </div>

      {/* ── Drag-over overlay ── */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm pointer-events-none"
          >
            <div className="flex flex-col items-center gap-4 w-72 h-56 rounded-2xl border-2 border-dashed border-amber-500/60 bg-amber-950/20">
              <Upload className="w-10 h-10 text-amber-400 mt-12" />
              <p className="text-base font-semibold text-amber-200">Drop to upload</p>
              <p className="text-xs text-amber-500">You'll choose who can see it</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Post-drop visibility prompt ── */}
      <AnimatePresence>
        {droppedFile && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm"
            onClick={() => setDroppedFile(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="cn-surface border cn-border rounded-2xl shadow-2xl p-6 w-80 mx-4"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-sm font-semibold cn-text-1 mb-1 truncate">{droppedFile.name}</p>
              <p className="text-xs cn-text-3 mb-5">{formatFileSize(droppedFile.size)} · Who can see this?</p>
              <div className="space-y-2">
                <button onClick={() => uploadDroppedFile(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border cn-border hover:border-blue-500/50 hover:bg-blue-900/20 transition-colors text-left">
                  <Lock className="w-5 h-5 text-blue-400 shrink-0" />
                  <div><p className="text-sm font-medium cn-text-1">Private</p><p className="text-xs cn-text-3">Only you</p></div>
                </button>
                <button onClick={() => uploadDroppedFile(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border cn-border hover:border-amber-500/50 hover:bg-amber-900/20 transition-colors text-left">
                  <Users className="w-5 h-5 text-amber-400 shrink-0" />
                  <div><p className="text-sm font-medium cn-text-1">Hub members</p><p className="text-xs cn-text-3">Requires a hub account</p></div>
                </button>
              </div>
              <button onClick={() => setDroppedFile(null)} className="mt-4 w-full text-xs cn-text-4 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lightbox preview ──
          Portaled to <body>: HubLayout's content area is `position: relative; z-index: 10`,
          its own stacking context — nothing inside it can out-rank the chrome (top bar /
          sidebar / bottom dock, all z-30) no matter its own z-index. Escaping via a portal
          (same fix as the Messages lightbox) is what makes this render above the chrome. */}
      {createPortal(
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/85 backdrop-blur-sm"
            onClick={closePreview}
          >
            <button onClick={closePreview} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="Close">
              <X className="w-5 h-5 text-white" />
            </button>
            <button onClick={e => { e.stopPropagation(); handleDownload(previewFile); }} className="absolute top-4 right-16 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="Download">
              <Download className="w-5 h-5 text-white" />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center"
              onClick={e => e.stopPropagation()}
            >
              {previewLoading && (
                <div className="flex flex-col items-center gap-3 py-20">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="text-sm text-white/60">Loading preview…</p>
                </div>
              )}
              {previewError && (
                <div className="flex flex-col items-center gap-3 py-20">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-red-300">{previewError}</p>
                </div>
              )}
              {previewUrl && (() => {
                const cat = getPreviewCategory(previewFile);
                if (cat === 'image') return <img src={previewUrl} alt={previewFile.name} className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl" />;
                if (cat === 'video') return <video src={previewUrl} controls autoPlay preload="auto" className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" />;
                if (cat === 'audio') return (
                  <div className="bg-zinc-900/90 border border-zinc-700 rounded-2xl p-8 flex flex-col items-center gap-4 min-w-[320px]">
                    <FileAudio className="w-12 h-12 text-blue-400" />
                    <p className="text-sm text-white font-medium truncate max-w-[280px]">{previewFile.name}</p>
                    <audio src={previewUrl} controls autoPlay className="w-full" />
                  </div>
                );
                if (cat === 'pdf') return <iframe src={previewUrl} title={previewFile.name} className="w-[85vw] h-[80vh] rounded-xl shadow-2xl border-0 bg-white" />;
                return null;
              })()}
              {previewUrl && (
                <div className="mt-3 px-4 py-2 bg-black/50 rounded-full">
                  <p className="text-xs text-white/60 truncate max-w-[60vw]">
                    {previewFile.name}{previewFile.size > 0 && ` · ${formatFileSize(previewFile.size)}`}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
}
