package handler

import (
	"fmt"
	"strconv"
	"strings"
)

type githubTestRepo struct {
	Owner string
	Name  string
}

func parseGitHubTestRepo(raw string) (githubTestRepo, error) {
	parts := strings.Split(strings.TrimSpace(raw), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return githubTestRepo{}, fmt.Errorf("expected owner/repo")
	}
	return githubTestRepo{Owner: parts[0], Name: parts[1]}, nil
}

func parseGitHubIssueNumbers(raw string) ([]int, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, fmt.Errorf("expected at least one issue number")
	}

	parts := strings.Split(trimmed, ",")
	issues := make([]int, 0, len(parts))
	for _, part := range parts {
		n, err := parseGitHubPRNumber(part)
		if err != nil {
			return nil, err
		}
		issues = append(issues, n)
	}

	return issues, nil
}

func parseGitHubPRNumber(raw string) (int, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, fmt.Errorf("expected positive number")
	}

	n, err := strconv.Atoi(trimmed)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("expected positive number")
	}

	return n, nil
}
