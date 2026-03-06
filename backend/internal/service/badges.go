package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

// MergedDraw is a flattened representation of a merged draw with its issue data,
// used for badge condition checking without depending on sqlc types.
type MergedDraw struct {
	ID        int64
	CreatedAt time.Time
	MergedAt  time.Time
	RepoOwner string
	RepoName  string
	Language  string
	Labels    []string
}

// BadgeUser holds user-level fields needed by badge checks.
type BadgeUser struct {
	LongestStreak int32
}

// BadgeDef describes a badge and its unlock condition.
type BadgeDef struct {
	Name        string
	Description string
	Icon        string
	Check       func(draws []MergedDraw, user BadgeUser) bool
}

// BadgeDefs is the canonical list of all 10 badges.
var BadgeDefs = []BadgeDef{
	{
		Name:        "Prologue",
		Description: "Merge your first pull request",
		Icon:        "book-open",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			return len(draws) >= 1
		},
	},
	{
		Name:        "Short Story",
		Description: "Merge 3 pull requests",
		Icon:        "book",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			return len(draws) >= 3
		},
	},
	{
		Name:        "The Epic",
		Description: "Merge 100 pull requests",
		Icon:        "library",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			return len(draws) >= 100
		},
	},
	{
		Name:        "Anthology",
		Description: "Merge pull requests in 5 or more languages",
		Icon:        "globe",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			langs := make(map[string]struct{})
			for _, d := range draws {
				if d.Language != "" {
					langs[d.Language] = struct{}{}
				}
			}
			return len(langs) >= 5
		},
	},
	{
		Name:        "Midnight Draft",
		Description: "Merge a pull request between midnight and 5 AM",
		Icon:        "moon",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			for _, d := range draws {
				h := d.MergedAt.Hour()
				if h >= 0 && h < 5 {
					return true
				}
			}
			return false
		},
	},
	{
		Name:        "Fast Forward",
		Description: "Merge a pull request within 24 hours of drawing it",
		Icon:        "zap",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			for _, d := range draws {
				if d.MergedAt.Sub(d.CreatedAt) < 24*time.Hour {
					return true
				}
			}
			return false
		},
	},
	{
		Name:        "Daily Author",
		Description: "Maintain a 30-day contribution streak",
		Icon:        "flame",
		Check: func(_ []MergedDraw, user BadgeUser) bool {
			return user.LongestStreak >= 30
		},
	},
	{
		Name:        "Worldbuilder",
		Description: "Contribute to 10 or more different repositories",
		Icon:        "map",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			repos := make(map[string]struct{})
			for _, d := range draws {
				key := d.RepoOwner + "/" + d.RepoName
				repos[key] = struct{}{}
			}
			return len(repos) >= 10
		},
	},
	{
		Name:        "Proofreader",
		Description: "Merge 10 pull requests with a bug label",
		Icon:        "bug",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			count := 0
			for _, d := range draws {
				if hasLabelContaining(d.Labels, "bug") {
					count++
				}
			}
			return count >= 10
		},
	},
	{
		Name:        "The Archivist",
		Description: "Merge 10 pull requests with a documentation label",
		Icon:        "file-text",
		Check: func(draws []MergedDraw, _ BadgeUser) bool {
			count := 0
			for _, d := range draws {
				if hasLabelContaining(d.Labels, "doc") {
					count++
				}
			}
			return count >= 10
		},
	},
}

func hasLabelContaining(labels []string, substr string) bool {
	for _, l := range labels {
		if strings.Contains(strings.ToLower(l), substr) {
			return true
		}
	}
	return false
}

// BadgeStore is the interface for badge-related database operations.
// Method signatures match the sqlc-generated Queries methods exactly.
type BadgeStore interface {
	UpsertBadge(ctx context.Context, arg database.UpsertBadgeParams) error
	GetBadgeByName(ctx context.Context, name string) (database.Badge, error)
	AwardBadge(ctx context.Context, arg database.AwardBadgeParams) (database.UserBadge, error)
	GetUserBadgeNames(ctx context.Context, userID int64) ([]string, error)
	GetUserMergedDrawsWithIssues(ctx context.Context, userID int64) ([]database.GetUserMergedDrawsWithIssuesRow, error)
}

// BadgeService handles badge initialization and awarding.
type BadgeService struct {
	store BadgeStore
}

// NewBadgeService creates a new BadgeService.
func NewBadgeService(store BadgeStore) *BadgeService {
	return &BadgeService{store: store}
}

// InitializeBadges upserts all badge definitions into the database.
func (s *BadgeService) InitializeBadges(ctx context.Context) error {
	for _, bd := range BadgeDefs {
		err := s.store.UpsertBadge(ctx, database.UpsertBadgeParams{
			Name:        bd.Name,
			Description: bd.Description,
			Icon:        bd.Icon,
		})
		if err != nil {
			return fmt.Errorf("upsert badge %q: %w", bd.Name, err)
		}
	}
	return nil
}

// CheckBadges evaluates all badge conditions for a user and awards any newly earned badges.
// It returns the names of newly awarded badges.
func (s *BadgeService) CheckBadges(ctx context.Context, userID int64, user BadgeUser) ([]string, error) {
	// Get existing badge names
	existing, err := s.store.GetUserBadgeNames(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user badge names: %w", err)
	}
	owned := make(map[string]struct{}, len(existing))
	for _, name := range existing {
		owned[name] = struct{}{}
	}

	// Load merged draws with issue data
	rows, err := s.store.GetUserMergedDrawsWithIssues(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get merged draws: %w", err)
	}

	draws := make([]MergedDraw, 0, len(rows))
	for _, r := range rows {
		d := MergedDraw{
			ID:        r.ID,
			RepoOwner: r.RepoOwner,
			RepoName:  r.RepoName,
			Labels:    r.Labels,
		}
		if r.CreatedAt.Valid {
			d.CreatedAt = r.CreatedAt.Time
		}
		if r.MergedAt.Valid {
			d.MergedAt = r.MergedAt.Time
		}
		if r.Language.Valid {
			d.Language = r.Language.String
		}
		draws = append(draws, d)
	}

	var awarded []string
	for _, bd := range BadgeDefs {
		if _, already := owned[bd.Name]; already {
			continue
		}
		if !bd.Check(draws, user) {
			continue
		}

		// Look up badge ID
		badge, err := s.store.GetBadgeByName(ctx, bd.Name)
		if err != nil {
			return awarded, fmt.Errorf("get badge %q: %w", bd.Name, err)
		}

		_, err = s.store.AwardBadge(ctx, database.AwardBadgeParams{
			UserID:  userID,
			BadgeID: badge.ID,
			DrawID:  pgtype.Int8{Valid: false},
		})
		if err != nil {
			return awarded, fmt.Errorf("award badge %q: %w", bd.Name, err)
		}
		awarded = append(awarded, bd.Name)
	}

	return awarded, nil
}
