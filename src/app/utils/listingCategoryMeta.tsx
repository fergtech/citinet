import { Package, HandHelping, Apple, Cpu, CalendarDays, Palette, Sparkles } from 'lucide-react';

/** Look of each marketplace category (icon + gradient) — shared by the Marketplace screen and Home's listing card. */
export const LISTING_CATEGORY_META: Record<string, { Icon: React.ElementType; gradient: string }> = {
  'Goods':         { Icon: Package,      gradient: 'from-blue-500 to-indigo-600' },
  'Services':      { Icon: HandHelping,  gradient: 'from-violet-500 to-blue-600' },
  'Food':          { Icon: Apple,        gradient: 'from-rose-500 to-pink-600' },
  'Electronics':   { Icon: Cpu,          gradient: 'from-cyan-500 to-sky-600' },
  'Events':        { Icon: CalendarDays, gradient: 'from-amber-500 to-orange-600' },
  'Arts & Crafts': { Icon: Palette,      gradient: 'from-fuchsia-500 to-pink-600' },
  'Other':         { Icon: Sparkles,     gradient: 'from-slate-500 to-slate-600' },
};
