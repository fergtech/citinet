import { Lightbulb, Antenna, Shield, Sprout, Landmark, Users, Layers } from 'lucide-react';
import type { Initiative } from '../services/initiativesService';

// ── Shared display constants/helpers — owned here since this is the natural
// "how do we render an initiative" component; InitiativesScreen imports these
// rather than duplicating them. ────────────────────────────────────────────

export const COLOR = {
  purple:  { gradient: 'from-purple-600 via-pink-600 to-rose-600',   icon: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', bar: 'from-purple-500 to-pink-500' },
  emerald: { gradient: 'from-emerald-600 via-teal-500 to-cyan-500',  icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', bar: 'from-emerald-500 to-teal-500' },
  blue:    { gradient: 'from-blue-600 via-indigo-600 to-violet-600', icon: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', bar: 'from-blue-500 to-indigo-500' },
  amber:   { gradient: 'from-amber-500 via-orange-500 to-red-500',   icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', bar: 'from-amber-400 to-orange-500' },
} as const;

export const STATUS_BADGE = {
  active:    'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  planning:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  completed: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400',
};
export const STATUS_LABEL = { active: 'In progress', planning: 'Planning', completed: 'Completed' };

// ── Task tracker status — a task's own status is auto-derived from its
// checklist when it has one (mirrors how initiative status derives from task
// completion), or stays a simple manual todo/in-progress/done cycle when it
// doesn't. Blocked is a manual overlay flag that wins over either. ──────────
export type TaskDisplayStatus = 'not-started' | 'in-progress' | 'blocked' | 'done';

export const TASK_STATUS_META: Record<TaskDisplayStatus, { label: string; badge: string }> = {
  'not-started': { label: 'Not started', badge: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400' },
  'in-progress': { label: 'In progress', badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
  blocked:       { label: 'Blocked', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  done:          { label: 'Done', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
};

export function effectiveTaskStatus(
  task: { status: 'todo' | 'in-progress' | 'done' },
  meta?: { blocked?: boolean },
): TaskDisplayStatus {
  if (meta?.blocked) return 'blocked';
  if (task.status === 'done') return 'done';
  if (task.status === 'in-progress') return 'in-progress';
  return 'not-started';
}

/** Matches the design system's 5-category set (infra/safety/green/budget/culture) —
 * category is free text from the external service, so unrecognized values fall
 * back to a generic icon rather than breaking. */
export const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  infrastructure: { label: 'Infrastructure', icon: Antenna },
  safety:         { label: 'Safety',         icon: Shield },
  environment:    { label: 'Environment',    icon: Sprout },
  budget:         { label: 'Budget',         icon: Landmark },
  culture:        { label: 'Community life', icon: Users },
};
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, c]) => ({ value, label: c.label }));
export function categoryMeta(category: string) {
  return CATEGORY_META[category.toLowerCase()] ?? { label: category || 'General', icon: Lightbulb };
}

export function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',     'from-violet-500 to-purple-500',
];
export function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = name.charCodeAt(name.indexOf(c)) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
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

export function ProgressBar({ done, total, pct, tone }: { done: number; total: number; pct: number; tone: 'ok' | 'brand' }) {
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

export function SpaceChip({ name, onClick }: { name: string; onClick?: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      disabled={!onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full cn-surface-2 text-[11px] font-semibold cn-text-3 disabled:cursor-default"
    >
      <Layers className="w-3 h-3" />{name}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────

export interface InitiativeCardProps {
  initiative: Initiative;
  bannerUrl?: string | null;
  taskCount: { done: number; total: number };
  onOpen: () => void;
  onOpenSpace?: () => void;
}

export function InitiativeCard({ initiative, bannerUrl, taskCount, onOpen, onOpenSpace }: InitiativeCardProps) {
  const c = COLOR[initiative.color];
  const cat = categoryMeta(initiative.category);
  const CatIcon = cat.icon;
  const openRoles = initiative.open_roles_count ?? 0;

  return (
    <button
      onClick={onOpen}
      className="cn-glass rounded-2xl overflow-hidden flex flex-col text-left hover:border-purple-300/60 dark:hover:border-purple-500/30 transition-colors"
    >
      {bannerUrl ? (
        <div className="h-24 w-full" style={{ background: `center/cover no-repeat url(${bannerUrl})` }} />
      ) : initiative.banner_mode === 'gradient' && initiative.banner_gradient_from && initiative.banner_gradient_to ? (
        <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, ${initiative.banner_gradient_from}, ${initiative.banner_gradient_to})` }} />
      ) : null}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0`}>
            <CatIcon className="w-4 h-4 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold cn-text-1 leading-tight">{initiative.title}</div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[initiative.status]}`}>{STATUS_LABEL[initiative.status]}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full cn-surface-2 cn-text-3">{cat.label}</span>
              {initiative.viewerIsMember && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">You're in</span>
              )}
            </div>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed cn-text-3 line-clamp-2">{initiative.goal}</p>

        <ProgressBar {...taskCount} pct={taskCount.total > 0 ? Math.round((taskCount.done / taskCount.total) * 100) : 0} tone={initiative.status === 'completed' ? 'ok' : 'brand'} />

        <div className="flex items-center justify-between gap-2">
          <AvatarStack names={initiative.members.map(m => m.name)} />
          <div className="flex items-center gap-2 shrink-0">
            {openRoles > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                {openRoles} role{openRoles > 1 ? 's' : ''} open
              </span>
            )}
            <span className="text-[11px] cn-text-4">by {initiative.createdBy}</span>
          </div>
        </div>

        {initiative.space_name && <SpaceChip name={initiative.space_name} onClick={onOpenSpace} />}
      </div>
    </button>
  );
}
