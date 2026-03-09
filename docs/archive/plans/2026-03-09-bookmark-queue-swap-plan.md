# Bookmark Queue And Swap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-active-bookmark model with a 5-item active work queue, add swap-on-limit behavior, and make PR/merge actions operate cleanly per bookmarked item.

**Architecture:** Keep `draws` as the source of truth for chosen/bookmarked work. Treat `bookmarked` and `pr_submitted` draws as active work items, enforce a cap of 5 active items per user, and support atomic replacement when the cap is full. Update Discover to render an active work list instead of one active bookmark and to present a swap modal when the user wants to bookmark a 6th issue.

**Tech Stack:** Go, Chi, pgx/sqlc, PostgreSQL, React, Sonner, Jest

---

### Task 1: Add backend query support for active work queues

**Files:**
- Modify: `backend/sql/queries/draws.sql`
- Modify: `backend/internal/database/draws.sql.go` (generated)
- Modify: `backend/internal/database/models.go` (generated if needed)
- Test: `backend/internal/handler/draw_limit_test.go`

**Step 1: Write the failing test**

Add a test that needs active work counting or listing for both `bookmarked` and `pr_submitted` draws.

```go
func TestActiveWorkIncludesBookmarkedAndPRSubmitted(t *testing.T) {
	// compile-time red test first: new query methods do not exist yet
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestActiveWorkIncludesBookmarkedAndPRSubmitted -v
```

Expected: FAIL because the new queue/list queries do not exist yet.

**Step 3: Write minimal implementation**

Add sqlc queries for:
- counting a user’s active work items (`bookmarked`, `pr_submitted`)
- listing a user’s active work items ordered by status and urgency
- loading swappable active work items for replacement flows

Keep the query output aligned with existing draw history response shape where possible.

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && "$HOME/go/bin/sqlc" generate && go test ./internal/handler -run TestActiveWorkIncludesBookmarkedAndPRSubmitted -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/sql/queries/draws.sql backend/internal/database/draws.sql.go backend/internal/database/models.go backend/internal/handler/draw_limit_test.go
git commit -m "feat: add active work queue queries"
```

---

### Task 2: Enforce a 5-bookmark active work cap with machine-readable errors

**Files:**
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/internal/handler/response.go`
- Test: `backend/internal/handler/choose_bookmark_test.go`

**Step 1: Write the failing test**

Add a handler-level test that proves a user with 5 active work items gets `BOOKMARK_LIMIT_REACHED` when choosing another issue to bookmark.

```go
func TestChooseBookmarkReturnsLimitReachedAtFiveActiveItems(t *testing.T) {
	// expected: 400 with BOOKMARK_LIMIT_REACHED and swap payload
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestChooseBookmarkReturnsLimitReachedAtFiveActiveItems -v
```

Expected: FAIL because the current flow either assumes one bookmark or has no 5-item limit.

**Step 3: Write minimal implementation**

Add:
- `ErrCodeBookmarkLimitReached`
- a shared `maxActiveBookmarks = 5` constant
- active work count checks in choose/bookmark flows
- error responses that include a compact `active_work` list for swap UI consumption

Do not implement swap yet in this task; only return the structured limit response.

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/handler -run TestChooseBookmarkReturnsLimitReachedAtFiveActiveItems -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/handler/draws.go backend/internal/handler/response.go backend/internal/handler/choose_bookmark_test.go
git commit -m "feat: enforce active bookmark queue limit"
```

---

### Task 3: Add atomic swap support on choose-and-bookmark

**Files:**
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/sql/queries/draws.sql`
- Modify: `backend/internal/database/draws.sql.go` (generated)
- Test: `backend/internal/handler/choose_bookmark_test.go`

**Step 1: Write the failing test**

Add a test that proves a full queue can replace one existing active work item in one request.

```go
func TestChooseBookmarkSwapsExistingActiveWorkAtomically(t *testing.T) {
	// expected: replaced draw becomes expired, new draw becomes bookmarked
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestChooseBookmarkSwapsExistingActiveWorkAtomically -v
```

Expected: FAIL because no replacement transaction exists yet.

**Step 3: Write minimal implementation**

Extend `/draws/choose` to accept `replace_draw_id` when `bookmark_immediately` is true.

Implement a transaction that:
- verifies `replace_draw_id` belongs to the same user
- verifies it is in a swappable active state
- marks it `expired`
- bookmarks the newly created draw
- returns updated active work payload

