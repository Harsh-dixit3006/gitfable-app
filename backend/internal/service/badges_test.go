package service

import (
	"testing"
	"time"
)

// helper to create a MergedDraw with defaults
func makeDraw(opts ...func(*MergedDraw)) MergedDraw {
	now := time.Now()
	d := MergedDraw{
		ID:        1,
		CreatedAt: now.Add(-48 * time.Hour),
		MergedAt:  now,
		RepoOwner: "owner",
		RepoName:  "repo",
		Language:  "Go",
		Labels:    nil,
	}
	for _, o := range opts {
		o(&d)
	}
	return d
}

func TestPrologue(t *testing.T) {
	badge := findBadge("Prologue")
	if badge == nil {
		t.Fatal("badge Prologue not found in BadgeDefs")
	}

	t.Run("no draws -> false", func(t *testing.T) {
		if badge.Check(nil, BadgeUser{}) {
			t.Error("expected false with no draws")
		}
	})

	t.Run("one draw -> true", func(t *testing.T) {
		draws := []MergedDraw{makeDraw()}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 1 draw")
		}
	})
}

func TestShortStory(t *testing.T) {
	badge := findBadge("Short Story")
	if badge == nil {
		t.Fatal("badge Short Story not found in BadgeDefs")
	}

	t.Run("2 draws -> false", func(t *testing.T) {
		draws := []MergedDraw{makeDraw(), makeDraw()}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false with 2 draws")
		}
	})

	t.Run("3 draws -> true", func(t *testing.T) {
		draws := []MergedDraw{makeDraw(), makeDraw(), makeDraw()}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 3 draws")
		}
	})
}

func TestMidnightDraft(t *testing.T) {
	badge := findBadge("Midnight Draft")
	if badge == nil {
		t.Fatal("badge Midnight Draft not found in BadgeDefs")
	}

	t.Run("merged at 3am -> true", func(t *testing.T) {
		mergedAt := time.Date(2025, 1, 1, 3, 0, 0, 0, time.UTC)
		draws := []MergedDraw{makeDraw(func(d *MergedDraw) {
			d.MergedAt = mergedAt
		})}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true for 3am merge")
		}
	})

	t.Run("merged at 6am -> false", func(t *testing.T) {
		mergedAt := time.Date(2025, 1, 1, 6, 0, 0, 0, time.UTC)
		draws := []MergedDraw{makeDraw(func(d *MergedDraw) {
			d.MergedAt = mergedAt
		})}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false for 6am merge")
		}
	})

	t.Run("merged at exactly 5am -> false", func(t *testing.T) {
		mergedAt := time.Date(2025, 1, 1, 5, 0, 0, 0, time.UTC)
		draws := []MergedDraw{makeDraw(func(d *MergedDraw) {
			d.MergedAt = mergedAt
		})}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false for exactly 5am merge")
		}
	})
}

func TestFastForward(t *testing.T) {
	badge := findBadge("Fast Forward")
	if badge == nil {
		t.Fatal("badge Fast Forward not found in BadgeDefs")
	}

	t.Run("merged 12h after creation -> true", func(t *testing.T) {
		created := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
		merged := created.Add(12 * time.Hour)
		draws := []MergedDraw{makeDraw(func(d *MergedDraw) {
			d.CreatedAt = created
			d.MergedAt = merged
		})}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true for 12h turnaround")
		}
	})

	t.Run("merged 25h after creation -> false", func(t *testing.T) {
		created := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
		merged := created.Add(25 * time.Hour)
		draws := []MergedDraw{makeDraw(func(d *MergedDraw) {
			d.CreatedAt = created
			d.MergedAt = merged
		})}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false for 25h turnaround")
		}
	})
}

func TestDailyAuthor(t *testing.T) {
	badge := findBadge("Daily Author")
	if badge == nil {
		t.Fatal("badge Daily Author not found in BadgeDefs")
	}

	t.Run("streak 29 -> false", func(t *testing.T) {
		if badge.Check(nil, BadgeUser{LongestStreak: 29}) {
			t.Error("expected false for streak 29")
		}
	})

	t.Run("streak 30 -> true", func(t *testing.T) {
		if !badge.Check(nil, BadgeUser{LongestStreak: 30}) {
			t.Error("expected true for streak 30")
		}
	})

	t.Run("streak 100 -> true", func(t *testing.T) {
		if !badge.Check(nil, BadgeUser{LongestStreak: 100}) {
			t.Error("expected true for streak 100")
		}
	})
}

