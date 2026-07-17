import { useState, useEffect, useCallback } from 'react';
import { useHub } from '../context/HubContext';
import {
  Plus, Users, CheckCircle2, Circle, Clock,
  Lightbulb, X, MessageSquare, TrendingUp, UserPlus, Calendar,
  ChevronLeft, CheckCheck, AlertCircle, Zap, Hammer, Share2, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Types ─────────────────────────────────────────────────

interface InitiativeTask {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  assignee?: string;
  dueDate?: string;
}

interface InitiativeMember {
  id: string;
  name: string;
  role: string;
  contribution: string;
  joinedAt: string;
}

interface InitiativeUpdate {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

interface Initiative {
  id: string;
  title: string;
  category: string;
  status: 'planning' | 'active' | 'completed';
  goal: string;
  description: string;
  progress: number;
  color: 'purple' | 'emerald' | 'blue' | 'amber';
  imageUrl?: string | null;
  createdBy: string;
  createdAt: string;
  tasks: InitiativeTask[];
  members: InitiativeMember[];
  updates: InitiativeUpdate[];
}

// ── Colour maps ────────────────────────────────────────────

const COLOR = {
  purple:  { gradient: 'from-purple-600 via-pink-600 to-rose-600',   icon: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', bar: 'from-purple-500 to-pink-500' },
  emerald: { gradient: 'from-emerald-600 via-teal-500 to-cyan-500',  icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', bar: 'from-emerald-500 to-teal-500' },
  blue:    { gradient: 'from-blue-600 via-indigo-600 to-violet-600', icon: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', bar: 'from-blue-500 to-indigo-500' },
  amber:   { gradient: 'from-amber-500 via-orange-500 to-red-500',   icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', bar: 'from-amber-400 to-orange-500' },
} as const;

const STATUS_BADGE = {
  active:    'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  planning:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  completed: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400',
};
const STATUS_LABEL = { active: 'In progress', planning: 'Planning', completed: 'Completed' };

// ── Mock data (fallback / offline) ────────────────────────

const SEED_INITIATIVES: Initiative[] = [
  {
    id: '1',
    title: 'Community Garden Expansion',
    category: 'Environment',
    status: 'active',
    color: 'emerald',
    goal: 'Convert the vacant lot on Elm St. into a shared vegetable garden with 40 raised beds available to all residents.',
    description: "We've secured the land lease and have 14 beds built so far. Next steps: irrigation install and bed assignments. Volunteers needed every weekend.",
    progress: 62,
    createdBy: 'Maria S.',
    createdAt: '2025-11-10',
    tasks: [
      { id: 't1', title: 'Secure land lease agreement', status: 'done', assignee: 'Maria S.' },
      { id: 't2', title: 'Build first 20 raised beds', status: 'done', assignee: 'Build Crew' },
      { id: 't3', title: 'Install irrigation system', status: 'in-progress', assignee: 'David K.', dueDate: 'Jan 15' },
      { id: 't4', title: 'Design bed assignment system', status: 'in-progress', assignee: 'Priya N.' },
      { id: 't5', title: 'Source compost suppliers', status: 'todo' },
      { id: 't6', title: 'Organise opening day event', status: 'todo', dueDate: 'Feb 1' },
      { id: 't7', title: 'Apply for community grant', status: 'todo', assignee: 'Maria S.' },
    ],
    members: [
      { id: 'm1', name: 'Maria S.',  role: 'Organiser',          contribution: 'Leading the project and coordinating volunteers', joinedAt: '2025-11-10' },
      { id: 'm2', name: 'David K.',  role: 'Irrigation Lead',    contribution: 'Designing and installing the water system',        joinedAt: '2025-11-14' },
      { id: 'm3', name: 'Priya N.',  role: 'Logistics',          contribution: 'Managing bed assignments and signups',             joinedAt: '2025-11-20' },
      { id: 'm4', name: 'James T.',  role: 'Volunteer',          contribution: 'Weekend build days and soil prep',                 joinedAt: '2025-12-01' },
      { id: 'm5', name: 'Lin C.',    role: 'Volunteer',          contribution: 'Plant sourcing and composting',                    joinedAt: '2025-12-03' },
    ],
    updates: [
      { id: 'u1', author: 'David K.', content: "Irrigation pipes delivered — starting install this weekend. Looking for 2 more hands if anyone's free.", timestamp: '2026-01-03T14:30:00' },
      { id: 'u2', author: 'Maria S.', content: 'Land lease signed and notarised! We officially have the lot for 3 years. Big thank you to everyone who helped push this through.', timestamp: '2025-12-15T09:00:00' },
      { id: 'u3', author: 'Priya N.', content: 'Bed signup form is live — 28 of 40 spots already claimed in the first 24 hours!', timestamp: '2025-12-10T11:15:00' },
    ],
  },
  {
    id: '2',
    title: 'Local Tool Library',
    category: 'Shared Resources',
    status: 'planning',
    color: 'blue',
    goal: 'Establish a lending library of tools and equipment so neighbours can borrow instead of buy.',
    description: 'Inventory catalogue underway with 80+ tools donated so far. Looking for a space to host and a volunteer coordinator.',
    progress: 28,
    createdBy: 'James T.',
    createdAt: '2025-12-01',
    tasks: [
      { id: 't1', title: 'Catalogue all donated tools', status: 'in-progress', assignee: 'James T.' },
      { id: 't2', title: 'Find a hosting location',     status: 'todo' },
      { id: 't3', title: 'Build borrowing platform',   status: 'todo' },
      { id: 't4', title: 'Recruit volunteer coordinator', status: 'todo' },
      { id: 't5', title: 'Draft borrowing policy',     status: 'todo' },
    ],
    members: [
      { id: 'm1', name: 'James T.', role: 'Initiator',    contribution: 'Collecting and cataloguing donated tools', joinedAt: '2025-12-01' },
      { id: 'm2', name: 'Sofia R.', role: 'Tech Support', contribution: 'Building the borrowing platform',          joinedAt: '2025-12-05' },
    ],
    updates: [
      { id: 'u1', author: 'James T.', content: "We've collected 80+ tools from 12 households. Catalogue halfway done. Anyone know of a space we could use for storage?", timestamp: '2025-12-20T16:00:00' },
    ],
  },
  {
    id: '3',
    title: 'Neighbourhood Safety Watch',
    category: 'Safety',
    status: 'active',
    color: 'amber',
    goal: 'Coordinate a resident-led neighbourhood watch across 7 zones to reduce crime and build community trust.',
    description: 'Monthly patrols, an alert channel, and direct liaison with the local precinct. Currently active in 3 of 7 planned zones.',
    progress: 44,
    createdBy: 'Robert M.',
    createdAt: '2025-10-05',
    tasks: [
      { id: 't1', title: 'Establish zone coordinators (3 of 7)', status: 'in-progress', assignee: 'Robert M.' },
      { id: 't2', title: 'Set up alert communication channel',   status: 'done' },
      { id: 't3', title: 'Meet with precinct liaison officer',   status: 'done', assignee: 'Robert M.' },
      { id: 't4', title: 'Design patrol schedule template',      status: 'done' },
      { id: 't5', title: 'Recruit zone 4 coordinator',           status: 'todo' },
      { id: 't6', title: 'Recruit zones 5–7 coordinators',       status: 'todo' },
      { id: 't7', title: 'Host community safety Q&A event',      status: 'todo', dueDate: 'Feb 10' },
    ],
    members: [
      { id: 'm1', name: 'Robert M.',   role: 'Programme Lead',       contribution: 'Zone coordination and police liaison',       joinedAt: '2025-10-05' },
      { id: 'm2', name: 'Deborah L.',  role: 'Zone 1 Coordinator',   contribution: 'Managing patrols in the Oak St. area',      joinedAt: '2025-10-12' },
      { id: 'm3', name: 'Ahmed K.',    role: 'Zone 2 Coordinator',   contribution: 'Coverage for the Central Ave. block',       joinedAt: '2025-10-20' },
    ],
    updates: [
      { id: 'u1', author: 'Robert M.', content: 'Zone 3 is now active — welcome Lin! That brings us to 3 zones covered. Next meeting Jan 12, Community Center.', timestamp: '2026-01-02T10:00:00' },
    ],
  },
  {
    id: '4',
    title: 'Community Broadband Advocacy',
    category: 'Infrastructure',
    status: 'planning',
    color: 'purple',
    goal: 'Push for municipal fibre infrastructure to guarantee fast, affordable internet access as a public utility.',
    description: 'Building a petition, attending city council meetings, and partnering with other neighbourhoods facing the same issues.',
    progress: 15,
    createdBy: 'Sam P.',
    createdAt: '2025-12-20',
    tasks: [
      { id: 't1', title: 'Draft petition and talking points',        status: 'in-progress', assignee: 'Sam P.' },
      { id: 't2', title: 'Connect with other neighbourhood groups',  status: 'todo' },
      { id: 't3', title: 'Attend January city council meeting',      status: 'todo', dueDate: 'Jan 21' },
      { id: 't4', title: 'Research municipal broadband case studies', status: 'todo' },
    ],
    members: [
      { id: 'm1', name: 'Sam P.', role: 'Advocate', contribution: 'Drafting petition and leading advocacy effort', joinedAt: '2025-12-20' },
    ],
    updates: [
      { id: 'u1', author: 'Sam P.', content: "Starting this initiative after seeing internet costs rise 40% this year. If this resonates with you, please join — we need voices.", timestamp: '2025-12-20T18:00:00' },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',     'from-violet-500 to-purple-500',
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = name.charCodeAt(name.indexOf(c)) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <span key={n + i} className={`${i === 0 ? '' : '-ml-2'} rounded-full ring-2 ring-white dark:ring-zinc-950`}>
          <span className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(n)} flex items-center justify-center text-white text-[9.5px] font-bold`}>
            {initials(n)}
          </span>
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 w-6 h-6 rounded-full cn-surface-3 ring-2 ring-white dark:ring-zinc-950 flex items-center justify-center text-[9.5px] font-bold cn-text-2">
          +{extra}
        </span>
      )}
    </div>
  );
}

function ProgressBar({ done, total, pct, tone }: { done: number; total: number; pct: number; tone: 'ok' | 'brand' }) {
  return (
    <div>
      <div className="h-1.5 rounded-full cn-surface-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${tone === 'ok' ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-pink-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="cn-mono text-[11px] cn-text-3">{done}/{total} tasks done</span>
        <span className="cn-mono text-[11px] cn-text-4">{pct}%</span>
      </div>
    </div>
  );
}

// ── Overlay (shared shell for New / Share modals) ───────────

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

function NewInitiativeModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (title: string, goal: string, color: Initiative['color']) => void;
}) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [color, setColor] = useState<Initiative['color']>('purple');
  return (
    <Overlay title="Start a project" onClose={onClose}>
      <div>
        <label className={fieldLabelClass}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Repaint the community mural" className={fieldClass} />
      </div>
      <div>
        <label className={fieldLabelClass}>What is this project about?</label>
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3} placeholder="Describe the goal…" className={`${fieldClass} resize-none`} />
      </div>
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
        onClick={() => { if (title.trim()) { onSubmit(title.trim(), goal.trim(), color); onClose(); } }}
        disabled={!title.trim()}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Create project
      </button>
    </Overlay>
  );
}

function ShareModal({ item, onClose }: { item: Initiative; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = window.location.href;
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
          <Lightbulb className="w-4 h-4 text-white" />
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

// ── Component ──────────────────────────────────────────────

interface InitiativesScreenProps {
  onBack: () => void;
  initialId?: string;
  onOpenDetail?: (id: string) => void;
  onBackToList?: () => void;
}

type TabId = 'overview' | 'tasks' | 'members' | 'updates';
type StatusFilter = 'all' | 'planning' | 'active' | 'completed';

export function InitiativesScreen({ onBack, initialId, onOpenDetail, onBackToList }: InitiativesScreenProps) {
  const { currentHub, currentUser } = useHub();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [joinedOnly, setJoinedOnly] = useState(false);

  // Remote data
  const [remoteInitiatives, setRemoteInitiatives] = useState<Initiative[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Locally created initiatives (optimistic, best-effort persisted)
  const [localInitiatives, setLocalInitiatives] = useState<Initiative[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Participation state
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, { role: string; contribution: string }>>({});

  // Join panel state
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [joinRole, setJoinRole] = useState('');
  const [joinContribution, setJoinContribution] = useState('');

  // Task overrides (status toggles — optimistic while API call is in flight)
  const [taskOverrides, setTaskOverrides] = useState<Record<string, InitiativeTask['status']>>({});

  // Locally added tasks per initiative (optimistic, replaced on next fetch)
  const [localTasks, setLocalTasks] = useState<Record<string, InitiativeTask[]>>({});
  const [newTaskText, setNewTaskText] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);

  // Locally added updates
  const [localUpdates, setLocalUpdates] = useState<Record<string, InitiativeUpdate[]>>({});
  const [newUpdateText, setNewUpdateText] = useState('');

  // ── API helpers ─────────────────────────────────────────

  const apiBase = currentHub?.tunnelUrl ?? '';
  const authHeaders = useCallback((): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(currentUser?.authToken ? { Authorization: `Bearer ${currentUser.authToken}` } : {}),
  }), [currentUser?.authToken]);

  const fetchInitiatives = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/initiatives`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRemoteInitiatives(data.initiatives ?? data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => { fetchInitiatives(); }, [fetchInitiatives]);

  // Sync view state with URL-driven initialId
  useEffect(() => {
    if (!initialId) {
      setView('list');
      setSelectedId(null);
      return;
    }
    const source = [...localInitiatives, ...(remoteInitiatives ?? SEED_INITIATIVES)];
    const found = source.find(i => String(i.id) === String(initialId));
    if (found) {
      setSelectedId(String(found.id));
      setView('detail');
      setActiveTab('overview');
      setShowJoinPanel(false);
      setShowAddTask(false);
    }
  }, [initialId, remoteInitiatives, localInitiatives]);

  const baseInitiatives = !loadError && remoteInitiatives !== null ? remoteInitiatives : SEED_INITIATIVES;

  const initiatives = [...localInitiatives, ...baseInitiatives].map(ini => ({
    ...ini,
    tasks: [...ini.tasks, ...(localTasks[ini.id] ?? [])],
    updates: [...(localUpdates[ini.id] ?? []), ...ini.updates],
  }));

  const current = initiatives.find(i => i.id === selectedId) ?? null;

  const isJoined = (id: string) => joinedIds.includes(id);

  const filtered = initiatives.filter(ini => {
    if (joinedOnly && !isJoined(ini.id)) return false;
    if (statusFilter !== 'all' && ini.status !== statusFilter) return false;
    return true;
  });

  // ── navigation ─────────────────────────────────────────

  const backToList = () => {
    setView('list');
    setSelectedId(null);
    setShowJoinPanel(false);
    setShowAddTask(false);
    onBackToList ? onBackToList() : onBack();
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
    setActiveTab('overview');
    setShowJoinPanel(false);
    setShowAddTask(false);
    setNewTaskText('');
    setNewUpdateText('');
    onOpenDetail?.(id);
  };

  // ── create ──────────────────────────────────────────────

  const handleCreateInitiative = (title: string, goal: string, color: Initiative['color']) => {
    const tempId = `local-${Date.now()}`;
    const item: Initiative = {
      id: tempId, title, category: '', status: 'planning', color,
      goal: goal || 'New community project — details coming soon.',
      description: '', progress: 0, imageUrl: null,
      createdBy: 'You', createdAt: new Date().toISOString(),
      tasks: [], members: [], updates: [],
    };
    setLocalInitiatives(prev => [item, ...prev]);
    openDetail(tempId);
    if (apiBase) {
      fetch(`${apiBase}/api/initiatives`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, goal }),
      }).then(r => {
        if (r.ok) {
          setLocalInitiatives(prev => prev.filter(i => i.id !== tempId));
          fetchInitiatives();
        }
      }).catch(() => {});
    }
  };

  // ── join / leave ────────────────────────────────────────

  const handleJoinConfirm = () => {
    if (!selectedId || !joinRole.trim()) return;
    // Optimistic local update
    setJoinedIds(prev => [...prev, selectedId]);
    setMemberRoles(prev => ({ ...prev, [selectedId]: { role: joinRole.trim(), contribution: joinContribution.trim() } }));
    setShowJoinPanel(false);
    setJoinRole('');
    setJoinContribution('');
    // Persist to Society+ (creates membership record)
    if (apiBase) {
      fetch(`${apiBase}/api/initiatives/${selectedId}/join`, {
        method: 'POST',
        headers: authHeaders(),
      }).catch(() => {});
    }
  };

  const handleLeave = () => {
    if (!selectedId) return;
    setJoinedIds(prev => prev.filter(id => id !== selectedId));
    setMemberRoles(prev => { const n = { ...prev }; delete n[selectedId]; return n; });
  };

  // ── tasks ───────────────────────────────────────────────

  const getTaskStatus = (task: InitiativeTask): InitiativeTask['status'] =>
    taskOverrides[task.id] ?? task.status;

  const cycleTask = (task: InitiativeTask) => {
    const cur = getTaskStatus(task);
    const next: InitiativeTask['status'] = cur === 'todo' ? 'in-progress' : cur === 'in-progress' ? 'done' : 'todo';
    // Optimistic update
    setTaskOverrides(prev => ({ ...prev, [task.id]: next }));
    // Persist to API (best-effort; optimistic update stays regardless)
    if (apiBase && !task.id.startsWith('local-')) {
      fetch(`${apiBase}/api/initiatives/goals/${task.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: next }),
      }).then(r => { if (r.ok) fetchInitiatives(); }).catch(() => {});
    }
  };

  const handleAddTask = () => {
    if (!newTaskText.trim() || !selectedId) return;
    const title = newTaskText.trim();
    // Optimistic
    const tempId = `local-${Date.now()}`;
    const task: InitiativeTask = { id: tempId, title, status: 'todo' };
    setLocalTasks(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), task] }));
    setNewTaskText('');
    setShowAddTask(false);
    // Persist to API
    if (apiBase) {
      fetch(`${apiBase}/api/initiatives/${selectedId}/goals`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title }),
      }).then(r => {
        if (r.ok) {
          // Remove optimistic entry and reload from server
          setLocalTasks(prev => {
            const n = { ...prev };
            n[selectedId] = (n[selectedId] ?? []).filter(t => t.id !== tempId);
            return n;
          });
          fetchInitiatives();
        }
      }).catch(() => {});
    }
  };

  // ── updates ─────────────────────────────────────────────

  const handlePostUpdate = () => {
    if (!newUpdateText.trim() || !selectedId) return;
    const update: InitiativeUpdate = {
      id: `u-${Date.now()}`,
      author: 'You',
      content: newUpdateText.trim(),
      timestamp: new Date().toISOString(),
    };
    setLocalUpdates(prev => ({ ...prev, [selectedId]: [update, ...(prev[selectedId] ?? [])] }));
    setNewUpdateText('');
  };

  // ── task counts for badge ───────────────────────────────

  const taskCount = (ini: Initiative) => {
    const tasks = [...ini.tasks, ...(localTasks[ini.id] ?? [])];
    const done = tasks.filter(t => (taskOverrides[t.id] ?? t.status) === 'done').length;
    return { done, total: tasks.length };
  };

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  const listPane = (
    <div className="flex flex-col gap-3.5">
      {/* Status tabs */}
      <div className="flex overflow-x-auto no-scrollbar border-b cn-border">
        {([
          { value: 'all',       label: 'All' },
          { value: 'planning',  label: 'Planning' },
          { value: 'active',    label: 'In progress' },
          { value: 'completed', label: 'Completed' },
        ] as { value: StatusFilter; label: string }[]).map(t => {
          const active = statusFilter === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setStatusFilter(t.value)}
              className={`shrink-0 relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? 'text-purple-600 dark:text-purple-300' : 'cn-text-3 hover:cn-text-1'
              }`}
            >
              {t.label}
              {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* Joined filter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setJoinedOnly(v => !v)}
          className={`inline-flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            joinedOnly
              ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 border-transparent'
              : 'cn-surface-2 cn-text-2 cn-border'
          }`}
        >
          <CheckCheck className="w-3 h-3" /> Joined ({joinedIds.length})
        </button>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="cn-glass rounded-2xl px-6 py-14 text-center cn-text-3 text-sm">
          No projects match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {filtered.map((ini, idx) => {
            const c = COLOR[ini.color];
            const tc = taskCount(ini);
            return (
              <motion.button
                key={ini.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => openDetail(ini.id)}
                className="cn-glass rounded-2xl p-4 flex flex-col gap-3 text-left hover:border-purple-300/60 dark:hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0 overflow-hidden`}>
                    {ini.imageUrl
                      ? <img src={ini.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <Lightbulb className="w-4 h-4 text-white" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold cn-text-1 leading-tight">{ini.title}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[ini.status]}`}>{STATUS_LABEL[ini.status]}</span>
                      {isJoined(ini.id) && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">You're in</span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[12.5px] leading-relaxed cn-text-3 line-clamp-2">{ini.goal}</p>

                <ProgressBar {...tc} pct={ini.progress} tone={ini.status === 'completed' ? 'ok' : 'brand'} />

                <div className="flex items-center justify-between">
                  <AvatarStack names={ini.members.map(m => m.name)} />
                  <span className="text-[11px] cn-text-4">by {ini.createdBy}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );

  const mainColumn = current
    ? (() => {
      const tc = taskCount(current);
      const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Overview',  icon: TrendingUp },
        { id: 'tasks',    label: `Tasks (${tc.total})`, icon: CheckCircle2 },
        { id: 'members',  label: `Members (${current.members.length + (isJoined(current.id) ? 1 : 0)})`, icon: Users },
        { id: 'updates',  label: `Updates (${current.updates.length})`, icon: MessageSquare },
      ];

      const groupedTasks = {
        'in-progress': current.tasks.filter(t => getTaskStatus(t) === 'in-progress'),
        'todo':        current.tasks.filter(t => getTaskStatus(t) === 'todo'),
        'done':        current.tasks.filter(t => getTaskStatus(t) === 'done'),
      };

      return (
        <div className="flex flex-col gap-4">
          {/* Back + share */}
          <div className="flex items-center justify-between">
            <button onClick={backToList} className="inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:cn-text-1 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> All projects
            </button>
            <button onClick={() => setShowShareModal(true)} title="Share this project" className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors">
              <Share2 className="w-4 h-4 cn-text-3" />
            </button>
          </div>

          {/* Title block */}
          <div>
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[current.status]}`}>{STATUS_LABEL[current.status]}</span>
            </div>
            <h1 className="text-xl md:text-[22px] font-bold cn-text-1 leading-tight tracking-tight">{current.title}</h1>
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(current.createdBy)} flex items-center justify-center text-white text-[9.5px] font-bold shrink-0`}>
                  {initials(current.createdBy)}
                </span>
                <span className="text-[12.5px] cn-text-3">Led by <b className="cn-text-1 font-semibold">{current.createdBy}</b></span>
              </span>
              <AvatarStack names={current.members.map(m => m.name)} />
            </div>
          </div>

          {/* Progress card */}
          <div className="cn-glass rounded-2xl p-4">
            <ProgressBar {...tc} pct={current.progress} tone={current.status === 'completed' ? 'ok' : 'brand'} />
          </div>

          {/* Join panel */}
          <AnimatePresence>
            {showJoinPanel && !isJoined(current.id) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="cn-surface border border-purple-200 dark:border-purple-800/50 rounded-2xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold cn-text-1 text-sm">Join this initiative</h3>
                    <button onClick={() => setShowJoinPanel(false)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <X className="w-4 h-4 cn-text-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className={fieldLabelClass}>Your role <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        value={joinRole}
                        onChange={e => setJoinRole(e.target.value)}
                        placeholder="e.g. Volunteer, Coordinator, Advisor…"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>How you'll contribute</label>
                      <textarea
                        value={joinContribution}
                        onChange={e => setJoinContribution(e.target.value)}
                        placeholder="Briefly describe what you'll bring to this effort…"
                        rows={2}
                        className={`${fieldClass} resize-none`}
                      />
                    </div>
                    <button
                      onClick={handleJoinConfirm}
                      disabled={!joinRole.trim()}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirm — Join Initiative
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isJoined(current.id) && !showJoinPanel && (
            <button
              onClick={() => setShowJoinPanel(true)}
              className="inline-flex items-center justify-center gap-1.5 self-start px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold shadow-sm transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" /> Join
            </button>
          )}
          {isJoined(current.id) && (
            <button
              onClick={handleLeave}
              className="inline-flex items-center justify-center gap-1.5 self-start px-4 py-2 rounded-lg cn-surface-2 cn-text-2 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 text-sm font-semibold transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Joined
            </button>
          )}

          {/* Tab strip */}
          <div className="flex overflow-x-auto no-scrollbar border-b cn-border -mb-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'text-purple-600 dark:text-purple-300' : 'cn-text-3 hover:cn-text-1'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="pt-1">

            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="space-y-3.5">
                <div className="cn-glass rounded-2xl p-4">
                  <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider mb-2">Goal</h3>
                  <p className="text-sm cn-text-1 leading-relaxed font-medium">{current.goal}</p>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { label: 'Participants', value: current.members.length + (isJoined(current.id) ? 1 : 0), icon: Users },
                    { label: 'Tasks',        value: `${tc.done}/${tc.total}`, icon: CheckCircle2 },
                    { label: 'Updates',      value: current.updates.length, icon: MessageSquare },
                  ].map(stat => (
                    <div key={stat.label} className="cn-glass rounded-2xl p-3.5 flex flex-col items-center gap-1">
                      <stat.icon className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                      <span className="text-lg font-bold cn-text-1">{stat.value}</span>
                      <span className="text-[11px] cn-text-3">{stat.label}</span>
                    </div>
                  ))}
                </div>

                {isJoined(current.id) && memberRoles[current.id] && (
                  <div className="rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 p-4">
                    <h3 className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">Your contribution</h3>
                    <p className="text-sm font-semibold cn-text-1">{memberRoles[current.id].role}</p>
                    {memberRoles[current.id].contribution && (
                      <p className="text-xs cn-text-3 mt-1">{memberRoles[current.id].contribution}</p>
                    )}
                  </div>
                )}

                {current.updates[0] && (
                  <div
                    className="cn-glass rounded-2xl p-4 cursor-pointer hover:border-purple-300/60 dark:hover:border-purple-500/30 transition-colors"
                    onClick={() => setActiveTab('updates')}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-semibold cn-text-3 uppercase tracking-wider">Latest update</h3>
                      <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">See all →</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarColor(current.updates[0].author)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                        {initials(current.updates[0].author)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold cn-text-2">{current.updates[0].author} · <span className="font-normal cn-text-4">{timeAgo(current.updates[0].timestamp)}</span></p>
                        <p className="text-sm cn-text-3 mt-0.5 line-clamp-2">{current.updates[0].content}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TASKS ── */}
            {activeTab === 'tasks' && (
              <div className="space-y-5">
                {(['in-progress', 'todo', 'done'] as const).map(status => {
                  const group = groupedTasks[status];
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
                          const ts = getTaskStatus(task);
                          return (
                            <div key={task.id} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
                              <button
                                onClick={() => cycleTask(task)}
                                className="shrink-0 w-5 h-5 flex items-center justify-center transition-transform hover:scale-110"
                                aria-label="Toggle task status"
                              >
                                {ts === 'done'        && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                {ts === 'in-progress' && <Clock className="w-5 h-5 text-amber-500" />}
                                {ts === 'todo'        && <Circle className="w-5 h-5 cn-text-4" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${ts === 'done' ? 'line-through cn-text-4' : 'cn-text-1'}`}>
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {task.assignee && <span className="text-xs cn-text-3">{task.assignee}</span>}
                                  {task.dueDate && (
                                    <span className="flex items-center gap-1 text-xs cn-text-4">
                                      <Calendar className="w-3 h-3" />{task.dueDate}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Add task */}
                <AnimatePresence>
                  {showAddTask ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="cn-surface border border-purple-200 dark:border-purple-800/50 rounded-xl p-4 flex gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={newTaskText}
                          onChange={e => setNewTaskText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowAddTask(false); }}
                          placeholder="Describe the task…"
                          className="flex-1 text-sm bg-transparent cn-text-1 placeholder:cn-text-4 focus:outline-none"
                        />
                        <button onClick={handleAddTask} disabled={!newTaskText.trim()} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors">Add</button>
                        <button onClick={() => setShowAddTask(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"><X className="w-4 h-4 cn-text-4" /></button>
                      </div>
                    </motion.div>
                  ) : (
                    <button
                      onClick={() => setShowAddTask(true)}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cn-border text-sm cn-text-3 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add task
                    </button>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── MEMBERS ── */}
            {activeTab === 'members' && (
              <div className="space-y-2.5">
                {isJoined(current.id) && memberRoles[current.id] && (
                  <div className="rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      You
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold cn-text-1">You</p>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">You</span>
                      </div>
                      <p className="text-xs font-medium cn-text-3 mt-0.5">{memberRoles[current.id].role}</p>
                      {memberRoles[current.id].contribution && (
                        <p className="text-xs cn-text-4 mt-0.5 line-clamp-1">{memberRoles[current.id].contribution}</p>
                      )}
                    </div>
                  </div>
                )}

                {current.members.map(member => (
                  <div key={member.id} className="cn-glass rounded-2xl p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(member.name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                      {initials(member.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold cn-text-1">{member.name}</p>
                        {member.id === 'm1' && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Lead</span>
                        )}
                      </div>
                      <p className="text-xs font-medium cn-text-3 mt-0.5">{member.role}</p>
                      <p className="text-xs cn-text-4 mt-0.5 line-clamp-1">{member.contribution}</p>
                    </div>
                  </div>
                ))}

                {!isJoined(current.id) && (
                  <button
                    onClick={() => setShowJoinPanel(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed cn-border text-sm cn-text-3 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" /> Join to add yourself
                  </button>
                )}
              </div>
            )}

            {/* ── UPDATES ── */}
            {activeTab === 'updates' && (
              <div className="space-y-3.5">
                {isJoined(current.id) && (
                  <div className="cn-glass rounded-2xl p-4">
                    <textarea
                      value={newUpdateText}
                      onChange={e => setNewUpdateText(e.target.value)}
                      placeholder="Share a progress update with the team…"
                      rows={3}
                      className="w-full text-sm bg-transparent cn-text-1 placeholder:cn-text-4 focus:outline-none resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handlePostUpdate}
                        disabled={!newUpdateText.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Zap className="w-3.5 h-3.5" /> Post Update
                      </button>
                    </div>
                  </div>
                )}

                {current.updates.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 cn-text-4">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">No updates yet — be the first to post one.</p>
                  </div>
                )}

                <div className="space-y-2.5">
                  {current.updates.map((update, idx) => (
                    <motion.div
                      key={update.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="cn-glass rounded-2xl p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(update.author)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {update.author === 'You' ? 'You' : initials(update.author)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold cn-text-1">{update.author}</span>
                            <span className="text-xs cn-text-4">{timeAgo(update.timestamp)}</span>
                          </div>
                          <p className="text-sm cn-text-3 leading-relaxed">{update.content}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {!isJoined(current.id) && (
                  <div className="flex items-center gap-3 cn-surface-2 border cn-border rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 cn-text-4 shrink-0" />
                    <p className="text-xs cn-text-3 flex-1">Join this initiative to post updates.</p>
                    <button onClick={() => setShowJoinPanel(true)} className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline shrink-0">Join →</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    })()
    : listPane;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-7">
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-7 md:items-start">
          <div className="flex flex-col gap-4 md:gap-5 min-w-0">
            {view === 'list' && (
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
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-sm font-semibold shadow-sm transition-all shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Start a project
                  </button>
                  <button
                    onClick={() => setShowNewModal(true)}
                    title="Start a project"
                    className="md:hidden w-9 h-9 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 flex items-center justify-center text-white shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {mainColumn}
          </div>

          {/* Summary rail */}
          <div className="hidden md:block mt-1">
            <div className="cn-glass rounded-2xl p-4 flex flex-col gap-3 sticky top-4">
              <span className="text-xs font-semibold cn-text-3">Overview</span>
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
                  <div className="cn-mono text-[22px] font-bold text-amber-500">{initiatives.filter(i => i.status === 'planning').length}</div>
                  <div className="text-[11.5px] cn-text-4">Planning</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNewModal && <NewInitiativeModal onClose={() => setShowNewModal(false)} onSubmit={handleCreateInitiative} />}
      {showShareModal && current && <ShareModal item={current} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
