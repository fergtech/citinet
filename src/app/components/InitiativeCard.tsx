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

/** Default cover art for any initiative that hasn't uploaded its own banner —
 * same photo set as citinet-mobile's INITIATIVE_CATEGORY_PRESET_IMAGES, kept
 * here so both platforms show identical imagery per category. "culture" reuses
 * the "community" photo, matching mobile. */
export const CATEGORY_PRESET_IMAGES: Record<string, string> = {
  infrastructure: '/initiatives/infrastructure.jpg',
  safety: '/initiatives/safety.jpg',
  environment: '/initiatives/environment.jpg',
  budget: '/initiatives/budget.jpg',
  culture: '/initiatives/community.jpg',
};
export function categoryPresetImage(category: string): string | null {
  return CATEGORY_PRESET_IMAGES[category?.toLowerCase()] ?? null;
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

export function AvatarStack({ names, max = 4, size = 'md' }: { names: string[]; max?: number; size?: 'sm' | 'md' }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  const dim = size === 'sm' ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9.5px]';
  const overlap = size === 'sm' ? '-ml-1.5' : '-ml-2';
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <span key={n + i} className={`${i === 0 ? '' : overlap} rounded-full ring-2 ring-white dark:ring-zinc-950`}>
          <span className={`${dim} rounded-full bg-gradient-to-br ${avatarColor(n)} flex items-center justify-center text-white font-bold`}>
            {initials(n)}
          </span>
        </span>
      ))}
      {extra > 0 && (
        <span className={`${overlap} ${dim} rounded-full cn-surface-3 ring-2 ring-white dark:ring-zinc-950 flex items-center justify-center font-bold cn-text-2`}>
          +{extra}
        </span>
      )}
    </div>
  );
}

/** `light` renders white labels/track for use directly over a photo/gradient
 * background (the grid card's full-bleed banner) — default stays themed for
 * the detail view's plain surface. */
export function ProgressBar({ done, total, pct, tone, light }: { done: number; total: number; pct: number; tone: 'ok' | 'brand'; light?: boolean }) {
  return (
    <div>
      <div className={`h-1.5 rounded-full overflow-hidden ${light ? 'bg-white/25' : 'cn-surface-3'}`}>
        <div
          className={`h-full rounded-full transition-all ${tone === 'ok' ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-pink-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className={`cn-mono text-[11px] ${light ? 'text-white/90' : 'cn-text-3'}`}>{done}/{total} tasks done</span>
        <span className={`cn-mono text-[11px] ${light ? 'text-white/75' : 'cn-text-4'}`}>{pct}%</span>
      </div>
    </div>
  );
}

export function SpaceChip({ name, onClick, light }: { name: string; onClick?: () => void; light?: boolean }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      disabled={!onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold disabled:cursor-default ${light ? 'bg-black/40 text-white backdrop-blur-md ring-1 ring-white/10' : 'cn-surface-2 cn-text-3'}`}
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
  const presetImage = categoryPresetImage(initiative.category);
  const customGradient = initiative.banner_mode === 'gradient' && initiative.banner_gradient_from && initiative.banner_gradient_to
    ? `linear-gradient(135deg, ${initiative.banner_gradient_from}, ${initiative.banner_gradient_to})`
    : null;
  const bgImage = bannerUrl || (!customGradient ? presetImage : null);

  return (
    <button
      onClick={onOpen}
      className="relative w-full h-[22rem] rounded-2xl overflow-hidden flex flex-col text-left border cn-border hover:border-purple-300/60 dark:hover:border-purple-500/30 transition-colors"
    >
      {/* Full-bleed cover — uploaded banner, a custom gradient, the category
          preset photo, or (nothing set at all) the initiative's own brand
          color. Fills the whole card and stays bare up top — only the
          content block below has a scrim behind it. */}
      <div
        className={`absolute inset-0 ${!bgImage && !customGradient ? `bg-gradient-to-br ${c.gradient}` : ''}`}
        style={bgImage ? { background: `center/cover no-repeat url(${bgImage})` } : customGradient ? { background: customGradient } : undefined}
      />

      {/* Category icon — floats over the bare top of the cover art in its
          own corner, out of the text block's flow, instead of sitting in a
          left column beside the title. */}
      <span className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0 ring-1 ring-white/20 shadow-lg`}>
        <CatIcon className="w-4 h-4 text-white" />
      </span>

      {/* Content block — a flex item of the card's flex-col frame, pushed
          to the bottom by mt-auto so it always sits flush against the
          card's actual bottom edge, only as tall as its visible children
          (no reserved/placeholder rows). Its own feathered scrim
          (transparent at its top edge, darkening toward the card's
          bottom) exactly matches that dynamic height, so it expands or
          shrinks with the content instead of leaving a gap. The extra
          top padding gives the fade room to complete before the title
          baseline, so the title text sits on an already-dark canvas
          (contrast) rather than the still-transparent top of the fade. */}
      <div
        className="relative z-10 mt-auto px-3.5 pt-9 pb-3.5 flex flex-col gap-1.5"
        style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.72) 20%, rgba(0,0,0,0.94) 100%)' }}
      >
        {/* No reserved min-height here — the pills row should sit right
            under the title with no gap, even when the title is one line. */}
        <div className="text-sm font-bold text-white leading-tight line-clamp-2">{initiative.title}</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[initiative.status]}`}>{STATUS_LABEL[initiative.status]}</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-md ring-1 ring-white/10">{cat.label}</span>
          {initiative.viewerIsMember && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-md ring-1 ring-white/10">You're in</span>
          )}
        </div>

        <p className="text-[12.5px] leading-relaxed text-white/85 line-clamp-2">{initiative.goal}</p>

        <ProgressBar {...taskCount} pct={taskCount.total > 0 ? Math.round((taskCount.done / taskCount.total) * 100) : 0} tone={initiative.status === 'completed' ? 'ok' : 'brand'} light />

        <div className="flex items-center justify-between gap-2">
          <AvatarStack names={initiative.members.map(m => m.name)} size="sm" />
          <div className="flex items-center gap-2 shrink-0">
            {openRoles > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                {openRoles} role{openRoles > 1 ? 's' : ''} open
              </span>
            )}
            <span className="text-[11px] text-white/75">by {initiative.createdBy}</span>
          </div>
        </div>

        {initiative.space_name && <SpaceChip name={initiative.space_name} onClick={onOpenSpace} light />}
      </div>
    </button>
  );
}
