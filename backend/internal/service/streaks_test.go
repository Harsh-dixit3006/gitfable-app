package service

import (
	"testing"
	"time"
)

func TestCalcStreak(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name        string
		current     int
		longest     int
		lastContrib time.Time
		wantCurrent int
		wantLongest int
	}{
		{"first contribution", 0, 0, time.Time{}, 1, 1},
		{"within 24h no change", 5, 10, now.Add(-12 * time.Hour), 5, 10},
		{"next day increment", 5, 10, now.Add(-30 * time.Hour), 6, 10},
		{"next day new longest", 10, 10, now.Add(-30 * time.Hour), 11, 11},
		{"gap resets", 5, 10, now.Add(-72 * time.Hour), 1, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			current, longest := CalcStreak(tt.current, tt.longest, tt.lastContrib, now)
			if current != tt.wantCurrent || longest != tt.wantLongest {
				t.Errorf("CalcStreak() = (%d, %d), want (%d, %d)", current, longest, tt.wantCurrent, tt.wantLongest)
			}
		})
	}
}
