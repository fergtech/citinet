import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, File, FileText, FileImage, FileVideo, FileAudio,
  Download, Search, Loader2, FolderOpen, AlertCircle, RefreshCw,
  HardDrive, Upload, Trash2, Globe, Lock, Plus, X, Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import type { HubFile } from '../types/hub';

interface FilesScreenProps {
  onBack: () => void;
}

type FileTab = 'my-drive' | 'shared';

// ── Helpers ──────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
    const diffMo = Math.floor(diffDay / 30);
    return `${diffMo} ${diffMo === 1 ? 'month' : 'months'} ago`;
  } catch {
    return dateStr;
  }
}

function getFileIcon(file: HubFile) {
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const mime = file.mime_type || '';

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext))
    return <FileImage className="w-5 h-5 text-pink-500" />;
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext))
    return <FileVideo className="w-5 h-5 text-purple-500" />;
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext))
    return <FileAudio className="w-5 h-5 text-blue-500" />;
  if (mime.startsWith('text/') || ['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xls', 'xlsx'].includes(ext))
    return <FileText className="w-5 h-5 text-amber-500" />;
  return <File className="w-5 h-5 text-slate-400" />;
}

// ── Component ────────────────────────────────

export function FilesScreen({ onBack }: FilesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const slug = currentHub?.slug || '';
  const myUserId = currentUser?.hubUserId || '';

  // ── state ──────────────────────────────────
  const [allFiles, setAllFiles] = useState<HubFile[]>([]);
  const [tab, setTab] = useState<FileTab>('my-drive');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIsPublicRef = useRef(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toggle visibility state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Lightbox preview state
  const [previewFile, setPreviewFile] = useState<HubFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // ── fetch ──────────────────────────────────
  const fetchFiles = useCallback(async (showRefresh = false) => {
    if (!slug) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const result = await hubService.listFiles(slug);
      setAllFiles(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Deep-link: auto-open a file once the file list loads
  useEffect(() => {
    if (allFiles.length === 0) return;
    const deeplink = sessionStorage.getItem('citinet-deeplink-file');
    if (!deeplink) return;
    sessionStorage.removeItem('citinet-deeplink-file');
    const target = allFiles.find(f => f.name === deeplink);
    if (target) openPreview(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFiles]);

  // ── derived data ───────────────────────────
  const myDriveFiles = allFiles.filter(f => f.owner_id === myUserId);
  const sharedFiles = allFiles.filter(f => f.is_public);
  const activeFiles = tab === 'my-drive' ? myDriveFiles : sharedFiles;

  const filteredFiles = search.trim()
    ? activeFiles.filter(f =>
        (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
        f.description?.toLowerCase().includes(search.toLowerCase())
      )
    : activeFiles;

  const totalSize = activeFiles.reduce((sum, f) => sum + (f.size || 0), 0);

  // ── upload ─────────────────────────────────
  const triggerUpload = (isPublic: boolean) => {
    uploadIsPublicRef.current = isPublic;
    setShowUploadMenu(false);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !slug) return;

    setUploading(true);
    setUploadError('');
    try {
      const uploaded = await hubService.uploadFile(slug, file, uploadIsPublicRef.current);
      setAllFiles(prev => [uploaded, ...prev]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── delete ─────────────────────────────────
  const handleDelete = async (file: HubFile) => {
    if (!slug) return;
    setDeletingId(file.id);
    try {
      await hubService.deleteFile(slug, file.name);
      setAllFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // ── toggle visibility ──────────────────────
  const handleToggleVisibility = async (file: HubFile) => {
    if (!slug) return;
    const newPublic = !file.is_public;
    setTogglingId(file.id);
    try {
      await hubService.toggleFileVisibility(slug, file.name, newPublic);
      setAllFiles(prev => prev.map(f => f.id === file.id ? { ...f, is_public: newPublic } : f));
    } catch (err) {
      console.error('Toggle visibility failed:', err);
    } finally {
      setTogglingId(null);
    }
  };

  // ── download ───────────────────────────────
  const handleDownload = (file: HubFile) => {
    hubService.downloadFile(slug, file.name || 'download');
  };

  // ── lightbox preview ───────────────────────
  const getFileCategory = (file: HubFile): 'image' | 'video' | 'audio' | 'pdf' | 'other' => {
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    return 'other';
  };

  const openPreview = async (file: HubFile) => {
    const category = getFileCategory(file);
    if (category === 'other') {
      // Non-previewable — just download
      handleDownload(file);
      return;
    }

    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewUrl(null);
    try {
      const blobUrl = await hubService.fetchFileBlob(slug, file.name);
      setPreviewUrl(blobUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewError('');
  };

  // ── tab config ─────────────────────────────
  const tabConfig: { key: FileTab; label: string; icon: typeof HardDrive; count: number }[] = [
    { key: 'my-drive', label: 'My Drive', icon: HardDrive, count: myDriveFiles.length },
    { key: 'shared', label: 'Shared', icon: Globe, count: sharedFiles.length },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
        title="Select file to upload"
      />

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Files</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeFiles.length} {activeFiles.length === 1 ? 'file' : 'files'}
              {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
            </p>
          </div>

          {/* Upload button */}
          <div className="relative">
            <button
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              disabled={uploading}
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
              aria-label="Upload file"
            >
              {uploading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Plus className="w-4 h-4 text-white" />
              }
            </button>

            {/* Upload dropdown */}
            <AnimatePresence>
              {showUploadMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  className="absolute right-0 top-11 w-52 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                >
                  <button
                    onClick={() => triggerUpload(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-colors text-left"
                  >
                    <Lock className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">To My Drive</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Private, only you can see</p>
                    </div>
                  </button>
                  <div className="border-t border-slate-100 dark:border-zinc-700" />
                  <button
                    onClick={() => triggerUpload(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-colors text-left"
                  >
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">To Shared</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Visible to all neighbors</p>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchFiles(true)}
            disabled={refreshing}
            className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-slate-700 dark:text-slate-300 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-4 pb-0">
          <div className="flex gap-1">
            {tabConfig.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setSearch(''); }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
                    active
                      ? 'text-purple-700 dark:text-purple-300'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                    active
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {t.count}
                  </span>
                  {active && (
                    <motion.div
                      layoutId="files-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Click-away overlay for upload menu */}
      {showUploadMenu && (
        <div className="fixed inset-0 z-20" onClick={() => setShowUploadMenu(false)} />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Upload error */}
        {uploadError && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 flex-1">{uploadError}</p>
            <button onClick={() => setUploadError('')} title="Dismiss error" className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg">
              <X className="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
        )}

        {/* Search */}
        {activeFiles.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === 'my-drive' ? 'my drive' : 'shared files'}...`}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-colors text-sm"
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading files...</p>
          </div>
        )}

        {/* Error — only show red banner for non-connectivity errors */}
        {error && !loading && !error.includes('Failed to fetch') && !error.includes('tunnel') && !error.includes('timed out') && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Could not load files</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
                <button
                  onClick={() => fetchFiles()}
                  className="mt-2 text-xs font-medium text-red-700 dark:text-red-300 underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state — shown when no files, or when hub is not yet reachable (treat as empty) */}
        {!loading && activeFiles.length === 0 && (!error || error.includes('Failed to fetch') || error.includes('tunnel') || error.includes('timed out')) && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            {tab === 'my-drive' ? (
              <>
                <HardDrive className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-base font-medium mb-1">Your drive is empty</p>
                <p className="text-sm mb-5">Upload files to use as your personal cloud storage.</p>
                <button
                  onClick={() => triggerUpload(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Upload to My Drive
                </button>
              </>
            ) : (
              <>
                <FolderOpen className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-base font-medium mb-1">No shared files yet</p>
                <p className="text-sm mb-5">Files shared with the community will appear here.</p>
                <button
                  onClick={() => triggerUpload(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Share a File
                </button>
              </>
            )}
          </div>
        )}

        {/* No search results */}
        {!loading && !error && activeFiles.length > 0 && filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <Search className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm font-medium">No files match "{search}"</p>
          </div>
        )}

        {/* File list */}
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {filteredFiles.map((file, index) => {
              const isOwner = file.owner_id === myUserId;
              const isDeleting = deletingId === file.id;
              return (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: index * 0.03 }}
                  className="group bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      {getFileIcon(file)}
                    </div>

                    {/* Info – clickable for preview */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => openPreview(file)}
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {file.name || 'Unnamed file'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {file.size > 0 && <span>{formatFileSize(file.size)}</span>}
                        {file.uploaded_at && (
                          <>
                            {file.size > 0 && <span>·</span>}
                            <span>{timeAgo(file.uploaded_at)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {/* Preview – for previewable files (image, video, audio, pdf) */}
                      {getFileCategory(file) !== 'other' && (
                        <button
                          onClick={() => openPreview(file)}
                          className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
                          aria-label={`Preview ${file.name}`}
                          title="Preview"
                        >
                          <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        </button>
                      )}
                      {/* Toggle visibility – owner only */}
                      {isOwner && (
                        <button
                          onClick={() => handleToggleVisibility(file)}
                          disabled={togglingId === file.id}
                          className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors disabled:opacity-50"
                          aria-label={file.is_public ? 'Make private' : 'Make public'}
                          title={file.is_public ? 'Make private' : 'Make public'}
                        >
                          {togglingId === file.id ? (
                            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                          ) : file.is_public ? (
                            <Globe className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Lock className="w-4 h-4 text-blue-500" />
                          )}
                        </button>
                      )}

                      {/* Download */}
                      <button
                        onClick={() => handleDownload(file)}
                        className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
                        aria-label={`Download ${file.name}`}
                        title="Download"
                      >
                        <Download className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </button>

                      {/* Delete – owner only, always red */}
                      {isOwner && (
                        <button
                          onClick={() => handleDelete(file)}
                          disabled={isDeleting}
                          className="w-8 h-8 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center transition-colors disabled:opacity-50"
                          aria-label={`Delete ${file.name}`}
                          title="Delete"
                        >
                          {isDeleting
                            ? <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                            : <Trash2 className="w-4 h-4 text-red-500" />
                          }
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>

        {/* Storage summary */}
        {!loading && activeFiles.length > 0 && (
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <HardDrive className="w-3.5 h-3.5" />
            <span>
              {activeFiles.length} {activeFiles.length === 1 ? 'file' : 'files'}
              {totalSize > 0 ? ` · ${formatFileSize(totalSize)} total` : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Lightbox preview modal ── */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closePreview}
          >
            {/* Close button */}
            <button
              onClick={closePreview}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Close preview"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Download button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload(previewFile); }}
              className="absolute top-4 right-16 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Download"
              title="Download"
            >
              <Download className="w-5 h-5 text-white" />
            </button>

            {/* Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {previewLoading && (
                <div className="flex flex-col items-center gap-3 py-20">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="text-sm text-white/70">Loading preview...</p>
                </div>
              )}

              {previewError && (
                <div className="flex flex-col items-center gap-3 py-20">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-red-300">{previewError}</p>
                </div>
              )}

              {previewUrl && (() => {
                const category = getFileCategory(previewFile);
                if (category === 'image') {
                  return (
                    <img
                      src={previewUrl}
                      alt={previewFile.name}
                      className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl"
                    />
                  );
                }
                if (category === 'video') {
                  return (
                    <video
                      src={previewUrl}
                      controls
                      autoPlay
                      className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
                    />
                  );
                }
                if (category === 'audio') {
                  return (
                    <div className="bg-zinc-900/90 border border-zinc-700 rounded-2xl p-8 flex flex-col items-center gap-4 min-w-[320px]">
                      <FileAudio className="w-12 h-12 text-blue-400" />
                      <p className="text-sm text-white font-medium truncate max-w-[280px]">{previewFile.name}</p>
                      <audio src={previewUrl} controls autoPlay className="w-full" />
                    </div>
                  );
                }
                if (category === 'pdf') {
                  return (
                    <iframe
                      src={previewUrl}
                      title={previewFile.name}
                      className="w-[85vw] h-[80vh] rounded-lg shadow-2xl border-0 bg-white"
                    />
                  );
                }
                return null;
              })()}

              {/* File name bar */}
              {previewUrl && (
                <div className="mt-3 px-4 py-2 bg-black/50 rounded-full">
                  <p className="text-xs text-white/70 truncate max-w-[60vw]">
                    {previewFile.name}
                    {previewFile.size > 0 && ` · ${formatFileSize(previewFile.size)}`}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
