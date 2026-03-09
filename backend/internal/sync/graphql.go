package sync

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Exported config variables for issue filtering.
var (
	MinRepoStars        = int32(50)
	MaxRepoInactiveDays = 90
)

// SearchQuery is the GraphQL query string for fetching issues via GitHub's search API.
const SearchQuery = `query($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 50, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        databaseId
        number
        title
        url
        state
        createdAt
        assignees(first: 1) { totalCount }
        labels(first: 20) { nodes { name } }
        comments(last: 5) { nodes { body createdAt authorAssociation } }
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: 10) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest { state }
              }
            }
          }
        }
        repository {
          owner { login }
          name
          stargazerCount
          pushedAt
          primaryLanguage { name }
        }
      }
    }
  }
}`

// BuildSearchQuery returns a GitHub search query string for the given language.
func BuildSearchQuery(language string) string {
	return fmt.Sprintf(`is:open is:issue label:"good first issue" language:%s`, language)
}

// BuildStaleCheckQuery builds a GraphQL query with aliased resource lookups
// to check whether issues are still open.
func BuildStaleCheckQuery(urls []string) string {
	var b strings.Builder
	b.WriteString("query {\n")
	for i, url := range urls {
		fmt.Fprintf(&b, "  i%d: resource(url: %q) { ... on Issue { url state } }\n", i, url)
	}
	b.WriteString("}")
	return b.String()
}

// BuildGraphQLRequestBody JSON-encodes a GraphQL request body with query and variables.
func BuildGraphQLRequestBody(query string, variables map[string]any) []byte {
	body := map[string]any{
		"query":     query,
		"variables": variables,
	}
	data, _ := json.Marshal(body)
	return data
}

// ClaimedLabels is a denylist of labels that indicate someone is already working on the issue.
var ClaimedLabels = []string{
	"in progress", "claimed", "wip", "taken", "work in progress",
	"assigned", "in-progress", "being worked on",
}

// Comment holds a parsed comment with metadata for claim detection.
type Comment struct {
	Body      string
	CreatedAt time.Time
	// AuthorRole is the GitHub authorAssociation value:
	// OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, FIRST_TIMER, FIRST_TIME_CONTRIBUTOR, NONE
	AuthorRole string
}

// claimPattern matches outsider comments expressing intent to work on an issue.
// Structure: <intent prefix> <action verb> <object suffix>
// This covers hundreds of natural permutations like:
//
//	"I'd like to take this", "can I work on this issue?", "I will handle it",
//	"I'm going to pick this up", "let me tackle this", "could I take this on?"
var claimPattern = regexp.MustCompile(
	`(?i)` +
		// Intent prefixes: "I'll", "I'd like to", "can I", "let me", "I want to", etc.
		`(?:` +
		`i(?:'ll|'d like to|'d love to| will| would like to| want to| am going to|'m going to)` +
		`|can i|could i|may i|let me|i(?:'m| am) (?:going to|happy to|willing to)` +
		`)` +
		`\s+` +
		// Action verbs: take, work on, handle, pick up, tackle, claim, grab
		`(?:take|work on|handle|pick up|pick this up|tackle|claim|grab)` +
		// Optional object: "this", "this issue", "it", "this one"
		`(?:\s+(?:this|this issue|this one|it|this task))?`,
)

// claimDirectPattern matches short, direct claim statements that don't follow
// the intent+verb structure: "claiming this", "dibs", "mine"
var claimDirectPattern = regexp.MustCompile(
	`(?i)(?:claiming this|i'm on it|i am on it|dibs)`,
)

// confirmPattern matches maintainer replies confirming a claim.
// Covers: "sure", "go ahead", "sounds good", "all yours", "feel free",
// "assigned", "go for it", "you got it", "please do", "yes!", "absolutely", etc.
var confirmPattern = regexp.MustCompile(
	`(?i)(?:` +
		`go\s+(?:ahead|for it)` +
		`|sounds?\s+good` +
		`|(?:it'?s |all\s+)yours` +
		`|feel\s+free` +
		`|assigned` +
		`|please\s+(?:go ahead|do)` +
		`|you\s+got\s+it` +
		`|lgtm` +
		`|(?:^|\n)\s*sure(?:\s+thing)?[!\s.,)]*(?:$|\n)` + // "sure!" at start of line, not "make sure"
		`|(?:^|\n)\s*yes[!\s.,)]*(?:$|\n)` + // "yes!" at start of line, not "yes we need to discuss"
		`|absolutely` +
		`|of\s+course` +
		`|👍` +
		`)`,
)

