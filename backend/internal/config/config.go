package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment string
	Port        int

	DatabaseURL string
	DBPoolSize  int

	FirebaseCredentialsPath string
	FirebaseProjectID       string
	FirebasePrivateKey      string
	FirebaseClientEmail     string

	RedisURL         string
	RateLimitEnabled bool

	GitHubWebhookSecret string

	CORSOrigins []string
	FrontendURL string

	GitHubToken   string
	SyncInterval  time.Duration
	StaleInterval time.Duration
	SyncEnabled   bool
}

func Load() (*Config, error) {
	cfg := &Config{
		Environment: getEnv("ENVIRONMENT", "development"),
		Port:        getEnvInt("PORT", 8001),

		DatabaseURL: getEnv("DATABASE_URL", "postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable"),
		DBPoolSize:  getEnvInt("DB_POOL_SIZE", 25),

		FirebaseCredentialsPath: getEnv("FIREBASE_SERVICE_ACCOUNT_PATH", ""),
		FirebaseProjectID:       getEnv("FIREBASE_PROJECT_ID", ""),
		FirebasePrivateKey:      strings.ReplaceAll(getEnv("FIREBASE_PRIVATE_KEY", ""), "\\n", "\n"),
		FirebaseClientEmail:     getEnv("FIREBASE_CLIENT_EMAIL", ""),

		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379"),
		RateLimitEnabled: getEnvBool("RATE_LIMIT_ENABLED", true),

		GitHubWebhookSecret: getEnv("GITHUB_WEBHOOK_SECRET", ""),

		CORSOrigins: parseCSV(getEnv("CORS_ORIGINS", "")),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),

		GitHubToken:   getEnv("GITHUB_TOKEN", ""),
		SyncInterval:  getEnvDuration("SYNC_INTERVAL", 6*time.Hour),
		StaleInterval: getEnvDuration("STALE_INTERVAL", 12*time.Hour),
		SyncEnabled:   getEnvBool("SYNC_ENABLED", true),
	}

	if cfg.IsProduction() && len(cfg.CORSOrigins) == 0 {
		return nil, fmt.Errorf("CORS_ORIGINS must be set in production")
	}

	return cfg, nil
}

func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		return strings.ToLower(v) == "true"
	}
	return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func parseCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			result = append(result, t)
		}
	}
	return result
}
