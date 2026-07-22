import { useState, useEffect, useCallback } from 'react';
import { useHub } from '../context/HubContext';
import {
  Plus, Users, CheckCircle2, Circle, Clock,
  X, MessageSquare, TrendingUp, Package,
  ChevronLeft, Hammer, Share2, Check, UserPlus, Loader2, Trash2,
  Image as ImageIcon, Upload, Activity, FileText, Download, ExternalLink, Link as LinkIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { hubService } from '../services/hubService';
import { spacesService } from '../services/spacesService';
import {
  initiativesService,
  type Initiative, type InitiativeTask, type InitiativeResource, type InitiativeRole,
  type InitiativeUpdate, type InitiativeActivityEntry, type TaskMeta, type ChecklistItem, type TaskNote,
} from '../services/initiativesService';
import type { HubSpace, HubMember, HubFile } from '../types/hub';
import {
  InitiativeCard, COLOR, STATUS_BADGE, STATUS_LABEL, CATEGORY_OPTIONS, categoryMeta,
  AvatarStack, ProgressBar, SpaceChip, avatarColor, initials,
  TASK_STATUS_META, effectiveTaskStatus, type TaskDisplayStatus,
} from './InitiativeCard';
import { InitiativeBannerUpload } from './InitiativeBannerUpload';

// ── Helpers ────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function taskCount(tasks: InitiativeTask[]) {
  const done = tasks.filter(t => t.status === 'done').length;
  return { done, total: tasks.length || 0 };
}

// ── Overlay (shared shell) ───────────────────────────────────

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="cn-surface border cn-border rounded-2xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto shadow-2xl p-5 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold cn-text-1">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors shrink-0">
            <X className="w-4 h-4 cn-text-3" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldLabelClass = 'text-[11.5px] font-semibold cn-text-3 block mb-1.5';
const fieldClass = 'w-full px-3 py-2.5 rounded-lg border cn-border cn-surface-2 text-[13.5px] cn-text-1 placeholder:cn-text-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40';

// ── Modals ─────────────────────────────────────────────────

function NewInitiativeModal({ onClose, onSubmit, mySpaces }: {
  onClose: () => void;
  onSubmit: (data: { title: string; goal: string; category: string; color: Initiative['color']; space_id: string | null; bannerFile: File | null }) => void;
  mySpaces: HubSpace[];
}) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]?.value ?? '');
  const [color, setColor] = useState<Initiative['color']>('purple');
  const [spaceId, setSpaceId] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const pickBanner = (file: File) => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };
  const clearBanner = () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerFile(null);
    setBannerPreview(null);
  };

  return (
    <Overlay title="Start a project" onClose={onClose}>
      <div>
        <label className={fieldLabelClass}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Repaint the community mural" className={fieldClass} />
      </div>
      <div>
        <label className={fieldLabelClass}>Cover image (optional)</label>
        {bannerPreview ? (
          <div className="relative rounded-xl overflow-hidden bg-black">
            <img src={bannerPreview} alt="" className="w-full max-h-32 object-cover" />
            <button type="button" onClick={clearBanner} className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-sm cn-text-4">
            <ImageIcon className="w-4 h-4" /><Upload className="w-4 h-4" />
            <span>Add a cover image</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) pickBanner(e.target.files[0]); }} />
          </label>
        )}
      </div>
      <div>
        <label className={fieldLabelClass}>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className={fieldClass}>
          {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className={fieldLabelClass}>What is this project about?</label>
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3} placeholder="Describe the goal…" className={`${fieldClass} resize-none`} />
      </div>
      {mySpaces.length > 0 && (
        <div>
          <label className={fieldLabelClass}>Belongs to a space?</label>
          <select value={spaceId} onChange={e => setSpaceId(e.target.value)} className={fieldClass}>
            <option value="">Not tied to a space — open to the whole hub</option>
            {mySpaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={fieldLabelClass}>Color</label>
        <div className="flex gap-2">
          {(Object.keys(COLOR) as Initiative['color'][]).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={`w-8 h-8 rounded-full bg-gradient-to-br ${COLOR[c].gradient} transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-purple-500 dark:ring-offset-zinc-900 scale-105' : 'opacity-70 hover:opacity-100'}`}
            />
          ))}
        </div>
      </div>
      <button
        onClick={() => { if (title.trim()) { onSubmit({ title: title.trim(), goal: goal.trim(), category, color, space_id: spaceId || null, bannerFile }); onClose(); } }}
        disabled={!title.trim()}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Create project
      </button>
    </Overlay>
  );
}