// claimMaxAge is how old a comment can be and still count as a claim signal.
const claimMaxAge = 7 * 24 * time.Hour

// isMaintainer returns true for OWNER, MEMBER, and COLLABORATOR roles.
func isMaintainer(role string) bool {
	return role == "OWNER" || role == "MEMBER" || role == "COLLABORATOR"
}

// isOutsider returns true for non-maintainer roles.
func isOutsider(role string) bool {
	return !isMaintainer(role)
}

// IsClaimed returns true if the issue appears to already be claimed, checking
// (in order): assignees, linked open PRs, label denylist, and comment-based
// claim detection (outsider claim + maintainer confirmation within 7 days).
func IsClaimed(labels []string, hasOpenPR bool, assigneeCount int, comments []Comment) bool {
	if assigneeCount > 0 {
		return true
	}
	if hasOpenPR {
		return true
	}
	for _, l := range labels {
		lower := strings.ToLower(l)
		for _, cl := range ClaimedLabels {
			if lower == cl {
				return true
			}
		}
	}
	return isClaimedByComments(comments)
}

// hasClaimIntent returns true if the text matches a claim-intent pattern.
func hasClaimIntent(text string) bool {
	return claimPattern.MatchString(text) || claimDirectPattern.MatchString(text)
}

// hasConfirmation returns true if the text matches a maintainer confirmation pattern.
func hasConfirmation(text string) bool {
	return confirmPattern.MatchString(text)
}

// isClaimedByComments checks for a two-phase claim pattern:
// 1. An outsider posts a claim-intent comment within the last 7 days
// 2. A maintainer replies with a confirmation AFTER the claim comment
func isClaimedByComments(comments []Comment) bool {
	cutoff := time.Now().Add(-claimMaxAge)

	// Find the earliest recent claim comment from an outsider.
	claimTime := time.Time{}
	for _, c := range comments {
		if c.CreatedAt.Before(cutoff) {
			continue
		}
		if !isOutsider(c.AuthorRole) {
			continue
		}
		if hasClaimIntent(c.Body) {
			if claimTime.IsZero() || c.CreatedAt.Before(claimTime) {
				claimTime = c.CreatedAt
			}
		}
	}
	if claimTime.IsZero() {
		return false
	}

	// Look for a maintainer confirmation after the claim.
	for _, c := range comments {
		if !isMaintainer(c.AuthorRole) {
			continue
		}
		if !c.CreatedAt.After(claimTime) {
			continue
		}
		if hasConfirmation(c.Body) {
			return true
		}
	}
	return false
}

// FilterIssue returns true if the repo meets quality thresholds:
// stars >= minStars AND pushed within maxInactiveDays.
func FilterIssue(repoFullName string, repoStars int32, repoPushedAt time.Time, minStars int32, maxInactiveDays int, allowlist []string) bool {
	for _, allowed := range allowlist {
		if strings.EqualFold(strings.TrimSpace(allowed), strings.TrimSpace(repoFullName)) {
			return true
		}
	}
	if repoStars < minStars {
		return false
	}
	cutoff := time.Now().AddDate(0, 0, -maxInactiveDays)
	return repoPushedAt.After(cutoff)
}

// --- Response types ---

// PageInfo holds pagination state from a GraphQL response.
type PageInfo struct {
	HasNextPage bool   `json:"hasNextPage"`
	EndCursor   string `json:"endCursor"`
}

// ParsedIssue holds a single issue parsed from the GraphQL search response.
type ParsedIssue struct {
	DatabaseID    int64
	Number        int
	Title         string
	URL           string
	State         string
	CreatedAt     time.Time
	Labels        []string
	HasOpenPR     bool
	AssigneeCount int
	Comments      []Comment
	RepoOwner     string
	RepoName      string
	RepoStars     int32
	PushedAt      time.Time
	Language      string
}

// SearchResult holds the parsed result of a GraphQL search response.
type SearchResult struct {
	IssueCount int
	PageInfo   PageInfo
	Issues     []ParsedIssue
}

// StaleCheckResult holds the parsed result of a single resource lookup.
type StaleCheckResult struct {
	URL   string `json:"url"`
	State string `json:"state"`
}

// --- Internal raw types for JSON unmarshaling ---

type graphQLSearchResponse struct {
	Data struct {
		Search struct {
			IssueCount int             `json:"issueCount"`
			PageInfo   PageInfo        `json:"pageInfo"`
			Nodes      json.RawMessage `json:"nodes"`
		} `json:"search"`
	} `json:"data"`
}

