# Robust Issue Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a robust end-to-end issue lifecycle with soft reservation, strict PR verification, unified merge rewards, and consistent progression/leaderboard updates.

**Architecture:** Keep draw/bookmark as a soft personal workflow, but make `pr_submitted` the strict verification boundary. Centralize merge completion into one backend service used by both manual verify and webhook paths so XP, contributions, streaks, badges, and activity all come from one idempotent transaction.

**Tech Stack:** Go, Chi, pgx/sqlc, PostgreSQL, React, Firebase auth, GitHub REST/GraphQL APIs

---

### Task 1: Add workflow state fields needed for strict PR verification

**Files:**
- Create: `backend/sql/migrations/003_draw_workflow_hardening.up.sql`
- Create: `backend/sql/migrations/003_draw_workflow_hardening.down.sql`
- Modify: `backend/sql/queries/draws.sql`
- Modify: `backend/sql/queries/issues.sql`
- Modify: `backend/sqlc.yaml`
- Modify: `backend/internal/database/models.go` (generated)
- Modify: `backend/internal/database/draws.sql.go` (generated)
- Modify: `backend/internal/database/issues.sql.go` (generated)

**Step 1: Write the failing test**

Add a handler/service test that needs fields for strict ownership and idempotent merge completion, for example a draw record with a verified PR author and a reward lock state.

```go
func TestEffectiveWorkflowNeedsPRVerificationMetadata(t *testing.T) {
	_ = database.Draw{}
	// compile-time red test first: new fields/queries should not exist yet
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestEffectiveWorkflowNeedsPRVerificationMetadata -v
```

Expected: FAIL at compile time because the new schema/query fields do not exist yet.

**Step 3: Write minimal implementation**

Add only the fields needed for the new workflow. Recommended columns:

- `draws.pr_owner_login VARCHAR(39)`
- `draws.pr_repo_owner VARCHAR(255)`
- `draws.pr_repo_name VARCHAR(255)`
- `draws.pr_number INTEGER`
- `draws.pr_verified_at TIMESTAMPTZ`
- `draws.reward_processed_at TIMESTAMPTZ`
- `draws.reward_source VARCHAR(20)`

Also add queries for:

- lookup by `issue_id` + active submitted states
- lookup by `pr_repo_owner` + `pr_repo_name` + `pr_number`
- setting verified PR metadata on submit
- merging only if `reward_processed_at IS NULL`

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && "$HOME/go/bin/sqlc" generate && go test ./internal/handler -run TestEffectiveWorkflowNeedsPRVerificationMetadata -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/sql/migrations/003_draw_workflow_hardening.* backend/sql/queries/draws.sql backend/sql/queries/issues.sql backend/internal/database
git commit -m "feat: add workflow verification schema"
```

---

### Task 2: Strengthen issue eligibility before draw/choose

**Files:**
- Modify: `backend/internal/service/issue_checker.go`
- Modify: `backend/internal/service/issue_checker_test.go`
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/sql/queries/issues.sql`

**Step 1: Write the failing test**

Add tests that prove an issue is unavailable when:

- GitHub shows an open linked PR
- GitHub comments indicate it is taken
- another GitFable draw already has an active `pr_submitted` claim for the same issue

```go
func TestIssueCheckerUnavailableWhenAnotherTrackedPRIsActive(t *testing.T) {
	// expected: false / unavailable
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/service -run TestIssueCheckerUnavailableWhenAnotherTrackedPRIsActive -v
```

Expected: FAIL because current logic only checks GitHub/open state and weak claim signals.

**Step 3: Write minimal implementation**

