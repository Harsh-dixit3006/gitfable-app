package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIssueCheckerIsOpen_ReturnsFalseWhenIssueHasOpenLinkedPR(t *testing.T) {
	oldIssueAPIBaseURL := issueAPIBaseURL
	oldGraphQLAPIURL := graphQLAPIURL
	defer func() {
		issueAPIBaseURL = oldIssueAPIBaseURL
		graphQLAPIURL = oldGraphQLAPIURL
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/owner/repo/issues/42":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"state":"open"}`))
		case "/graphql":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"data": {
					"repository": {
						"issue": {
							"assignees": {"totalCount": 0},
							"labels": {"nodes": [{"name": "good first issue"}]},
							"comments": {"nodes": []},
							"timelineItems": {
								"nodes": [
									{"source": {"state": "OPEN"}}
								]
							}
						}
					}
				}
			}`))
		default:
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	issueAPIBaseURL = server.URL
	graphQLAPIURL = server.URL + "/graphql"

	checker := NewIssueChecker(nil)
	checker.httpClient = server.Client()

	open, err := checker.IsOpen(context.Background(), "owner", "repo", 42)
	if err != nil {
		t.Fatalf("IsOpen returned error: %v", err)
	}
	if open {
		t.Fatal("IsOpen = true, want false when issue already has an open linked PR")
	}
}

func TestIssueCheckerIsOpen_ReturnsTrueWhenIssueIsOpenAndUnclaimed(t *testing.T) {
	oldIssueAPIBaseURL := issueAPIBaseURL
	oldGraphQLAPIURL := graphQLAPIURL
	defer func() {
		issueAPIBaseURL = oldIssueAPIBaseURL
		graphQLAPIURL = oldGraphQLAPIURL
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/owner/repo/issues/42":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"state":"open"}`))
		case "/graphql":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"data": {
					"repository": {
						"issue": {
							"assignees": {"totalCount": 0},
							"labels": {"nodes": [{"name": "good first issue"}]},
							"comments": {"nodes": []},
							"timelineItems": {"nodes": []}
						}
					}
				}
			}`))
		default:
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	issueAPIBaseURL = server.URL
	graphQLAPIURL = server.URL + "/graphql"

	checker := NewIssueChecker(nil)
	checker.httpClient = server.Client()

	open, err := checker.IsOpen(context.Background(), "owner", "repo", 42)
	if err != nil {
		t.Fatalf("IsOpen returned error: %v", err)
	}
	if !open {
		t.Fatal("IsOpen = false, want true for open unclaimed issue")
	}
}