function ShareModal({ item, hubSlug, onClose }: { item: Initiative; hubSlug: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = initiativesService.getShareLink(hubSlug, item.id);
  const cat = categoryMeta(item.category);
  const CatIcon = cat.icon;
  const c = COLOR[item.color];
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };
  return (
    <Overlay title="Share this project" onClose={onClose}>
      <div className="rounded-xl cn-surface-2 border cn-border p-3 flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0`}>
          <CatIcon className="w-4 h-4 text-white" />
        </span>
        <span className="text-[13px] font-semibold cn-text-1 truncate">{item.title}</span>
      </div>
      <div>
        <label className={fieldLabelClass}>Link</label>
        <div className="flex gap-2">
          <input readOnly value={link} className={`${fieldClass} cn-text-3 truncate`} />
          <button
            onClick={handleCopy}
            className={`shrink-0 px-3 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${copied ? 'bg-emerald-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function AddTaskModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (title: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <Overlay title="Add a task" onClose={onClose}>
      <div>
        <label className={fieldLabelClass}>Task</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pick up lumber from hardware store" className={fieldClass} autoFocus />
      </div>
      <button
        onClick={() => { if (title.trim()) { onSubmit(title.trim()); onClose(); } }}
        disabled={!title.trim()}
        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
      >
        Add task
      </button>
    </Overlay>
  );
}

function AddResourceModal({ hubSlug, onClose, onSubmitMaterial, onSubmitLink, onSubmitFile, onSubmitExistingFile }: {
  hubSlug: string;
  onClose: () => void;
  onSubmitMaterial: (item: string, qty: string) => void;
  onSubmitLink: (item: string, url: string) => void;
  onSubmitFile: (file: File) => void;
  onSubmitExistingFile: (fileId: string) => void;
}) {
  const [tab, setTab] = useState<'material' | 'file' | 'link'>('material');
  const [fileMode, setFileMode] = useState<'upload' | 'existing'>('upload');
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [existingFiles, setExistingFiles] = useState<HubFile[] | null>(null);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');

  useEffect(() => {
    if (tab === 'file' && fileMode === 'existing' && existingFiles === null) {
      hubService.listFiles(hubSlug).then(setExistingFiles).catch(() => setExistingFiles([]));
    }
  }, [tab, fileMode, existingFiles, hubSlug]);

  const filteredFiles = (existingFiles ?? []).filter(f => f.name.toLowerCase().includes(fileSearch.toLowerCase()));

  return (
    <Overlay title="Add a resource" onClose={onClose}>
      <div className="flex gap-1 p-1 rounded-xl cn-surface-2">
        {([['material', 'Material'], ['file', 'File'], ['link', 'Link']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === id ? 'bg-purple-600 text-white' : 'cn-text-3 hover:cn-text-1'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'material' && (
        <>
          <div>
            <label className={fieldLabelClass}>Item</label>
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Cedar for 6 raised beds" className={fieldClass} autoFocus />
          </div>
          <div>
            <label className={fieldLabelClass}>Quantity (optional)</label>
            <input value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 2x6x8, ~40 boards" className={fieldClass} />
          </div>
          <button
            onClick={() => { if (item.trim()) { onSubmitMaterial(item.trim(), qty.trim()); onClose(); } }}
            disabled={!item.trim()}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Add resource
          </button>
        </>
      )}

      {tab === 'link' && (
        <>
          <div>
            <label className={fieldLabelClass}>Title (optional)</label>
            <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="e.g. Shared budget spreadsheet" className={fieldClass} autoFocus />
          </div>
          <div>
            <label className={fieldLabelClass}>URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className={fieldClass} />
          </div>
          <p className="text-[11.5px] cn-text-4">For an external website or reference — for anything you have as a file, upload or attach it instead.</p>
          <button
            onClick={() => { if (url.trim()) { onSubmitLink(linkTitle.trim(), url.trim()); onClose(); } }}
            disabled={!url.trim()}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Add link
          </button>
        </>
      )}

      {tab === 'file' && (
        <>
          <div className="flex gap-1 p-1 rounded-xl cn-surface-2">
            {([['upload', 'Upload new'], ['existing', 'From hub files']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFileMode(id)}
                className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${fileMode === id ? 'bg-purple-600 text-white' : 'cn-text-3 hover:cn-text-1'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {fileMode === 'upload' ? (
            <>
              <div>
                <label className={fieldLabelClass}>File</label>
                <input
                  type="file"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-[13px] cn-text-2 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:text-xs file:font-semibold file:cursor-pointer hover:file:bg-purple-700 cn-surface-2 rounded-lg cursor-pointer"
                />
              </div>
              <p className="text-[11.5px] cn-text-4">Shared with the whole hub, same as the Files screen — not private.</p>
              <button
                onClick={() => { if (file) { onSubmitFile(file); onClose(); } }}
                disabled={!file}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                Upload file
              </button>
            </>
          ) : (
            <>
              <input
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
                placeholder="Search your files..."
                className={fieldClass}
                autoFocus
              />
              <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg cn-surface-2 p-1.5">
                {existingFiles === null ? (
                  <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin cn-text-4" /></div>
                ) : filteredFiles.length === 0 ? (
                  <p className="text-[12.5px] cn-text-4 text-center py-4">No files found.</p>
                ) : (
                  filteredFiles.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFileId(f.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${selectedFileId === f.id ? 'bg-purple-100 dark:bg-purple-900/30' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0 cn-text-4" />
                      <span className="flex-1 min-w-0 text-[13px] cn-text-1 truncate">{f.name}</span>
                      {!f.is_public && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full cn-surface-3 cn-text-4">Private — will be shared</span>}
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => { if (selectedFileId) { onSubmitExistingFile(selectedFileId); onClose(); } }}
                disabled={!selectedFileId}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                Attach file
              </button>
            </>
          )}
        </>
      )}
    </Overlay>
  );
}

function AddRoleModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (role: string, skill: string) => void }) {
  const [role, setRole] = useState('');
  const [skill, setSkill] = useState('');
  return (
    <Overlay title="Add an open role" onClose={onClose}>
      <div>
        <label className={fieldLabelClass}>Role</label>
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Weekend paint crew" className={fieldClass} autoFocus />
      </div>
      <div>
        <label className={fieldLabelClass}>Skill needed</label>
        <input value={skill} onChange={e => setSkill(e.target.value)} placeholder="e.g. General labor" className={fieldClass} />
      </div>
      <button
        onClick={() => { if (role.trim()) { onSubmit(role.trim(), skill.trim()); onClose(); } }}
        disabled={!role.trim()}
        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
      >
        Add role
      </button>
    </Overlay>
  );
}

function InviteModal({ hubSlug, initiativeId, shareLink, onClose }: { hubSlug: string; initiativeId: string; shareLink: string; onClose: () => void }) {
  const [members, setMembers] = useState<HubMember[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => { hubService.listMembers(hubSlug).then(setMembers).catch(() => {}); }, [hubSlug]);

  const invite = async (userId: string) => {
    try {
      await initiativesService.invite(hubSlug, initiativeId, userId);
      setInvited(prev => new Set([...prev, userId]));
    } catch { /* non-critical */ }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <Overlay title="Invite people" onClose={onClose}>
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {members.map(m => (
          <div key={m.user_id} className="flex items-center gap-2.5">
            <span className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarColor(m.username)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
              {initials(m.display_name || m.username)}
            </span>
            <span className="flex-1 min-w-0 text-[13px] cn-text-1 truncate">{m.display_name || m.username}</span>
            <button
              onClick={() => invite(m.user_id)}
              disabled={invited.has(m.user_id)}
              className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${invited.has(m.user_id) ? 'cn-surface-2 cn-text-4' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
            >
              {invited.has(m.user_id) ? 'Invited' : 'Invite'}
            </button>
          </div>
        ))}
      </div>
      <div>
        <label className={fieldLabelClass}>Or share an invite link</label>
        <div className="flex gap-2">
          <input readOnly value={shareLink} className={`${fieldClass} cn-text-3 truncate`} />
          <button onClick={copyLink} className={`shrink-0 px-3 rounded-lg text-sm font-semibold transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Detail tab panes ─────────────────────────────────────────

const ACTIVITY_ICON: Record<InitiativeActivityEntry['kind'], React.ElementType> = {
  task: CheckCircle2, resource: Package, team: Users, update: MessageSquare, member: UserPlus,
};

function ActivityStream({ hubSlug, initiativeId }: { hubSlug: string; initiativeId: string }) {
  const [entries, setEntries] = useState<InitiativeActivityEntry[] | null>(null);
  useEffect(() => {
    initiativesService.getActivity(hubSlug, initiativeId, 5).then(setEntries).catch(() => setEntries([]));
  }, [hubSlug, initiativeId]);
  return (
    <div>
      <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-2.5">Recent activity</h3>
      {entries === null ? (
        <div className="flex items-center justify-center py-6 cn-text-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : entries.length === 0 ? (
        <p className="text-xs cn-text-4">No activity yet on this project.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((a, i) => {
            const Icon = ACTIVITY_ICON[a.kind] ?? CheckCircle2;
            return (
              <div key={a.id} className={`flex items-center gap-2.5 py-2.5 ${i ? 'border-t cn-border' : ''}`}>
                <span className="w-7 h-7 rounded-lg cn-surface-2 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 cn-text-3" />
                </span>
                <div className="flex-1 min-w-0 text-[13px] cn-text-2">
                  <b className="cn-text-1 font-semibold">{a.actor_name}</b> {a.text}
                </div>
                <span className="cn-mono text-[11px] cn-text-4 shrink-0">{timeAgo(a.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverviewPane({ initiative, hubSlug, onSeeUpdates }: { initiative: Initiative; hubSlug: string; onSeeUpdates: () => void }) {
  return (
    <div className="space-y-3.5">
      <div className="cn-glass rounded-2xl p-4">
        <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-2">Goal</h3>
        <p className="text-sm cn-text-1 leading-relaxed font-medium">{initiative.goal}</p>
        {initiative.description && <p className="text-sm cn-text-3 leading-relaxed mt-2">{initiative.description}</p>}
      </div>
      <div className="cn-glass rounded-2xl p-4">
        <ActivityStream hubSlug={hubSlug} initiativeId={initiative.id} />
      </div>
      {initiative.updates[0] && (
        <div
          className="cn-glass rounded-2xl p-4 cursor-pointer hover:border-purple-300/60 dark:hover:border-purple-500/30 transition-colors"
          onClick={onSeeUpdates}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider">Latest update</h3>
            <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">See all →</span>
          </div>
          <div className="flex items-start gap-3">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarColor(initiative.updates[0].author_name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
              {initials(initiative.updates[0].author_name)}
            </div>
            <div>
              <p className="text-xs font-semibold cn-text-2">{initiative.updates[0].author_name} · <span className="font-normal cn-text-4">{timeAgo(initiative.updates[0].created_at)}</span></p>
              <p className="text-sm cn-text-3 mt-0.5 line-clamp-2">{initiative.updates[0].content}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TasksPane({ initiative, hubSlug, onChanged, currentUserId }: { initiative: Initiative; hubSlug: string; onChanged: () => void; currentUserId?: string }) {
  const [tasks, setTasks] = useState(initiative.tasks);
  const [taskMeta, setTaskMeta] = useState<Record<string, TaskMeta>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [trackingTaskId, setTrackingTaskId] = useState<string | null>(null);
  const { currentUser } = useHub();

  const loadTaskMeta = useCallback(() => {
    initiativesService.getTaskMeta(hubSlug, initiative.id).then(setTaskMeta).catch(() => {});
  }, [hubSlug, initiative.id]);
  useEffect(() => { setTasks(initiative.tasks); }, [initiative.tasks]);
  useEffect(() => { loadTaskMeta(); }, [loadTaskMeta]);

  const cycleTask = async (task: InitiativeTask) => {
    const next: InitiativeTask['status'] = task.status === 'todo' ? 'in-progress' : task.status === 'in-progress' ? 'done' : 'todo';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
    try {
      await initiativesService.updateTaskStatus(hubSlug, task.id, next, initiative.id, task.title);
      if (next === 'done') onChanged();
    } catch { /* optimistic update stays regardless */ }
  };

  const assignToMe = async (task: InitiativeTask) => {
    setBusyId(task.id);
    try {
      await initiativesService.assignTask(hubSlug, task.id, initiative.id, true);
      setTaskMeta(prev => ({
        ...prev,
        [task.id]: {
          task_id: task.id, initiative_id: initiative.id,
          assignee_user_id: currentUser?.hubUserId ?? null,
          assignee_name: currentUser?.displayName ?? currentUser?.username ?? 'You',
          due_date: prev[task.id]?.due_date ?? null,
          blocked: prev[task.id]?.blocked ?? false,
          checklist_total: prev[task.id]?.checklist_total ?? 0,
          checklist_done: prev[task.id]?.checklist_done ?? 0,
        },
      }));
    } finally { setBusyId(null); }
  };

  const unassignMe = async (task: InitiativeTask) => {
    setBusyId(task.id);
    try {
      await initiativesService.unassignTask(hubSlug, task.id, initiative.id);
      setTaskMeta(prev => ({ ...prev, [task.id]: { ...prev[task.id], assignee_user_id: null, assignee_name: null } }));
    } finally { setBusyId(null); }
  };

  const addTask = async (title: string) => {
    const tempId = `local-${Date.now()}`;
    setTasks(prev => [...prev, { id: tempId, title, status: 'todo', created_by: currentUserId }]);
    try {
      const created = await initiativesService.addTask(hubSlug, initiative.id, { title });
      setTasks(prev => prev.map(t => t.id === tempId ? { ...created, status: created.status ?? 'todo' } : t));
    } catch {
      setTasks(prev => prev.filter(t => t.id !== tempId));
    }
  };

  const removeTask = async (task: InitiativeTask) => {
    setDeletingId(task.id);
    try {
      await initiativesService.deleteTask(hubSlug, task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch { /* non-critical — row stays if the delete failed */ }
    finally { setDeletingId(null); }
  };

  const trackingTask = trackingTaskId ? tasks.find(t => t.id === trackingTaskId) ?? null : null;
  if (trackingTask) {
    return (
      <TaskTrackerView
        initiative={initiative}
        task={trackingTask}
        meta={taskMeta[trackingTask.id]}
        hubSlug={hubSlug}
        currentUserId={currentUserId}
        onBack={() => { setTrackingTaskId(null); loadTaskMeta(); onChanged(); }}
        onMetaChanged={loadTaskMeta}
      />
    );
  }

  const groups = {
    'in-progress': tasks.filter(t => t.status === 'in-progress'),
    'todo': tasks.filter(t => t.status === 'todo'),
    'done': tasks.filter(t => t.status === 'done'),
  };
  const tc = taskCount(tasks);

  return (
    <div className="space-y-5">
      <ProgressBar {...tc} pct={tc.total > 0 ? Math.round((tc.done / tc.total) * 100) : 0} tone={initiative.status === 'completed' ? 'ok' : 'brand'} />
      {(['in-progress', 'todo', 'done'] as const).map(status => {
        const group = groups[status];
        if (group.length === 0) return null;
        const labels = { 'in-progress': 'In Progress', todo: 'To Do', done: 'Done' };
        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider">{labels[status]}</h3>
              <span className="text-xs px-1.5 py-0.5 rounded-full cn-surface-2 cn-text-3">{group.length}</span>
            </div>
            <div className="space-y-2">
              {group.map(task => {
                const meta = taskMeta[task.id];
                const ownsTask = task.created_by === currentUserId || meta?.assignee_user_id === currentUserId;
                const hasChecklist = (meta?.checklist_total ?? 0) > 0;
                const canCycle = ownsTask && !hasChecklist;
                const disp = effectiveTaskStatus(task, meta);
                const isSelfAssigned = !!meta?.assignee_user_id && meta.assignee_user_id === currentUserId;
                return (
                  <div key={task.id} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
                    <button
                      onClick={() => canCycle && cycleTask(task)}
                      disabled={!canCycle}
                      title={hasChecklist ? 'This task has a checklist — status follows checklist completion' : (ownsTask ? undefined : 'Only the task creator or assignee can update its status')}
                      className="shrink-0 w-5 h-5 flex items-center justify-center transition-transform enabled:hover:scale-110 disabled:cursor-default disabled:opacity-60"
                      aria-label="Toggle task status"
                    >
                      {task.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                      {task.status === 'in-progress' && <Clock className="w-5 h-5 text-amber-500" />}
                      {task.status === 'todo' && <Circle className="w-5 h-5 cn-text-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through cn-text-4' : 'cn-text-1'}`}>{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TASK_STATUS_META[disp].badge}`}>{TASK_STATUS_META[disp].label}</span>
                        {hasChecklist && <span className="text-[11px] cn-text-4">{meta!.checklist_done}/{meta!.checklist_total} steps</span>}
                      </div>
                    </div>
                    {meta?.assignee_name ? (
                      <div className="shrink-0 flex items-center gap-1">
                        <span className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(meta.assignee_name)} flex items-center justify-center text-white text-[9.5px] font-bold`} title={meta.assignee_name}>
                          {initials(meta.assignee_name)}
                        </span>
                        {isSelfAssigned && (
                          <button
                            onClick={() => unassignMe(task)}
                            disabled={busyId === task.id}
                            title="Not for me — unassign"
                            aria-label="Unassign yourself"
                            className="w-5 h-5 rounded-full flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                          >
                            {busyId === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => assignToMe(task)}
                        disabled={busyId === task.id}
                        className="shrink-0 px-2.5 py-1 rounded-lg cn-surface-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 text-xs font-semibold cn-text-3 transition-colors disabled:opacity-50"
                      >
                        {busyId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Assign to me'}
                      </button>
                    )}
                    <button
                      onClick={() => setTrackingTaskId(task.id)}
                      title="Track progress"
                      aria-label="Track progress"
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <Activity className="w-3.5 h-3.5" />
                    </button>
                    {task.created_by === currentUserId && (
                      <button
                        onClick={() => removeTask(task)}
                        disabled={deletingId === task.id}
                        title="Remove task"
                        aria-label="Remove task"
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        {deletingId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {initiative.viewerIsCreator && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border text-sm cn-text-3 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add task
        </button>
      )}
      {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onSubmit={addTask} />}
    </div>
  );
}

// ── Task tracker — inline detail view (Atlas pin-detail pattern: back button,
// not a modal) for a single task's status, checklist, and progress notes. ──
function TaskTrackerView({
  initiative, task, meta, hubSlug, currentUserId, onBack, onMetaChanged,
}: {
  initiative: Initiative;
  task: InitiativeTask;
  meta?: TaskMeta;
  hubSlug: string;
  currentUserId?: string;
  onBack: () => void;
  onMetaChanged: () => void;
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [notes, setNotes] = useState<TaskNote[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [busyBlocked, setBusyBlocked] = useState(false);

  const ownsTask = task.created_by === currentUserId || meta?.assignee_user_id === currentUserId;

  const loadChecklist = useCallback(() => {
    initiativesService.getChecklist(hubSlug, task.id).then(setChecklist).catch(() => setChecklist([]));
  }, [hubSlug, task.id]);
  const loadNotes = useCallback(() => {
    initiativesService.getTaskNotes(hubSlug, task.id).then(setNotes).catch(() => setNotes([]));
  }, [hubSlug, task.id]);
  useEffect(() => { loadChecklist(); }, [loadChecklist]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const addItem = async () => {
    if (!newItem.trim()) return;
    setAddingItem(true);
    try {
      await initiativesService.addChecklistItem(hubSlug, task.id, initiative.id, newItem.trim());
      setNewItem('');
      loadChecklist();
      onMetaChanged();
    } finally { setAddingItem(false); }
  };

  const toggleItem = async (item: ChecklistItem) => {
    setChecklist(prev => prev?.map(i => i.id === item.id ? { ...i, done: !i.done } : i) ?? null);
    try {
      await initiativesService.updateChecklistItem(hubSlug, item.id, { done: !item.done });
      onMetaChanged();
    } catch { loadChecklist(); }
  };

  const saveItemText = async (item: ChecklistItem) => {
    const text = editingText.trim();
    setEditingItemId(null);
    if (!text || text === item.text) return;
    setChecklist(prev => prev?.map(i => i.id === item.id ? { ...i, text } : i) ?? null);
    try { await initiativesService.updateChecklistItem(hubSlug, item.id, { text }); } catch { loadChecklist(); }
  };

  const removeItem = async (item: ChecklistItem) => {
    setChecklist(prev => prev?.filter(i => i.id !== item.id) ?? null);
    try { await initiativesService.deleteChecklistItem(hubSlug, item.id); onMetaChanged(); } catch { loadChecklist(); }
  };

  const toggleBlocked = async () => {
    setBusyBlocked(true);
    try { await initiativesService.setTaskBlocked(hubSlug, task.id, initiative.id, !meta?.blocked); onMetaChanged(); }
    finally { setBusyBlocked(false); }
  };

  const postNote = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try { await initiativesService.postTaskNote(hubSlug, task.id, initiative.id, draft.trim()); setDraft(''); loadNotes(); }
    finally { setPosting(false); }
  };
  const removeNote = async (id: string) => { try { await initiativesService.deleteTaskNote(hubSlug, id); loadNotes(); } catch { /* non-critical */ } };
  const postReply = async (noteId: string) => {
    const text = replyDrafts[noteId]?.trim();
    if (!text) return;
    await initiativesService.replyToNote(hubSlug, noteId, text);
    setReplyDrafts(prev => ({ ...prev, [noteId]: '' }));
    setOpenReplyFor(null);
    loadNotes();
  };
  const removeReply = async (id: string) => { try { await initiativesService.deleteNoteReply(hubSlug, id); loadNotes(); } catch { /* non-critical */ } };

  const total = checklist?.length ?? 0;
  const done = checklist?.filter(i => i.done).length ?? 0;
  const hasChecklist = total > 0;
  const disp: TaskDisplayStatus = meta?.blocked
    ? 'blocked'
    : !hasChecklist
      ? (task.status === 'done' ? 'done' : task.status === 'in-progress' ? 'in-progress' : 'not-started')
      : done === total ? 'done' : done === 0 ? 'not-started' : 'in-progress';

  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:text-zinc-200 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />All tasks
        </button>
        <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-3">{initiative.title}</p>
        <h2 className="text-lg font-bold cn-text-1">{task.title}</h2>
      </div>

      <div className="cn-glass rounded-2xl p-4">
        <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-3">Status</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['not-started', 'in-progress', 'blocked', 'done'] as const).map(s => {
            const m = TASK_STATUS_META[s];
            const active = disp === s;
            const clickable = s === 'blocked' && ownsTask;
            return (
              <button
                key={s}
                disabled={!clickable || busyBlocked}
                onClick={() => clickable && toggleBlocked()}
                title={s === 'blocked' ? (ownsTask ? undefined : 'Only the task creator or assignee can do this') : 'Determined automatically'}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-colors disabled:cursor-default ${active ? m.badge : 'cn-surface-2 cn-text-4'} ${clickable ? 'hover:opacity-80' : ''}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        {hasChecklist && !meta?.blocked && (
          <p className="text-[11px] cn-text-4 mt-3">Status updates automatically as checklist steps are completed.</p>
        )}
      </div>

      <div className="cn-glass rounded-2xl p-4">
        <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-3">Checklist ({done}/{total})</h3>
        {checklist === null ? (
          <div className="flex items-center justify-center py-4 cn-text-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="space-y-1.5">
            {checklist.map(item => (
              <div key={item.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => ownsTask && toggleItem(item)}
                  disabled={!ownsTask}
                  aria-label="Toggle checklist item"
                  className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center border transition-colors disabled:cursor-default ${item.done ? 'bg-emerald-500 border-emerald-500' : 'cn-border'}`}
                >
                  {item.done && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
                {editingItemId === item.id ? (
                  <input
                    autoFocus
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    onBlur={() => saveItemText(item)}
                    onKeyDown={e => { if (e.key === 'Enter') saveItemText(item); if (e.key === 'Escape') setEditingItemId(null); }}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg cn-surface-2 text-sm cn-text-1 outline-none"
                  />
                ) : (
                  <span
                    onClick={() => { if (ownsTask) { setEditingItemId(item.id); setEditingText(item.text); } }}
                    className={`flex-1 min-w-0 text-sm ${item.done ? 'line-through cn-text-4' : 'cn-text-2'} ${ownsTask ? 'cursor-text' : ''}`}
                  >
                    {item.text}
                  </span>
                )}
                {ownsTask && (
                  <button
                    onClick={() => removeItem(item)}
                    aria-label="Remove checklist item"
                    className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center cn-text-4 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {checklist.length === 0 && <p className="text-[12.5px] cn-text-4">No checklist steps yet.</p>}
          </div>
        )}
        {ownsTask && (
          <div className="flex items-center gap-2 mt-3">
            <input
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
              placeholder="Add a checklist step..."
              className="flex-1 min-w-0 px-3 py-2 rounded-lg cn-surface-2 text-sm cn-text-1 placeholder:cn-text-4 outline-none"
            />
            <button
              onClick={addItem}
              disabled={addingItem || !newItem.trim()}
              className="shrink-0 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {addingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
            </button>
          </div>
        )}
      </div>

      <div className="cn-glass rounded-2xl p-4">
        <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-3">Progress notes</h3>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="What's the latest?"
          rows={2}
          className="w-full px-3 py-2 rounded-lg cn-surface-2 text-sm cn-text-1 placeholder:cn-text-4 outline-none resize-none"
        />
        <button
          onClick={postNote}
          disabled={posting || !draft.trim()}
          className="mt-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post note'}
        </button>

        {notes === null ? (
          <div className="flex items-center justify-center py-4 cn-text-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : notes.length === 0 ? (
          <p className="text-[12.5px] cn-text-4 mt-4">No progress notes yet.</p>
        ) : (
          <div className="space-y-3 mt-4">
            {notes.map((note, idx) => (
              <div key={note.id} className={idx > 0 ? 'pt-3 border-t cn-border' : ''}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold cn-text-1">{note.author_name} <span className="font-normal cn-text-4">{timeAgo(note.created_at)}</span></p>
                    <p className="text-sm cn-text-2 mt-0.5">{note.content}</p>
                    <button onClick={() => setOpenReplyFor(openReplyFor === note.id ? null : note.id)} className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline mt-1">
                      Reply
                    </button>
                  </div>
                  {note.author_id === currentUserId && (
                    <button
                      onClick={() => removeNote(note.id)}
                      aria-label="Remove note"
                      className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {note.replies.length > 0 && (
                  <div className="mt-2 pl-4 space-y-2 border-l cn-border">
                    {note.replies.map(reply => (
                      <div key={reply.id} className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold cn-text-1">{reply.author_name} <span className="font-normal cn-text-4">{timeAgo(reply.created_at)}</span></p>
                          <p className="text-[12.5px] cn-text-2">{reply.content}</p>
                        </div>
                        {reply.author_id === currentUserId && (
                          <button
                            onClick={() => removeReply(reply.id)}
                            aria-label="Remove reply"
                            className="shrink-0 w-5 h-5 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {openReplyFor === note.id && (
                  <div className="mt-2 pl-4 flex items-center gap-2">
                    <input
                      value={replyDrafts[note.id] ?? ''}
                      onChange={e => setReplyDrafts(prev => ({ ...prev, [note.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') postReply(note.id); }}
                      placeholder="Reply..."
                      autoFocus
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg cn-surface-2 text-xs cn-text-1 placeholder:cn-text-4 outline-none"
                    />
                    <button onClick={() => postReply(note.id)} className="shrink-0 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                      Send
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResourcesPane({ initiative, hubSlug, onChanged, currentUserId }: { initiative: Initiative; hubSlug: string; onChanged: () => void; currentUserId?: string }) {
  const [resources, setResources] = useState<InitiativeResource[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => { initiativesService.getResources(hubSlug, initiative.id).then(setResources).catch(() => setResources([])); }, [hubSlug, initiative.id]);
  useEffect(() => { load(); }, [load]);

  const addResource = async (item: string, qty: string) => {
    await initiativesService.addResource(hubSlug, initiative.id, { item, qty: qty || undefined });
    load();
  };
  const addLink = async (item: string, url: string) => {
    await initiativesService.addResourceLink(hubSlug, initiative.id, { item: item || undefined, url });
    load();
  };
  const [uploading, setUploading] = useState(false);
  const addFile = async (file: File) => {
    setUploading(true);
    try { await initiativesService.uploadResourceFile(hubSlug, initiative.id, file); load(); }
    finally { setUploading(false); }
  };
  const addExistingFile = async (fileId: string) => {
    setUploading(true);
    try { await initiativesService.attachResourceFile(hubSlug, initiative.id, fileId); load(); }
    finally { setUploading(false); }
  };
  const provide = async (id: string) => {
    setBusyId(id);
    try { await initiativesService.provideResource(hubSlug, id); load(); onChanged(); } finally { setBusyId(null); }
  };
  const unprovide = async (id: string) => {
    setBusyId(id);
    try { await initiativesService.unprovideResource(hubSlug, id); load(); onChanged(); } finally { setBusyId(null); }
  };
  const remove = async (id: string) => {
    setDeletingId(id);
    try { await initiativesService.deleteResource(hubSlug, id); load(); } catch { /* non-critical */ }
    finally { setDeletingId(null); }
  };

  if (resources === null) return <div className="flex items-center justify-center py-10 cn-text-4"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-2.5">
      {resources.length === 0 && <p className="text-[12.5px] cn-text-4">No resources shared for this project yet — material needs, files, or links.</p>}
      {resources.map(r => (
        <div key={r.id} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
          {r.kind === 'file' && <FileText className="w-4 h-4 shrink-0 text-blue-500" />}
          {r.kind === 'link' && <LinkIcon className="w-4 h-4 shrink-0 text-blue-500" />}
          {r.kind === 'material' && <Package className={`w-4 h-4 shrink-0 ${r.provided ? 'text-emerald-500' : 'cn-text-4'}`} />}

          {r.kind === 'link' ? (
            <a href={r.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 group">
              <p className="text-sm cn-text-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 truncate inline-flex items-center gap-1">
                {r.item} <ExternalLink className="w-3 h-3 shrink-0" />
              </p>
              <p className="text-xs cn-text-4 truncate">{r.url}</p>
            </a>
          ) : r.kind === 'file' ? (
            <button onClick={() => hubService.downloadFile(hubSlug, r.file_display_name || r.item)} className="flex-1 min-w-0 text-left group">
              <p className="text-sm cn-text-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 truncate">{r.file_display_name || r.item}</p>
              <p className="text-xs cn-text-4">{formatBytes(r.file_size_bytes)}</p>
            </button>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-sm cn-text-1">{r.item}</p>
              {r.qty && <p className="text-xs cn-text-4">{r.qty}</p>}
            </div>
          )}

          {r.kind === 'file' && (
            <button
              onClick={() => hubService.downloadFile(hubSlug, r.file_display_name || r.item)}
              title="Download"
              aria-label="Download"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {r.kind === 'material' && (
            r.provided ? (
              r.provided_by_user_id === currentUserId ? (
                <button
                  onClick={() => unprovide(r.id)}
                  disabled={busyId === r.id}
                  title="Not me anymore — retract"
                  className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <>Provided by you <X className="w-3 h-3" /></>}
                </button>
              ) : (
                <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">Provided by {r.provided_by_name}</span>
              )
            ) : (
              <button
                onClick={() => provide(r.id)}
                disabled={busyId === r.id}
                className="shrink-0 px-3 py-1.5 rounded-lg cn-surface-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 text-xs font-semibold cn-text-3 transition-colors disabled:opacity-50"
              >
                {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'I can provide this'}
              </button>
            )
          )}

          {r.created_by === currentUserId && (
            <button
              onClick={() => remove(r.id)}
              disabled={deletingId === r.id}
              title="Remove resource"
              aria-label="Remove resource"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => setShowAdd(true)}
        disabled={uploading}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border text-sm cn-text-3 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {uploading ? 'Uploading…' : 'Add a resource'}
      </button>
      {showAdd && (
        <AddResourceModal
          hubSlug={hubSlug}
          onClose={() => setShowAdd(false)}
          onSubmitMaterial={addResource}
          onSubmitLink={addLink}
          onSubmitFile={addFile}
          onSubmitExistingFile={addExistingFile}
        />
      )}
    </div>
  );
}

function TeamPane({ initiative, hubSlug, onChanged, currentUserId }: { initiative: Initiative; hubSlug: string; onChanged: () => void; currentUserId?: string }) {
  const [roles, setRoles] = useState<InitiativeRole[] | null>(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => { initiativesService.getRoles(hubSlug, initiative.id).then(setRoles).catch(() => setRoles([])); }, [hubSlug, initiative.id]);
  useEffect(() => { load(); }, [load]);

  const addRole = async (role: string, skill: string) => {
    await initiativesService.addRole(hubSlug, initiative.id, { role, skill: skill || undefined });
    load();
  };
  const claim = async (id: string) => {
    setBusyId(id);
    try { await initiativesService.claimRole(hubSlug, id); load(); onChanged(); } finally { setBusyId(null); }
  };
  const unclaim = async (id: string) => {
    setBusyId(id);
    try { await initiativesService.unclaimRole(hubSlug, id); load(); onChanged(); } finally { setBusyId(null); }
  };
  const remove = async (id: string) => {
    setDeletingId(id);
    try { await initiativesService.deleteRole(hubSlug, id); load(); } catch { /* non-critical */ }
    finally { setDeletingId(null); }
  };

  const openRoles = roles?.filter(r => !r.filled) ?? [];
  const filledRoles = roles?.filter(r => r.filled) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider">Contributors ({initiative.members.length})</h3>
          <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
            <UserPlus className="w-3.5 h-3.5" /> Invite
          </button>
        </div>
        <div className="space-y-2">
          {initiative.members.map((m, i) => (
            <div key={m.id ?? i} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
              <span className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(m.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{initials(m.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold cn-text-1">{m.name}</p>
                {m.role && <p className="text-xs cn-text-4">{m.role}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-2">Open roles</h3>
        {roles === null ? (
          <div className="flex items-center justify-center py-6 cn-text-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {openRoles.length === 0 && <p className="text-[12.5px] cn-text-4">All roles are filled — thank you!</p>}
            {openRoles.map(r => (
              <div key={r.id} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold cn-text-1">{r.role}</p>
                  {r.skill && <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full cn-surface-2 cn-text-3">{r.skill}</span>}
                </div>
                <button
                  onClick={() => claim(r.id)}
                  disabled={busyId === r.id}
                  className="shrink-0 px-3 py-1.5 rounded-lg cn-surface-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 text-xs font-semibold cn-text-3 transition-colors disabled:opacity-50"
                >
                  {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'I can help'}
                </button>
                {r.created_by === currentUserId && (
                  <button
                    onClick={() => remove(r.id)}
                    disabled={deletingId === r.id}
                    title="Remove role"
                    aria-label="Remove role"
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {initiative.viewerIsCreator && (
          <button
            onClick={() => setShowAddRole(true)}
            className="w-full mt-2 flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border text-sm cn-text-3 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add role
          </button>
        )}
      </div>

      {filledRoles.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-2">Filled roles</h3>
          <div className="space-y-2">
            {filledRoles.map(r => (
              <div key={r.id} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(r.filled_by_name || '?')} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{initials(r.filled_by_name || '?')}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm cn-text-1">{r.role}</p>
                  <p className="text-xs cn-text-4">{r.filled_by_name}</p>
                </div>
                {r.filled_by_user_id === currentUserId ? (
                  <button
                    onClick={() => unclaim(r.id)}
                    disabled={busyId === r.id}
                    title="Not for me anymore — unclaim"
                    className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <>Filled by you <X className="w-3 h-3" /></>}
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">Filled</span>
                )}
                {r.created_by === currentUserId && (
                  <button
                    onClick={() => remove(r.id)}
                    disabled={deletingId === r.id}
                    title="Remove role"
                    aria-label="Remove role"
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddRole && <AddRoleModal onClose={() => setShowAddRole(false)} onSubmit={addRole} />}
      {showInvite && <InviteModal hubSlug={hubSlug} initiativeId={initiative.id} shareLink={initiativesService.getShareLink(hubSlug, initiative.id)} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function UpdatesPane({ initiative, hubSlug, canPost, currentUserId }: { initiative: Initiative; hubSlug: string; canPost: boolean; currentUserId?: string }) {
  const [updates, setUpdates] = useState<InitiativeUpdate[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => { initiativesService.getUpdates(hubSlug, initiative.id).then(setUpdates).catch(() => setUpdates([])); }, [hubSlug, initiative.id]);
  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try { await initiativesService.postUpdate(hubSlug, initiative.id, draft.trim()); setDraft(''); load(); }
    finally { setPosting(false); }
  };
  const comment = async (updateId: string) => {
    const text = commentDrafts[updateId]?.trim();
    if (!text) return;
    await initiativesService.addComment(hubSlug, updateId, text);
    setCommentDrafts(prev => ({ ...prev, [updateId]: '' }));
    load();
  };
  const removeUpdate = async (id: string) => {
    setDeletingId(id);
    try { await initiativesService.deleteUpdate(hubSlug, id); load(); } catch { /* non-critical */ }
    finally { setDeletingId(null); }
  };
  const removeComment = async (id: string) => {
    setDeletingId(id);
    try { await initiativesService.deleteComment(hubSlug, id); load(); } catch { /* non-critical */ }
    finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-3.5">
      {canPost && (
        <div className="cn-glass rounded-2xl p-4">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Share a progress update with the team…"
            rows={3}
            className="w-full text-sm bg-transparent cn-text-1 placeholder:cn-text-4 focus:outline-none resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={post}
              disabled={!draft.trim() || posting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold transition-all disabled:opacity-40"
            >
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />} Post Update
            </button>
          </div>
        </div>
      )}

      {updates === null ? (
        <div className="flex items-center justify-center py-10 cn-text-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : updates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 cn-text-4">
          <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No updates yet — be the first to post one.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {updates.map((update, idx) => (
            <motion.div key={update.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="cn-glass rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(update.author_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {initials(update.author_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold cn-text-1">{update.author_name}</span>
                    <span className="text-xs cn-text-4">{timeAgo(update.created_at)}</span>
                  </div>
                  <p className="text-sm cn-text-3 leading-relaxed">{update.content}</p>
                </div>
                {update.author_id === currentUserId && (
                  <button
                    onClick={() => removeUpdate(update.id)}
                    disabled={deletingId === update.id}
                    title="Remove update"
                    aria-label="Remove update"
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    {deletingId === update.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {update.comments.length > 0 && (
                <div className="flex flex-col gap-2 mt-3 pl-11">
                  {update.comments.map(c => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(c.author_name)} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{initials(c.author_name)}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold cn-text-1">{c.author_name}</span>
                        <span className="text-[10px] cn-text-4 ml-1.5">{timeAgo(c.created_at)}</span>
                        <p className="text-[12.5px] cn-text-3 mt-0.5">{c.content}</p>
                      </div>
                      {c.author_id === currentUserId && (
                        <button
                          onClick={() => removeComment(c.id)}
                          disabled={deletingId === c.id}
                          title="Remove comment"
                          aria-label="Remove comment"
                          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center cn-text-4 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                          {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canPost && (
                <div className="flex items-center gap-2 mt-3 pl-11">
                  <input
                    value={commentDrafts[update.id] ?? ''}
                    onChange={e => setCommentDrafts(prev => ({ ...prev, [update.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') comment(update.id); }}
                    placeholder="Reply…"
                    className="flex-1 text-xs bg-transparent border-b cn-border cn-text-1 placeholder:cn-text-4 focus:outline-none py-1"
                  />
                  <button onClick={() => comment(update.id)} disabled={!commentDrafts[update.id]?.trim()} className="text-xs font-semibold text-purple-600 dark:text-purple-400 disabled:opacity-40 shrink-0">Reply</button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────

interface InitiativesScreenProps {
  onBack: () => void;
  initialId?: string;
  onOpenDetail?: (id: string) => void;
  onBackToList?: () => void;
  onOpenSpace?: (spaceSlug: string) => void;
}

type TabId = 'overview' | 'tasks' | 'resources' | 'team' | 'updates';
type StatusFilter = 'all' | 'planning' | 'active' | 'completed';

export function InitiativesScreen({ onBack, initialId, onOpenDetail, onBackToList, onOpenSpace }: InitiativesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const hubSlug = currentHub?.slug ?? '';
  const currentUserId = currentUser?.hubUserId;

  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [mySpaces, setMySpaces] = useState<HubSpace[]>([]);

  const [showNewModal, setShowNewModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const load = useCallback(async () => {
    if (!hubSlug) return;
    setLoading(true);
    try {
      const list = await initiativesService.listAll(hubSlug);
      setInitiatives(list);
      setNotConfigured(false);
    } catch (err) {
      // The service's error message is the server's human-readable body.error text
      // (e.g. "Initiatives app not configured"), not the raw HTTP status.
      setNotConfigured(err instanceof Error && err.message.toLowerCase().includes('not configured'));
      setInitiatives([]);
    } finally {
      setLoading(false);
    }
  }, [hubSlug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (hubSlug) spacesService.listMine(hubSlug).then(setMySpaces).catch(() => {}); }, [hubSlug]);

  useEffect(() => {
    if (!initialId) { setSelectedId(null); return; }
    setSelectedId(initialId);
    setActiveTab('overview');
  }, [initialId]);

  const current = initiatives.find(i => i.id === selectedId) ?? null;

  const filtered = initiatives.filter(ini => {
    if (statusFilter !== 'all' && ini.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && ini.category?.toLowerCase() !== categoryFilter) return false;
    return true;
  });

  const backToList = () => {
    setSelectedId(null);
    onBackToList ? onBackToList() : onBack();
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setActiveTab('overview');
    onOpenDetail?.(id);
  };

  const handleCreate = async (data: { title: string; goal: string; category: string; color: Initiative['color']; space_id: string | null; bannerFile: File | null }) => {
    const { bannerFile, ...createData } = data;
    try {
      const created = await initiativesService.create(hubSlug, createData);
      // The creator is auto-joined synchronously as part of create, so this upload
      // is already authorized by the time it fires — no race with membership.
      if (bannerFile) {
        await initiativesService.uploadBanner(hubSlug, created.id, bannerFile).catch(() => {});
      }
      await load();
      openDetail(created.id);
    } catch { /* surfaced implicitly via unchanged list — non-critical for now */ }
  };

  const handleJoin = async () => {
    if (!current) return;
    try { await initiativesService.join(hubSlug, current.id); load(); } catch { /* non-critical */ }
  };
  const handleLeave = async () => {
    if (!current) return;
    try { await initiativesService.leave(hubSlug, current.id); load(); } catch { /* non-critical */ }
  };

  const handleBannerUpload = async (file: File) => {
    if (!current) return;
    try { await initiativesService.uploadBanner(hubSlug, current.id, file); load(); } catch { /* non-critical */ }
  };
  const handleBannerRemove = async () => {
    if (!current) return;
    try { await initiativesService.removeBanner(hubSlug, current.id); load(); } catch { /* non-critical */ }
  };

  const bannerUrlFor = (ini: Initiative) =>
    ini.banner_mode === 'image' && ini.banner_image_file_name ? initiativesService.getBannerUrl(hubSlug, ini.id) : null;

  const canEditBanner = !!current?.viewerIsCreator;

  const listPane = (
    <div className="flex flex-col gap-3.5">
      <div className="flex overflow-x-auto no-scrollbar border-b cn-border">
        {([
          { value: 'all', label: 'All' }, { value: 'planning', label: 'Planning' },
          { value: 'active', label: 'In progress' }, { value: 'completed', label: 'Completed' },
        ] as { value: StatusFilter; label: string }[]).map(t => {
          const active = statusFilter === t.value;
          return (
            <button key={t.value} onClick={() => setStatusFilter(t.value)} className={`shrink-0 relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${active ? 'text-purple-600 dark:text-purple-300' : 'cn-text-3 hover:cn-text-1'}`}>
              {t.label}
              {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[{ value: 'all', label: 'All categories' }, ...CATEGORY_OPTIONS].map(c => (
          <button
            key={c.value}
            onClick={() => setCategoryFilter(c.value)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              categoryFilter === c.value ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 border-transparent' : 'cn-surface-2 cn-text-2 cn-border'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {notConfigured ? (
        <div className="cn-glass rounded-2xl px-6 py-14 text-center cn-text-3 text-sm">
          Initiatives aren't set up for this hub yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="cn-glass rounded-2xl px-6 py-14 text-center cn-text-3 text-sm">
          No projects match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {filtered.map((ini, idx) => (
            <motion.div key={ini.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <InitiativeCard
                initiative={ini}
                bannerUrl={bannerUrlFor(ini)}
                taskCount={taskCount(ini.tasks)}
                onOpen={() => openDetail(ini.id)}
                onOpenSpace={ini.space_slug ? () => onOpenSpace?.(ini.space_slug!) : undefined}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  const mainColumn = current ? (() => {
    const tc = taskCount(current.tasks);
    const cat = categoryMeta(current.category);
    const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
      { id: 'overview', label: 'Overview', icon: TrendingUp },
      { id: 'tasks', label: `Tasks (${tc.total})`, icon: CheckCircle2 },
      { id: 'resources', label: 'Resources', icon: Package },
      { id: 'team', label: `Team (${current.members.length})`, icon: Users },
      // Unlike tasks/members, updates aren't embedded on the initiative object
      // (UpdatesPane fetches them lazily on its own) — no count to show here that
      // wouldn't be stale, matching the design reference's plain "Updates" label.
      { id: 'updates', label: 'Updates', icon: MessageSquare },
    ];

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={backToList} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:cn-text-1 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> All projects
          </button>
          <button onClick={() => setShowShareModal(true)} title="Share this project" className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors">
            <Share2 className="w-4 h-4 cn-text-3" />
          </button>
        </div>

        <InitiativeBannerUpload
          initiative={current}
          bannerUrl={bannerUrlFor(current)}
          canEdit={canEditBanner}
          onUpload={handleBannerUpload}
          onRemove={handleBannerRemove}
        />

        <div>
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[current.status]}`}>{STATUS_LABEL[current.status]}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full cn-surface-2 cn-text-3">{cat.label}</span>
          </div>
          <h1 className="text-xl md:text-[22px] font-bold cn-text-1 leading-tight tracking-tight">{current.title}</h1>
          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(current.createdBy)} flex items-center justify-center text-white text-[9.5px] font-bold shrink-0`}>{initials(current.createdBy)}</span>
              <span className="text-[12.5px] cn-text-3">Led by <b className="cn-text-1 font-semibold">{current.createdBy}</b></span>
            </span>
            <AvatarStack names={current.members.map(m => m.name)} />
          </div>
          <div className="mt-2.5">
            {current.space_name ? (
              <SpaceChip name={current.space_name} onClick={current.space_slug ? () => onOpenSpace?.(current.space_slug!) : undefined} />
            ) : (
              <span className="text-[11.5px] cn-text-4">Independent project — not tied to a space</span>
            )}
          </div>
        </div>

        <div className="cn-glass rounded-2xl p-4">
          <ProgressBar {...tc} pct={tc.total > 0 ? Math.round((tc.done / tc.total) * 100) : 0} tone={current.status === 'completed' ? 'ok' : 'brand'} />
        </div>

        {current.viewerIsMember ? (
          <button onClick={handleLeave} className="inline-flex items-center justify-center gap-1.5 self-start px-4 py-2 rounded-lg cn-surface-2 cn-text-2 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 text-sm font-semibold transition-colors">
            <Check className="w-3.5 h-3.5" /> Joined
          </button>
        ) : (
          <button onClick={handleJoin} className="inline-flex items-center justify-center gap-1.5 self-start px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold shadow-sm transition-all">
            <UserPlus className="w-3.5 h-3.5" /> Join
          </button>
        )}

        <div className="flex overflow-x-auto no-scrollbar border-b cn-border -mb-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${active ? 'text-purple-600 dark:text-purple-300' : 'cn-text-3 hover:cn-text-1'}`}>
                <Icon className="w-3.5 h-3.5" />{tab.label}
                {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />}
              </button>
            );
          })}
        </div>

        <div className="pt-1">
          {activeTab === 'overview' && <OverviewPane initiative={current} hubSlug={hubSlug} onSeeUpdates={() => setActiveTab('updates')} />}
          {activeTab === 'tasks' && <TasksPane initiative={current} hubSlug={hubSlug} onChanged={load} currentUserId={currentUserId} />}
          {activeTab === 'resources' && <ResourcesPane initiative={current} hubSlug={hubSlug} onChanged={load} currentUserId={currentUserId} />}
          {activeTab === 'team' && <TeamPane initiative={current} hubSlug={hubSlug} onChanged={load} currentUserId={currentUserId} />}
          {activeTab === 'updates' && <UpdatesPane initiative={current} hubSlug={hubSlug} canPost={!!current.viewerIsMember} currentUserId={currentUserId} />}
        </div>
      </div>
    );
  })() : listPane;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-7">
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-7 md:items-start">
          <div className="flex flex-col gap-4 md:gap-5 min-w-0">
            {!current && (
              <div>
                <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:cn-text-1 mb-2.5 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" /> {currentHub?.name}
                </button>
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: 'var(--cn-grad-initiatives)' }}>
                    <Hammer className="w-[22px] h-[22px] text-white" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-[26px] font-bold cn-text-1 tracking-tight">Initiatives</h1>
                    <p className="text-[13px] cn-text-3 mt-0.5">Community projects residents are building together</p>
                  </div>
                  <button onClick={() => setShowNewModal(true)} className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold shadow-sm transition-all shrink-0">
                    <Plus className="w-4 h-4" /> Start a project
                  </button>
                  <button onClick={() => setShowNewModal(true)} title="Start a project" className="md:hidden w-9 h-9 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 flex items-center justify-center text-white shrink-0">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-20 cn-text-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : mainColumn}
          </div>

          <div className="hidden md:block mt-1">
            <div className="cn-glass rounded-2xl p-4 flex flex-col gap-3 sticky top-4">
              <span className="text-xs font-semibold cn-text-3">This month</span>
              <div className="flex justify-between">
                <div>
                  <div className="cn-mono text-[22px] font-bold cn-text-1">{initiatives.filter(i => i.status === 'active').length}</div>
                  <div className="text-[11.5px] cn-text-4">In progress</div>
                </div>
                <div>
                  <div className="cn-mono text-[22px] font-bold text-emerald-500">{initiatives.filter(i => i.status === 'completed').length}</div>
                  <div className="text-[11.5px] cn-text-4">Completed</div>
                </div>
                <div>
                  <div className="cn-mono text-[22px] font-bold text-amber-500">{initiatives.reduce((sum, i) => sum + (i.open_roles_count ?? 0), 0)}</div>
                  <div className="text-[11.5px] cn-text-4">Open roles</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNewModal && <NewInitiativeModal onClose={() => setShowNewModal(false)} onSubmit={handleCreate} mySpaces={mySpaces} />}
      {showShareModal && current && <ShareModal item={current} hubSlug={hubSlug} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
