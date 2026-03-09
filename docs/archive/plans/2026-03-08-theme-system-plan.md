# Theme System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize all color definitions into `src/lib/theme.js` + CSS custom properties, then migrate all pages and components to use them.

**Architecture:** `src/lib/theme.js` exports raw RGB tuples, Tailwind class presets, and semantic color groups (rarity, difficulty, status). `App.css` uses CSS custom properties backed by the same RGB values. Pages/components import from theme.js instead of hardcoding.

**Tech Stack:** React, Tailwind CSS, CSS custom properties

**Design doc:** `docs/plans/2026-03-08-theme-system-design.md`

**Commit policy:** Do not commit any theme-system changes unless the user explicitly asks for a commit.

---

## Progress Checkpoint

Completed or effectively done already:

- `frontend/src/lib/theme.js` exists and exports `colors`, `accent`, `RARITY`, `DIFF_COLORS`, `statusColors`, and `rgba()`.
- `frontend/src/App.css` has the theme CSS variables and updated rarity/status utility classes.
- `frontend/src/pages/Discover.js` already imports the theme system.
- `frontend/src/components/DrawAnimation.js` already re-exports `RARITY` and `DIFF_COLORS` from `theme.js`.

In progress right now:

- `frontend/src/pages/Dashboard.js`
- `frontend/src/pages/History.js`
- `frontend/src/pages/Leaderboard.js`
- `frontend/src/pages/Profile.js`
- `frontend/src/pages/Landing.js`
- `frontend/src/components/Navbar.js`
- `frontend/src/components/InfoSidebar.js`
- `frontend/src/components/IssueCardRow.js`

Primary remaining cleanup:

- Remove leftover hardcoded `sky-*`, `amber-*`, and raw accent `rgba(...)` values from the files above.
- Finish the UI migration inside `frontend/src/components/DrawAnimation.js`; the data constants moved already, but the component chrome still uses old color literals.
- Run a verification sweep so the plan can confidently move from "partial migration" to "theme system complete".

---

## Revised Execution Order

The original Task 1-4 work is already in place. Continue from the remaining refactor in this order so the biggest hotspots are handled first:

1. `frontend/src/components/DrawAnimation.js`
2. `frontend/src/pages/Landing.js`
3. `frontend/src/components/InfoSidebar.js`
4. `frontend/src/components/IssueCardRow.js`
5. `frontend/src/components/Navbar.js` and `frontend/src/pages/Leaderboard.js`
6. Verification pass on `frontend/src/pages/Dashboard.js`, `frontend/src/pages/History.js`, and `frontend/src/pages/Profile.js`

---

### Task 5: Finish DrawAnimation.js UI migration

**Files:**
- Modify: `frontend/src/components/DrawAnimation.js`

**Step 1: Import the remaining theme helpers**

Change the theme import to include `colors` and `accent` alongside `RARITY` and `DIFF_COLORS`.

**Step 2: Remove the remaining shared accent literals**

Replace the remaining page-accent usages so the component stops hand-rolling the same palette:

- Idle card top rule `via-sky-300/20` -> theme-backed accent styling
- Idle/loading text and icon classes using `sky-*` -> `accent.text`, `accent.textMuted`, or a new small helper in `theme.js` if needed
- Language pill `bg-sky-300/10 text-sky-100 border-sky-300/20` -> shared accent classes
- Energy ring border and conic gradient `rgba(125,211,252,...)` -> `colors.accent.rgb`
- Bookmark CTA hover styles using `sky-*` -> shared accent classes

**Step 3: Collapse duplicate rarity flare data where practical**

Keep rarity-specific behavior, but avoid duplicating canonical colors if the value can be derived from `RARITY[rarity].rgb` or another semantic theme export.

**Step 4: Verify this file no longer contains shared accent literals**

Run:

```bash
rg -n "sky-[0-9]|rgba\(125,211,252|rgba\(251,191,36" frontend/src/components/DrawAnimation.js
```

Expected: only rarity-specific canonical values that are intentionally defined, or no results.

---

### Task 6: Finish Landing.js migration

**Files:**
- Modify: `frontend/src/pages/Landing.js`

**Step 1: Replace the remaining hardcoded amber utility classes**

Clean up the leftover `bg-amber-*`, `text-amber-*`, `border-amber-*`, and `via-amber-*` classes that still appear in hero chips, stat dividers, section labels, CTA chrome, and activity feed highlights.

**Step 2: Replace raw accent gradients and borders**