func TestTheEpic(t *testing.T) {
	badge := findBadge("The Epic")
	if badge == nil {
		t.Fatal("badge The Epic not found in BadgeDefs")
	}

	t.Run("99 draws -> false", func(t *testing.T) {
		draws := make([]MergedDraw, 99)
		for i := range draws {
			draws[i] = makeDraw()
		}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false with 99 draws")
		}
	})

	t.Run("100 draws -> true", func(t *testing.T) {
		draws := make([]MergedDraw, 100)
		for i := range draws {
			draws[i] = makeDraw()
		}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 100 draws")
		}
	})
}

func TestAnthology(t *testing.T) {
	badge := findBadge("Anthology")
	if badge == nil {
		t.Fatal("badge Anthology not found in BadgeDefs")
	}

	t.Run("4 languages -> false", func(t *testing.T) {
		langs := []string{"Go", "Python", "Rust", "Java"}
		draws := make([]MergedDraw, len(langs))
		for i, l := range langs {
			lang := l
			draws[i] = makeDraw(func(d *MergedDraw) { d.Language = lang })
		}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false with 4 languages")
		}
	})

	t.Run("5 languages -> true", func(t *testing.T) {
		langs := []string{"Go", "Python", "Rust", "Java", "TypeScript"}
		draws := make([]MergedDraw, len(langs))
		for i, l := range langs {
			lang := l
			draws[i] = makeDraw(func(d *MergedDraw) { d.Language = lang })
		}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 5 languages")
		}
	})
}

func TestWorldbuilder(t *testing.T) {
	badge := findBadge("Worldbuilder")
	if badge == nil {
		t.Fatal("badge Worldbuilder not found in BadgeDefs")
	}

	t.Run("9 repos -> false", func(t *testing.T) {
		draws := make([]MergedDraw, 9)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.RepoOwner = "owner"
				d.RepoName = "repo" + string(rune('a'+i))
			})
		}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false with 9 repos")
		}
	})

	t.Run("10 repos -> true", func(t *testing.T) {
		draws := make([]MergedDraw, 10)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.RepoOwner = "owner"
				d.RepoName = "repo" + string(rune('a'+i))
			})
		}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 10 repos")
		}
	})
}

func TestProofreader(t *testing.T) {
	badge := findBadge("Proofreader")
	if badge == nil {
		t.Fatal("badge Proofreader not found in BadgeDefs")
	}

	t.Run("9 bug PRs -> false", func(t *testing.T) {
		draws := make([]MergedDraw, 9)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.Labels = []string{"bug"}
			})
		}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false with 9 bug PRs")
		}
	})

	t.Run("10 bug PRs -> true", func(t *testing.T) {
		draws := make([]MergedDraw, 10)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.Labels = []string{"bug"}
			})
		}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 10 bug PRs")
		}
	})

	t.Run("label contains bug substring -> true", func(t *testing.T) {
		draws := make([]MergedDraw, 10)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.Labels = []string{"bugfix"}
			})
		}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with bugfix labels")
		}
	})
}

func TestTheArchivist(t *testing.T) {
	badge := findBadge("The Archivist")
	if badge == nil {
		t.Fatal("badge The Archivist not found in BadgeDefs")
	}

	t.Run("9 docs PRs -> false", func(t *testing.T) {
		draws := make([]MergedDraw, 9)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.Labels = []string{"documentation"}
			})
		}
		if badge.Check(draws, BadgeUser{}) {
			t.Error("expected false with 9 docs PRs")
		}
	})

	t.Run("10 docs PRs -> true", func(t *testing.T) {
		draws := make([]MergedDraw, 10)
		for i := range draws {
			draws[i] = makeDraw(func(d *MergedDraw) {
				d.Labels = []string{"documentation"}
			})
		}
		if !badge.Check(draws, BadgeUser{}) {
			t.Error("expected true with 10 docs PRs")
		}
	})
}

// helper to find a badge by name
func findBadge(name string) *BadgeDef {
	for i := range BadgeDefs {
		if BadgeDefs[i].Name == name {
			return &BadgeDefs[i]
		}
	}
	return nil
}