type rawIssueNode struct {
	DatabaseID int64  `json:"databaseId"`
	Number     int    `json:"number"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	State      string `json:"state"`
	CreatedAt  string `json:"createdAt"`
	Assignees  struct {
		TotalCount int `json:"totalCount"`
	} `json:"assignees"`
	Comments struct {
		Nodes []struct {
			Body              string `json:"body"`
			CreatedAt         string `json:"createdAt"`
			AuthorAssociation string `json:"authorAssociation"`
		} `json:"nodes"`
	} `json:"comments"`
	Labels struct {
		Nodes []struct {
			Name string `json:"name"`
		} `json:"nodes"`
	} `json:"labels"`
	TimelineItems struct {
		Nodes []struct {
			Source struct {
				State string `json:"state"`
			} `json:"source"`
		} `json:"nodes"`
	} `json:"timelineItems"`
	Repository struct {
		Owner struct {
			Login string `json:"login"`
		} `json:"owner"`
		Name            string `json:"name"`
		StargazerCount  int32  `json:"stargazerCount"`
		PushedAt        string `json:"pushedAt"`
		PrimaryLanguage *struct {
			Name string `json:"name"`
		} `json:"primaryLanguage"`
	} `json:"repository"`
}

// ParseSearchResponse parses the GraphQL search response JSON into a SearchResult.
// Null or malformed nodes are skipped.
func ParseSearchResponse(data []byte) (*SearchResult, error) {
	var resp graphQLSearchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal search response: %w", err)
	}

	// Parse nodes array, which may contain nulls.
	var rawNodes []*json.RawMessage
	if err := json.Unmarshal(resp.Data.Search.Nodes, &rawNodes); err != nil {
		return nil, fmt.Errorf("unmarshal nodes array: %w", err)
	}

	var issues []ParsedIssue
	for _, rawNode := range rawNodes {
		if rawNode == nil {
			continue
		}

		var node rawIssueNode
		if err := json.Unmarshal(*rawNode, &node); err != nil {
			continue // skip malformed nodes
		}

		// Skip nodes that didn't match the Issue fragment (no databaseId).
		if node.DatabaseID == 0 && node.URL == "" {
			continue
		}

		createdAt, _ := time.Parse(time.RFC3339, node.CreatedAt)
		pushedAt, _ := time.Parse(time.RFC3339, node.Repository.PushedAt)

		labels := make([]string, 0, len(node.Labels.Nodes))
		for _, l := range node.Labels.Nodes {
			labels = append(labels, l.Name)
		}

		lang := ""
		if node.Repository.PrimaryLanguage != nil {
			lang = node.Repository.PrimaryLanguage.Name
		}

		// Check if any linked PR is OPEN or in DRAFT state.
		hasOpenPR := false
		for _, ti := range node.TimelineItems.Nodes {
			if ti.Source.State == "OPEN" {
				hasOpenPR = true
				break
			}
		}

		// Extract structured comments for claim detection.
		var comments []Comment
		for _, c := range node.Comments.Nodes {
			if c.Body == "" {
				continue
			}
			commentTime, _ := time.Parse(time.RFC3339, c.CreatedAt)
			comments = append(comments, Comment{
				Body:       c.Body,
				CreatedAt:  commentTime,
				AuthorRole: c.AuthorAssociation,
			})
		}

		issues = append(issues, ParsedIssue{
			DatabaseID:    node.DatabaseID,
			Number:        node.Number,
			Title:         node.Title,
			URL:           node.URL,
			State:         node.State,
			CreatedAt:     createdAt,
			Labels:        labels,
			HasOpenPR:     hasOpenPR,
			AssigneeCount: node.Assignees.TotalCount,
			Comments:      comments,
			RepoOwner:     node.Repository.Owner.Login,
			RepoName:      node.Repository.Name,
			RepoStars:     node.Repository.StargazerCount,
			PushedAt:      pushedAt,
			Language:      lang,
		})
	}

	return &SearchResult{
		IssueCount: resp.Data.Search.IssueCount,
		PageInfo:   resp.Data.Search.PageInfo,
		Issues:     issues,
	}, nil
}

// ParseStaleCheckResponse parses the aliased resource lookup response.
func ParseStaleCheckResponse(data []byte) ([]StaleCheckResult, error) {
	var resp struct {
		Data map[string]StaleCheckResult `json:"data"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal stale check response: %w", err)
	}

	results := make([]StaleCheckResult, 0, len(resp.Data))
	for _, r := range resp.Data {
		results = append(results, r)
	}
	return results, nil
}
