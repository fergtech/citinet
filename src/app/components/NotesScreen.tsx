import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Link from '@tiptap/extension-link';
import { Video } from './editor/VideoExtension';
import { LinkPreview } from './editor/LinkPreviewExtension';
import {
  ArrowLeft, Plus, Search, Pin, Archive, Trash2, MoreVertical,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  CheckSquare, X, NotebookPen, Check, AlertCircle, Loader2,
  Globe, Lock, ArchiveRestore, Link as LinkIcon, Users, Link2, Newspaper, Copy,
  Heading1, Heading2, Heading3, ImagePlus, Code2, Video as VideoIcon, Youtube as YoutubeIcon, ExternalLink,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import type { HubNote } from '../types/hub';

interface NotesScreenProps {
  onBack: () => void;
  initialNoteId?: string;
}

// ─── Save Status Indicator ────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  return (
    <span className={`flex items-center gap-1 text-xs transition-all ${
      status === 'saving' ? 'text-slate-400 dark:text-zinc-500' :
      status === 'saved'  ? 'text-emerald-600 dark:text-emerald-400' :
                            'text-red-500'
    }`}>
      {status === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'saved'  && <Check className="w-3 h-3" />}
      {status === 'error'  && <AlertCircle className="w-3 h-3" />}
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Retry'}
    </span>
  );
}

// ─── Format Toolbar ───────────────────────────────────────────────────────────