Convert the remaining literal accent gradients and `rgba(251,191,36,...)` / `rgba(245,158,11,...)` values to template literals using `colors.accent.rgb`, or route them through reusable accent helpers when class-based styling is enough.

**Step 3: Keep semantic exceptions explicit**

If a value remains literal because it represents a unique one-off art direction rather than the shared accent language, leave a note in the code review or plan update instead of silently mixing approaches.

**Step 4: Verify Landing.js**

Run:

```bash
rg -n "sky-[0-9]|amber-[0-9]|rgba\(125,211,252|rgba\(251,191,36|rgba\(245,158,11|rgba\(217,119,6|rgba\(252,211,77|rgba\(253,230,138" frontend/src/pages/Landing.js
```

Expected: no leftover shared accent literals, or only consciously retained art-direction values.

---

### Task 7: Finish the shared component cleanup

**Files:**
- Modify: `frontend/src/components/InfoSidebar.js`
- Modify: `frontend/src/components/IssueCardRow.js`
- Modify: `frontend/src/components/Navbar.js`

**Step 1: InfoSidebar.js**

- Replace the decorative bottom glow `bg-amber-300/[0.03]` usage with theme-backed accent styling.
- Decide whether the purple reward-card glow is intentional rarity flavor or should become theme-driven shared accent styling. If it stays purple, document that it is purposeful rarity chrome rather than accidental leftover palette usage.

**Step 2: IssueCardRow.js**

- Keep rarity-specific maps if they remain the clearest expression.
- Prefer deriving map values from `RARITY` or theme color helpers when possible, especially the legendary accent and hover glow strings.

**Step 3: Navbar.js**

- Replace the remaining `focus:ring-amber-300/20` usage with a theme-backed helper or a CSS variable-driven equivalent.
- Check active-nav and login-dialog states for any remaining ad-hoc accent styling.

**Step 4: Verify the shared components**

Run:

```bash
rg -n "sky-[0-9]|amber-[0-9]|rgba\(125,211,252|rgba\(251,191,36" frontend/src/components/InfoSidebar.js frontend/src/components/IssueCardRow.js frontend/src/components/Navbar.js
```

Expected: only intentional rarity-specific values remain.

---

### Task 8: Finish the remaining page pass

**Files:**
- Modify: `frontend/src/pages/Leaderboard.js`
- Verify: `frontend/src/pages/Dashboard.js`
- Verify: `frontend/src/pages/History.js`
- Verify: `frontend/src/pages/Profile.js`

**Step 1: Leaderboard.js**

- Replace the remaining literal amber selected-row/pinned-row classes with theme-backed accent styling.
- Keep podium silver/bronze distinctions as explicit non-accent semantic variants.

**Step 2: Dashboard.js / History.js / Profile.js**

- Review for any remaining hardcoded shared accent values.
- If only theme imports remain and no leftover literals are present, treat these files as complete.

**Step 3: Verify the remaining pages**

Run:

```bash
rg -n "sky-[0-9]|amber-[0-9]|rgba\(125,211,252|rgba\(251,191,36" frontend/src/pages/Dashboard.js frontend/src/pages/History.js frontend/src/pages/Leaderboard.js frontend/src/pages/Profile.js
```

Expected: only acceptable semantic variants remain.

---

### Task 9: Final verification sweep

**Files:**
- Verify: `frontend/src/pages/**/*.js`
- Verify: `frontend/src/components/**/*.js`

**Step 1: Search for leftover shared accent literals**

Run:

```bash
rg -n "sky-[0-9]|amber-[0-9]|rgba\(125,211,252|rgba\(251,191,36|rgba\(245,158,11|rgba\(217,119,6|rgba\(252,211,77|rgba\(253,230,138" frontend/src/pages frontend/src/components
```

Expected: either no results, or only results that are intentionally retained in rarity-specific or semantic helper definitions.

**Step 2: Run the frontend test/build safety net**

Run:

```bash
cd frontend && npm test -- --watchAll=false
```

Then run:

```bash
cd frontend && npm run build
```

Expected: both commands succeed.

**Step 3: Visual verification**

Visit: Landing, Discover, Dashboard, Leaderboard, History, Profile.

Check:

- Shared accent feels consistent across all pages
- Rarity treatments still differ correctly
- DrawAnimation still looks intentional after the cleanup
- Focus, hover, and selected states still read clearly

**Step 4: Update the plan checkpoint**

Once verification passes, update this document and the design doc to note that the theme-system migration is complete.

---

## Completed Foundation Tasks (Already Done)

