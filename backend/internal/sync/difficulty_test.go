package sync

import "testing"

func TestScoreDifficulty(t *testing.T) {
	tests := []struct {
		name      string
		labels    []string
		repoStars int32
		want      string
	}{
		// Label-only (mid-range stars)
		{"good first issue on mid repo", []string{"good first issue", "bug"}, 5000, "Beginner"},
		{"beginner label", []string{"beginner"}, 5000, "Beginner"},
		{"easy label", []string{"easy"}, 5000, "Beginner"},
		{"starter label", []string{"starter"}, 5000, "Beginner"},
		{"first-timers-only label", []string{"first-timers-only"}, 5000, "Beginner"},
		{"help wanted on mid repo", []string{"help wanted"}, 5000, "Intermediate"},
		{"medium label", []string{"medium"}, 5000, "Intermediate"},
		{"advanced label", []string{"advanced"}, 5000, "Advanced"},
		{"hard label", []string{"hard"}, 5000, "Advanced"},
		{"expert label", []string{"expert"}, 5000, "Advanced"},
		{"complex label", []string{"complex"}, 5000, "Advanced"},
		{"no matching label", []string{"bug", "enhancement"}, 5000, "Intermediate"},
		// Star modifiers
		{"good first issue on small repo", []string{"good first issue"}, 300, "Beginner"},
		{"good first issue on huge repo", []string{"good first issue"}, 120000, "Intermediate"},
		{"help wanted on small repo", []string{"help wanted"}, 500, "Beginner"},
		{"help wanted on huge repo", []string{"help wanted"}, 80000, "Advanced"},
		{"advanced on small repo", []string{"advanced"}, 200, "Intermediate"},
		{"advanced on huge repo", []string{"advanced"}, 200000, "Advanced"},
		// Clamping
		{"beginner on tiny repo clamps to 0", []string{"beginner"}, 10, "Beginner"},
		{"advanced on massive repo clamps to 2", []string{"advanced"}, 500000, "Advanced"},
		// Empty/nil labels
		{"empty labels mid repo", []string{}, 5000, "Intermediate"},
		{"nil labels mid repo", nil, 5000, "Intermediate"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ScoreDifficulty(tt.labels, tt.repoStars)
			if got != tt.want {
				t.Errorf("ScoreDifficulty(%v, %d) = %q, want %q", tt.labels, tt.repoStars, got, tt.want)
			}
		})
	}
}

func TestScoreRarity(t *testing.T) {
	tests := []struct {
		name      string
		repoStars int32
		want      string
	}{
		{"tiny repo", 100, RarityCommon},
		{"small repo", 999, RarityCommon},
		{"borderline rare", 1000, RarityRare},
		{"mid repo", 5000, RarityRare},
		{"borderline epic", 10000, RarityEpic},
		{"popular repo", 30000, RarityEpic},
		{"borderline legendary", 50000, RarityLegendary},
		{"mega repo", 200000, RarityLegendary},
		{"zero stars", 0, RarityCommon},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ScoreRarity(tt.repoStars)
			if got != tt.want {
				t.Errorf("ScoreRarity(%d) = %q, want %q", tt.repoStars, got, tt.want)
			}
		})
	}
}
