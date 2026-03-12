package handler

import (
	"context"
	"testing"
)

func TestConnectTestDB_ReturnsErrorWhenDatabaseUnavailable(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	_, err := connectTestDB(ctx, "postgresql://gitfable:gitfable@nonexistent.invalid:5432/gitfable?sslmode=disable&connect_timeout=1")
	if err == nil {
		t.Fatal("expected error when database is unavailable")
	}
}
