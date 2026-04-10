package sync

import (
	"encoding/json"
	"testing"
	"time"
)

func TestBuildSearchQuery(t *testing.T) {
	tests := []struct {
		language string
		want     string
	}{
		{"Go", `is:open is:issue label:"good first issue" language:Go`},
		{"JavaScript", `is:open is:issue label:"good first issue" language:JavaScript`},
		{"C++", `is:open is:issue label:"good first issue" language:C++`},
	}

	for _, tt := range tests {
		t.Run(tt.language, func(t *testing.T) {
			got := BuildSearchQuery(tt.language)
			if got != tt.want {
				t.Errorf("BuildSearchQuery(%q) = %q, want %q", tt.language, got, tt.want)
			}
		})
	}
}

func TestParseSearchResponse(t *testing.T) {
	raw := `{
		"data": {
			"search": {
				"issueCount": 42,
				"pageInfo": {
					"hasNextPage": true,
					"endCursor": "Y3Vyc29yOjE="
				},
				"nodes": [
					{
						"databaseId": 123456789,
						"number": 42,
						"title": "Fix typo in README",
						"url": "https://github.com/owner/repo/issues/42",
						"state": "OPEN",
						"createdAt": "2026-01-15T10:30:00Z",
						"labels": {
							"nodes": [
								{"name": "good first issue"},
								{"name": "documentation"}
							]
						},
						"repository": {
							"owner": {"login": "owner"},
							"name": "repo",
							"stargazerCount": 5000,
							"pushedAt": "2026-03-01T12:00:00Z",
							"primaryLanguage": {"name": "Go"}
						}
					}
				]
			}
		}
	}`

	result, err := ParseSearchResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseSearchResponse returned error: %v", err)
	}

	if result.IssueCount != 42 {
		t.Errorf("IssueCount = %d, want 42", result.IssueCount)
	}
	if !result.PageInfo.HasNextPage {
		t.Error("HasNextPage = false, want true")
	}
	if result.PageInfo.EndCursor != "Y3Vyc29yOjE=" {
		t.Errorf("EndCursor = %q, want %q", result.PageInfo.EndCursor, "Y3Vyc29yOjE=")
	}
	if len(result.Issues) != 1 {
		t.Fatalf("len(Issues) = %d, want 1", len(result.Issues))
	}

	issue := result.Issues[0]
	if issue.DatabaseID != 123456789 {
		t.Errorf("DatabaseID = %d, want 123456789", issue.DatabaseID)
	}
	if issue.Number != 42 {
		t.Errorf("Number = %d, want 42", issue.Number)
	}
	if issue.Title != "Fix typo in README" {
		t.Errorf("Title = %q, want %q", issue.Title, "Fix typo in README")
	}
	if issue.URL != "https://github.com/owner/repo/issues/42" {
		t.Errorf("URL = %q, want %q", issue.URL, "https://github.com/owner/repo/issues/42")
	}
	if issue.State != "OPEN" {
		t.Errorf("State = %q, want %q", issue.State, "OPEN")
	}
	wantCreated := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	if !issue.CreatedAt.Equal(wantCreated) {
		t.Errorf("CreatedAt = %v, want %v", issue.CreatedAt, wantCreated)
	}
	if len(issue.Labels) != 2 || issue.Labels[0] != "good first issue" || issue.Labels[1] != "documentation" {
		t.Errorf("Labels = %v, want [good first issue, documentation]", issue.Labels)
	}
	if issue.RepoOwner != "owner" {
		t.Errorf("RepoOwner = %q, want %q", issue.RepoOwner, "owner")
	}
	if issue.RepoName != "repo" {
		t.Errorf("RepoName = %q, want %q", issue.RepoName, "repo")
	}
	if issue.RepoStars != 5000 {
		t.Errorf("RepoStars = %d, want 5000", issue.RepoStars)
	}
	wantPushed := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	if !issue.PushedAt.Equal(wantPushed) {
		t.Errorf("PushedAt = %v, want %v", issue.PushedAt, wantPushed)
	}
	if issue.Language != "Go" {
		t.Errorf("Language = %q, want %q", issue.Language, "Go")
	}
}

func TestParseSearchResponse_SkipsNonIssueNodes(t *testing.T) {
	raw := `{
		"data": {
			"search": {
				"issueCount": 1,
				"pageInfo": {
					"hasNextPage": false,
					"endCursor": ""
				},
				"nodes": [null]
			}
		}
	}`

	result, err := ParseSearchResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseSearchResponse returned error: %v", err)
	}
	if len(result.Issues) != 0 {
		t.Errorf("len(Issues) = %d, want 0", len(result.Issues))
	}
}

