import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import { Loader2, AlertCircle, NotebookPen, Copy, Check, LogIn } from 'lucide-react';
import { hubService } from '../services/hubService';
import { getHubUrl } from '../utils/subdomain';

export const PENDING_FORK_KEY = 'citinet-pending-fork';

interface PublicNote {
  id: string;
  title: string;
  web_body_plain: string | null;
  web_body_rich: object | null;
  color?: string | null;
  created_at: string;
  updated_at: string;
}

function NoteViewer({ note }: { note: PublicNote }) {
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
    ],
    content: (note.web_body_rich as object) ?? note.web_body_plain ?? '',
  });

  return (
    <div className="w-full max-w-2xl mx-auto">
      {note.title && (
        <h1 className="text-2xl font-bold text-white mb-6 leading-tight break-words">
          {note.title}
        </h1>
      )}
      {editor ? (
        <div className="tiptap-editor text-zinc-300 text-sm leading-relaxed">
          <EditorContent editor={editor} />
        </div>
      ) : note.web_body_plain ? (
        <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
          {note.web_body_plain}
        </p>
      ) : (
        <p className="text-zinc-500 text-sm italic">No content.</p>
      )}
      <p className="mt-8 text-xs text-zinc-600">
        Last updated {new Date(note.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}

type CopyState = 'idle' | 'copying' | 'done' | 'redirecting' | 'error';

function CopyButton({ hubSlug, noteId }: { hubSlug: string; noteId: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const isConnected = !!hubService.getHubConnection(hubSlug);

  const handleCopy = async () => {
    if (isConnected) {
      setState('copying');
      try {
        const forked = await hubService.forkNote(hubSlug, noteId);
        setState('done');
        setTimeout(() => {
          window.location.href = `${window.location.origin}/notes/${forked.id}?hub=${hubSlug}`;
        }, 800);
      } catch {
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      }
    } else {
      setState('redirecting');
      sessionStorage.setItem(PENDING_FORK_KEY, JSON.stringify({ noteId, hubSlug }));
      setTimeout(() => {
        window.location.href = getHubUrl(hubSlug);
      }, 600);
    }
  };

  if (state === 'done') {
    return (
      <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium">
        <Check className="w-4 h-4" />
        Copied! Opening your notes…
      </div>
    );
  }

  if (state === 'redirecting') {
    return (
      <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-700 text-zinc-300 text-sm font-medium">
        <Loader2 className="w-4 h-4 animate-spin" />
        Taking you to sign in…
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-900/40 border border-rose-800 text-rose-300 text-sm font-medium">
        <AlertCircle className="w-4 h-4" />
        Couldn't copy — try again
      </div>
    );
  }

  return (
    <button
      onClick={handleCopy}
      disabled={state === 'copying'}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold transition-colors disabled:opacity-60"
    >
      {state === 'copying' ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isConnected ? (
        <Copy className="w-4 h-4" />
      ) : (
        <LogIn className="w-4 h-4" />
      )}
      {state === 'copying' ? 'Copying…' : isConnected ? 'Copy to my notes' : 'Copy to my notes'}
    </button>
  );
}

export function ShareNotePage() {
  const { hubSlug, noteId } = useParams<{ hubSlug: string; noteId: string }>();
  const [searchParams] = useSearchParams();

  const [note, setNote] = useState<PublicNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hubSlug || !noteId) { setError('Invalid share link'); setLoading(false); return; }

    const src = searchParams.get('src');
    if (!src || !/^https?:\/\/.+/.test(src)) {
      setError('This note cannot be reached — the hub does not have a public tunnel URL configured. The owner needs to set up Tailscale Funnel and re-share the link.');
      setLoading(false);
      return;
    }

    fetch(`${src}/api/public/notes/${noteId}`)
      .then(async r => {
        if (!r.ok) { setError('This note is not publicly accessible or no longer exists.'); return; }
        setNote(await r.json() as PublicNote);
      })
      .catch(() => setError('Could not reach the hub. It may be offline.'))
      .finally(() => setLoading(false));
  }, [hubSlug, noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-900 px-6 py-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tracking-tight text-white">citinet</span>
        <span className="text-xs text-zinc-500 font-medium">community network</span>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-20">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm text-zinc-400">Loading note…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-center max-w-sm">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : note ? (
          <div className="w-full max-w-2xl space-y-6">
            {/* Note card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-2 mb-6 text-amber-400">
                <NotebookPen className="w-4 h-4" />
                <span className="text-xs font-medium text-zinc-500">
                  Shared from <span className="text-zinc-400">{hubSlug}</span>
                </span>
              </div>
              <NoteViewer note={note} />
            </div>

            {/* Copy action */}
            {hubSlug && noteId && (
              <div className="flex flex-col items-center gap-2">
                <CopyButton hubSlug={hubSlug} noteId={noteId} />
                {!hubService.getHubConnection(hubSlug) && (
                  <p className="text-xs text-zinc-600 text-center max-w-xs">
                    You'll be asked to sign in (or join) the <span className="text-zinc-400">{hubSlug}</span> hub, then the note will be added to your notes automatically.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>

      <footer className="px-6 py-5 text-center">
        <p className="text-xs text-zinc-700">
          Note is hosted on the hub owner's device and served over their Tailscale connection.
        </p>
      </footer>
    </div>
  );
}