### Task 1: Create src/lib/theme.js

**Files:**
- Create: `frontend/src/lib/theme.js`

**Step 1: Create the theme file**

Create `frontend/src/lib/theme.js` with:

```js
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
```

**Step 2: Commit**

```bash
git add frontend/src/lib/theme.js
git -c commit.gpgsign=false commit -m "feat: add centralized theme system (src/lib/theme.js)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add CSS custom properties to App.css

**Files:**
- Modify: `frontend/src/App.css`

**Step 1: Add :root block at the top of App.css (after line 1, before the grid-bg section)**

Insert this block at the very top of the file:

```css
/* ═══ Theme Color Variables ═══ */
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
  --color-blue: 59,130,246;
  --status-drawn: 113,113,122;
  --status-bookmarked: 251,191,36;
  --status-pr-submitted: 59,130,246;
  --status-merged: 16,185,129;
  --status-expired: 239,68,68;
}

```

**Step 2: Update rarity classes to use CSS variables**

Replace the rarity tier section (lines 156-170 area):

```css
.rarity-common {
    --rarity-color: var(--color-common);
    --rarity-text: #A1A1AA;
}
.rarity-rare {
    --rarity-color: var(--color-rare);
    --rarity-text: #60A5FA;
}
.rarity-epic {
    --rarity-color: var(--color-epic);
    --rarity-text: #A855F7;
}
.rarity-legendary {
    --rarity-color: var(--color-legendary);
    --rarity-text: #FBBF24;
}
```

**Step 3: Update status classes to use CSS variables**

Replace the status pill section (lines 149-153 area):

```css
.status-drawn { background: rgba(var(--status-drawn), 0.15); color: #A1A1AA; border: 1px solid rgba(var(--status-drawn), 0.2); }
.status-bookmarked { background: rgba(var(--status-bookmarked), 0.12); color: #FBBF24; border: 1px solid rgba(var(--status-bookmarked), 0.25); }
.status-pr_submitted { background: rgba(var(--status-pr-submitted), 0.12); color: #60A5FA; border: 1px solid rgba(var(--status-pr-submitted), 0.25); }
.status-merged { background: rgba(var(--status-merged), 0.12); color: #34D399; border: 1px solid rgba(var(--status-merged), 0.25); }
.status-expired { background: rgba(var(--status-expired), 0.12); color: #F87171; border: 1px solid rgba(var(--status-expired), 0.25); }
```

**Step 4: Update glow/ambient classes to use accent variable**

Replace in the glow section:
- `.inner-glow-violet::before`: `rgba(125, 211, 252, 0.35)` → `rgba(var(--accent-rgb), 0.35)`
- `.glow-violet`: `rgba(125, 211, 252, 0.35)` → `rgba(var(--accent-rgb), 0.35)`
- `.ambient-violet`: `rgba(125, 211, 252, 0.08)` → `rgba(var(--accent-rgb), 0.08)`

Replace in the rune-btn section:
- All `rgba(125, 211, 252, ...)` → `rgba(var(--accent-rgb), ...)`

Replace in the pulse-glow keyframes:
- All `rgba(125, 211, 252, ...)` → `rgba(var(--accent-rgb), ...)`

Replace in the energy-ring-pulse keyframes:
- All `rgba(125, 211, 252, ...)` → `rgba(var(--accent-rgb), ...)`

Replace in the rarity card/badge/glow/line sections:
- All hardcoded `rgba(161, 161, 170, ...)` → `rgba(var(--color-common), ...)`
- All hardcoded `rgba(96, 165, 250, ...)` → `rgba(var(--color-rare), ...)`
- All hardcoded `rgba(168, 85, 247, ...)` → `rgba(var(--color-epic), ...)`
- All hardcoded `rgba(251, 191, 36, ...)` and `rgba(245, 158, 11, ...)` → `rgba(var(--color-legendary), ...)`

**Step 5: Verify the app still renders**

```bash
cd frontend && npm start
```

Check: Discover page, Dashboard, draw animation — colors should look identical.

**Step 6: Commit**

```bash
git add frontend/src/App.css
git -c commit.gpgsign=false commit -m "refactor: use CSS custom properties in App.css color utilities

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Update DrawAnimation.js to re-export from theme.js

**Files:**
- Modify: `frontend/src/components/DrawAnimation.js:1-21`

**Step 1: Replace the imports and constants**

Replace lines 1-21 of DrawAnimation.js with:

```js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  Bookmark, ExternalLink, Star, FolderGit2,
  Gem, Crown, Sparkles, Zap,
  BookOpen, RotateCcw, Shuffle,
} from 'lucide-react';
import { RARITY, DIFF_COLORS } from '@/lib/theme';

export { RARITY, DIFF_COLORS };
```

This removes the local RARITY and DIFF_COLORS constants and re-exports them from theme.js. All existing imports like `import { RARITY, DIFF_COLORS } from '@/components/DrawAnimation'` continue to work.

**Step 2: Verify existing imports still work**

Check that these files still import correctly:
- `frontend/src/pages/Discover.js` imports `RARITY, DIFF_COLORS, RarityBadge` from `@/components/DrawAnimation`
- Any other files importing from DrawAnimation

Since we re-export `RARITY` and `DIFF_COLORS`, these imports are backwards-compatible.

**Step 3: Commit**

```bash
git add frontend/src/components/DrawAnimation.js
git -c commit.gpgsign=false commit -m "refactor: DrawAnimation re-exports RARITY/DIFF_COLORS from theme.js

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Migrate Discover.js to use theme imports

**Files:**
- Modify: `frontend/src/pages/Discover.js`

**Step 1: Add theme import**

Add after the existing imports (around line 10):

```js
import { colors, accent } from '@/lib/theme';
```

**Step 2: Replace all hardcoded rgba values with template literals**

Find and replace all inline rgba values using the `colors` object:

| Find | Replace |
|------|---------|
| `rgba(251,191,36,` | `` `rgba(${colors.accent.rgb},` `` |
| `rgba(245,158,11,` | `` `rgba(${colors.accent.rgb},` `` |
| `rgba(217,119,6,` | `` `rgba(${colors.accent.rgb},` `` |
| `rgba(252,211,77,` | `` `rgba(${colors.accent.rgb},` `` |
| `rgba(253,230,138,` | `` `rgba(${colors.accent.rgb},` `` |

For string values inside JSX attributes (like `style={{ color: 'rgba(...)' }}`), use template literals:
```js
color: `rgba(${colors.accent.rgb},0.7)`
```

For default parameter values (like the FloatingOrb `color` prop), use the template literal:
```js
function FloatingOrb({ delay = 0, duration = 20, color = `rgba(${colors.accent.rgb},0.15)`, size = 300 })
```

**Step 3: Replace Tailwind class strings with accent imports**

Key replacements:
| Find | Replace with |
|------|-------------|
| `'bg-amber-300/5 border border-amber-300/20'` | `accent.badge` |
| `'text-amber-300'` (icon classes) | `accent.icon` |
| `'text-amber-200'` (text classes) | `accent.text` |
| `'via-amber-300/30'` | `accent.divider` |
| `'via-amber-100'` | use `accent.gradient` for the full gradient |
| `'focus:border-amber-300/40'` | `accent.focusBorder` |
| `'bg-amber-300/10 border-amber-300/40 text-amber-200 shadow-...'` | `accent.activeBtn` |
| `'bg-amber-400'` (filter count) | `accent.badgeCount` |

Use template literals to combine with other classes:
```js
className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${accent.badge} mb-6`}
```

**Step 4: Verify the page renders correctly**

Open the Discover page, check:
- Header colors, filter buttons, pagination, search focus border
- FloatingOrb glow colors
- Aurora band gradients
- Particle mote colors

**Step 5: Commit**

```bash
git add frontend/src/pages/Discover.js
git -c commit.gpgsign=false commit -m "refactor: migrate Discover.js to centralized theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Migrate Dashboard.js to use theme imports

**Files:**
- Modify: `frontend/src/pages/Dashboard.js`

**Step 1: Add theme import and replace colors**

Same pattern as Task 4. Add `import { colors, accent } from '@/lib/theme';` and replace:
- All `rgba(251,191,36,...)` with template literals using `colors.accent.rgb`
- All `text-amber-*`, `bg-amber-*`, `border-amber-*` Tailwind classes with `accent.*` presets

Key Dashboard-specific replacements:
- Avatar glow: `bg-amber-400/15` → `accent.avatarGlow`
- Avatar border: `border-amber-400/25` → `accent.avatarBorder`
- Level badge: `text-amber-200 bg-amber-400/10` → `accent.levelBadge`
- XP text: `text-amber-200` → `accent.text`
- Icon color: `text-amber-300` → `accent.icon`
- Muted labels: `text-amber-400/60` → `accent.textMuted`
- Badge glow: `shadow-[0_0_15px_-7px_rgba(251,191,36,0.5)]` → `accent.glow`

**Step 2: Verify and commit**

```bash
git add frontend/src/pages/Dashboard.js
git -c commit.gpgsign=false commit -m "refactor: migrate Dashboard.js to centralized theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Migrate Leaderboard.js to use theme imports

**Files:**
- Modify: `frontend/src/pages/Leaderboard.js`

Same pattern. Add import, replace amber Tailwind classes and rgba values with `accent.*` and `colors.accent.rgb`.

**Commit:**

```bash
git add frontend/src/pages/Leaderboard.js
git -c commit.gpgsign=false commit -m "refactor: migrate Leaderboard.js to centralized theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Migrate History.js to use theme imports

**Files:**
- Modify: `frontend/src/pages/History.js`

Same pattern.

**Commit:**

```bash
git add frontend/src/pages/History.js
git -c commit.gpgsign=false commit -m "refactor: migrate History.js to centralized theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Migrate Profile.js to use theme imports

**Files:**
- Modify: `frontend/src/pages/Profile.js`

**Note:** Profile currently uses `sky-*` colors. Per the design, Profile should use the same amber accent as other pages. Replace all `sky-*` Tailwind classes with `accent.*` equivalents, and all `rgba(125,211,252,...)` with `colors.accent.rgb`.

**Commit:**

```bash
git add frontend/src/pages/Profile.js
git -c commit.gpgsign=false commit -m "refactor: migrate Profile.js to centralized theme (sky -> amber)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Migrate Landing.js to use theme imports

**Files:**
- Modify: `frontend/src/pages/Landing.js`

Landing has the most inline rgba values (~15+). Same pattern — import theme, replace all hardcoded amber rgba and Tailwind classes.

**Commit:**

```bash
git add frontend/src/pages/Landing.js
git -c commit.gpgsign=false commit -m "refactor: migrate Landing.js to centralized theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Migrate shared components (Navbar, InfoSidebar, IssueCardRow)

**Files:**
- Modify: `frontend/src/components/Navbar.js`
- Modify: `frontend/src/components/InfoSidebar.js`
- Modify: `frontend/src/components/IssueCardRow.js`

**Step 1: For each component, add theme import and replace color references**

Navbar currently uses `sky-*` classes — replace with `accent.*`.
InfoSidebar uses `sky-*` classes — replace with `accent.*`.
IssueCardRow uses `sky-*` and `blue-*` — replace with `accent.*`.

For any remaining `sky-*` references that are semantically tied to rarity (e.g., "Beginner" difficulty badge), use `DIFF_COLORS` from theme.js instead of hardcoding.

**Step 2: Commit**

```bash
git add frontend/src/components/Navbar.js frontend/src/components/InfoSidebar.js frontend/src/components/IssueCardRow.js
git -c commit.gpgsign=false commit -m "refactor: migrate Navbar, InfoSidebar, IssueCardRow to centralized theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Migrate DrawAnimation.js remaining color references

**Files:**
- Modify: `frontend/src/components/DrawAnimation.js`

DrawAnimation has inline `sky-*` and `amber-*` classes beyond the RARITY/DIFF_COLORS constants (e.g., in the card UI, difficulty badges, spinner). Replace these with `accent.*` and `colors.*` imports.

Add `import { colors, accent } from '@/lib/theme';` (in addition to the existing re-exports).

**Commit:**

```bash
git add frontend/src/components/DrawAnimation.js
git -c commit.gpgsign=false commit -m "refactor: migrate DrawAnimation.js color references to theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Final verification

**Step 1: Check no hardcoded sky/amber rgba values remain**

```bash
cd frontend && grep -rn 'rgba(251,191,36\|rgba(125,211,252\|rgba(96,165,250\|rgba(168,85,247\|rgba(161,161,170' src/pages/ src/components/ --include='*.js' | grep -v 'theme.js' | grep -v node_modules
```

Expected: No results (all moved to theme.js or App.css variables).

**Step 2: Check no hardcoded sky-*/amber-* Tailwind classes remain in pages**

```bash
cd frontend && grep -rn 'sky-[0-9]\|amber-[0-9]' src/pages/ src/components/ --include='*.js' | grep -v 'theme.js' | grep -v node_modules
```

Expected: Minimal results — only in theme.js itself and possibly in rarity-specific contexts that reference `RARITY[x].color`.

**Step 3: Visual check**

Start the app and visit every page: Landing, Discover, Dashboard, Leaderboard, History, Profile. Verify amber accent is consistent across all.

**Step 4: No commit (verification only)**
