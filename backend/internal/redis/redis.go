package redis

import (
	"context"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

func NewClient(ctx context.Context, redisURL string) *redis.Client {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Warn("invalid redis URL, rate limiting will use in-memory fallback", "error", err)
		return nil
	}

	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Warn("redis connection failed, rate limiting will use in-memory fallback", "error", err)
		return nil
	}

	slog.Info("redis connected", "addr", opts.Addr)
	return client
}