function FormatToolbar({ editor, hubSlug }: { editor: ReturnType<typeof useEditor>; hubSlug: string }) {
  const [imgUploading, setImgUploading]       = useState(false);
  const [videoUploading, setVideoUploading]   = useState(false);
  const [linkFetching, setLinkFetching]       = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, title: string, icon: React.ReactNode, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-zinc-600'
          : active
          ? 'bg-slate-200 dark:bg-zinc-600 text-slate-900 dark:text-white'
          : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-800 dark:hover:text-zinc-200'
      }`}
    >
      {icon}
    </button>
  );

  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const getHubFileUrl = (fileName: string) => {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.hub.tunnelUrl) return null;
    return `${conn.hub.tunnelUrl}/api/public/files/${encodeURIComponent(fileName)}`;
  };

  const handleImageFile = async (file: File) => {
    setImgUploading(true);
    try {
      const result = await hubService.uploadFile(hubSlug, file, true);
      const url = getHubFileUrl(result.name);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } catch { /* silent */ } finally {
      setImgUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVideoFile = async (file: File) => {
    setVideoUploading(true);
    try {
      const result = await hubService.uploadFile(hubSlug, file, true);
      const url = getHubFileUrl(result.name);
      if (url) {
        editor.chain().focus().insertContent({
          type: 'video',
          attrs: { src: url, mimeType: file.type },
        }).run();
      }
    } catch { /* silent */ } finally {
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleYouTube = () => {
    const url = prompt('Paste a YouTube URL:');
    if (!url) return;
    editor.chain().focus().setYoutubeVideo({ src: url }).run();
  };

  const handleLinkPreview = async () => {
    const url = prompt('Paste any URL to embed a preview:');
    if (!url) return;
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.hub.tunnelUrl) return;
    setLinkFetching(true);
    try {
      const res = await fetch(
        `${conn.hub.tunnelUrl}/api/public/og?url=${encodeURIComponent(url)}`,
      );
      if (res.ok) {
        const data = await res.json();
        editor.chain().focus().insertContent({
          type: 'linkPreview',
          attrs: {
            url:         data.url || url,
            title:       data.title || url,
            description: data.description || '',
            image:       data.image || null,
            siteName:    data.site_name || '',
          },
        }).run();
      } else {
        // Fallback: insert as plain link
        editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
      }
    } catch {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } finally {
      setLinkFetching(false);
    }
  };

  const sep = <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />;

  return (
    <>
      <input ref={fileInputRef}  type="file" accept="image/*"  className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
      <input ref={videoInputRef} type="file" accept="video/*"  className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); }} />
      <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex-shrink-0 flex-wrap">
        {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'Heading 1', <Heading1 className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2', <Heading2 className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Heading 3', <Heading3 className="w-3.5 h-3.5" />)}
        {sep}
        {btn(editor.isActive('bold'),      () => editor.chain().focus().toggleBold().run(),      'Bold',        <Bold className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('italic'),    () => editor.chain().focus().toggleItalic().run(),    'Italic',      <Italic className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline',   <UnderlineIcon className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('code'),      () => editor.chain().focus().toggleCode().run(),      'Inline code', <Code2 className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('link'),      handleLink,                                           'Add link',    <LinkIcon className="w-3.5 h-3.5" />)}
        {sep}
        {btn(false, () => fileInputRef.current?.click(),  'Insert image',    imgUploading   ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />,   imgUploading)}
        {btn(false, () => videoInputRef.current?.click(), 'Upload video',    videoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VideoIcon className="w-3.5 h-3.5" />,   videoUploading)}
        {btn(false, handleYouTube,                        'Embed YouTube',   false ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <YoutubeIcon className="w-3.5 h-3.5" />)}
        {btn(false, handleLinkPreview,                    'Embed link preview', linkFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />, linkFetching)}
        {sep}
        {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  'Bullet list',  <List className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Ordered list', <ListOrdered className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('taskList'),    () => editor.chain().focus().toggleTaskList().run(),    'Checklist',    <CheckSquare className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('codeBlock'),   () => editor.chain().focus().toggleCodeBlock().run(),   'Code block',   <Code2 className="w-3.5 h-3.5" />)}
      </div>
    </>
  );
}

// ─── Note List Item ───────────────────────────────────────────────────────────

function NoteListItem({
  note,
  isSelected,
  onSelect,
  onPin,
  inArchive = false,
}: {
  note: HubNote;
  isSelected: boolean;
  onSelect: () => void;
  onPin: (e: React.MouseEvent) => void;
  inArchive?: boolean;
}) {
  const preview = note.body_plain.trim().slice(0, 80) || 'No additional text';
  const title = note.title.trim() || 'Untitled';

  const date = (() => {
    const d = new Date(note.updated_at);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  })();

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-zinc-800/60 transition-colors group relative ${
        isSelected
          ? 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-400'
          : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-900 dark:text-zinc-100 truncate leading-snug">
          {title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {note.is_blog_published && !inArchive && (
            <Newspaper className="w-3 h-3 text-violet-500 opacity-80" aria-label="Published to blog" />
          )}
          {note.is_web_public && !note.is_blog_published && !inArchive && (
            <Globe className="w-3 h-3 text-emerald-500 opacity-80" aria-label="Web public note" />
          )}
          {note.is_public && !note.is_web_public && !inArchive && (
            <Users className="w-3 h-3 text-indigo-400 dark:text-indigo-500 opacity-70" aria-label="Hub members note" />
          )}
          <span className="text-[10px] text-slate-400 dark:text-zinc-500">{date}</span>
          {!inArchive && (
            <button
              onClick={onPin}
              title={note.is_pinned ? 'Unpin' : 'Pin'}
              className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                note.is_pinned
                  ? 'text-amber-500 opacity-100'
                  : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-500'
              }`}
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {note.forked_from_username && (
        <p className="flex items-center gap-1 text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5">
          <Copy className="w-2.5 h-2.5 shrink-0" />
          Copied from @{note.forked_from_username}
        </p>
      )}
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 truncate">{preview}</p>
    </button>
  );
}

// ─── Note Editor ──────────────────────────────────────────────────────────────

