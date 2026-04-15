import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, Users, Lock, Eye, Globe,
  Loader2, AlertCircle, Settings, LogOut, UserPlus,
  Check, X, ChevronRight, MessageCircle, Share2,
  LayoutGrid, Send, Image as ImageIcon, Video, FileText,
  Download, Sparkles, Palette, ImagePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useHub } from '../context/HubContext';
import { spacesService } from '../services/spacesService';
import { hubService } from '../services/hubService';
import type { HubSpace, HubSpaceMember, HubPost, HubMember, HubSpaceFile } from '../types/hub';

interface SpacesScreenProps {
  onBack: () => void;
}

// ── Constants (same as AccountScreen) ────────────────────

const BANNER_SOLID_COLORS = ['#0f766e', '#0369a1', '#1d4ed8', '#6d28d9', '#be123c', '#b45309', '#374151'];
const BANNER_GRADIENTS = [
  { from: '#2563eb', to: '#7c3aed' },
  { from: '#0f766e', to: '#2563eb' },
  { from: '#be123c', to: '#7c2d12' },
  { from: '#1d4ed8', to: '#0f766e' },
  { from: '#c2410c', to: '#be123c' },
  { from: '#374151', to: '#111827' },
  { from: '#7c3aed', to: '#ec4899' },
  { from: '#065f46', to: '#0f766e' },
];

// ── helpers ──────────────────────────────────────────────

