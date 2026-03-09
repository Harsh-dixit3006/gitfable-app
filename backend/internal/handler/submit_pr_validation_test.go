package handler

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

func TestValidateSubmittedPR_RejectsDifferentAuthor(t *testing.T) {
	err := validateSubmittedPR(
		database.User{ID: 1, GithubUsername: pgtype.Text{String: "octocat", Valid: true}},
		database.Issue{RepoOwner: "vercel", RepoName: "next.js", GithubNumber: 42},
		service.PRStatus{UserLogin: "someone-else", Title: "Fix #42"},
		"vercel",
		"next.js",
		nil,
	)

	if err == nil {
		t.Fatal("validateSubmittedPR() error = nil, want author mismatch error")
	}
	if err.Code != ErrCodePRAuthorMismatch {
		t.Fatalf("validateSubmittedPR() code = %q, want %q", err.Code, ErrCodePRAuthorMismatch)
	}
}

func TestValidateSubmittedPR_RejectsWrongRepo(t *testing.T) {
	err := validateSubmittedPR(
		database.User{ID: 1, GithubUsername: pgtype.Text{String: "octocat", Valid: true}},
		database.Issue{RepoOwner: "vercel", RepoName: "next.js", GithubNumber: 42},
		service.PRStatus{UserLogin: "octocat", Title: "Fix #42"},
		"facebook",
		"react",
		nil,
	)

	if err == nil {
		t.Fatal("validateSubmittedPR() error = nil, want repo mismatch error")
	}
	if err.Code != ErrCodePRRepoMismatch {
		t.Fatalf("validateSubmittedPR() code = %q, want %q", err.Code, ErrCodePRRepoMismatch)
	}
}

func TestValidateSubmittedPR_RejectsMissingIssueReference(t *testing.T) {
	err := validateSubmittedPR(
		database.User{ID: 1, GithubUsername: pgtype.Text{String: "octocat", Valid: true}},
		database.Issue{RepoOwner: "vercel", RepoName: "next.js", GithubNumber: 42},
		service.PRStatus{UserLogin: "octocat", Title: "Refactor cache layer", Body: "Improves perf"},
		"vercel",
		"next.js",
		nil,
	)

	if err == nil {
		t.Fatal("validateSubmittedPR() error = nil, want issue reference error")
	}
	if err.Code != ErrCodePRIssueReferenceMissing {
		t.Fatalf("validateSubmittedPR() code = %q, want %q", err.Code, ErrCodePRIssueReferenceMissing)
	}
}

func TestValidateSubmittedPR_RejectsConflictingClaim(t *testing.T) {
	conflict := &database.Draw{ID: 99, UserID: 2}
	err := validateSubmittedPR(
		database.User{ID: 1, GithubUsername: pgtype.Text{String: "octocat", Valid: true}},
		database.Issue{ID: 10, RepoOwner: "vercel", RepoName: "next.js", GithubNumber: 42},
		service.PRStatus{UserLogin: "octocat", Title: "Fix #42"},
		"vercel",
		"next.js",
		conflict,
	)

	if err == nil {
		t.Fatal("validateSubmittedPR() error = nil, want conflicting claim error")
	}
	if err.Code != ErrCodeIssueAlreadyClaimed {
		t.Fatalf("validateSubmittedPR() code = %q, want %q", err.Code, ErrCodeIssueAlreadyClaimed)
	}
}

func TestValidateSubmittedPR_AllowsMatchingVerifiedPR(t *testing.T) {
	err := validateSubmittedPR(
		database.User{ID: 1, GithubUsername: pgtype.Text{String: "octocat", Valid: true}},
		database.Issue{ID: 10, RepoOwner: "vercel", RepoName: "next.js", GithubNumber: 42},
		service.PRStatus{UserLogin: "octocat", Title: "Fix #42", Body: "Resolves #42"},
		"Vercel",
		"Next.js",
		nil,
	)

	if err != nil {
		t.Fatalf("validateSubmittedPR() error = %v, want nil", err)
	}
}

func TestMapPRVerificationError_RateLimited(t *testing.T) {
	apiErr := mapPRVerificationError(errors.New("github API rate limited"))

	if apiErr.Code != ErrCodeRateLimited {
		t.Fatalf("mapPRVerificationError() code = %q, want %q", apiErr.Code, ErrCodeRateLimited)
	}
	if apiErr.Message != "GitHub API rate limited while verifying PR" {
		t.Fatalf("mapPRVerificationError() message = %q", apiErr.Message)
	}
}

func TestMapPRVerificationError_PRNotFound(t *testing.T) {
	apiErr := mapPRVerificationError(errors.New("PR not found"))

	if apiErr.Code != ErrCodeInvalidPRURL {
		t.Fatalf("mapPRVerificationError() code = %q, want %q", apiErr.Code, ErrCodeInvalidPRURL)
	}
	if apiErr.Message != "GitHub PR not found or not accessible" {
		t.Fatalf("mapPRVerificationError() message = %q", apiErr.Message)
	}
}
