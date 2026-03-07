package sync

import "strings"

// Difficulty level constants.
const (
	DifficultyBeginner     = "Beginner"
	DifficultyIntermediate = "Intermediate"
	DifficultyAdvanced     = "Advanced"
)

// Label lists for each difficulty tier. Exported so callers can reconfigure.
var (
	BeginnerLabels     = []string{"good first issue", "beginner", "easy", "starter", "first-timers-only"}
	IntermediateLabels = []string{"help wanted", "medium", "intermediate"}
	AdvancedLabels     = []string{"advanced", "hard", "expert", "complex"}
)

// Star thresholds for repo complexity modifier. Exported for configurability.
var (
	SmallRepoMaxStars int32 = 1000
	LargeRepoMinStars int32 = 50000
)

// ScoreDifficulty returns a difficulty string ("Beginner", "Intermediate", or
// "Advanced") based on issue labels and repository star count.
func ScoreDifficulty(labels []string, repoStars int32) string {
	// Step 1: Label score (0-2), default 1.
	labelScore := labelScore(labels)

	// Step 2: Repo complexity modifier.
	modifier := repoModifier(repoStars)

	// Step 3: Clamp and map.
	raw := labelScore + modifier
	if raw < 0 {
		raw = 0
	}
	if raw > 2 {
		raw = 2
	}

	switch raw {
	case 0:
		return DifficultyBeginner
	case 2:
		return DifficultyAdvanced
	default:
		return DifficultyIntermediate
	}
}

// labelScore checks labels in priority order: beginner (0), advanced (2), intermediate (1).
// Returns 1 (intermediate) if no matching label is found.
func labelScore(labels []string) int {
	lower := make([]string, len(labels))
	for i, l := range labels {
		lower[i] = strings.ToLower(l)
	}

	// Priority: beginner first.
	for _, bl := range BeginnerLabels {
		for _, l := range lower {
			if l == bl {
				return 0
			}
		}
	}

	// Then advanced.
	for _, al := range AdvancedLabels {
		for _, l := range lower {
			if l == al {
				return 2
			}
		}
	}

	// Then intermediate.
	for _, il := range IntermediateLabels {
		for _, l := range lower {
			if l == il {
				return 1
			}
		}
	}

	// Default: intermediate.
	return 1
}

// repoModifier returns -1, 0, or +1 based on star count thresholds.
func repoModifier(stars int32) int {
	switch {
	case stars < SmallRepoMaxStars:
		return -1
	case stars > LargeRepoMinStars:
		return 1
	default:
		return 0
	}
}
