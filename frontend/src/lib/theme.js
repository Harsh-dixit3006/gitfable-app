import { Gem, Crown, Sparkles } from 'lucide-react';

// ─── Raw RGB tuples ────────────────────────────────────────────────
// Use in template literals: `rgba(${colors.accent.rgb}, 0.4)`
export const colors = {
  accent:    { rgb: '251,191,36',  tw: 'amber' },
  common:    { rgb: '161,161,170', tw: 'zinc' },
  rare:      { rgb: '96,165,250',  tw: 'blue' },
  epic:      { rgb: '168,85,247',  tw: 'purple' },
  legendary: { rgb: '251,191,36',  tw: 'amber' },
  sky:       { rgb: '125,211,252', tw: 'sky' },
  emerald:   { rgb: '16,185,129',  tw: 'emerald' },
  red:       { rgb: '239,68,68',   tw: 'red' },
  slate:     { rgb: '148,163,184', tw: 'slate' },
  blue:      { rgb: '59,130,246',  tw: 'blue' },
};

// ─── Page accent (amber) ──────────────────────────────────────────
// Pre-built Tailwind class strings for the primary UI accent
export const accent = {
  text:         'text-amber-200',
  textMuted:    'text-amber-400/60',
  textBright:   'text-amber-300',
  bg:           'bg-amber-400/10',
  bgSubtle:     'bg-amber-300/10',
  bgFaint:      'bg-amber-300/5',
  border:       'border-amber-400/25',
  borderBright: 'border-amber-300/40',
  borderFaint:  'border-amber-300/20',
  glow:         'shadow-[0_0_15px_-7px_rgba(251,191,36,0.5)]',
  glowSm:       'shadow-[0_0_12px_-4px_rgba(251,191,36,0.4)]',
  focusBorder:  'focus:border-amber-300/40',
  gradient:     'from-white via-amber-100 to-zinc-400',
  divider:      'via-amber-300/30',
  icon:         'text-amber-300',
  iconMuted:    'text-amber-400/60',
  badge:        'bg-amber-300/5 border border-amber-300/20',
  badgeCount:   'bg-amber-400',
  activeBtn:    'bg-amber-300/10 border-amber-300/40 text-amber-200 shadow-[0_0_12px_-4px_rgba(251,191,36,0.4)]',
  avatarGlow:   'bg-amber-400/15',
  avatarBorder: 'border-amber-400/25',
  levelBadge:   'text-amber-200 bg-amber-400/10',
};

// ─── Rarity system ────────────────────────────────────────────────
// Consolidates DrawAnimation.js RARITY constant
export const RARITY = {
  common:    { label: 'Common',    icon: null,     color: 'zinc',   rgb: colors.common.rgb,    accent: `rgba(${colors.common.rgb},`,    drawXP: 5,  mergeXP: 75,  browseMergeXP: 25 },
  rare:      { label: 'Rare',      icon: Gem,      color: 'blue',   rgb: colors.rare.rgb,      accent: `rgba(${colors.rare.rgb},`,      drawXP: 15, mergeXP: 150, browseMergeXP: 50 },
  epic:      { label: 'Epic',      icon: Sparkles, color: 'purple', rgb: colors.epic.rgb,      accent: `rgba(${colors.epic.rgb},`,      drawXP: 30, mergeXP: 300, browseMergeXP: 100 },
  legendary: { label: 'Legendary', icon: Crown,    color: 'amber',  rgb: colors.legendary.rgb, accent: `rgba(${colors.legendary.rgb},`, drawXP: 50, mergeXP: 500, browseMergeXP: 0 },
};

// ─── Difficulty colors ────────────────────────────────────────────
// Consolidates DrawAnimation.js DIFF_COLORS constant
export const DIFF_COLORS = {
  Beginner:     'bg-amber-300/10 text-amber-200 border-amber-300/20',
  Intermediate: 'bg-slate-300/10 text-slate-200 border-slate-300/20',
  Advanced:     'bg-red-500/10 text-red-400 border-red-500/20',
};

// ─── Status colors ────────────────────────────────────────────────
// Semantic colors for draw statuses (CSS classes in App.css use --status-* vars)
export const statusColors = {
  drawn:        { rgb: '113,113,122', label: 'Drawn',        text: '#A1A1AA' },
  bookmarked:   { rgb: colors.accent.rgb, label: 'Bookmarked',   text: '#FBBF24' },
  pr_submitted: { rgb: colors.blue.rgb,   label: 'PR Submitted', text: '#60A5FA' },
  merged:       { rgb: colors.emerald.rgb, label: 'Merged',      text: '#34D399' },
  expired:      { rgb: colors.red.rgb,    label: 'Expired',      text: '#F87171' },
};

// ─── Helpers ──────────────────────────────────────────────────────
export function rgba(colorKey, alpha) {
  const c = colors[colorKey];
  if (!c) throw new Error(`Unknown color key: ${colorKey}`);
  return `rgba(${c.rgb},${alpha})`;
}