function visibilityIcon(v: string) {
  if (v === 'private') return <Lock className="w-3 h-3" />;
  if (v === 'invite-only') return <Eye className="w-3 h-3" />;
  return <Globe className="w-3 h-3" />;
}
function visibilityLabel(v: string) {
  if (v === 'private') return 'Private';
  if (v === 'invite-only') return 'Invite Only';
  return 'Public';
}
function canManage(role?: string | null) { return role === 'owner' || role === 'admin'; }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatBytes(b?: number) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }
function getAvatarColor(name: string) {
  const colors = ['from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500', 'from-violet-500 to-purple-500'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function fileTypeIcon(mime?: string) {
  if (!mime) return <FileText className="w-5 h-5 text-zinc-400" />;
  if (mime.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-400" />;
  if (mime.startsWith('video/')) return <Video className="w-5 h-5 text-purple-400" />;
  return <FileText className="w-5 h-5 text-zinc-400" />;
}

function isImage(mime?: string) { return !!mime?.startsWith('image/'); }
function isVideo(mime?: string) { return !!mime?.startsWith('video/'); }

// ── Banner style ─────────────────────────────────────────

function getBannerStyle(space: HubSpace, tunnelUrl: string): React.CSSProperties {
  if (space.banner_mode === 'image' && space.banner_image_file_name) {
    const url = spacesService.getSpaceBannerUrl(tunnelUrl, space.slug);
    return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (space.banner_mode === 'solid' && space.banner_color) {
    return { backgroundColor: space.banner_color };
  }
  if (space.banner_mode === 'gradient' && space.banner_gradient_from && space.banner_gradient_to) {
    return { backgroundImage: `linear-gradient(135deg, ${space.banner_gradient_from}, ${space.banner_gradient_to})` };
  }
  // deterministic default gradient per space name
  const grads = [
    ['#2563eb', '#7c3aed'], ['#0f766e', '#2563eb'], ['#7c3aed', '#ec4899'],
    ['#065f46', '#0f766e'], ['#c2410c', '#be123c'], ['#374151', '#111827'],
  ];
  let h = 0;
  for (let i = 0; i < space.name.length; i++) h = space.name.charCodeAt(i) + ((h << 5) - h);
  const [from, to] = grads[Math.abs(h) % grads.length];
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

// ── Create Space Modal ────────────────────────────────────

function CreateSpaceModal({ hubSlug, onCreated, onClose }: { hubSlug: string; onCreated: (s: HubSpace) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'invite-only'>('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slugManual, setSlugManual] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugManual) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const space = await spacesService.create(hubSlug, { name, slug, description: desc, visibility });
      onCreated(space);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Create a Space</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Space Name</label>
            <input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Neighborhood Garden Club" required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Slug (URL)</label>
            <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-xl px-3 focus-within:border-purple-500 overflow-hidden">
              <span className="text-zinc-500 text-sm mr-1">spaces/</span>
              <input value={slug} onChange={e => { setSlug(e.target.value); setSlugManual(true); }} placeholder="garden-club" required
                className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Description <span className="text-zinc-600">(optional)</span></label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What is this space about?"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Visibility</label>
            <div className="grid grid-cols-3 gap-2">
              {(['public', 'private', 'invite-only'] as const).map(v => (
                <button key={v} type="button" onClick={() => setVisibility(v)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${visibility === v ? 'bg-purple-600 border-purple-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
                  {visibilityLabel(v)}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              {visibility === 'public' ? 'Anyone on the hub can join directly.' : visibility === 'private' ? 'Members request to join; admin approves.' : 'Members can only join via invitation.'}
            </p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700">Cancel</button>
            <button type="submit" disabled={loading || !name || !slug}
              className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create Space
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Invite Member Modal ───────────────────────────────────

function InviteMemberModal({ hubSlug, spaceSlug, onClose }: { hubSlug: string; spaceSlug: string; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<HubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    hubService.listMembers(hubSlug).then(setMembers).catch(() => {}).finally(() => setLoading(false));
  }, [hubSlug]);

  const filtered = members.filter(m => (m.username + (m.display_name || '')).toLowerCase().includes(search.toLowerCase()));

  async function invite(userId: string) {
    setInviting(userId); setError('');
    try {
      await spacesService.invite(hubSlug, spaceSlug, userId);
      setInvited(prev => new Set([...prev, userId]));
    } catch (err: any) { setError(err.message); }
    finally { setInviting(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Invite Members</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center"><X className="w-4 h-4 text-zinc-400" /></button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hub members…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500" />
          </div>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {loading && <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>}
            {!loading && filtered.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-800">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(m.username)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>{getInitials(m.display_name || m.username)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{m.display_name || m.username}</p>
                  <p className="text-xs text-zinc-500">@{m.username}</p>
                </div>
                <button onClick={() => invite(m.user_id)} disabled={inviting === m.user_id || invited.has(m.user_id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${invited.has(m.user_id) ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
                  {inviting === m.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : invited.has(m.user_id) ? <><Check className="w-3 h-3" /> Invited</> : <><UserPlus className="w-3 h-3" /> Invite</>}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700">Done</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Compose Post ──────────────────────────────────────────

function ComposePost({ hubSlug, spaceSlug, onPosted }: { hubSlug: string; spaceSlug: string; onPosted: (p: HubPost) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(f);
    setMediaPreview(URL.createObjectURL(f));
  }
  function removeMedia() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null); setMediaPreview(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true); setError('');
    try {
      const post = await spacesService.createPost(hubSlug, spaceSlug, { title, body, mediaFile: mediaFile ?? undefined });
      onPosted(post);
      setTitle(''); setBody(''); removeMedia(); setOpen(false);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full max-w-2xl mx-auto flex items-center gap-3 px-4 py-3 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-zinc-400 text-sm transition-colors">
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"><Plus className="w-4 h-4" /></div>
        <span>Share something with this space…</span>
      </button>
    );
  }

  const isVid = mediaFile?.type.startsWith('video/');

  return (
    <form onSubmit={submit} className="w-full max-w-2xl mx-auto bg-zinc-800/60 border border-zinc-700 rounded-2xl p-4 space-y-3">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What's on your mind?" required autoFocus
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500" />
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Add more detail… (optional)" rows={3}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none" />
      {mediaPreview && (
        <div className="relative rounded-xl overflow-hidden">
          {isVid ? <video src={mediaPreview} controls className="w-full max-h-48 object-contain bg-black" /> : <img src={mediaPreview} alt="Preview" className="w-full max-h-48 object-cover" />}
          <button type="button" onClick={removeMedia} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 items-center">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="p-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors" title="Attach media">
          <ImageIcon className="w-4 h-4" />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <div className="flex-1" />
        <button type="button" onClick={() => { removeMedia(); setOpen(false); }} className="px-3 py-2 rounded-xl bg-zinc-700 text-sm text-zinc-300 hover:bg-zinc-600">Cancel</button>
        <button type="submit" disabled={loading || !title.trim()}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}<Send className="w-4 h-4" /> Post
        </button>
      </div>
    </form>
  );
}

// ── Highlights panel ──────────────────────────────────────

function HighlightsPanel({ posts, tunnelUrl, spaceSlug, authToken }: { posts: HubPost[]; tunnelUrl: string; spaceSlug: string; authToken?: string }) {
  // Top posts by reply_count (engagement), then newest; pick up to 4
  const highlights = [...posts]
    .sort((a, b) => (Number(b.reply_count) - Number(a.reply_count)) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    .slice(0, 4);

  if (highlights.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Sparkles className="w-8 h-8 text-zinc-700 mb-3" />
      <p className="text-xs text-zinc-600">Highlights will appear here as the space becomes active.</p>
    </div>
  );

  return (
    <div className="space-y-3 p-4">
      {highlights.map(post => {
        const mediaUrl = post.media_file_name ? `${tunnelUrl}/api/spaces/${spaceSlug}/files/${encodeURIComponent(post.media_file_name)}${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}` : null;
        const hasMedia = !!mediaUrl;
        return (
          <div key={post.id} className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
            {hasMedia && isImage(post.media_file_name ? `image/${post.media_file_name.split('.').pop()}` : undefined) && (
              <img src={mediaUrl!} alt={post.title} className="w-full h-28 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            {hasMedia && isVideo(post.media_file_name ? `video/${post.media_file_name.split('.').pop()}` : undefined) && (
              <video src={mediaUrl!} className="w-full h-28 object-cover" muted preload="metadata" />
            )}
            <div className="p-3">
              <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{post.title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] text-zinc-500">{post.author_username}</span>
                <span className="text-[11px] text-zinc-600 flex items-center gap-0.5 ml-auto">
                  <MessageCircle className="w-3 h-3" /> {post.reply_count}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Files Tab ─────────────────────────────────────────────

function FilesTab({ hubSlug, spaceSlug, tunnelUrl, authToken }: { hubSlug: string; spaceSlug: string; tunnelUrl: string; authToken?: string }) {
  const [files, setFiles] = useState<HubSpaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; mime?: string; name: string } | null>(null);

  useEffect(() => {
    spacesService.getFiles(hubSlug, spaceSlug)
      .then(setFiles).catch(() => {}).finally(() => setLoading(false));
  }, [hubSlug, spaceSlug]);

  function getFileUrl(fileName: string) {
    const base = `${tunnelUrl}/api/spaces/${spaceSlug}/files/${encodeURIComponent(fileName)}`;
    return authToken ? `${base}?token=${encodeURIComponent(authToken)}` : base;
  }

  async function handlePreview(file: HubSpaceFile) {
    setPreview({ url: getFileUrl(file.file_name), mime: file.mime_type, name: file.file_name });
  }

  return (
    <div className="p-5">
      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>}
      {!loading && files.length === 0 && (
        <div className="text-center py-12 text-zinc-500 text-sm">No files shared in this space yet.</div>
      )}
      <div className="space-y-2">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/60 hover:bg-zinc-800 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center flex-shrink-0">
              {fileTypeIcon(f.mime_type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{f.file_name}</p>
              <p className="text-xs text-zinc-500 truncate">
                {f.uploaded_by && `@${f.uploaded_by}`}{f.post_title && ` · ${f.post_title}`} {formatBytes(f.size_bytes) && `· ${formatBytes(f.size_bytes)}`}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {(isImage(f.mime_type) || isVideo(f.mime_type)) && (
                <button onClick={() => handlePreview(f)}
                  className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Preview">
                  <ImageIcon className="w-4 h-4" />
                </button>
              )}
              <a href={getFileUrl(f.file_name)} download={f.file_name}
                className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Download">
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Preview lightbox */}
      <AnimatePresence>
        {preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreview(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl w-full max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <button onClick={() => setPreview(null)} className="absolute -top-10 right-0 text-white/60 hover:text-white text-sm">Close</button>
              {isImage(preview.mime) ? (
                <img src={preview.url} alt={preview.name} className="w-full max-h-[80vh] object-contain rounded-2xl" />
              ) : isVideo(preview.mime) ? (
                <video src={preview.url} controls autoPlay className="w-full max-h-[80vh] rounded-2xl bg-black" />
              ) : null}
              <p className="text-center text-xs text-white/50 mt-2">{preview.name}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Space Detail ──────────────────────────────────────────

type SpaceTab = 'feed' | 'members' | 'files' | 'settings';

function SpaceDetail({ hubSlug, space, myUserId, tunnelUrl, authToken, onSpaceUpdated, onSpaceDeleted }: {
  hubSlug: string; space: HubSpace; myUserId?: string;
  tunnelUrl: string; authToken?: string;
  onSpaceUpdated: (s: HubSpace) => void;
  onSpaceDeleted: (spaceId: string) => void;
}) {
  const [tab, setTab] = useState<SpaceTab>('feed');
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [members, setMembers] = useState<HubSpaceMember[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [sharingPost, setSharingPost] = useState<string | null>(null);
  const [sharedPosts, setSharedPosts] = useState<Set<string>>(new Set());
  // Settings
  const [settingsName, setSettingsName] = useState(space.name);
  const [settingsDesc, setSettingsDesc] = useState(space.description || '');
  const [settingsVis, setSettingsVis] = useState(space.visibility);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Banner editor
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const isActive = space.my_status === 'active';
  const isPending = space.my_status === 'pending';
  const isInvited = space.my_status === 'invited';
  const isAdmin = canManage(space.my_role);

  useEffect(() => {
    setTab('feed'); setPosts([]); setMembers([]);
    setSettingsName(space.name); setSettingsDesc(space.description || ''); setSettingsVis(space.visibility);
    setSettingsSaved(false); setShowBannerEditor(false);
  }, [space.id]);

  useEffect(() => {
    if (tab === 'feed' && isActive) {
      setPostsLoading(true);
      spacesService.getPosts(hubSlug, space.slug).then(setPosts).catch(() => {}).finally(() => setPostsLoading(false));
    }
    if (tab === 'members') {
      setMembersLoading(true);
      spacesService.getMembers(hubSlug, space.slug).then(setMembers).catch(() => {}).finally(() => setMembersLoading(false));
    }
  }, [tab, space.slug, isActive]);

  async function handleJoin() {
    setActionLoading(true); setError('');
    try {
      const { status } = await spacesService.join(hubSlug, space.slug);
      onSpaceUpdated({ ...space, my_status: status as any, my_role: status === 'active' ? 'member' : null });
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(false); }
  }
  async function handleLeave() {
    setActionLoading(true); setError('');
    try {
      await spacesService.leave(hubSlug, space.slug);
      onSpaceUpdated({ ...space, my_status: null, my_role: null });
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(false); }
  }
  async function handleAcceptInvite() {
    setActionLoading(true); setError('');
    try {
      await spacesService.acceptInvite(hubSlug, space.slug);
      onSpaceUpdated({ ...space, my_status: 'active', my_role: 'member' });
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(false); }
  }
  async function handleApproveMember(userId: string) {
    try {
      await spacesService.updateMember(hubSlug, space.slug, userId, { status: 'active' });
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, status: 'active' } : m));
    } catch {}
  }
  async function handleRemoveMember(userId: string) {
    try {
      await spacesService.removeMember(hubSlug, space.slug, userId);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch {}
  }
  async function handleShareToFeed(postId: string) {
    setSharingPost(postId);
    try {
      await spacesService.shareToFeed(hubSlug, postId);
      setSharedPosts(prev => new Set([...prev, postId]));
    } catch {}
    finally { setSharingPost(null); }
  }
  async function handleDelete() {
    setDeleting(true); setSettingsError('');
    try {
      await spacesService.deleteSpace(hubSlug, space.slug);
      onSpaceDeleted(space.id);
    } catch (err: any) { setSettingsError(err.message); setDeleting(false); setConfirmDelete(false); }
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true); setSettingsError(''); setSettingsSaved(false);
    try {
      const updated = await spacesService.update(hubSlug, space.slug, { name: settingsName, description: settingsDesc, visibility: settingsVis });
      onSpaceUpdated(updated); setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) { setSettingsError(err.message); }
    finally { setSettingsSaving(false); }
  }
  async function saveBannerStyle(fields: { banner_mode: string; banner_color?: string; banner_gradient_from?: string; banner_gradient_to?: string }) {
    setBannerSaving(true);
    try {
      const updated = await spacesService.update(hubSlug, space.slug, fields);
      onSpaceUpdated(updated);
    } catch {}
    finally { setBannerSaving(false); }
  }
  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerSaving(true);
    try {
      await spacesService.uploadBanner(hubSlug, space.slug, file);
      const updated = await spacesService.get(hubSlug, space.slug);
      onSpaceUpdated(updated);
    } catch {}
    finally { setBannerSaving(false); }
  }

  const bannerStyle = getBannerStyle(space, tunnelUrl);
  const tabs: SpaceTab[] = ['feed', 'members', 'files', ...(isAdmin ? ['settings' as SpaceTab] : [])];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Banner — taller, with edit button for admins */}
      <div className="relative flex-shrink-0 h-44 md:h-52" style={bannerStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />
        {isAdmin && (
          <button onClick={() => setShowBannerEditor(v => !v)}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors z-10" title="Customize banner">
            {bannerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
          </button>
        )}
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${space.visibility === 'public' ? 'bg-emerald-900/70 text-emerald-300' : space.visibility === 'private' ? 'bg-amber-900/70 text-amber-300' : 'bg-zinc-800/70 text-zinc-400'}`}>
                {visibilityIcon(space.visibility)} {visibilityLabel(space.visibility)}
              </span>
              {space.my_role && <span className="text-xs text-white/60 capitalize">{space.my_role}</span>}
            </div>
            <h1 className="text-xl font-bold text-white drop-shadow leading-tight">{space.name}</h1>
            <p className="text-sm text-white/60 mt-0.5">{Number(space.member_count) || 0} member{Number(space.member_count) !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {error && <p className="text-xs text-red-400">{error}</p>}
            {isInvited && (
              <button onClick={handleAcceptInvite} disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept Invite
              </button>
            )}
            {isPending && !isInvited && <span className="px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-sm text-sm text-zinc-300">Pending Approval</span>}
            {!space.my_status && (
              <button onClick={handleJoin} disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {space.visibility === 'private' ? 'Request to Join' : 'Join Space'}
              </button>
            )}
            {isActive && space.my_role !== 'owner' && (
              <button onClick={handleLeave} disabled={actionLoading}
                className="px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-sm hover:bg-black/60 text-xs text-white/70 flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Leave
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banner editor */}
      <AnimatePresence>
        {showBannerEditor && isAdmin && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex-shrink-0 px-5 py-3 border-b border-zinc-800 bg-zinc-900/80 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-300">Banner Style</p>
              <button onClick={() => bannerInputRef.current?.click()} disabled={bannerSaving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors">
                <ImagePlus className="w-3.5 h-3.5" /> Upload Image
              </button>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500 mb-1.5">Solid Colors</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_SOLID_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => saveBannerStyle({ banner_mode: 'solid', banner_color: color })}
                    className="w-7 h-7 rounded-full border-2 border-zinc-600 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500 mb-1.5">Gradients</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_GRADIENTS.map((g, i) => (
                  <button key={i} type="button" onClick={() => saveBannerStyle({ banner_mode: 'gradient', banner_gradient_from: g.from, banner_gradient_to: g.to })}
                    className="w-14 h-7 rounded-full border-2 border-zinc-600 hover:scale-105 transition-transform"
                    style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Description */}
      {space.description && (
        <div className="px-6 py-3 border-b border-zinc-800 flex-shrink-0">
          <p className="text-sm text-zinc-400 leading-relaxed">{space.description}</p>
        </div>
      )}

      {/* Tabs */}
      {isActive && (
        <div className="flex border-b border-zinc-800 px-6 flex-shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 px-1 mr-6 text-sm font-medium border-b-2 -mb-px capitalize whitespace-nowrap transition-colors ${tab === t ? 'border-purple-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Not a member */}
        {!isActive && !isPending && !isInvited && (
          <div className="flex flex-col items-center justify-center h-full py-16 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4"><Users className="w-7 h-7 text-zinc-500" /></div>
            <h3 className="text-base font-semibold text-white mb-1">Join to participate</h3>
            <p className="text-sm text-zinc-500">{space.visibility === 'invite-only' ? 'This space is invite-only. Ask an admin to invite you.' : space.visibility === 'private' ? 'Request to join — an admin will approve you.' : 'Join this space to read posts and contribute.'}</p>
          </div>
        )}
        {isPending && (
          <div className="flex flex-col items-center justify-center h-full py-16 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-900/40 border border-amber-800 flex items-center justify-center mb-4"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>
            <h3 className="text-base font-semibold text-white mb-1">Request pending</h3>
            <p className="text-sm text-zinc-500">An admin will review your request to join.</p>
          </div>
        )}

        {/* Feed tab — two columns on desktop */}
        {isActive && tab === 'feed' && (
          <div className="flex gap-0 h-full">
            {/* Main feed column */}
            <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-4">
              <ComposePost hubSlug={hubSlug} spaceSlug={space.slug} onPosted={p => setPosts(prev => [p, ...prev])} />
              {postsLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>}
              {!postsLoading && posts.length === 0 && <div className="text-center py-12 text-zinc-500 text-sm">No posts yet. Be the first to share something.</div>}
              {posts.map(post => {
                const mediaUrl = post.media_file_name ? `${tunnelUrl}/api/spaces/${space.slug}/files/${encodeURIComponent(post.media_file_name)}${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}` : null;
                return (
                  <div key={post.id} className="max-w-2xl mx-auto bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(post.author_username)} flex items-center justify-center text-white text-xs font-semibold`}>{getInitials(post.author_username)}</div>
                      <span className="text-sm font-medium text-white">{post.author_username}</span>
                      <span className="text-xs text-zinc-500 ml-auto">{timeAgo(post.created_at)}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">{post.title}</h3>
                    {post.body && <p className="text-sm text-zinc-400 leading-relaxed">{post.body}</p>}
                    {mediaUrl && (
                      <div className="mt-3 rounded-xl overflow-hidden">
                        {post.media_file_name?.match(/\.(mp4|webm|mov)$/i)
                          ? <video src={mediaUrl} controls preload="auto" className="w-full max-h-64 object-contain bg-black rounded-xl" />
                          : <img src={mediaUrl} alt={post.title} className="w-full max-h-64 object-cover rounded-xl" />}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-700">
                      <span className="text-xs text-zinc-500 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {post.reply_count}</span>
                      {post.author_id === myUserId && !sharedPosts.has(post.id) && !(post as any).shared_to_feed && (
                        <button onClick={() => handleShareToFeed(post.id)} disabled={sharingPost === post.id}
                          className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400 hover:text-purple-400 transition-colors">
                          {sharingPost === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Share to hub feed
                        </button>
                      )}
                      {(sharedPosts.has(post.id) || (post as any).shared_to_feed) && (
                        <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400"><Check className="w-3.5 h-3.5" /> Shared to feed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Highlights column — desktop only */}
            <div className="hidden lg:flex flex-col w-72 flex-shrink-0 border-l border-zinc-800 overflow-y-auto">
              <div className="px-4 pt-4 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">Highlights</span>
                </div>
                <p className="text-[11px] text-zinc-600 mt-0.5">Top content in this space</p>
              </div>
              <HighlightsPanel posts={posts} tunnelUrl={tunnelUrl} spaceSlug={space.slug} authToken={authToken} />
            </div>
          </div>
        )}

        {/* Members tab */}
        {isActive && tab === 'members' && (
          <div className="p-5 max-w-2xl">
            {isAdmin && (
              <button onClick={() => setShowInvite(true)}
                className="w-full flex items-center gap-2 justify-center mb-4 py-2.5 rounded-xl border border-dashed border-zinc-700 hover:border-purple-600 text-sm text-zinc-400 hover:text-purple-400 transition-colors">
                <UserPlus className="w-4 h-4" /> Invite hub members
              </button>
            )}
            {membersLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>}
            {members.filter(m => m.status === 'pending').length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Pending Approval</p>
                {members.filter(m => m.status === 'pending').map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-zinc-800">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(m.username)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>{getInitials(m.display_name || m.username)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{m.display_name || m.username}</p>
                      <p className="text-xs text-zinc-500">@{m.username}</p>
                    </div>
                    {isAdmin && <button onClick={() => handleApproveMember(m.user_id)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-medium text-white flex items-center gap-1"><Check className="w-3 h-3" /> Approve</button>}
                  </div>
                ))}
              </div>
            )}
            {members.filter(m => m.status === 'active').length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Members</p>
                {members.filter(m => m.status === 'active').map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-zinc-800">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(m.username)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>{getInitials(m.display_name || m.username)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{m.display_name || m.username}</p>
                      <p className="text-xs text-zinc-500 capitalize">{m.role}</p>
                    </div>
                    {isAdmin && m.user_id !== myUserId && m.role !== 'owner' && (
                      <button onClick={() => handleRemoveMember(m.user_id)} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files tab */}
        {isActive && tab === 'files' && (
          <FilesTab hubSlug={hubSlug} spaceSlug={space.slug} tunnelUrl={tunnelUrl} authToken={authToken} />
        )}

        {/* Settings tab */}
        {isActive && tab === 'settings' && isAdmin && (
          <form onSubmit={saveSettings} className="p-5 space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Space Name</label>
              <input value={settingsName} onChange={e => setSettingsName(e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
              <textarea value={settingsDesc} onChange={e => setSettingsDesc(e.target.value)} rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Visibility</label>
              <div className="grid grid-cols-3 gap-2">
                {(['public', 'private', 'invite-only'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setSettingsVis(v)}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors ${settingsVis === v ? 'bg-purple-600 border-purple-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
                    {visibilityLabel(v)}
                  </button>
                ))}
              </div>
            </div>
            {settingsError && <p className="text-xs text-red-400">{settingsError}</p>}
            <button type="submit" disabled={settingsSaving}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
              {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : settingsSaved ? <><Check className="w-4 h-4" /> Saved</> : <><Settings className="w-4 h-4" /> Save Settings</>}
            </button>
            {space.my_role === 'owner' && (
              <div className="pt-4 mt-4 border-t border-zinc-800">
                {!confirmDelete ? (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-red-950 border border-zinc-700 hover:border-red-800 text-sm text-zinc-400 hover:text-red-400 transition-colors">
                    Delete Space
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-red-400 text-center">Permanently deletes the space and membership data. Posts are kept but detached.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700">Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
                        {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Yes, Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      <AnimatePresence>
        {showInvite && <InviteMemberModal hubSlug={hubSlug} spaceSlug={space.slug} onClose={() => setShowInvite(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────

export function SpacesScreen({ onBack }: SpacesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const myUserId = currentUser?.hubUserId;
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const authToken = currentUser?.authToken;
  const navigate = useNavigate();
  const { spaceSlug: urlSpaceSlug } = useParams<{ spaceSlug: string }>();

  const [mySpaces, setMySpaces] = useState<HubSpace[]>([]);
  const [allSpaces, setAllSpaces] = useState<HubSpace[]>([]);
  const [selected, setSelected] = useState<HubSpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  function selectSpace(space: HubSpace | null) {
    setSelected(space);
    if (space) {
      navigate(`/spaces/${encodeURIComponent(space.slug)}`, { replace: true });
    } else {
      navigate('/spaces', { replace: true });
    }
  }

  const load = useCallback(async () => {
    if (!hubSlug) return;
    setLoading(true); setError('');
    try {
      const [mine, all] = await Promise.all([spacesService.listMine(hubSlug), spacesService.listAll(hubSlug)]);
      setMySpaces(mine); setAllSpaces(all);
      // Restore selected space from URL on initial load
      if (urlSpaceSlug) {
        const match = [...mine, ...all].find(s => s.slug === decodeURIComponent(urlSpaceSlug));
        if (match) setSelected(match);
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [hubSlug]); // intentionally exclude urlSpaceSlug — only used on first load

  useEffect(() => { load(); }, [load]);

  function handleSpaceUpdated(updated: HubSpace) {
    setSelected(updated);
    setMySpaces(prev => {
      const isActive = updated.my_status === 'active';
      const inList = prev.find(s => s.id === updated.id);
      if (isActive && !inList) return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
      if (!isActive && inList) return prev.filter(s => s.id !== updated.id);
      return prev.map(s => s.id === updated.id ? updated : s);
    });
    setAllSpaces(prev => prev.map(s => s.id === updated.id ? updated : s));
  }

  function handleCreated(space: HubSpace) {
    setMySpaces(prev => [...prev, space].sort((a, b) => a.name.localeCompare(b.name)));
    setAllSpaces(prev => [space, ...prev]);
    selectSpace(space); setShowCreate(false);
  }

  function handleDeleted(spaceId: string) {
    setMySpaces(prev => prev.filter(s => s.id !== spaceId));
    setAllSpaces(prev => prev.filter(s => s.id !== spaceId));
    selectSpace(null);
  }

  const displaySpaces = (showAll ? allSpaces : mySpaces).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  const pendingInvites = allSpaces.filter(s => s.my_status === 'invited');

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Left panel */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-zinc-800 flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800 flex-shrink-0">
          <button onClick={onBack} className="w-8 h-8 rounded-xl hover:bg-zinc-800 flex items-center justify-center flex-shrink-0"><ArrowLeft className="w-4 h-4 text-zinc-400" /></button>
          <h1 className="text-base font-semibold text-white flex-1">Spaces</h1>
          <button onClick={() => setShowCreate(true)} className="w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-500 flex items-center justify-center"><Plus className="w-4 h-4 text-white" /></button>
        </div>
        <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search spaces…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="flex gap-1 mt-2">
            <button onClick={() => setShowAll(false)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${!showAll ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>My Spaces</button>
            <button onClick={() => setShowAll(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${showAll ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Discover</button>
          </div>
        </div>
        {pendingInvites.length > 0 && !showAll && (
          <div className="px-4 py-2 bg-purple-900/20 border-b border-purple-900/40 flex-shrink-0">
            <p className="text-xs text-purple-400 font-medium mb-1">You have {pendingInvites.length} invite{pendingInvites.length > 1 ? 's' : ''}</p>
            {pendingInvites.map(s => (
              <button key={s.id} onClick={() => selectSpace(s)} className="w-full text-left flex items-center gap-2 py-1.5 text-sm text-white hover:text-purple-300">
                <ChevronRight className="w-3 h-3 text-purple-400" /> {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>}
          {error && <div className="m-4 p-3 rounded-xl bg-red-950/40 border border-red-900 flex gap-2 text-sm text-red-400"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}</div>}
          {!loading && displaySpaces.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mb-3"><LayoutGrid className="w-6 h-6 text-zinc-500" /></div>
              <p className="text-sm text-zinc-400 font-medium mb-1">{showAll ? 'No spaces on this hub yet' : 'No spaces joined yet'}</p>
              <p className="text-xs text-zinc-600">{showAll ? 'Be the first to create one.' : 'Switch to Discover to find spaces to join.'}</p>
            </div>
          )}
          {displaySpaces.map(space => (
            <button key={space.id} onClick={() => selectSpace(space)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-800/60 transition-colors text-left border-b border-zinc-800/50 ${selected?.id === space.id ? 'bg-zinc-800/70' : ''}`}>
              <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden" style={getBannerStyle(space, tunnelUrl)}>
                <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold bg-black/10">{space.name[0]?.toUpperCase()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-medium text-white truncate">{space.name}</span>
                  <span className="text-zinc-600 flex-shrink-0">{visibilityIcon(space.visibility)}</span>
                </div>
                <p className="text-xs text-zinc-500 truncate">{space.description || `${Number(space.member_count) || 0} members`}</p>
                {space.my_status === 'pending' && <span className="text-xs text-amber-400">Pending approval</span>}
                {space.my_status === 'invited' && <span className="text-xs text-purple-400">Invited — tap to accept</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col flex-1 overflow-hidden`}>
        {selected ? (
          <>
            <button onClick={() => selectSpace(null)} className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-zinc-800 text-zinc-400 text-sm flex-shrink-0">
              <ArrowLeft className="w-4 h-4" /> All Spaces
            </button>
            <SpaceDetail hubSlug={hubSlug} space={selected} myUserId={myUserId}
              tunnelUrl={tunnelUrl} authToken={authToken}
              onSpaceUpdated={handleSpaceUpdated} onSpaceDeleted={handleDeleted} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-900 to-indigo-900 border border-purple-800 flex items-center justify-center mb-5"><LayoutGrid className="w-9 h-9 text-purple-300" /></div>
            <h2 className="text-lg font-semibold text-white mb-2">Select a Space</h2>
            <p className="text-sm text-zinc-500 max-w-xs">Choose a space from the list to view its feed and members, or create a new one.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateSpaceModal hubSlug={hubSlug} onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