func TestParseStaleCheckResponse(t *testing.T) {
	raw := `{
		"data": {
			"i0": {"url": "https://github.com/owner/repo/issues/1", "state": "CLOSED"},
			"i1": {"url": "https://github.com/owner/repo/issues/2", "state": "OPEN"}
		}
	}`

	results, err := ParseStaleCheckResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseStaleCheckResponse returned error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(results))
	}

	// Results may come in any order since they're parsed from a map, so check both.
	found := map[string]string{}
	for _, r := range results {
		found[r.URL] = r.State
	}

	if found["https://github.com/owner/repo/issues/1"] != "CLOSED" {
		t.Errorf("issue/1 state = %q, want CLOSED", found["https://github.com/owner/repo/issues/1"])
	}
	if found["https://github.com/owner/repo/issues/2"] != "OPEN" {
		t.Errorf("issue/2 state = %q, want OPEN", found["https://github.com/owner/repo/issues/2"])
	}
}

func TestBuildGraphQLRequestBody(t *testing.T) {
	vars := map[string]any{
		"query":  "test query",
		"cursor": nil,
	}
	body := BuildGraphQLRequestBody("{ viewer { login } }", vars)

	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("failed to unmarshal body: %v", err)
	}
	if _, ok := parsed["query"]; !ok {
		t.Error("body missing 'query' key")
	}
	if _, ok := parsed["variables"]; !ok {
		t.Error("body missing 'variables' key")
	}
	if parsed["query"] != "{ viewer { login } }" {
		t.Errorf("query = %v, want %q", parsed["query"], "{ viewer { login } }")
	}
}

func TestHasClaimIntent(t *testing.T) {
	shouldMatch := []struct {
		name string
		text string
	}{
		// --- Contraction variants ---
		{"i'll take this", "I'll take this"},
		{"i'll work on this", "I'll work on this issue"},
		{"i'll handle this", "I'll handle this"},
		{"i'll pick this up", "I'll pick this up"},
		{"i'll tackle this", "I'll tackle this one"},
		{"i'll grab this", "I'll grab this"},
		{"i'll claim this", "I'll claim this"},

		// --- "I'd like to" variants ---
		{"i'd like to take", "I'd like to take this"},
		{"i'd like to work on", "I'd like to work on this issue"},
		{"i'd like to handle", "I'd like to handle this"},
		{"i'd like to tackle", "I'd like to tackle this"},

		// --- "I'd love to" variants ---
		{"i'd love to take", "I'd love to take this"},
		{"i'd love to work on", "I'd love to work on this"},

		// --- "I will" / "I want to" ---
		{"i will take this", "I will take this"},
		{"i want to work on", "I want to work on this"},
		{"i would like to take", "I would like to take this issue"},

		// --- "Can I" / "Could I" / "May I" ---
		{"can i take this", "Can I take this?"},
		{"can i work on this", "Can I work on this?"},
		{"could i take this", "Could I take this?"},
		{"could i work on", "Could I work on this issue?"},
		{"may i take this", "May I take this?"},

		// --- "Let me" ---
		{"let me take this", "Let me take this"},
		{"let me work on this", "Let me work on this"},
		{"let me handle this", "Let me handle this one"},

		// --- "I'm going to" / "I am going to" ---
		{"i'm going to take", "I'm going to take this"},
		{"i am going to work on", "I am going to work on this"},

		// --- "I'm happy/willing to" ---
		{"i'm happy to take", "I'm happy to take this"},
		{"i'm willing to work on", "I'm willing to work on this"},
		{"i am happy to handle", "I am happy to handle this"},

		// --- Direct claim patterns ---
		{"claiming this", "Claiming this!"},
		{"i'm on it", "I'm on it"},
		{"i am on it", "I am on it"},
		{"dibs", "Dibs"},

		// --- With surrounding context ---
		{"embedded in sentence", "Hey @maintainer, I'd like to take this if it's still available"},
		{"with newlines", "Great issue!\nI'll work on this"},

		// --- No explicit object ---
		{"take without object", "I'll take this"},
		{"work on without object", "Can I work on this"},
	}

	for _, tt := range shouldMatch {
		t.Run("match: "+tt.name, func(t *testing.T) {
			if !hasClaimIntent(tt.text) {
				t.Errorf("hasClaimIntent(%q) = false, want true", tt.text)
			}
		})
	}

	shouldNotMatch := []struct {
		name string
		text string
	}{
		{"question about status", "Is this still available?"},
		{"discussion", "This looks like a great feature"},
		{"unrelated take", "I think we should take a different approach"},
		{"working on unrelated", "I'm working on a similar project"},
		{"suggestion", "Someone should take this"},
		{"past tense", "I took this last week"},
		{"asking about difficulty", "How hard would it be to work on this?"},
		{"compliment", "Great work on this issue!"},
		{"emoji only", "👍"},
		{"empty", ""},
		{"just a question mark", "?"},
		{"mentioning PR generically", "Has anyone submitted a PR for this?"},
	}

	for _, tt := range shouldNotMatch {
		t.Run("no match: "+tt.name, func(t *testing.T) {
			if hasClaimIntent(tt.text) {
				t.Errorf("hasClaimIntent(%q) = true, want false", tt.text)
			}
		})
	}
}

