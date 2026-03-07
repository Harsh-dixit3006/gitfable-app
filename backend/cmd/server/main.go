package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/nishantg96/gitfable/internal/config"
	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/firebase"
	"github.com/nishantg96/gitfable/internal/handler"
	mw "github.com/nishantg96/gitfable/internal/middleware"
	goredis "github.com/nishantg96/gitfable/internal/redis"
	"github.com/nishantg96/gitfable/internal/seed"
	"github.com/nishantg96/gitfable/internal/service"
	isync "github.com/nishantg96/gitfable/internal/sync"
)

func main() {
	// 1. Load config.
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// 2. Configure structured logging.
	var logHandler slog.Handler
	if cfg.IsProduction() {
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	slog.SetDefault(slog.New(logHandler))

	slog.Info("starting GitFable API", "port", cfg.Port, "env", cfg.Environment)

	ctx := context.Background()

	// 3. Connect pgxpool.
	pool, err := database.NewPool(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	slog.Info("database connected")

	// 4. Run migrations in dev.
	if !cfg.IsProduction() {
		migrationsPath := getEnv("MIGRATIONS_PATH", "sql/migrations")
		if err := database.RunMigrations(cfg.DatabaseURL, migrationsPath); err != nil {
			slog.Error("failed to run migrations", "error", err)
			os.Exit(1)
		}
	}

	// 5. Create sqlc Queries from pool.
	queries := database.New(pool)

	// 6. Initialize Firebase client.
	fbClient, err := firebase.NewClient(ctx, cfg.FirebaseCredentialsPath)
	if err != nil {
		slog.Error("failed to initialize firebase", "error", err)
		os.Exit(1)
	}
	slog.Info("firebase initialized")

	// 7. Initialize Redis client (can be nil).
	redisClient := goredis.NewClient(ctx, cfg.RedisURL)

	// 8. Create services.
	xpService := service.NewXPService(queries)
	badgeService := service.NewBadgeService(queries)
	streakService := service.NewStreakService(queries)
	githubClient := service.NewGitHubClient()
	issueChecker := service.NewIssueChecker(redisClient)

	// 9. Initialize badges in DB.
	if err := badgeService.InitializeBadges(ctx); err != nil {
		slog.Error("failed to initialize badges", "error", err)
		os.Exit(1)
	}
	slog.Info("badges initialized")

	// 9b. Seed database in non-production.
	if !cfg.IsProduction() {
		if err := seed.SeedDatabase(ctx, queries); err != nil {
			slog.Error("failed to seed database", "error", err)
			os.Exit(1)
		}
	}

	// 9c. Start issue sync service.
	if cfg.SyncEnabled {
		syncService := isync.NewSyncService(queries, cfg.GitHubToken, cfg.SyncInterval, cfg.StaleInterval)
		syncService.Start(ctx)
		defer syncService.Stop()
	}

	// 10. Create middleware.
	authMiddleware := mw.NewAuthMiddleware(fbClient, queries)
	rateLimiter := mw.NewRateLimiter(redisClient)
	defer rateLimiter.Close()

	// 11. Create handlers.
	healthHandler := &handler.HealthHandler{
		Pool:  pool,
		Redis: redisClient,
	}

	authHandler := &handler.AuthHandler{
		Queries:        queries,
		FB:             fbClient,
		RequireAuth:    authMiddleware.RequireAuth,
		UserFromContext: ctxutil.UserFromContext,
	}

	drawHandler := handler.NewDrawHandler(
		pool,
		queries,
		authMiddleware.RequireAuth,
		xpService,
		badgeService,
		streakService,
		githubClient,
		issueChecker,
	)

	usersHandler := &handler.UsersHandler{
		Queries:     queries,
		RequireAuth: authMiddleware.RequireAuth,
	}

	publicHandler := &handler.PublicHandler{
		Queries: queries,
	}

	webhookHandler := handler.NewWebhookHandler(
		pool,
		queries,
		cfg.GitHubWebhookSecret,
		xpService,
		badgeService,
		streakService,
	)

	// 12. Build Chi router.
	r := chi.NewRouter()

	// Global middleware.
	r.Use(mw.RequestID)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		ExposedHeaders:   []string{"X-RateLimit-Remaining", "X-RateLimit-Reset"},
		AllowCredentials: true,
	}))
	r.Use(mw.LimitRequestSize)
	r.Use(mw.SecurityHeaders)
	r.Use(rateLimiter.Middleware)
	r.Use(mw.Logger)

	// Health (no version prefix).
	r.Get("/health", healthHandler.Health)
	r.Get("/ready", healthHandler.Ready)

	// API v1.
	r.Route("/api/v1", func(r chi.Router) {
		r.Mount("/auth", authHandler.Routes())
		r.Mount("/draws", drawHandler.Routes())
		r.Mount("/users", usersHandler.Routes())
		r.Get("/issues", publicHandler.ListIssues)
		r.Get("/leaderboard", publicHandler.Leaderboard)
		r.Get("/stats", publicHandler.Stats)
		r.Get("/activity", publicHandler.Activity)
		r.Mount("/webhooks", webhookHandler.Routes())
	})

	// 13. Start HTTP server with graceful shutdown.
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	sigCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-sigCtx.Done()
	slog.Info("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
	slog.Info("server stopped")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