- Extend issue availability checks to combine GitHub eligibility with tracked GitFable claims
- In `Draw` and `Choose`, reject issues that already have another active submitted PR claim
- Keep bookmark as soft reservation only; do not lock on bookmark

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/service ./internal/handler -run 'TestIssueCheckerUnavailableWhenAnotherTrackedPRIsActive|TestIssueCheckerIsOpen' -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/service/issue_checker.go backend/internal/service/issue_checker_test.go backend/internal/handler/draws.go backend/sql/queries/issues.sql
git commit -m "fix: harden issue eligibility checks"
```

---

### Task 3: Make PR submission strict and issue-linked

**Files:**
- Modify: `backend/internal/service/github.go`
- Modify: `backend/internal/service/github_test.go`
- Modify: `backend/internal/handler/draws.go`
- Modify: `frontend/src/pages/Discover.js`

**Step 1: Write the failing test**

Add tests for PR submission rejection when:

- PR author login does not match the signed-in user’s linked GitHub username
- PR repo does not match the issue repo
- PR body/title does not reference the issue number
- another user already owns the active `pr_submitted` claim for that issue

```go
func TestSubmitPRRejectsPRFromDifferentAuthor(t *testing.T) {
	// expected: 400 with clear error code
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/service ./internal/handler -run TestSubmitPRRejectsPRFromDifferentAuthor -v
```

Expected: FAIL because current code mostly validates URL shape only.

**Step 3: Write minimal implementation**

- Extend `GitHubClient` to fetch enough PR detail: author login, repo owner/name, body/title
- Validate PR against the drawn issue and current user before storing it
- Persist verified PR metadata on the draw
- Return machine-readable errors for frontend to show useful messages

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/service ./internal/handler -run 'TestSubmitPRRejectsPRFromDifferentAuthor|TestParsePRURL' -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/service/github.go backend/internal/service/github_test.go backend/internal/handler/draws.go frontend/src/pages/Discover.js
git commit -m "fix: verify submitted prs against issue ownership"
```

---

### Task 4: Centralize merge completion into one idempotent service

**Files:**
- Create: `backend/internal/service/merge_completion.go`
- Create: `backend/internal/service/merge_completion_test.go`
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/internal/handler/webhooks.go`
- Modify: `backend/internal/service/xp.go`
- Modify: `backend/internal/service/badges.go`
- Modify: `backend/sql/queries/draws.sql`
- Modify: `backend/sql/queries/activities.sql`
- Modify: `backend/sql/queries/events.sql`

**Step 1: Write the failing test**

Add a service test that executes merge completion twice and proves only one reward application occurs.

```go
func TestCompleteMerge_IsIdempotent(t *testing.T) {
	// first call awards rewards
	// second call returns already processed without duplicate XP or contributions
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/service -run TestCompleteMerge_IsIdempotent -v
```

Expected: FAIL because merge logic is currently duplicated across manual verify and webhook paths.

**Step 3: Write minimal implementation**

Create a single merge-completion service that:

- validates draw is eligible for merge completion
- sets merged state once
- awards merge XP using one canonical ruleset
- increments contributions once
- updates streak once
- checks badges once
- creates activity and audit event once
- records `reward_processed_at` and `reward_source`

Use this service from both:

- `POST /draws/{id}/verify`
- `POST /webhooks/github`

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/service ./internal/handler -run 'TestCompleteMerge_IsIdempotent|TestVerify' -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/service/merge_completion.go backend/internal/service/merge_completion_test.go backend/internal/handler/draws.go backend/internal/handler/webhooks.go backend/sql/queries/draws.sql backend/sql/queries/activities.sql backend/sql/queries/events.sql
git commit -m "refactor: unify merge completion workflow"
```

---

### Task 5: Fix reward consistency and progression side effects

**Files:**
- Modify: `backend/internal/handler/webhooks.go`
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/internal/handler/users.go`
- Modify: `backend/sql/queries/draws.sql`
- Modify: `backend/sql/queries/users.sql`

**Step 1: Write the failing test**

Add tests proving manual verify and webhook produce the same XP/contribution outcome for the same draw source/rarity.

```go
func TestManualVerifyAndWebhookAwardSameMergeRewards(t *testing.T) {
	// expected: identical xp_awarded and user progression updates
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestManualVerifyAndWebhookAwardSameMergeRewards -v
```

Expected: FAIL because webhook currently awards a fixed `100 XP`.

**Step 3: Write minimal implementation**

- Remove separate webhook XP math
- Use source/rarity-based reward rules everywhere
- Make dashboard/profile/history rely on merged/progression truth where appropriate
- Add `badge_earned` / `streak_milestone` activity entries only if you decide to surface them now; otherwise document deferment

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/handler ./internal/service -run TestManualVerifyAndWebhookAwardSameMergeRewards -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/handler/webhooks.go backend/internal/handler/draws.go backend/internal/handler/users.go backend/sql/queries/draws.sql backend/sql/queries/users.sql
git commit -m "fix: make merge rewards consistent across verification paths"
```

---

### Task 6: Make bookmark expiry and work-state transitions explicit

**Files:**
- Modify: `backend/internal/handler/draws.go`
- Modify: `backend/sql/queries/draws.sql`
- Modify: `frontend/src/components/InfoSidebar.js`
- Modify: `frontend/src/pages/Discover.js`

**Step 1: Write the failing test**

Add tests proving expired bookmarks are transitioned clearly and that redraw/abandon/release do not leave ambiguous active work state behind.

```go
func TestExpiredBookmarkDoesNotRemainActiveWork(t *testing.T) {
	// expected: expired rows are no longer treated as active work
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd backend && go test ./internal/handler -run TestExpiredBookmarkDoesNotRemainActiveWork -v
```

Expected: FAIL because expiration is mostly passive today.

**Step 3: Write minimal implementation**

- Add explicit expiry transition behavior when loading active bookmark/work state
- Define redraw semantics clearly: either keep current behavior but rename it, or make it abandon the current draw before a new draw
- Update sidebar and Discover copy to reflect the real workflow state transitions

**Step 4: Run test to verify it passes**

Run:

```bash
cd backend && go test ./internal/handler -run TestExpiredBookmarkDoesNotRemainActiveWork -v
cd frontend && npm test -- --watchAll=false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/internal/handler/draws.go backend/sql/queries/draws.sql frontend/src/components/InfoSidebar.js frontend/src/pages/Discover.js
git commit -m "fix: clarify active work and expiry transitions"
```

---

### Task 7: Tighten frontend workflow messaging and error handling

**Files:**
- Modify: `frontend/src/pages/Discover.js`
- Modify: `frontend/src/components/InfoSidebar.js`
- Modify: `frontend/src/contexts/AuthContext.js`
- Test: `frontend/src/pages/discoverUtils.test.js`

**Step 1: Write the failing test**

Add tests for correct user feedback when:

- PR verify returns `verified: false`
- issue is no longer available
- PR submission fails strict validation
- draw limit is exceeded and the dynamic cap is displayed correctly

```javascript
test('verify flow does not show merged toast when backend says verified false', () => {
  expect(source).not.toContain("toast.success('PR merged!")
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm test -- --watchAll=false --runInBand --runTestsByPath src/pages/discoverUtils.test.js
```

Expected: FAIL because current toast/messaging is too optimistic.

**Step 3: Write minimal implementation**

- Show clear workflow-state messages
- Differentiate verification pending vs merged vs rejected
- Show dynamic limit values from backend/user profile consistently
- Ensure active work area reflects strict PR ownership state

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend && npm test -- --watchAll=false --runInBand --runTestsByPath src/pages/discoverUtils.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/pages/Discover.js frontend/src/components/InfoSidebar.js frontend/src/contexts/AuthContext.js frontend/src/pages/discoverUtils.test.js
git commit -m "fix: align discover messaging with workflow state"
```

---

### Task 8: Final verification and workflow audit

**Files:**
- Verify: `backend/internal/handler/*.go`
- Verify: `backend/internal/service/*.go`
- Verify: `frontend/src/pages/Discover.js`
- Verify: `frontend/src/components/InfoSidebar.js`
- Verify: `docs/draw-limit-overrides.md`

**Step 1: Run backend verification**

Run:

```bash
cd backend && go test ./...
```

Expected: PASS.

**Step 2: Run frontend verification**

Run:

```bash
cd frontend && npm test -- --watchAll=false
cd frontend && npm run build
```

Expected: PASS.

**Step 3: Manual workflow verification**

Verify this exact path manually:

1. sign in
2. draw issue
3. bookmark issue
4. submit valid PR URL from linked GitHub account
5. verify merge (manual or webhook)
6. confirm XP, contribution count, streak, badges, history, dashboard, and leaderboard all update exactly once

Expected: one coherent progression event, no duplicate rewards, no misleading UI states.

**Step 4: Commit final integration work**

```bash
git add .
git commit -m "feat: harden end-to-end issue workflow"
```
