package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var prURLRegex = regexp.MustCompile(`^https://github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)/pull/(\d+)$`)
var issueReferenceRegex = regexp.MustCompile(`(?i)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s*#(\d+)`)

// ParsePRURL extracts the owner, repo, and PR number from a GitHub pull request URL.
func ParsePRURL(url string) (owner, repo string, number int, err error) {
	matches := prURLRegex.FindStringSubmatch(url)
	if matches == nil {
		return "", "", 0, fmt.Errorf("invalid PR URL format")
	}

	number, err = strconv.Atoi(matches[3])
	if err != nil || number < 1 {
		return "", "", 0, fmt.Errorf("invalid PR number")
	}

	return matches[1], matches[2], number, nil
}

// PRStatus represents the relevant fields from a GitHub pull request.
type PRStatus struct {
	State          string `json:"state"`
	Merged         bool   `json:"merged"`
	MergedAt       string `json:"merged_at"`
	MergeCommitSHA string `json:"merge_commit_sha"`
	UserLogin      string `json:"user_login"`
	Title          string `json:"title"`
	Body           string `json:"body"`
	HTMLURL        string `json:"html_url"`
}

// GitHubClient defines the interface for interacting with the GitHub API.
type GitHubClient interface {
	GetPRStatus(ctx context.Context, owner, repo string, number int) (*PRStatus, error)
}

type githubClient struct {
	httpClient *http.Client
	baseURL    string
	token      string
}

// NewGitHubClient creates a new GitHubClient with sensible defaults.
func NewGitHubClient(token string) GitHubClient {
	return &githubClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    "https://api.github.com",
		token:      token,
	}
}

func (c *githubClient) GetPRStatus(ctx context.Context, owner, repo string, number int) (*PRStatus, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/pulls/%d", strings.TrimRight(c.baseURL, "/"), owner, repo, number)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github api request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("PR not found")
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("github API rate limited")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var pr struct {
		State          string `json:"state"`
		Merged         bool   `json:"merged"`
		MergedAt       string `json:"merged_at"`
		MergeCommitSHA string `json:"merge_commit_sha"`
		User           struct {
			Login string `json:"login"`
		} `json:"user"`
		Title   string `json:"title"`
		Body    string `json:"body"`
		HTMLURL string `json:"html_url"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &PRStatus{
		State:          pr.State,
		Merged:         pr.Merged,
		MergedAt:       pr.MergedAt,
		MergeCommitSHA: pr.MergeCommitSHA,
		UserLogin:      pr.User.Login,
		Title:          pr.Title,
		Body:           pr.Body,
		HTMLURL:        pr.HTMLURL,
	}, nil
}

func PRReferencesIssue(pr PRStatus, issueNumber int32) bool {
	needle := fmt.Sprintf("#%d", issueNumber)
	if strings.Contains(strings.ToLower(pr.Title), strings.ToLower(needle)) {
		return true
	}
	for _, match := range issueReferenceRegex.FindAllStringSubmatch(pr.Body, -1) {
		if len(match) < 2 {
			continue
		}
		n, err := strconv.Atoi(match[1])
		if err == nil && int32(n) == issueNumber {
			return true
		}
	}
	return false
}

// VerifyWebhookSignature checks that a GitHub webhook payload matches the expected HMAC-SHA256 signature.
func VerifyWebhookSignature(payload []byte, signature, secret string) bool {
	if secret == "" || signature == "" {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
