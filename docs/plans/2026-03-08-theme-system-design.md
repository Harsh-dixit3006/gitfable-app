# Frontend Theme System

## Goal

Centralize all color semantics into a single `src/lib/theme.js` file plus CSS custom properties, replacing hardcoded Tailwind classes and rgba values scattered across ~10+ files.

## File Structure

```
src/lib/theme.js        # Single source of truth for all color values
src/App.css             # CSS custom properties + updated utility classes
```

## theme.js Exports

### Raw RGB tuples (for inline styles, animations, gradients)

```js
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
}
```

### Tailwind class presets (for component className props)

```js
export const accent = {
  text:       'text-amber-200',
  textMuted:  'text-amber-400/60',
  textBright: 'text-amber-300',
  bg:         'bg-amber-400/10',
  bgSubtle:   'bg-amber-300/10',
  border:     'border-amber-400/25',
  borderBright: 'border-amber-300/40',
  glow:       'shadow-[0_0_15px_-7px_rgba(251,191,36,0.5)]',
  focusBorder: 'focus:border-amber-300/40',
  gradient:   'from-white via-amber-100 to-zinc-400',
  divider:    'via-amber-300/30',
  activeBtn:  'bg-amber-300/10 border-amber-300/40 text-amber-200 shadow-[0_0_12px_-4px_rgba(251,191,36,0.4)]',
  badge:      'bg-amber-300/5 border border-amber-300/20',
  badgeCount: 'bg-amber-400',
  icon:       'text-amber-300',
  iconMuted:  'text-amber-400/60',
}
```

### Rarity system (consolidating DrawAnimation.js RARITY)

```js
export const rarity = {
  common: {
    label: 'Common',
    rgb: '161,161,170',
    accent: 'rgba(161,161,170,',
    // ... icon, drawXP, etc. from current RARITY constant
  },
  rare: { ... },
  epic: { ... },
  legendary: { ... },
}
```

### Difficulty colors (consolidating DrawAnimation.js DIFF_COLORS)

```js
export const difficulty = {
  Beginner:     'bg-amber-300/10 text-amber-200 border-amber-300/20',
  Intermediate: 'bg-slate-300/10 text-slate-200 border-slate-300/20',
  Advanced:     'bg-red-500/10 text-red-400 border-red-500/20',
}
```

### Status colors (consolidating App.css status classes)

```js
export const statusColors = {
  drawn:        { rgb: '113,113,122', label: 'Drawn' },
  bookmarked:   { rgb: '251,191,36',  label: 'Bookmarked' },
  pr_submitted: { rgb: '59,130,246',  label: 'PR Submitted' },
  merged:       { rgb: '16,185,129',  label: 'Merged' },
  expired:      { rgb: '239,68,68',   label: 'Expired' },
}
```

## CSS Custom Properties (App.css)

```css
:root {
  --accent-rgb: 251,191,36;
  --color-common: 161,161,170;
  --color-rare: 96,165,250;
  --color-epic: 168,85,247;
  --color-legendary: 251,191,36;
  --color-sky: 125,211,252;
  --color-emerald: 16,185,129;
  --color-red: 239,68,68;
  --color-slate: 148,163,184;
  --status-drawn: 113,113,122;
  --status-bookmarked: 251,191,36;
  --status-pr-submitted: 59,130,246;
  --status-merged: 16,185,129;
  --status-expired: 239,68,68;
}
```

Existing App.css utility classes (.rarity-*, .status-*, .rune-btn, glow classes) updated to use `var(--color-*)`.

## Migration Strategy

1. Create `src/lib/theme.js` with all constants
2. Update App.css with CSS custom properties, update utility classes to use them
3. Update DrawAnimation.js to re-export RARITY and DIFF_COLORS from theme.js (backwards-compatible)
4. Migrate each page one at a time (Discover, Dashboard, Leaderboard, History, Profile, Landing)
5. Migrate shared components (Navbar, InfoSidebar, IssueCardRow)

## What Stays the Same

- Tailwind config unchanged (default palette)
- Component structure unchanged
- Visual output identical
- App.css class names unchanged (just backed by variables now)

## Design Decisions

1. **JS + CSS hybrid** — JS constants for component logic and inline styles, CSS variables for stylesheet utility classes. Both reference the same RGB values.
2. **Pre-built Tailwind class strings** — avoids string concatenation in JSX. Components import `accent.text` instead of building `text-amber-200`.
3. **Backwards-compatible re-exports** — DrawAnimation.js RARITY and DIFF_COLORS become thin wrappers around theme.js, so existing imports don't break.
4. **RGB tuples as strings** — `'251,191,36'` format works in both `rgba(${rgb}, 0.4)` (JS) and `rgba(var(--accent-rgb), 0.4)` (CSS).
