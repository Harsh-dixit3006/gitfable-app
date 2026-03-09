# E2E Test Plan: Complete Workflow with Demo Repo

## Overview
Create an end-to-end test that validates the complete GitFable user journey using the demo repository `nishantg96/git-demo-issues`.

## Test Scope
1. **Authentication Flow** - Firebase auth (mocked for test)
2. **Issue Sync** - Populate test DB with demo issues
3. **Draw/Browse Flow** - Random draw + table choose
4. **Active Work Queue** - Bookmark 5 issues, verify carousel
5. **Swap Behavior** - Try to add 6th, trigger swap modal, replace one
6. **PR Submission** - Simulate PR creation and submission
7. **Merge Verification** - Verify PR merge and reward distribution

## Test Structure

### Option A: Go Integration Test (Recommended)
- Backend-focused using httptest.Server
- Database transactions for isolation
- Mock Firebase auth with test tokens
- Mock GitHub API responses for PR verification

### Option B: Playwright E2E (UI Level)
- Full browser automation
- Tests actual user interactions
- Requires running frontend + backend
- Slower but more realistic

## Recommendation
Use **Option A (Go Integration Test)** because:
- Faster execution
- Better isolation
- Can verify business logic directly
- Already have test infrastructure in backend

## Implementation Plan

### Phase 1: Test Infrastructure
1. Create `backend/internal/handler/workflow_e2e_test.go`
2. Add test helper functions:
   - `createTestUser()` - Create test user with Firebase UID
   - `createDemoIssues()` - Insert 5+ demo issues
   - `mockFirebaseAuth()` - Create valid test tokens
   - `mockGitHubAPI()` - Mock PR verification responses

### Phase 2: Test Scenarios
1. **TestDrawAndBookmark** - Draw random issue, bookmark it
2. **TestChooseAndBookmark** - Use table choose path
3. **TestActiveQueueLimit** - Fill to 5, verify limit error
4. **TestSwapFlow** - Replace active bookmark with new one
5. **TestPRSubmission** - Submit PR URL, verify status
6. **TestMergeAndRewards** - Verify merge, check XP/streak/badges

### Phase 3: Test Data
Demo issues from `nishantg96/git-demo-issues`:
1. "Add README badges" (easy)
2. "Fix typo in docs" (easy)
3. "Implement dark mode" (medium)
4. "Add pagination to API" (medium)
5. "Refactor database layer" (hard)

### Phase 4: Assertions
Each test validates:
- HTTP status codes
- Database state changes
- Response payloads
- Reward calculations (XP = base × difficulty)

## Success Criteria
- All 6 test scenarios pass
- Tests run in < 10 seconds
- No external dependencies (mocked Firebase/GitHub)
- Idempotent (can run multiple times without cleanup issues)

## Files to Create/Modify
1. `backend/internal/handler/workflow_e2e_test.go` - Main test file
2. `backend/internal/handler/test_helpers.go` - Shared test utilities
3. Minor updates to existing handlers if test hooks needed

## Time Estimate
2-3 hours for complete implementation

---
**Ready for review. Should I proceed with implementation?**