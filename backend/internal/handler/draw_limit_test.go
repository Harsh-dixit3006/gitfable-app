package handler

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

func TestEffectiveDailyDrawLimit_UsesUserOverrideWhenPresent(t *testing.T) {
	user := database.User{
		DailyDrawLimit: pgtype.Int4{Int32: 7, Valid: true},
	}

	if got := effectiveDailyDrawLimit(user, 3); got != 7 {
		t.Fatalf("effectiveDailyDrawLimit() = %d, want 7", got)
	}
}

func TestEffectiveDailyDrawLimit_FallsBackToDefault(t *testing.T) {
	user := database.User{}

	if got := effectiveDailyDrawLimit(user, 3); got != 3 {
		t.Fatalf("effectiveDailyDrawLimit() = %d, want 3", got)
	}
}

func TestRemainingDraws_NeverGoesNegative(t *testing.T) {
	if got := remainingDraws(5, 7); got != 0 {
		t.Fatalf("remainingDraws() = %d, want 0", got)
	}
}
