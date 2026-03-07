package seed

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

// SeedDatabase populates the database with mock issues and users for development.
// It is a no-op if the issues table already contains data.
func SeedDatabase(ctx context.Context, queries *database.Queries) error {
	count, err := queries.CountIssues(ctx)
	if err != nil {
		return fmt.Errorf("seed: count issues: %w", err)
	}
	if count > 0 {
		slog.Info("seed: database already has data, skipping", "issue_count", count)
		return nil
	}

	slog.Info("seed: populating database with mock data")

	if err := seedIssues(ctx, queries); err != nil {
		return fmt.Errorf("seed: issues: %w", err)
	}

	if err := seedUsers(ctx, queries); err != nil {
		return fmt.Errorf("seed: users: %w", err)
	}

	slog.Info("seed: done", "issues", len(mockIssues), "users", len(mockUsers))
	return nil
}

func text(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

type mockIssue struct {
	GithubID     int64
	GithubNumber int32
	RepoOwner    string
	RepoName   string
	Title      string
	URL        string
	Language   string
	Difficulty string
	RepoStars  int32
	Labels     []string
}

var mockIssues = []mockIssue{
	// facebook/react — JavaScript
	{100001, 1, "facebook", "react", "Fix useEffect cleanup race condition", "https://github.com/facebook/react/issues/100001", "JavaScript", "Intermediate", 215000, []string{"bug", "good first issue"}},
	{100002, 2, "facebook", "react", "Add aria-label to portal components", "https://github.com/facebook/react/issues/100002", "JavaScript", "Beginner", 215000, []string{"good first issue", "accessibility"}},
	{100003, 3, "facebook", "react", "Optimize reconciler for large lists", "https://github.com/facebook/react/issues/100003", "JavaScript", "Advanced", 215000, []string{"performance", "enhancement"}},

	// microsoft/vscode — TypeScript
	{100004, 4, "microsoft", "vscode", "Fix syntax highlighting for nested templates", "https://github.com/microsoft/vscode/issues/100004", "TypeScript", "Intermediate", 155000, []string{"bug", "languages"}},
	{100005, 5, "microsoft", "vscode", "Add keyboard shortcut for split terminal", "https://github.com/microsoft/vscode/issues/100005", "TypeScript", "Beginner", 155000, []string{"good first issue", "terminal"}},
	{100006, 6, "microsoft", "vscode", "Implement custom font ligature support", "https://github.com/microsoft/vscode/issues/100006", "TypeScript", "Advanced", 155000, []string{"enhancement", "editor"}},

	// rust-lang/rust — Rust
	{100007, 7, "rust-lang", "rust", "Improve error message for lifetime mismatch", "https://github.com/rust-lang/rust/issues/100007", "Rust", "Intermediate", 90000, []string{"A-diagnostics", "good first issue"}},
	{100008, 8, "rust-lang", "rust", "Add doc examples for std::collections::BTreeMap", "https://github.com/rust-lang/rust/issues/100008", "Rust", "Beginner", 90000, []string{"good first issue", "docs"}},
	{100009, 9, "rust-lang", "rust", "Optimize pattern matching compilation", "https://github.com/rust-lang/rust/issues/100009", "Rust", "Advanced", 90000, []string{"enhancement", "compiler"}},

	// django/django — Python
	{100010, 10, "django", "django", "Fix QuerySet.defer() with select_related", "https://github.com/django/django/issues/100010", "Python", "Intermediate", 76000, []string{"bug", "ORM"}},
	{100011, 11, "django", "django", "Add type hints to template engine", "https://github.com/django/django/issues/100011", "Python", "Beginner", 76000, []string{"good first issue", "enhancement"}},
	{100012, 12, "django", "django", "Implement async middleware chain", "https://github.com/django/django/issues/100012", "Python", "Advanced", 76000, []string{"enhancement", "async"}},

	// golang/go — Go
	{100013, 13, "golang", "go", "Fix race condition in sync.Pool", "https://github.com/golang/go/issues/100013", "Go", "Intermediate", 120000, []string{"bug", "runtime"}},
	{100014, 14, "golang", "go", "Add examples to net/http documentation", "https://github.com/golang/go/issues/100014", "Go", "Beginner", 120000, []string{"good first issue", "docs"}},
	{100015, 15, "golang", "go", "Optimize garbage collector pause times", "https://github.com/golang/go/issues/100015", "Go", "Advanced", 120000, []string{"performance", "runtime"}},

	// flutter/flutter — Dart
	{100016, 16, "flutter", "flutter", "Fix ListView scroll jank on older devices", "https://github.com/flutter/flutter/issues/100016", "Dart", "Intermediate", 160000, []string{"bug", "framework"}},
	{100017, 17, "flutter", "flutter", "Add docs for CustomPainter widget", "https://github.com/flutter/flutter/issues/100017", "Dart", "Beginner", 160000, []string{"good first issue", "docs"}},
	{100018, 18, "flutter", "flutter", "Implement platform channel batching", "https://github.com/flutter/flutter/issues/100018", "Dart", "Advanced", 160000, []string{"enhancement", "engine"}},

	// tensorflow/tensorflow — C++
	{100019, 19, "tensorflow", "tensorflow", "Fix memory leak in eager execution mode", "https://github.com/tensorflow/tensorflow/issues/100019", "C++", "Intermediate", 182000, []string{"bug", "comp:core"}},
	{100020, 20, "tensorflow", "tensorflow", "Add tutorial for custom training loop", "https://github.com/tensorflow/tensorflow/issues/100020", "C++", "Beginner", 182000, []string{"good first issue", "docs"}},
	{100021, 21, "tensorflow", "tensorflow", "Optimize XLA compilation for TPU", "https://github.com/tensorflow/tensorflow/issues/100021", "C++", "Advanced", 182000, []string{"enhancement", "comp:xla"}},

	// kubernetes/kubernetes — Go
	{100022, 22, "kubernetes", "kubernetes", "Fix pod eviction race in scheduler", "https://github.com/kubernetes/kubernetes/issues/100022", "Go", "Intermediate", 105000, []string{"bug", "sig/scheduling"}},
	{100023, 23, "kubernetes", "kubernetes", "Add validation for CRD field types", "https://github.com/kubernetes/kubernetes/issues/100023", "Go", "Beginner", 105000, []string{"good first issue", "sig/api-machinery"}},
	{100024, 24, "kubernetes", "kubernetes", "Implement priority-based preemption", "https://github.com/kubernetes/kubernetes/issues/100024", "Go", "Advanced", 105000, []string{"enhancement", "sig/scheduling"}},

	// nodejs/node — JavaScript
	{100025, 25, "nodejs", "node", "Fix stream backpressure handling in HTTP/2", "https://github.com/nodejs/node/issues/100025", "JavaScript", "Intermediate", 102000, []string{"bug", "http2"}},
	{100026, 26, "nodejs", "node", "Improve error messages in fs module", "https://github.com/nodejs/node/issues/100026", "JavaScript", "Beginner", 102000, []string{"good first issue", "fs"}},
	{100027, 27, "nodejs", "node", "Implement worker thread pool auto-scaling", "https://github.com/nodejs/node/issues/100027", "JavaScript", "Advanced", 102000, []string{"enhancement", "worker"}},
}

func seedIssues(ctx context.Context, queries *database.Queries) error {
	for _, m := range mockIssues {
		_, err := queries.CreateIssue(ctx, database.CreateIssueParams{
			GithubID:        m.GithubID,
			GithubNumber:    m.GithubNumber,
			RepoOwner:       m.RepoOwner,
			RepoName:        m.RepoName,
			Title:           m.Title,
			Url:             m.URL,
			Language:        text(m.Language),
			Difficulty:      text(m.Difficulty),
			RepoStars:       m.RepoStars,
			RepoPushedAt:    pgtype.Timestamptz{},
			GithubCreatedAt: pgtype.Timestamptz{},
			Labels:          m.Labels,
			State:           database.IssueStateOpen,
		})
		if err != nil {
			return fmt.Errorf("create issue %d: %w", m.GithubID, err)
		}
	}
	return nil
}

type mockUser struct {
	FirebaseUID   string
	Username      string
	Email         string
	DisplayName   string
	AvatarURL     string
	XP            int
	CurrentStreak int
	LongestStreak int
}

var mockUsers = []mockUser{
	{"seed_firebase_uid_1", "sarah-chen", "sarah@example.com", "Sarah Chen", "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah", 4200, 12, 30},
	{"seed_firebase_uid_2", "alex-rust", "alex@example.com", "Alex Rust", "https://api.dicebear.com/7.x/avataaars/svg?seed=alex", 3100, 7, 21},
	{"seed_firebase_uid_3", "dev-maya", "maya@example.com", "Maya Dev", "https://api.dicebear.com/7.x/avataaars/svg?seed=maya", 1500, 5, 14},
	{"seed_firebase_uid_4", "code-ninja", "ninja@example.com", "Code Ninja", "https://api.dicebear.com/7.x/avataaars/svg?seed=ninja", 5000, 20, 45},
	{"seed_firebase_uid_5", "byte-smith", "byte@example.com", "Byte Smith", "https://api.dicebear.com/7.x/avataaars/svg?seed=byte", 800, 3, 10},
	{"seed_firebase_uid_6", "luna-dev", "luna@example.com", "Luna Dev", "https://api.dicebear.com/7.x/avataaars/svg?seed=luna", 2700, 9, 18},
	{"seed_firebase_uid_7", "max-code", "max@example.com", "Max Code", "https://api.dicebear.com/7.x/avataaars/svg?seed=max", 350, 2, 5},
	{"seed_firebase_uid_8", "pixel-jane", "jane@example.com", "Pixel Jane", "https://api.dicebear.com/7.x/avataaars/svg?seed=jane", 50, 1, 1},
}

func seedUsers(ctx context.Context, queries *database.Queries) error {
	for _, m := range mockUsers {
		user, err := queries.CreateUser(ctx, database.CreateUserParams{
			FirebaseUid: m.FirebaseUID,
			Username:    m.Username,
			Email:       m.Email,
			DisplayName: m.DisplayName,
			AvatarUrl:   m.AvatarURL,
		})
		if err != nil {
			return fmt.Errorf("create user %s: %w", m.Username, err)
		}

		level := service.CalcLevel(m.XP)
		_, err = queries.UpdateUserXP(ctx, database.UpdateUserXPParams{
			ID:    user.ID,
			Xp:    int32(m.XP),
			Level: int32(level),
		})
		if err != nil {
			return fmt.Errorf("update xp for %s: %w", m.Username, err)
		}

		err = queries.UpdateUserStreak(ctx, database.UpdateUserStreakParams{
			ID:            user.ID,
			CurrentStreak: int32(m.CurrentStreak),
			LongestStreak: int32(m.LongestStreak),
		})
		if err != nil {
			return fmt.Errorf("update streak for %s: %w", m.Username, err)
		}
	}
	return nil
}
