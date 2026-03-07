package sync

import (
	"encoding/json"
	"fmt"
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
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
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
        labels(first: 20) { nodes { name } }
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
	return fmt.Sprintf(`label:"good first issue" language:%s state:open sort:updated`, language)
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

// FilterIssue returns true if the repo meets quality thresholds:
// stars >= minStars AND pushed within maxInactiveDays.
func FilterIssue(repoStars int32, repoPushedAt time.Time, minStars int32, maxInactiveDays int) bool {
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
	DatabaseID int64
	Number     int
	Title      string
	URL        string
	State      string
	CreatedAt  time.Time
	Labels     []string
	RepoOwner  string
	RepoName   string
	RepoStars  int32
	PushedAt   time.Time
	Language   string
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
	Labels     struct {
		Nodes []struct {
			Name string `json:"name"`
		} `json:"nodes"`
	} `json:"labels"`
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

		issues = append(issues, ParsedIssue{
			DatabaseID: node.DatabaseID,
			Number:     node.Number,
			Title:      node.Title,
			URL:        node.URL,
			State:      node.State,
			CreatedAt:  createdAt,
			Labels:     labels,
			RepoOwner:  node.Repository.Owner.Login,
			RepoName:   node.Repository.Name,
			RepoStars:  node.Repository.StargazerCount,
			PushedAt:   pushedAt,
			Language:   lang,
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
