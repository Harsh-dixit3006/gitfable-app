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
		{"Go", `label:"good first issue" language:Go state:open sort:updated`},
		{"JavaScript", `label:"good first issue" language:JavaScript state:open sort:updated`},
		{"C++", `label:"good first issue" language:C++ state:open sort:updated`},
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

func TestFilterIssue(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name            string
		repoStars       int32
		repoPushedAt    time.Time
		minStars        int32
		maxInactiveDays int
		want            bool
	}{
		{
			name:            "good repo",
			repoStars:       500,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			want:            true,
		},
		{
			name:            "too few stars",
			repoStars:       10,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			want:            false,
		},
		{
			name:            "inactive repo",
			repoStars:       500,
			repoPushedAt:    now.AddDate(0, 0, -200),
			minStars:        50,
			maxInactiveDays: 90,
			want:            false,
		},
		{
			name:            "borderline stars",
			repoStars:       50,
			repoPushedAt:    now.AddDate(0, 0, -10),
			minStars:        50,
			maxInactiveDays: 90,
			want:            true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FilterIssue(tt.repoStars, tt.repoPushedAt, tt.minStars, tt.maxInactiveDays)
			if got != tt.want {
				t.Errorf("FilterIssue(stars=%d, pushed=%v, min=%d, maxDays=%d) = %v, want %v",
					tt.repoStars, tt.repoPushedAt, tt.minStars, tt.maxInactiveDays, got, tt.want)
			}
		})
	}
}