func TestHasConfirmation(t *testing.T) {
	shouldMatch := []struct {
		name string
		text string
	}{
		{"go ahead", "Go ahead!"},
		{"go for it", "Go for it"},
		{"sounds good", "Sounds good, thanks!"},
		{"sound good", "Sound good"},
		{"all yours", "All yours!"},
		{"it's yours", "It's yours"},
		{"its yours", "Its yours"},
		{"feel free", "Feel free!"},
		{"assigned", "Assigned to you"},
		{"please go ahead", "Please go ahead"},
		{"please do", "Please do"},
		{"you got it", "You got it"},
		{"lgtm", "LGTM"},
		{"sure!", "Sure!"},
		{"sure thing", "Sure thing"},
		{"yes!", "Yes!"},
		{"absolutely", "Absolutely"},
		{"of course", "Of course!"},
		{"thumbs up", "👍"},
		{"embedded sure", "@user sure, go ahead!"},
		{"with context", "@deepsheth3 sounds good, thanks!"},
	}

	for _, tt := range shouldMatch {
		t.Run("match: "+tt.name, func(t *testing.T) {
			if !hasConfirmation(tt.text) {
				t.Errorf("hasConfirmation(%q) = false, want true", tt.text)
			}
		})
	}

	shouldNotMatch := []struct {
		name string
		text string
	}{
		{"discussion", "We need to discuss the approach first"},
		{"question", "Are you sure about that approach?"},
		{"make sure", "Please make sure to add tests"},
		{"unrelated yes", "Yes we need to rethink this design"},
		{"just thanks", "Thanks for your interest!"},
		{"rejection", "Sorry, this is already being worked on"},
		{"empty", ""},
	}

	for _, tt := range shouldNotMatch {
		t.Run("no match: "+tt.name, func(t *testing.T) {
			if hasConfirmation(tt.text) {
				t.Errorf("hasConfirmation(%q) = true, want false", tt.text)
			}
		})
	}
}

