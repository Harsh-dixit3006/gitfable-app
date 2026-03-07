package service

import "testing"

func TestCalcLevel(t *testing.T) {
	tests := []struct {
		xp    int
		level int
	}{
		{0, 1},
		{499, 1},
		{500, 2},
		{999, 2},
		{1000, 3},
		{5000, 11},
	}
	for _, tt := range tests {
		if got := CalcLevel(tt.xp); got != tt.level {
			t.Errorf("CalcLevel(%d) = %d, want %d", tt.xp, got, tt.level)
		}
	}
}
