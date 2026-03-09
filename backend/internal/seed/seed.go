package seed

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

func SeedDatabase(ctx context.Context, queries *database.Queries) error {
	overrides, err := parseDailyDrawLimitOverrides(os.Getenv("SEED_DAILY_DRAW_LIMITS"))
	if err != nil {
		return err
	}
	if len(overrides) == 0 {
		slog.Info("seed: skipped (no draw limit overrides configured)")
		return nil
	}

	for username, limit := range overrides {
		if _, err := queries.UpdateUserDailyDrawLimitByUsername(ctx, database.UpdateUserDailyDrawLimitByUsernameParams{
			Lower:          username,
			DailyDrawLimit: pgInt4(limit),
		}); err != nil {
			return fmt.Errorf("seed draw limit override for %s: %w", username, err)
		}
		slog.Info("seed: applied daily draw limit override", "username", username, "daily_draw_limit", limit)
	}

	return nil
}

func parseDailyDrawLimitOverrides(raw string) (map[string]int32, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return map[string]int32{}, nil
	}

	overrides := make(map[string]int32)
	for _, part := range strings.Split(raw, ",") {
		entry := strings.TrimSpace(part)
		pieces := strings.Split(entry, ":")
		if len(pieces) != 2 {
			return nil, fmt.Errorf("invalid SEED_DAILY_DRAW_LIMITS entry %q, expected username:limit", entry)
		}

		username := strings.TrimSpace(pieces[0])
		limitText := strings.TrimSpace(pieces[1])
		limit, err := strconv.Atoi(limitText)
		if err != nil {
			return nil, fmt.Errorf("invalid draw limit %q for %s", limitText, username)
		}
		if username == "" || limit <= 0 {
			return nil, fmt.Errorf("invalid SEED_DAILY_DRAW_LIMITS entry %q", entry)
		}

		overrides[strings.ToLower(username)] = int32(limit)
	}
	return overrides, nil
}

func pgInt4(v int32) pgtype.Int4 {
	return pgtype.Int4{Int32: v, Valid: true}
}