func TestIsClaimed(t *testing.T) {
	recent := time.Now().Add(-1 * time.Hour)
	stale := time.Now().Add(-10 * 24 * time.Hour) // 10 days ago

	tests := []struct {
		name          string
		labels        []string
		hasOpenPR     bool
		assigneeCount int
		comments      []Comment
		want          bool
	}{
		// --- Structural signals (no comments needed) ---
		{"unclaimed issue", []string{"good first issue", "bug"}, false, 0, nil, false},
		{"has open PR", []string{"good first issue"}, true, 0, nil, true},
		{"claimed label", []string{"good first issue", "claimed"}, false, 0, nil, true},
		{"in progress label", []string{"In Progress", "bug"}, false, 0, nil, true},
		{"wip label", []string{"WIP"}, false, 0, nil, true},
		{"taken label", []string{"taken"}, false, 0, nil, true},
		{"assigned label", []string{"assigned"}, false, 0, nil, true},
		{"in-progress label", []string{"in-progress"}, false, 0, nil, true},
		{"work in progress label", []string{"Work In Progress"}, false, 0, nil, true},
		{"being worked on label", []string{"being worked on"}, false, 0, nil, true},
		{"empty labels no PR", []string{}, false, 0, nil, false},
		{"nil labels no PR", nil, false, 0, nil, false},
		{"both signals", []string{"claimed"}, true, 0, nil, true},
		{"has assignee", []string{"good first issue"}, false, 1, nil, true},
		{"has multiple assignees", []string{}, false, 3, nil, true},
		{"assignee + open PR", []string{}, true, 1, nil, true},
		{"no assignee no PR no label", []string{"enhancement"}, false, 0, nil, false},

		// --- Two-phase: claim + confirmation (various real-world patterns) ---
		{
			"SkyRL pattern: I'd like to take + sounds good",
			nil, false, 0,
			[]Comment{
				{Body: "I'd like to take this.", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "@deepsheth3 sounds good, thanks!", CreatedAt: recent.Add(5 * time.Minute), AuthorRole: "MEMBER"},
			},
			true,
		},
		{
			"django-modern-rest pattern: can i take it + sure go ahead",
			nil, false, 0,
			[]Comment{
				{Body: "@sobolevn can i take it?", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "@sw1pr0g sure thing! Please, go ahead :)", CreatedAt: recent.Add(time.Minute), AuthorRole: "MEMBER"},
			},
			true,
		},
		{
			"I will work on this + go for it",
			nil, false, 0,
			[]Comment{
				{Body: "I will work on this issue", CreatedAt: recent, AuthorRole: "CONTRIBUTOR"},
				{Body: "Go for it", CreatedAt: recent.Add(time.Minute), AuthorRole: "OWNER"},
			},
			true,
		},
		{
			"could I handle this + absolutely",
			nil, false, 0,
			[]Comment{
				{Body: "Could I handle this?", CreatedAt: recent, AuthorRole: "FIRST_TIME_CONTRIBUTOR"},
				{Body: "Absolutely", CreatedAt: recent.Add(3 * time.Minute), AuthorRole: "COLLABORATOR"},
			},
			true,
		},
		{
			"i'm going to tackle + of course",
			nil, false, 0,
			[]Comment{
				{Body: "I'm going to tackle this one", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "Of course, let us know if you need help", CreatedAt: recent.Add(time.Minute), AuthorRole: "MEMBER"},
			},
			true,
		},
		{
			"dibs + 👍",
			nil, false, 0,
			[]Comment{
				{Body: "Dibs", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "👍", CreatedAt: recent.Add(time.Minute), AuthorRole: "MEMBER"},
			},
			true,
		},
		{
			"claiming this + feel free",
			nil, false, 0,
			[]Comment{
				{Body: "Claiming this!", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "Feel free!", CreatedAt: recent.Add(2 * time.Minute), AuthorRole: "COLLABORATOR"},
			},
			true,
		},

		// --- Should NOT be claimed ---
		{
			"claim without confirmation",
			nil, false, 0,
			[]Comment{
				{Body: "I'll take this", CreatedAt: recent, AuthorRole: "NONE"},
			},
			false,
		},
		{
			"claim but unrelated maintainer reply",
			nil, false, 0,
			[]Comment{
				{Body: "I'll take this", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "Thanks for your interest, but we need to discuss the approach first", CreatedAt: recent.Add(time.Minute), AuthorRole: "MEMBER"},
			},
			false,
		},
		{
			"confirmation before claim (wrong order)",
			nil, false, 0,
			[]Comment{
				{Body: "Sure!", CreatedAt: recent, AuthorRole: "MEMBER"},
				{Body: "I'll take this", CreatedAt: recent.Add(time.Minute), AuthorRole: "NONE"},
			},
			false,
		},
		{
			"stale claim + confirmation (>7 days old)",
			nil, false, 0,
			[]Comment{
				{Body: "I'll take this", CreatedAt: stale, AuthorRole: "NONE"},
				{Body: "Go ahead", CreatedAt: stale.Add(time.Minute), AuthorRole: "MEMBER"},
			},
			false,
		},
		{
			"maintainer claims (not outsider)",
			nil, false, 0,
			[]Comment{
				{Body: "I'll take this", CreatedAt: recent, AuthorRole: "MEMBER"},
				{Body: "Sounds good", CreatedAt: recent.Add(time.Minute), AuthorRole: "OWNER"},
			},
			false,
		},
		{
			"unrelated discussion",
			nil, false, 0,
			[]Comment{
				{Body: "This looks like a great feature", CreatedAt: recent, AuthorRole: "NONE"},
			},
			false,
		},
		{
			"question only",
			nil, false, 0,
			[]Comment{
				{Body: "Is this still available?", CreatedAt: recent, AuthorRole: "NONE"},
			},
			false,
		},
		{
			"two outsiders no maintainer",
			nil, false, 0,
			[]Comment{
				{Body: "I'll take this", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "Go ahead", CreatedAt: recent.Add(time.Minute), AuthorRole: "NONE"},
			},
			false,
		},
		{
			"make sure in maintainer reply is not confirmation",
			nil, false, 0,
			[]Comment{
				{Body: "I'd like to work on this", CreatedAt: recent, AuthorRole: "NONE"},
				{Body: "Please make sure to add tests before submitting", CreatedAt: recent.Add(time.Minute), AuthorRole: "MEMBER"},
			},
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsClaimed(tt.labels, tt.hasOpenPR, tt.assigneeCount, tt.comments)
			if got != tt.want {
				t.Errorf("IsClaimed() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseSearchResponse_DetectsLinkedPR(t *testing.T) {
	raw := `{
		"data": {
			"search": {
				"issueCount": 2,
				"pageInfo": {"hasNextPage": false, "endCursor": ""},
				"nodes": [
					{
						"databaseId": 111,
						"number": 1,
						"title": "Issue with open PR",
						"url": "https://github.com/owner/repo/issues/1",
						"state": "OPEN",
						"createdAt": "2026-01-01T00:00:00Z",
						"labels": {"nodes": [{"name": "good first issue"}]},
						"timelineItems": {
							"nodes": [
								{"source": {"state": "OPEN"}}
							]
						},
						"repository": {
							"owner": {"login": "owner"},
							"name": "repo",
							"stargazerCount": 5000,
							"pushedAt": "2026-03-01T00:00:00Z",
							"primaryLanguage": {"name": "Go"}
						}
					},
					{
						"databaseId": 222,
						"number": 2,
						"title": "Issue without PR",
						"url": "https://github.com/owner/repo/issues/2",
						"state": "OPEN",
						"createdAt": "2026-01-01T00:00:00Z",
						"labels": {"nodes": [{"name": "good first issue"}]},
						"timelineItems": {
							"nodes": [
								{"source": {"state": "MERGED"}}
							]
						},
						"repository": {
							"owner": {"login": "owner"},
							"name": "repo",
							"stargazerCount": 5000,
							"pushedAt": "2026-03-01T00:00:00Z",
							"primaryLanguage": {"name": "Go"}
						}
					}
				]
			}
		}
	}`

	result, err := ParseSearchResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseSearchResponse returned error: %v", err)
	}
	if len(result.Issues) != 2 {
		t.Fatalf("len(Issues) = %d, want 2", len(result.Issues))
	}
	if !result.Issues[0].HasOpenPR {
		t.Error("Issues[0].HasOpenPR = false, want true (has OPEN PR)")
	}
	if result.Issues[1].HasOpenPR {
		t.Error("Issues[1].HasOpenPR = true, want false (PR is MERGED, not OPEN)")
	}
}

func TestFilterIssue(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name            string
		repoFullName    string
		repoStars       int32
		repoPushedAt    time.Time
		minStars        int32
		maxInactiveDays int
		allowlist       []string
		want            bool
	}{
		{
			name:            "good repo",
			repoFullName:    "acme/project",
			repoStars:       500,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			want:            true,
		},
		{
			name:            "too few stars",
			repoFullName:    "acme/project",
			repoStars:       10,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			want:            false,
		},
		{
			name:            "inactive repo",
			repoFullName:    "acme/project",
			repoStars:       500,
			repoPushedAt:    now.AddDate(0, 0, -200),
			minStars:        50,
			maxInactiveDays: 90,
			want:            false,
		},
		{
			name:            "borderline stars",
			repoFullName:    "acme/project",
			repoStars:       50,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			want:            true,
		},
		{
			name:            "allowlisted repo bypasses star filter",
			repoFullName:    "example/demo-repo",
			repoStars:       0,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			allowlist:       []string{"example/demo-repo"},
			want:            true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FilterIssue(tt.repoFullName, tt.repoStars, tt.repoPushedAt, tt.minStars, tt.maxInactiveDays, tt.allowlist)
			if got != tt.want {
				t.Errorf("FilterIssue(repo=%q, stars=%d, pushed=%v, min=%d, maxDays=%d) = %v, want %v",
					tt.repoFullName, tt.repoStars, tt.repoPushedAt, tt.minStars, tt.maxInactiveDays, got, tt.want)
			}
		})
	}
}
