# Discover Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Discover page UI with a draw-first layout using the FIFA Walkout animation, sidebar info panel, and hybrid card-list browse section — keeping all existing business logic intact.

**Architecture:** The current `Discover.js` has all business logic (API calls, auth, filters, bookmark, PR submission) inline. We rewrite only the JSX/UI layer. The draw animation (FIFA Walkout with spotlight beams, info flashes, card drop + flip) is ported from `DiscoverPrototype.js`. The DataTable is replaced with a hybrid card-list. Filters move inline into the browse section. Signal cards become a sidebar.

**Tech Stack:** React 19, Framer Motion, Tailwind CSS, existing Shadcn UI components, lucide-react icons.

---

### Task 1: Extract draw animation into reusable component

**Files:**
- Create: `frontend/src/components/DrawFIFAWalkout.js`
- Reference: `frontend/src/pages/DiscoverPrototype.js:374-693` (DrawRitual function)

**Step 1: Create the DrawFIFAWalkout component**

Port the `DrawRitual` function from DiscoverPrototype.js into its own component file. Changes from prototype:
- Accept props: `state` ('idle' | 'shuffling' | 'revealed'), `issue` (normalized issue object), `rarity` (string), `onDraw` (callback), `onBookmark` (callback), `onRedraw` (callback), `onViewGithub` (url string), `xpAwarded` (number), `drawSource` ('draw' | 'choose')
- Use the RARITY config from Discover.js (which includes `browseMergeXP`, `drawMergeXP`, `drawXP`)
- The XP capsule (DrawControls equivalent) is built into this component
- The action buttons (Bookmark, Redraw, GitHub) replace the prototype's simple Reset button
- Keep the idle card, spotlight beams, info flash, card drop, flip, settle phases exactly as prototyped
- Keep the centered card layout with `w-80 h-[440px]` sizing
- Export RARITY, DIFF_COLORS, and RarityBadge from this file so Discover.js can import them

The component renders:
```jsx
<div className="flex flex-col items-center">
  {/* Card area with animation phases */}
  {/* Below card: action buttons or draw button depending on state */}
</div>
```

Action buttons in revealed state:
- Bookmark button (rune-btn style)
- Redraw button (ghost style)
- View on GitHub link (ghost style, opens new tab)
- XP capsule (the larger redesigned version from prototype)

**Step 2: Verify the file compiles**

Run: `cd /home/nishantg96/Personal/Projects/gitfable-app/frontend && npx craco build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/DrawFIFAWalkout.js
git commit -m "feat: extract FIFA Walkout draw animation into reusable component"
```

---

### Task 2: Create InfoSidebar component

**Files:**
- Create: `frontend/src/components/InfoSidebar.js`
- Reference: `frontend/src/pages/DiscoverPrototype.js:801-825` (InfoSidebar function)

**Step 1: Create the InfoSidebar component**

Port from prototype but make it dynamic:
- Accept props: `redrawsRemaining` (number), `activeBookmark` (object | null), `onSubmitPR` (callback), `onVerify` (callback), `onRelease` (callback), `onViewGithub` (callback)
- Draw Budget section shows `redrawsRemaining`
- Bookmark section shows bookmark status (Open / issue title + countdown + action buttons)
- Draw Rewards section shows XP per rarity tier
- Active bookmark actions: Submit PR, Verify Merge, GitHub link, Release — same logic as current Discover.js

```jsx
<div className="obsidian rounded-xl p-4 w-56 flex-shrink-0 space-y-5">
  {/* Draw Budget */}
  {/* Bookmark Status + Actions */}
  {/* Draw Rewards table */}
</div>
```

**Step 2: Verify build**

Run: `cd /home/nishantg96/Personal/Projects/gitfable-app/frontend && npx craco build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add frontend/src/components/InfoSidebar.js
git commit -m "feat: add InfoSidebar component for draw-first layout"
```

---

### Task 3: Create IssueCardRow component for hybrid card-list

**Files:**
- Create: `frontend/src/components/IssueCardRow.js`
- Reference: `frontend/src/pages/DiscoverPrototype.js:894-934` (IssueCardRow function)

**Step 1: Create the IssueCardRow component**

Port from prototype but add real interactivity:
- Accept props: `issue` (normalized issue object), `onChoose` (callback), `choosingIssueId` (string | null for loading state)
- Rarity stripe on left edge
- Repo name (monospace), title, labels (max 2)
- Right side: language badge, difficulty badge, stars, View link (ExternalLink to GitHub), Choose button (rune-btn, calls `onChoose(issue.id)`)
- Hover glow scales with rarity (epic/legendary get visible glow)