Do not auto-replace any item without explicit `replace_draw_id`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/handler -run 'TestChooseBookmarkSwapsExistingActiveWorkAtomically|TestChooseStatusAndExpiry' -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/handler/draws.go backend/sql/queries/draws.sql backend/internal/database/draws.sql.go backend/internal/handler/choose_bookmark_test.go
git commit -m "feat: add bookmark swap flow"
```

---

### Task 4: Replace single active bookmark UI with active work queue UI

**Files:**
- Modify: `frontend/src/pages/Discover.js`
- Modify: `frontend/src/components/InfoSidebar.js`
- Modify: `frontend/src/pages/discoverUtils.test.js`

**Step 1: Write the failing test**

Add source-level regression tests for:
- `activeBookmarks` list state
- `Active Work` UI label
- per-item action rendering

```js
test('discover renders active work queue instead of single active bookmark card', () => {
  expect(discoverSource).toContain('activeBookmarks');
  expect(infoSidebarSource).toContain('Active Work');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: FAIL because the page still assumes one active bookmark.

**Step 3: Write minimal implementation**

Change Discover to:
- load active work as a list, not one draw
- render multiple cards in the sidebar
- route `Submit PR`, `Verify`, `Release` per draw id
- sort `pr_submitted` items before `bookmarked`, then by nearest expiry

Keep the rest of the page structure intact.

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/pages/Discover.js frontend/src/components/InfoSidebar.js frontend/src/pages/discoverUtils.test.js
git commit -m "feat: show active work queue in discover"
```

---

### Task 5: Add swap modal UX when the queue is full

**Files:**
- Modify: `frontend/src/pages/Discover.js`
- Modify: `frontend/src/components/IssueCardRow.js`
- Modify: `frontend/src/pages/discoverUtils.test.js`

**Step 1: Write the failing test**

Add source-level regression tests for a full-queue swap modal.

```js
test('discover shows swap modal when bookmark queue is full', () => {
  expect(discoverSource).toContain('BOOKMARK_LIMIT_REACHED');
  expect(discoverSource).toContain('Replace this');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: FAIL because no swap modal exists yet.

**Step 3: Write minimal implementation**

Add a modal that opens on `BOOKMARK_LIMIT_REACHED` and shows:
- the newly chosen issue
- current active work items
- `Replace this` actions for swappable items

On confirmation, retry `/draws/choose` with `replace_draw_id`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/pages/Discover.js frontend/src/components/IssueCardRow.js frontend/src/pages/discoverUtils.test.js
git commit -m "feat: add bookmark swap modal"
```

---

### Task 6: Ensure PR submit and verify actions are always tied to the correct draw

**Files:**
- Modify: `frontend/src/pages/Discover.js`
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/internal/handler/webhooks.go`
- Test: `backend/internal/handler/submit_pr_validation_test.go`
- Test: `frontend/src/pages/discoverUtils.test.js`

**Step 1: Write the failing test**

Add tests that prove PR actions are per-draw, not based on a single implicit active item.

```go
func TestSubmitPRAppliesToExplicitDrawID(t *testing.T) {
	// expected: validation and persistence target the requested draw only
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestSubmitPRAppliesToExplicitDrawID -v
cd ../frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: FAIL because some UI/backend assumptions still rely on a single active bookmark concept.

**Step 3: Write minimal implementation**

Audit all submit/verify/release paths so they:
- use the clicked draw id from the active work list
- update only the matching active work item in local state
- keep merge verification responses mapped to the correct card

Do not redesign the entire PR dialog; just make it draw-specific and reliable.

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/handler -run TestSubmitPRAppliesToExplicitDrawID -v
cd ../frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/handler/draws.go backend/internal/handler/webhooks.go backend/internal/handler/submit_pr_validation_test.go frontend/src/pages/Discover.js frontend/src/pages/discoverUtils.test.js
git commit -m "fix: scope pr actions to active work items"
```

---

### Task 7: Verify the full feature set end to end

**Files:**
- Modify: `frontend/src/pages/discoverUtils.test.js` (only if a missing regression is discovered)
- Modify: `backend/internal/handler/*_test.go` (only if a missing regression is discovered)

**Step 1: Run focused backend tests**

```bash
cd backend && go test ./internal/handler ./internal/middleware -v
```

Expected: PASS.

**Step 2: Run full backend suite**

```bash
cd backend && go test ./...
```

Expected: PASS.

**Step 3: Run focused frontend tests**

```bash
cd frontend && npm test -- --watchAll=false --runInBand discoverUtils.test.js
```

Expected: PASS.

**Step 4: Run full frontend suite**

```bash
cd frontend && npm test -- --watchAll=false
```

Expected: PASS.

**Step 5: Manual verification checklist**

Verify in the app:
- choose and bookmark 5 issues
- attempt a 6th and see swap modal
- replace one active work item
- submit PR on one queue item
- verify merge on the same item
- confirm other queue items remain intact

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add bookmark queue and swap workflow"
```
