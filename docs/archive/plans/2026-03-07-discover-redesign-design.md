# Discover Page Redesign

## Problem

The current Discover page has 5 competing sections (signal cards, active bookmark, filters, card draw, data table) stacked vertically with no clear hierarchy. The layout feels cluttered, the visual design is generic, the card draw lacks excitement, and the overall flow tries to do too much at once.

## Design Direction

**Draw-first layout** with a hero card draw experience as the primary interaction. Browse issues is secondary, accessed by scrolling down.

### Decided

- **Draw-first** hero layout — the draw area IS the page
- **Hybrid card-list** for browse section (not a strict table)
- **Filters** move inline into the browse section (not a separate panel)
- **Signal cards** removed as a dedicated grid; info shown contextually

### Needs Prototyping (user will evaluate all variants)

**Draw Animation (4 variants):**
1. **TCG / Gacha** — card flip with rarity-colored burst particles
2. **Slot machine** — spinning reel that lands on the issue
3. **Mystical ritual** — rune circles, mist materialization, arcane energy
4. **Clean & snappy** — quick flip with color flash, no drama

**Info Layout (3 variants):**
1. **Compact sidebar** — stats panel beside draw area
2. **Contextual inline** — info appears only where relevant (budget near button, bookmark as top bar)
3. **Collapsible panels** — accordion sections that start collapsed

## Page Structure

```
1. Header — "Discover" + subtitle (minimal)
2. Hero Draw Area — centered, large, animated
   - Draw button + remaining draws indicator
   - Revealed card with rarity visual treatment
   - Action buttons (bookmark, redraw, view)
3. Active Bookmark — contextual bar (if exists)
4. Browse Section
   - Inline filters (language chips, difficulty, rarity)
   - Search input
   - Hybrid card-list rows:
     - Left: rarity accent stripe
     - Center: repo (mono), title, labels
     - Right: language, difficulty, stars, View/Choose
   - Pagination (reuse existing component)
```

## Hybrid Card-List Row Design

Each issue row is a compact card (not a table row):
- Colored left border indicating rarity (zinc=common, blue=rare, purple=epic, amber=legendary)
- Subtle rarity glow on hover for epic/legendary
- Repo name in monospace, issue title as primary text
- Labels as small chips
- Right-aligned: language badge, difficulty badge, star count, action buttons
- Maintains sortability and pagination from current DataTable

## Prototype Plan

Build a standalone prototype page at `/discover-prototype` that shows:
- All 4 draw animations side-by-side or toggle-able
- All 3 info layouts switchable
- The hybrid card-list browse section
- User picks their preferred combination, then we implement the final version