**Step 2: Verify build**

Run: `cd /home/nishantg96/Personal/Projects/gitfable-app/frontend && npx craco build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add frontend/src/components/IssueCardRow.js
git commit -m "feat: add hybrid card-list IssueCardRow component"
```

---

### Task 4: Rewrite Discover.js with new layout

**Files:**
- Modify: `frontend/src/pages/Discover.js` (full UI rewrite, keep all business logic)

**Step 1: Rewrite the Discover page**

Keep ALL existing state, effects, callbacks, and API logic (lines 1-291 of current file — everything above the `return` statement). Replace only the JSX return.

New layout structure:
```
1. Page header ("// Discover" + subtitle)
2. Hero Draw Area (flex row):
   - InfoSidebar (left)
   - DrawFIFAWalkout (center, flex-1)
3. Browse Section:
   - Header + search input
   - Inline filter chips (languages, difficulties, rarities)
   - IssueCardRow list (mapped from filtered issues)
   - Pagination (reuse existing DataTable pagination or simple page buttons)
4. PR Dialog (keep existing)
```

Key changes:
- Remove: signal cards grid, separate filter panel, old card draw animation, DataTable
- Add: imports for DrawFIFAWalkout, InfoSidebar, IssueCardRow
- Filters move inline into browse section as chip buttons (same toggle logic)
- Issues rendered as `IssueCardRow` list instead of DataTable
- Client-side pagination: keep `pageSize` state, compute `paginatedIssues` slice, render page buttons
- Client-side sorting: keep sorting state, sort `tableData` before paginating
- Global text filter: keep `issueQuery` state, filter on repo+title+labels
- The `handleDraw` delay changes from 1800 to 1000 (FIFA walkout has its own longer animation in the revealed phase)
- Pass all bookmark/PR callbacks through to InfoSidebar
- Keep all `data-testid` attributes for e2e tests where possible

**Step 2: Verify build**

Run: `cd /home/nishantg96/Personal/Projects/gitfable-app/frontend && npx craco build 2>&1 | tail -5`

**Step 3: Smoke test in browser**

Run dev server, navigate to `/discover`, verify:
- Sidebar shows draw budget and bookmark status
- Draw button triggers FIFA walkout animation
- Revealed card shows issue with XP capsule and action buttons
- Bookmark/Redraw/GitHub buttons work
- Browse section shows issue cards with filters
- Search filters the list
- Pagination works

**Step 4: Commit**

```bash
git add frontend/src/pages/Discover.js
git commit -m "feat: redesign Discover page with draw-first FIFA Walkout layout"
```

---

### Task 5: Update e2e tests for new layout

**Files:**
- Modify: `frontend/e2e/issues-table.spec.js`

**Step 1: Update selectors**

The page no longer uses a `<table>` — it uses card rows. Update test selectors:
- Replace `table tbody tr` selectors with `[data-testid="issue-card-row"]`
- Replace `table thead` sort header clicks with new sort button selectors
- Replace `td:nth-child(N)` with `data-testid` based selectors on card row elements
- Keep filter tests (same `data-testid` attributes on filter buttons)
- Keep search test (same `data-testid="issues-table-search-input"`)
- Keep pagination tests (same pagination component)
- Update page size selector if pagination changes

**Step 2: Run e2e tests**

Run: `cd /home/nishantg96/Personal/Projects/gitfable-app/frontend && npx playwright test e2e/issues-table.spec.js`

**Step 3: Commit**

```bash
git add frontend/e2e/issues-table.spec.js
git commit -m "test: update e2e tests for hybrid card-list layout"
```

---

### Task 6: Clean up prototype page

**Files:**
- Modify: `frontend/src/App.js` (remove prototype route)
- Delete: `frontend/src/pages/DiscoverPrototype.js`

**Step 1: Remove prototype route and import**

Remove the `import DiscoverPrototype` line and the `/discover-prototype` Route from App.js.

**Step 2: Delete prototype file**

```bash
rm frontend/src/pages/DiscoverPrototype.js
```

**Step 3: Verify build**

Run: `cd /home/nishantg96/Personal/Projects/gitfable-app/frontend && npx craco build 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add frontend/src/App.js
git rm frontend/src/pages/DiscoverPrototype.js
git commit -m "chore: remove Discover prototype page"
```
