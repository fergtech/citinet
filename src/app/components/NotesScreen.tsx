import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  ArrowLeft, Plus, Search, Pin, Archive, Trash2, MoreVertical,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  CheckSquare, X, NotebookPen, Check, AlertCircle, Loader2,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import type { HubNote } from '../types/hub';

interface NotesScreenProps {
  onBack: () => void;
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

function FormatToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, title: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
        active
          ? 'bg-slate-200 dark:bg-zinc-600 text-slate-900 dark:text-white'
          : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-800 dark:hover:text-zinc-200'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50">
      {btn(editor.isActive('bold'),        () => editor.chain().focus().toggleBold().run(),        'Bold',          <Bold className="w-3.5 h-3.5" />)}
      {btn(editor.isActive('italic'),      () => editor.chain().focus().toggleItalic().run(),      'Italic',        <Italic className="w-3.5 h-3.5" />)}
      {btn(editor.isActive('underline'),   () => editor.chain().focus().toggleUnderline().run(),   'Underline',     <UnderlineIcon className="w-3.5 h-3.5" />)}
      <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />
      {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  'Bullet list',   <List className="w-3.5 h-3.5" />)}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Ordered list',  <ListOrdered className="w-3.5 h-3.5" />)}
      {btn(editor.isActive('taskList'),    () => editor.chain().focus().toggleTaskList().run(),    'Checklist',     <CheckSquare className="w-3.5 h-3.5" />)}
    </div>
  );
}

// ─── Note List Item ───────────────────────────────────────────────────────────

function NoteListItem({
  note,
  isSelected,
  onSelect,
  onPin,
}: {
  note: HubNote;
  isSelected: boolean;
  onSelect: () => void;
  onPin: (e: React.MouseEvent) => void;
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
          <span className="text-[10px] text-slate-400 dark:text-zinc-500">{date}</span>
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
        </div>
      </div>
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 truncate">{preview}</p>
    </button>
  );
}

// ─── Note Editor (mounts fresh per note via key) ──────────────────────────────

function NoteEditor({
  note,
  hubSlug,
  autoFocusTitle,
  onSave,
  onSaveStatus,
}: {
  note: HubNote;
  hubSlug: string;
  autoFocusTitle?: boolean;
  onSave: (updated: HubNote) => void;
  onSaveStatus: (s: 'idle' | 'saving' | 'saved' | 'error') => void;
}) {
  const [titleValue, setTitleValue] = useState(note.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingPatch = useRef<Partial<HubNote>>({});
  const latestNote = useRef(note);
  latestNote.current = note;

  useEffect(() => {
    if (autoFocusTitle) {
      setTimeout(() => titleRef.current?.focus(), 30);
    }
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

  // Flush on unmount (note switch)
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    const patch = pendingPatch.current;
    if (Object.keys(patch).length) {
      hubService.updateNote(hubSlug, latestNote.current.id, patch).catch(() => {});
    }
  }, [hubSlug]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: note.body_rich ?? '',
    onUpdate: ({ editor }) => {
      scheduleAutosave({
        body_rich: editor.getJSON() as object,
        body_plain: editor.getText(),
      });
    },
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleValue(e.target.value);
    scheduleAutosave({ title: e.target.value });
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.commands.focus('end');
    }
  };

  const editedDate = (() => {
    const d = new Date(note.updated_at);
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <FormatToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 md:px-10 py-7">
          <input
            ref={titleRef}
            value={titleValue}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
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

export function NotesScreen({ onBack }: NotesScreenProps) {
  const { currentHub } = useHub();
  const hubSlug = currentHub?.slug ?? '';

  const [notes, setNotes] = useState<HubNote[]>([]);
  const [selected, setSelected] = useState<HubNote | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!hubSlug) return;
    hubService.listNotes(hubSlug)
      .then(data => { setNotes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hubSlug]);

  // Filtered + sectioned
  const q = query.trim().toLowerCase();
  const active = notes.filter(n => !n.is_archived);
  const filtered = q
    ? active.filter(n => n.title.toLowerCase().includes(q) || n.body_plain.toLowerCase().includes(q))
    : active;
  const pinned  = filtered.filter(n =>  n.is_pinned);
  const regular = filtered.filter(n => !n.is_pinned);

  const handleSave = useCallback((updated: HubNote) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setSelected(prev => prev?.id === updated.id ? updated : prev);
  }, []);

  const selectNote = (note: HubNote, autoFocusTitle = false) => {
    setSelected(note);
    setIsNewNote(autoFocusTitle);
    setMobileView('editor');
    setActionsOpen(false);
    setDeleteConfirm(false);
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

  const archiveNote = async () => {
    if (!selected) return;
    try {
      const updated = await hubService.updateNote(hubSlug, selected.id, { is_archived: true });
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      setSelected(null);
      setMobileView('list');
    } catch {}
    setActionsOpen(false);
  };

  const deleteNote = async () => {
    if (!selected) return;
    try {
      await hubService.deleteNote(hubSlug, selected.id);
      setNotes(prev => prev.filter(n => n.id !== selected.id));
      setSelected(null);
      setMobileView('list');
    } catch {}
    setDeleteConfirm(false);
    setActionsOpen(false);
  };

  const totalCount = notes.filter(n => !n.is_archived).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex">

      {/* ── List Panel ── */}
      <div className={`
        ${mobileView === 'editor' ? 'hidden' : 'flex'}
        md:flex flex-col
        w-full md:w-72 lg:w-80 xl:w-96
        border-r border-slate-200 dark:border-zinc-800
        bg-white dark:bg-zinc-950
      `}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-200 dark:border-zinc-800">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-none">Notes</h1>
            {!loading && <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">{totalCount} note{totalCount !== 1 ? 's' : ''}</p>}
          </div>
          <button
            onClick={createNote}
            className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-sm transition-colors"
            title="New note"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Note list */}
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
              {/* Pinned section */}
              {pinned.length > 0 && (
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

              {/* Regular notes */}
              {regular.length > 0 && (
                <>
                  {pinned.length > 0 && (
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
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Editor Panel ── */}
      <div className={`
        ${mobileView === 'list' ? 'hidden' : 'flex'}
        md:flex flex-col flex-1 min-w-0 min-h-screen
      `}>
        {selected ? (
          <>
            {/* Editor top bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              {/* Back (mobile) */}
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex-1" />
              <SaveIndicator status={saveStatus} />

              {/* Pin toggle */}
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

              {/* More actions */}
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
                    <div className="absolute right-0 top-9 z-20 w-44 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                      <button
                        onClick={archiveNote}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Archive className="w-3.5 h-3.5 text-slate-400" />
                        Archive note
                      </button>
                      {!deleteConfirm ? (
                        <button
                          onClick={() => setDeleteConfirm(true)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete note
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
            </div>

            {/* TipTap editor — key causes full remount when note changes */}
            <NoteEditor
              key={selected.id}
              note={selected}
              hubSlug={hubSlug}
              autoFocusTitle={isNewNote}
              onSave={handleSave}
              onSaveStatus={setSaveStatus}
            />
          </>
        ) : (
          /* No note selected — desktop empty state */
          <div className="hidden md:flex flex-col flex-1 items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
              <NotebookPen className="w-8 h-8 text-amber-500 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-700 dark:text-zinc-300 mb-1">Your private notes</h2>
            <p className="text-sm text-slate-400 dark:text-zinc-600 mb-5 max-w-xs">
              Only you can see these. Select a note to edit it, or create a new one.
            </p>
            <button
              onClick={createNote}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
