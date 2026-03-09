package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/nishantg96/gitfable/internal/config"
	"github.com/nishantg96/gitfable/internal/database"
	isync "github.com/nishantg96/gitfable/internal/sync"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	queries := database.New(pool)
	svc := isync.NewSyncService(queries, cfg.GitHubToken, cfg.SyncRepoAllowlist, cfg.SyncInterval, cfg.StaleInterval)

	slog.Info("starting one-time sync")
	if err := svc.RunOnce(ctx); err != nil {
		slog.Error("sync failed", "error", err)
		os.Exit(1)
	}

	openCount, err := queries.CountOpenIssues(ctx)
	if err == nil {
		slog.Info("sync complete", "open_issues", openCount)
	}
}