function NoteEditor({
  note,
  hubSlug,
  autoFocusTitle,
  readOnly,
  onSave,
  onSaveStatus,
}: {
  note: HubNote;
  hubSlug: string;
  autoFocusTitle?: boolean;
  readOnly?: boolean;
  onSave: (updated: HubNote) => void;
  onSaveStatus: (s: 'idle' | 'saving' | 'saved' | 'error') => void;
}) {
  const [titleValue, setTitleValue] = useState(note.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingPatch = useRef<Partial<HubNote>>({});
  const latestNote = useRef(note);
  latestNote.current = note;

  // Refs hold the latest upload-and-insert functions so editorProps callbacks
  // (created once on mount) always call the current closure.
  const uploadImageRef = useRef<(file: File) => void>(() => {});
  const uploadVideoRef = useRef<(file: File) => void>(() => {});

  useEffect(() => {
    if (autoFocusTitle) setTimeout(() => titleRef.current?.focus(), 30);
  }, [autoFocusTitle]);

  const flushSave = useCallback(async () => {
    const patch = { ...pendingPatch.current };
    if (!Object.keys(patch).length) return;
    pendingPatch.current = {};
    try {
      const updated = await hubService.updateNote(hubSlug, latestNote.current.id, patch);
      onSave(updated);
      onSaveStatus('saved');
      setTimeout(() => onSaveStatus('idle'), 2000);
    } catch {
      onSaveStatus('error');
    }
  }, [hubSlug, onSave, onSaveStatus]);

  const scheduleAutosave = useCallback((patch: Partial<HubNote>) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    onSaveStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 700);
  }, [flushSave, onSaveStatus]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    const patch = pendingPatch.current;
    if (Object.keys(patch).length) {
      hubService.updateNote(hubSlug, latestNote.current.id, patch).catch(() => {});
    }
  }, [hubSlug]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ width: 640, height: 360, nocookie: true }),
      Link.configure({ openOnClick: false }),
      Video,
      LinkPreview,
    ],
    content: note.body_rich ?? '',
    editable: !readOnly,
    editorProps: {
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const images = files.filter(f => f.type.startsWith('image/'));
        const videos = files.filter(f => f.type.startsWith('video/'));
        if (!images.length && !videos.length) return false;
        event.preventDefault();
        images.forEach(f => uploadImageRef.current(f));
        videos.forEach(f => uploadVideoRef.current(f));
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const images = files.filter(f => f.type.startsWith('image/'));
        const videos = files.filter(f => f.type.startsWith('video/'));
        if (!images.length && !videos.length) return false;
        images.forEach(f => {
          const named = new File([f], `paste-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type });
          uploadImageRef.current(named);
        });
        videos.forEach(f => {
          const named = new File([f], `paste-${Date.now()}.${f.type.split('/')[1] || 'mp4'}`, { type: f.type });
          uploadVideoRef.current(named);
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (readOnly) return;
      const body_rich  = editor.getJSON() as object;
      const body_plain = editor.getText();
      const patch: Parameters<typeof scheduleAutosave>[0] = { body_rich, body_plain };
      // Keep the published snapshot (web_body_rich) in sync automatically so
      // edits made after publishing appear on the blog without re-publishing.
      if (latestNote.current.is_web_public || latestNote.current.is_blog_published) {
        patch.web_body_rich  = body_rich;
        patch.web_body_plain = body_plain;
      }
      scheduleAutosave(patch);
    },
  });

  // Keep upload refs in sync with the current editor + hubSlug closure.
  useEffect(() => {
    const getUrl = async (file: File) => {
      const result = await hubService.uploadFile(hubSlug, file, true);
      const conn = hubService.getHubConnection(hubSlug);
      if (!conn?.hub.tunnelUrl) return null;
      return `${conn.hub.tunnelUrl}/api/public/files/${encodeURIComponent(result.name)}`;
    };

    uploadImageRef.current = async (file: File) => {
      if (!editor) return;
      try {
        const url = await getUrl(file);
        if (url) editor.chain().focus().setImage({ src: url }).run();
      } catch { /* silent */ }
    };

    uploadVideoRef.current = async (file: File) => {
      if (!editor) return;
      try {
        const url = await getUrl(file);
        if (url) editor.chain().focus().insertContent({ type: 'video', attrs: { src: url, mimeType: file.type } }).run();
      } catch { /* silent */ }
    };
  }, [editor, hubSlug]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    setTitleValue(e.target.value);
    scheduleAutosave({ title: e.target.value });
  };

  const editedDate = (() => {
    const d = new Date(note.updated_at);
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {!readOnly && <FormatToolbar editor={editor} hubSlug={hubSlug} />}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 md:px-10 py-7">
          <input
            ref={titleRef}
            value={titleValue}
            onChange={handleTitleChange}
            readOnly={readOnly}
            placeholder="Title"
            className="w-full text-2xl md:text-3xl font-bold bg-transparent outline-none text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-zinc-700 mb-1.5 leading-tight"
          />
          <p className="text-[11px] text-slate-400 dark:text-zinc-600 mb-5">{editedDate}</p>
          <div className="tiptap-editor text-sm md:text-base text-slate-800 dark:text-zinc-200 leading-relaxed">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function NotesScreen({ onBack, initialNoteId }: NotesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const navigate = useNavigate();

  const [notes, setNotes] = useState<HubNote[]>([]);
  const [archivedNotes, setArchivedNotes] = useState<HubNote[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [selected, setSelected] = useState<HubNote | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [visPopoverOpen, setVisPopoverOpen] = useState(false);
  const [noteLinkCopied, setNoteLinkCopied] = useState(false);

  // Is the currently selected note owned by this user?
  const isOwnNote = !selected || selected.owner_id === currentUser?.hubUserId;

  // Load active notes on mount, then resolve any initialNoteId
  useEffect(() => {
    if (!hubSlug) return;
    hubService.listNotes(hubSlug)
      .then(async data => {
        setNotes(data);
        setLoading(false);
        if (initialNoteId) {
          // First check if it's in the already-loaded list (own active note)
          const inList = data.find(n => n.id === initialNoteId);
          if (inList) {
            setSelected(inList);
            setMobileView('editor');
          } else {
            // Could be archived or someone else's public note — fetch directly
            try {
              const note = await hubService.getNote(hubSlug, initialNoteId);
              setSelected(note);
              setMobileView('editor');
            } catch { /* note not found or not accessible */ }
          }
        }
      })
      .catch(() => setLoading(false));
  }, [hubSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load archived notes when archive view is opened
  useEffect(() => {
    if (!showArchive || !hubSlug) return;
    hubService.listNotes(hubSlug, true)
      .then(data => setArchivedNotes(data))
      .catch(() => {});
  }, [showArchive, hubSlug]);

  // Switch view: clear selection when switching between archive and notes
  const switchView = (toArchive: boolean) => {
    setShowArchive(toArchive);
    setSelected(null);
    setMobileView('list');
    setQuery('');
    navigate('/notes', { replace: true });
  };

  // ── Filtered + sectioned ──────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const currentList = showArchive ? archivedNotes : notes.filter(n => !n.is_archived);
  const filtered = q
    ? currentList.filter(n => n.title.toLowerCase().includes(q) || n.body_plain.toLowerCase().includes(q))
    : currentList;
  const pinned  = filtered.filter(n =>  n.is_pinned);
  const regular = filtered.filter(n => !n.is_pinned);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSave = useCallback((updated: HubNote) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setArchivedNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setSelected(prev => prev?.id === updated.id ? updated : prev);
  }, []);

  const selectNote = (note: HubNote, autoFocusTitle = false) => {
    setSelected(note);
    setIsNewNote(autoFocusTitle);
    setMobileView('editor');
    setActionsOpen(false);
    setDeleteConfirm(false);
    navigate(`/notes/${note.id}`, { replace: true });
  };

  const createNote = async () => {
    if (!hubSlug) return;
    try {
      const note = await hubService.createNote(hubSlug, { title: '', body_plain: '' });
      setNotes(prev => [note, ...prev]);
      selectNote(note, true);
    } catch {}
  };

  const togglePin = async (note: HubNote, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const updated = await hubService.updateNote(hubSlug, note.id, { is_pinned: !note.is_pinned });
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      if (selected?.id === note.id) setSelected(updated);
    } catch {}
    setActionsOpen(false);
  };

  const handleSetNoteVisibility = async (target: 'private' | 'hub' | 'web' | 'blog') => {
    if (!selected) return;
    setVisPopoverOpen(false);
    setActionsOpen(false);
    try {
      let updated: HubNote;
      if (target === 'blog') {
        // Blog: web-public + blog-published. Flush decrypted body for public serving.
        updated = await hubService.setNoteWebPublic(hubSlug, selected.id, true, {
          body_plain: selected.body_plain,
          body_rich: selected.body_rich,
        });
        updated = await hubService.updateNote(hubSlug, selected.id, { is_public: true, is_blog_published: true });
        updated = { ...updated, is_web_public: true, is_blog_published: true };
      } else if (target === 'web') {
        updated = await hubService.setNoteWebPublic(hubSlug, selected.id, true, {
          body_plain: selected.body_plain,
          body_rich: selected.body_rich,
        });
        updated = await hubService.updateNote(hubSlug, selected.id, { is_public: true, is_blog_published: false });
        updated = { ...updated, is_web_public: true, is_blog_published: false };
      } else if (target === 'hub') {
        updated = await hubService.setNoteWebPublic(hubSlug, selected.id, false);
        updated = await hubService.updateNote(hubSlug, selected.id, { is_public: true, is_blog_published: false });
        updated = { ...updated, is_web_public: false, is_blog_published: false };
      } else {
        updated = await hubService.setNoteWebPublic(hubSlug, selected.id, false);
        updated = await hubService.updateNote(hubSlug, selected.id, { is_public: false, is_blog_published: false });
        updated = { ...updated, is_web_public: false, is_blog_published: false };
      }
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      setSelected(updated);
    } catch {}
  };

  const handleCopyNoteLink = () => {
    if (!selected) return;
    const link = hubService.getPublicNoteLink(hubSlug, selected.id);
    navigator.clipboard.writeText(link).then(() => {
      setNoteLinkCopied(true);
      setTimeout(() => setNoteLinkCopied(false), 2000);
    });
    setVisPopoverOpen(false);
  };

  const clearSelected = () => {
    setSelected(null);
    setMobileView('list');
    navigate('/notes', { replace: true });
  };

  const archiveNote = async () => {
    if (!selected) return;
    try {
      const updated = await hubService.updateNote(hubSlug, selected.id, { is_archived: true });
      setNotes(prev => prev.filter(n => n.id !== updated.id));
      setArchivedNotes(prev => [updated, ...prev.filter(n => n.id !== updated.id)]);
      clearSelected();
    } catch {}
    setActionsOpen(false);
  };

  const unarchiveNote = async () => {
    if (!selected) return;
    try {
      const updated = await hubService.updateNote(hubSlug, selected.id, { is_archived: false });
      setArchivedNotes(prev => prev.filter(n => n.id !== updated.id));
      setNotes(prev => [updated, ...prev]);
      clearSelected();
    } catch {}
    setActionsOpen(false);
  };

  const deleteNote = async () => {
    if (!selected) return;
    try {
      await hubService.deleteNote(hubSlug, selected.id);
      setNotes(prev => prev.filter(n => n.id !== selected.id));
      setArchivedNotes(prev => prev.filter(n => n.id !== selected.id));
      clearSelected();
    } catch {}
    setDeleteConfirm(false);
    setActionsOpen(false);
  };

  const activeCount   = notes.filter(n => !n.is_archived).length;
  const archiveCount  = archivedNotes.length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    // h-screen + overflow-hidden = viewport-locked; each panel scrolls independently
    <div className="h-screen overflow-hidden bg-white dark:bg-zinc-950 flex">

      {/* ── List Panel (fixed-height sidebar) ─────────────────────────────── */}
      <div className={`
        ${mobileView === 'editor' ? 'hidden' : 'flex'}
        md:flex flex-col
        w-full md:w-72 lg:w-80 xl:w-96
        h-full flex-shrink-0
        border-r border-slate-200 dark:border-zinc-800
        bg-white dark:bg-zinc-950
      `}>

        {/* Header — fixed */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
          <button
            onClick={showArchive ? () => switchView(false) : onBack}
            className="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-none">
              {showArchive ? 'Archive' : 'Notes'}
            </h1>
            {!loading && (
              <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">
                {showArchive
                  ? `${archiveCount} archived note${archiveCount !== 1 ? 's' : ''}`
                  : `${activeCount} note${activeCount !== 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          {!showArchive && (
            <button
              onClick={createNote}
              className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-sm transition-colors"
              title="New note"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search — fixed */}
        <div className="px-3 py-2.5 border-b border-slate-100 dark:border-zinc-800/60 flex-shrink-0">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={showArchive ? 'Search archive…' : 'Search notes…'}
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Note list — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 px-6 text-center">
              {q ? (
                <>
                  <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">No results</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">Try a different search term</p>
                </>
              ) : showArchive ? (
                <>
                  <Archive className="w-8 h-8 text-slate-300 dark:text-zinc-700 mb-2" />
                  <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">Archive is empty</p>
                </>
              ) : (
                <>
                  <NotebookPen className="w-8 h-8 text-amber-400 mb-2 opacity-60" />
                  <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">No notes yet</p>
                  <button
                    onClick={createNote}
                    className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-medium hover:underline"
                  >
                    Create your first note
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {pinned.length > 0 && !showArchive && (
                <>
                  <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                    <Pin className="w-3 h-3 text-slate-400 dark:text-zinc-600" />
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-600 uppercase tracking-wider">Pinned</span>
                  </div>
                  {pinned.map(note => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      isSelected={selected?.id === note.id}
                      onSelect={() => selectNote(note)}
                      onPin={e => togglePin(note, e)}
                    />
                  ))}
                </>
              )}
              {regular.length > 0 && (
                <>
                  {pinned.length > 0 && !showArchive && (
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-600 uppercase tracking-wider">Notes</span>
                    </div>
                  )}
                  {regular.map(note => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      isSelected={selected?.id === note.id}
                      onSelect={() => selectNote(note)}
                      onPin={e => togglePin(note, e)}
                      inArchive={showArchive}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Archive toggle — fixed at bottom */}
        <div className="flex-shrink-0 border-t border-slate-100 dark:border-zinc-800/60 px-3 py-2">
          {showArchive ? (
            <button
              onClick={() => switchView(false)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Notes
            </button>
          ) : (
            <button
              onClick={() => switchView(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
              {archiveCount > 0 && (
                <span className="ml-auto text-[10px] bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">
                  {archiveCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Editor Panel (independent scroll) ────────────────────────────── */}
      <div className={`
        ${mobileView === 'list' ? 'hidden' : 'flex'}
        md:flex flex-col flex-1 min-w-0 h-full overflow-hidden
      `}>
        {selected ? (
          <>
            {/* Editor top bar — fixed */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
              <button
                onClick={() => { setMobileView('list'); }}
                className="md:hidden w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex-1" />
              {isOwnNote && <SaveIndicator status={saveStatus} />}

              {/* Visibility popover — own notes only */}
              {isOwnNote && !showArchive && (() => {
                const isAdminOrMod = currentUser?.isAdmin || currentUser?.hubRole === 'moderator';
                // Blog-published notes are also web-public — "web" covers both states
                // for the privacy radio; blog listing is a secondary toggle below it.
                const vis = (selected.is_web_public || selected.is_blog_published) ? 'web' : selected.is_public ? 'hub' : 'private';
                const isBlogPublished = !!selected.is_blog_published;
                return (
                  <div className="relative">
                    {visPopoverOpen && <div className="fixed inset-0 z-40" onClick={() => setVisPopoverOpen(false)} />}
                    <button
                      onClick={() => setVisPopoverOpen(v => !v)}
                      title="Set visibility"
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        isBlogPublished
                          ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                          : vis === 'web'
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                          : vis === 'hub'
                          ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {isBlogPublished ? <Newspaper className="w-4 h-4" /> : vis === 'web' ? <Globe className="w-4 h-4" /> : vis === 'hub' ? <Users className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>
                    {visPopoverOpen && (
                      <div className="absolute right-0 top-9 z-50 w-60 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                        <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Who can read</p>
                        {([
                          { key: 'private', label: 'Only me',          sub: 'Private',            Icon: Lock,      color: 'text-slate-400' },
                          { key: 'hub',     label: 'Hub members',       sub: 'Requires account',   Icon: Users,     color: 'text-indigo-400' },
                          { key: 'web',     label: 'Anyone with link',  sub: 'No account needed',  Icon: Globe,     color: 'text-emerald-500' },
                        ] as { key: 'private'|'hub'|'web'; label: string; sub: string; Icon: React.ElementType; color: string }[]).map(({ key, label, sub, Icon, color }) => (
                          <button
                            key={key}
                            onClick={() => handleSetNoteVisibility(key)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-slate-800 dark:text-zinc-100">{label}</span>
                              <span className="block text-xs text-slate-400 dark:text-zinc-500">{sub}</span>
                            </span>
                            {vis === key && <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                          </button>
                        ))}
                        {/* Secondary actions shown when the note is web-accessible */}
                        {vis === 'web' && (
                          <div className="border-t border-slate-100 dark:border-zinc-800">
                            {/* Blog publish toggle — admin/mod only */}
                            {isAdminOrMod && (
                              <button
                                onClick={() => handleSetNoteVisibility(isBlogPublished ? 'web' : 'blog')}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                              >
                                <Newspaper className={`w-4 h-4 shrink-0 ${isBlogPublished ? 'text-violet-500' : 'text-slate-300 dark:text-zinc-600'}`} />
                                <span className="flex-1 min-w-0">
                                  <span className={`block text-sm font-medium ${isBlogPublished ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-zinc-300'}`}>
                                    {isBlogPublished ? 'Listed on public blog' : 'Publish to blog'}
                                  </span>
                                  <span className="block text-xs text-slate-400 dark:text-zinc-500">
                                    {isBlogPublished ? 'Tap to remove from blog' : 'Admin/mod only'}
                                  </span>
                                </span>
                                {isBlogPublished && <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                              </button>
                            )}
                            <button
                              onClick={handleCopyNoteLink}
                              className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {noteLinkCopied
                                ? <Check className="w-4 h-4 text-emerald-500" />
                                : <Link2 className="w-4 h-4 text-slate-400" />}
                              <span className="text-sm text-slate-700 dark:text-zinc-300">
                                {noteLinkCopied ? 'Copied!' : 'Copy share link'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Pin toggle — own notes only */}
              {isOwnNote && !showArchive && (
                <button
                  onClick={() => togglePin(selected)}
                  title={selected.is_pinned ? 'Unpin' : 'Pin to top'}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                    selected.is_pinned
                      ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Pin className="w-4 h-4" />
                </button>
              )}

              {/* More actions — own notes only */}
              {isOwnNote && (
                <div className="relative">
                  <button
                    onClick={() => { setActionsOpen(v => !v); setDeleteConfirm(false); }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {actionsOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => { setActionsOpen(false); setDeleteConfirm(false); }} />
                      <div className="absolute right-0 top-9 z-20 w-48 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                        {showArchive ? (
                          <button
                            onClick={unarchiveNote}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <ArchiveRestore className="w-3.5 h-3.5 text-emerald-500" />
                            Restore note
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => { setActionsOpen(false); setVisPopoverOpen(true); }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Globe className="w-3.5 h-3.5 text-indigo-400" />
                              Set visibility
                            </button>
                            <button
                              onClick={archiveNote}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Archive className="w-3.5 h-3.5 text-slate-400" />
                              Archive note
                            </button>
                          </>
                        )}
                        {!deleteConfirm ? (
                          <button
                            onClick={() => setDeleteConfirm(true)}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-zinc-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete permanently
                          </button>
                        ) : (
                          <div className="px-3.5 py-2.5 border-t border-slate-100 dark:border-zinc-800">
                            <p className="text-xs text-slate-600 dark:text-zinc-400 mb-2">Delete permanently?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={deleteNote}
                                className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(false)}
                                className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Public note banner — shown when viewing someone else's note */}
            {!isOwnNote && (
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800 flex-shrink-0">
                <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                  Public note — read only
                </p>
              </div>
            )}

            {/* TipTap editor — key causes full remount when note changes */}
            <NoteEditor
              key={selected.id}
              note={selected}
              hubSlug={hubSlug}
              autoFocusTitle={isNewNote && isOwnNote}
              readOnly={showArchive || !isOwnNote}
              onSave={handleSave}
              onSaveStatus={setSaveStatus}
            />
          </>
        ) : (
          /* No note selected — desktop empty state */
          <div className="hidden md:flex flex-col flex-1 items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
              {showArchive
                ? <Archive className="w-8 h-8 text-slate-400 dark:text-zinc-500" />
                : <NotebookPen className="w-8 h-8 text-amber-500 dark:text-amber-400" />}
            </div>
            <h2 className="text-lg font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              {showArchive ? 'Archived notes' : 'Your private notes'}
            </h2>
            <p className="text-sm text-slate-400 dark:text-zinc-600 mb-5 max-w-xs">
              {showArchive
                ? 'Select a note to view it. Restore or delete from the ⋮ menu.'
                : 'Private by default. Use the visibility button to share with hub members or anyone with a link.'}
            </p>
            {!showArchive && (
              <button
                onClick={createNote}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Note
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
