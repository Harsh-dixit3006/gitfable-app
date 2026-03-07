package seed

import (
	"context"
	"log/slog"

	"github.com/nishantg96/gitfable/internal/database"
)

// SeedDatabase is a no-op now that the sync pipeline provides real issues.
// Kept as a stub so the server main.go call doesn't need to change.
func SeedDatabase(ctx context.Context, queries *database.Queries) error {
	slog.Info("seed: skipped (mock data removed, sync pipeline provides real issues)")
	return nil
}
