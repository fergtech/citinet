import { useState, useEffect } from 'react';
import {
  ArrowLeft, Target, Plus, Users, CheckCircle2, Circle, Clock,
  Lightbulb, X, MessageSquare, TrendingUp, UserPlus, Calendar,
  ChevronRight, CheckCheck, AlertCircle, Zap,
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

// ── Mock data ──────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────

interface InitiativesScreenProps {
  onBack: () => void;
}

type TabId = 'overview' | 'tasks' | 'members' | 'updates';
type FilterId = 'all' | 'active' | 'planning' | 'joined';

export function InitiativesScreen({ onBack }: InitiativesScreenProps) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [filter, setFilter] = useState<FilterId>('all');

  // Participation state
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, { role: string; contribution: string }>>({});

  // Join panel state
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [joinRole, setJoinRole] = useState('');
  const [joinContribution, setJoinContribution] = useState('');

  // Task overrides (status toggles)
  const [taskOverrides, setTaskOverrides] = useState<Record<string, InitiativeTask['status']>>({});

  // Locally added tasks per initiative
  const [localTasks, setLocalTasks] = useState<Record<string, InitiativeTask[]>>({});
  const [newTaskText, setNewTaskText] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);

  // Locally added updates
  const [localUpdates, setLocalUpdates] = useState<Record<string, InitiativeUpdate[]>>({});
  const [newUpdateText, setNewUpdateText] = useState('');

  // Deep-link: auto-open from sessionStorage (set by dashboard modal)
  useEffect(() => {
    const deeplink = sessionStorage.getItem('citinet-deeplink-initiative');
    if (!deeplink) return;
    sessionStorage.removeItem('citinet-deeplink-initiative');
    if (SEED_INITIATIVES.find(i => i.id === deeplink)) {
      setSelectedId(deeplink);
      setView('detail');
      setActiveTab('overview');
    }
  }, []);

  const initiatives = SEED_INITIATIVES.map(ini => ({
    ...ini,
    tasks: [...ini.tasks, ...(localTasks[ini.id] ?? [])],
    updates: [...(localUpdates[ini.id] ?? []), ...ini.updates],
  }));

  const current = initiatives.find(i => i.id === selectedId) ?? null;

  const filtered = initiatives.filter(ini => {
    if (filter === 'joined') return joinedIds.includes(ini.id);
    if (filter === 'active')   return ini.status === 'active';
    if (filter === 'planning') return ini.status === 'planning';
    return true;
  });

  // ── navigation ─────────────────────────────────────────

  const handleBack = () => {
    if (view === 'detail') {
      setView('list');
      setSelectedId(null);
      setShowJoinPanel(false);
      setShowAddTask(false);
    } else {
      onBack();
    }
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
    setActiveTab('overview');
    setShowJoinPanel(false);
    setShowAddTask(false);
    setNewTaskText('');
    setNewUpdateText('');
  };

  // ── join / leave ────────────────────────────────────────

  const isJoined = (id: string) => joinedIds.includes(id);

  const handleJoinConfirm = () => {
    if (!selectedId || !joinRole.trim()) return;
    setJoinedIds(prev => [...prev, selectedId]);
    setMemberRoles(prev => ({ ...prev, [selectedId]: { role: joinRole.trim(), contribution: joinContribution.trim() } }));
    setShowJoinPanel(false);
    setJoinRole('');
    setJoinContribution('');
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
    setTaskOverrides(prev => ({ ...prev, [task.id]: next }));
  };

  const handleAddTask = () => {
    if (!newTaskText.trim() || !selectedId) return;
    const task: InitiativeTask = { id: `local-${Date.now()}`, title: newTaskText.trim(), status: 'todo' };
    setLocalTasks(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), task] }));
    setNewTaskText('');
    setShowAddTask(false);
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </button>

          <div className="flex-1 min-w-0">
            {view === 'list' ? (
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Initiatives</h1>
            ) : (
              <p className="text-base font-semibold text-slate-900 dark:text-white truncate">{current?.title}</p>
            )}
          </div>

          {view === 'list' && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium transition-all shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}

          {view === 'detail' && current && (
            <button
              onClick={() => isJoined(current.id) ? handleLeave() : setShowJoinPanel(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                isJoined(current.id)
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-sm'
              }`}
            >
              {isJoined(current.id) ? <CheckCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              {isJoined(current.id) ? 'Joined' : 'Join'}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          LIST VIEW
      ══════════════════════════════════════════════════════ */}
      {view === 'list' && (
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Filter chips */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {(['all', 'active', 'planning', 'joined'] as FilterId[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
                  filter === f
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700'
                }`}
              >
                {f === 'all' ? `All (${initiatives.length})` : f === 'joined' ? `Joined (${joinedIds.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                <Target className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">No initiatives here yet</p>
              </div>
            )}
            {filtered.map((ini, idx) => {
              const c = COLOR[ini.color];
              const tc = taskCount(ini);
              return (
                <motion.button
                  key={ini.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => openDetail(ini.id)}
                  className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-purple-200 dark:hover:border-purple-800/50 hover:shadow-md transition-all group overflow-hidden"
                >
                  {/* Top accent strip */}
                  <div className={`h-1 w-full bg-gradient-to-r ${c.gradient}`} />
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg ${c.icon} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Lightbulb className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{ini.title}</h3>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[ini.status]}`}>
                            {ini.status.charAt(0).toUpperCase() + ini.status.slice(1)}
                          </span>
                          {isJoined(ini.id) && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">You're in</span>
                          )}
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 inline-block ${c.badge}`}>{ini.category}</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{ini.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-purple-400 transition-colors shrink-0 mt-1" />
                    </div>

                    {/* Progress + meta */}
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{tc.done}/{tc.total} tasks done</span>
                        <span>{ini.progress}% complete</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${c.bar} transition-all`}
                          style={{ width: `${ini.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ini.members.length + (isJoined(ini.id) ? 1 : 0)} participants</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{ini.updates.length} updates</span>
                        <span className="ml-auto">by {ini.createdBy}</span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DETAIL VIEW
      ══════════════════════════════════════════════════════ */}
      {view === 'detail' && current && (() => {
        const c = COLOR[current.color];
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
          <div>
            {/* Hero banner */}
            <div className={`relative bg-gradient-to-br ${c.gradient} px-5 pt-5 pb-10`}>
              <div className="max-w-4xl mx-auto">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                    <Lightbulb className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/20 text-white">{current.category}</span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/20 text-white capitalize">{current.status}</span>
                    </div>
                    <h2 className="text-xl font-bold text-white leading-tight">{current.title}</h2>
                    <p className="text-sm text-white/70 mt-1">Started by {current.createdBy}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-5">
                  <div className="flex justify-between text-xs text-white/80 mb-1.5">
                    <span>{tc.done} of {tc.total} tasks complete</span>
                    <span className="font-semibold">{current.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${current.progress}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                      className="h-full rounded-full bg-white/80"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Join panel (slides in below hero) */}
            <AnimatePresence>
              {showJoinPanel && !isJoined(current.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="max-w-4xl mx-auto px-4 pt-4 pb-2">
                    <div className="bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-800/50 rounded-2xl p-5 shadow-lg">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Join this initiative</h3>
                        <button onClick={() => setShowJoinPanel(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                          <X className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Your role <span className="text-red-400">*</span></label>
                          <input
                            type="text"
                            value={joinRole}
                            onChange={e => setJoinRole(e.target.value)}
                            placeholder="e.g. Volunteer, Coordinator, Advisor…"
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">How you'll contribute</label>
                          <textarea
                            value={joinContribution}
                            onChange={e => setJoinContribution(e.target.value)}
                            placeholder="Briefly describe what you'll bring to this effort…"
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none resize-none"
                          />
                        </div>
                        <button
                          onClick={handleJoinConfirm}
                          disabled={!joinRole.trim()}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Confirm — Join Initiative
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tab bar */}
            <div className="sticky top-[57px] z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-zinc-800 -mt-5">
              <div className="max-w-4xl mx-auto px-4">
                <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {tabs.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                          active
                            ? 'text-purple-700 dark:text-purple-300'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {active && (
                          <motion.div
                            layoutId="initiatives-tab-indicator"
                            className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tab content */}
            <div className="max-w-4xl mx-auto px-4 py-6">

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Goal */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Goal</h3>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium">{current.goal}</p>
                  </div>

                  {/* Description */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">What's happening</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{current.description}</p>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Participants', value: current.members.length + (isJoined(current.id) ? 1 : 0), icon: Users },
                      { label: 'Tasks',        value: `${tc.done}/${tc.total}`, icon: CheckCircle2 },
                      { label: 'Updates',      value: current.updates.length, icon: MessageSquare },
                    ].map(stat => (
                      <div key={stat.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col items-center gap-1">
                        <stat.icon className="w-4 h-4 text-purple-500" />
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{stat.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Your contribution (if joined) */}
                  {isJoined(current.id) && memberRoles[current.id] && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-4">
                      <h3 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">Your contribution</h3>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{memberRoles[current.id].role}</p>
                      {memberRoles[current.id].contribution && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{memberRoles[current.id].contribution}</p>
                      )}
                    </div>
                  )}

                  {/* Latest update preview */}
                  {current.updates[0] && (
                    <div
                      className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 cursor-pointer hover:border-purple-200 dark:hover:border-purple-800/50 transition-colors"
                      onClick={() => setActiveTab('updates')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Latest Update</h3>
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">See all →</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarColor(current.updates[0].author)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                          {initials(current.updates[0].author)}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{current.updates[0].author} · <span className="font-normal text-slate-400">{timeAgo(current.updates[0].timestamp)}</span></p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{current.updates[0].content}</p>
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
                          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{labels[status]}</h3>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400">{group.length}</span>
                        </div>
                        <div className="space-y-2">
                          {group.map(task => {
                            const ts = getTaskStatus(task);
                            return (
                              <div
                                key={task.id}
                                className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 group"
                              >
                                <button
                                  onClick={() => cycleTask(task)}
                                  className="shrink-0 w-5 h-5 flex items-center justify-center transition-transform hover:scale-110"
                                  aria-label="Toggle task status"
                                >
                                  {ts === 'done'        && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                  {ts === 'in-progress' && <Clock className="w-5 h-5 text-amber-500" />}
                                  {ts === 'todo'        && <Circle className="w-5 h-5 text-slate-300 dark:text-zinc-600" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${ts === 'done' ? 'line-through text-slate-400 dark:text-zinc-500' : 'text-slate-900 dark:text-white'}`}>
                                    {task.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {task.assignee && <span className="text-xs text-slate-500 dark:text-slate-400">{task.assignee}</span>}
                                    {task.dueDate && (
                                      <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-zinc-500">
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
                        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-purple-200 dark:border-purple-800/50 p-4 flex gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={newTaskText}
                            onChange={e => setNewTaskText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowAddTask(false); }}
                            placeholder="Describe the task…"
                            className="flex-1 text-sm bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                          />
                          <button onClick={handleAddTask} disabled={!newTaskText.trim()} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors">Add</button>
                          <button onClick={() => setShowAddTask(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"><X className="w-4 h-4 text-slate-400" /></button>
                        </div>
                      </motion.div>
                    ) : (
                      <button
                        onClick={() => setShowAddTask(true)}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 text-sm text-slate-500 dark:text-slate-400 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add task
                      </button>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── MEMBERS ── */}
              {activeTab === 'members' && (
                <div className="space-y-3">
                  {/* You (if joined) */}
                  {isJoined(current.id) && memberRoles[current.id] && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                        You
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">You</p>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">You</span>
                        </div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-0.5">{memberRoles[current.id].role}</p>
                        {memberRoles[current.id].contribution && (
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-1">{memberRoles[current.id].contribution}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Existing members */}
                  {current.members.map(member => (
                    <div key={member.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(member.name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                        {initials(member.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{member.name}</p>
                          {member.id === 'm1' && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Lead</span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-0.5">{member.role}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-1">{member.contribution}</p>
                      </div>
                    </div>
                  ))}

                  {/* Not joined CTA */}
                  {!isJoined(current.id) && (
                    <button
                      onClick={() => setShowJoinPanel(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 text-sm text-slate-500 dark:text-slate-400 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" /> Join to add yourself
                    </button>
                  )}
                </div>
              )}

              {/* ── UPDATES ── */}
              {activeTab === 'updates' && (
                <div className="space-y-4">
                  {/* Post update (if joined) */}
                  {isJoined(current.id) && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
                      <textarea
                        value={newUpdateText}
                        onChange={e => setNewUpdateText(e.target.value)}
                        placeholder="Share a progress update with the team…"
                        rows={3}
                        className="w-full text-sm bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none resize-none"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={handlePostUpdate}
                          disabled={!newUpdateText.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Zap className="w-3.5 h-3.5" /> Post Update
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Update feed */}
                  {current.updates.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                      <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">No updates yet — be the first to post one.</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {current.updates.map((update, idx) => (
                      <motion.div
                        key={update.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(update.author)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {update.author === 'You' ? 'You' : initials(update.author)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">{update.author}</span>
                              <span className="text-xs text-slate-400 dark:text-zinc-500">{timeAgo(update.timestamp)}</span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{update.content}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Not joined nudge */}
                  {!isJoined(current.id) && (
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex-1">Join this initiative to post updates.</p>
                      <button onClick={() => setShowJoinPanel(true)} className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline shrink-0">Join →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
