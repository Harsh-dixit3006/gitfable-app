package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nishantg96/gitfable/internal/handler"
	goredis "github.com/redis/go-redis/v9"
)

type RateLimiter struct {
	redis  *goredis.Client
	local  map[string][]time.Time
	mu     sync.Mutex
	limits map[string]rateConfig
	done   chan struct{}
}

type rateConfig struct {
	requests int
	window   time.Duration
}

func NewRateLimiter(redisClient *goredis.Client) *RateLimiter {
	rl := &RateLimiter{
		redis: redisClient,
		local: make(map[string][]time.Time),
		done:  make(chan struct{}),
		limits: map[string]rateConfig{
			"auth":    {requests: 10, window: time.Minute},
			"draws":   {requests: 5, window: time.Minute},
			"default": {requests: 100, window: time.Minute},
		},
	}
	// Periodic cleanup of stale in-memory rate limit entries.
	if redisClient == nil {
		go rl.cleanupLoop()
	}
	return rl
}

// Close stops the cleanup goroutine.
func (rl *RateLimiter) Close() {
	close(rl.done)
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-rl.done:
			return
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for key, timestamps := range rl.local {
				valid := timestamps[:0]
				for _, t := range timestamps {
					if now.Sub(t) < 2*time.Minute {
						valid = append(valid, t)
					}
				}
				if len(valid) == 0 {
					delete(rl.local, key)
				} else {
					rl.local[key] = valid
				}
			}
			rl.mu.Unlock()
		}
	}
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		category := rl.categorize(r.URL.Path)
		clientID := rl.clientID(r)
		key := fmt.Sprintf("ratelimit:%s:%s", clientID, category)

		cfg := rl.limits[category]
		remaining, resetAt, allowed := rl.check(r.Context(), key, cfg)

		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(resetAt, 10))

		if !allowed {
			w.Header().Set("Retry-After", strconv.FormatInt(resetAt-time.Now().Unix(), 10))
			handler.Error(w, http.StatusTooManyRequests, handler.ErrCodeRateLimited, "Rate limit exceeded")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (rl *RateLimiter) categorize(path string) string {
	if strings.Contains(path, "/auth") {
		return "auth"
	}
	if strings.Contains(path, "/draws") {
		return "draws"
	}
	return "default"
}

func (rl *RateLimiter) clientID(r *http.Request) string {
	if user := UserFromContext(r.Context()); user != nil {
		return fmt.Sprintf("user:%d", user.ID)
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.Split(xff, ",")[0]
	}
	return r.RemoteAddr
}

func (rl *RateLimiter) check(ctx context.Context, key string, cfg rateConfig) (remaining int, resetAt int64, allowed bool) {
	now := time.Now()
	resetAt = now.Add(cfg.window).Unix()

	if rl.redis != nil {
		return rl.checkRedis(ctx, key, cfg, now)
	}
	return rl.checkLocal(key, cfg, now)
}

func (rl *RateLimiter) checkRedis(ctx context.Context, key string, cfg rateConfig, now time.Time) (int, int64, bool) {
	pipe := rl.redis.Pipeline()
	windowStart := now.Add(-cfg.window)

	pipe.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%d", windowStart.UnixNano()))
	pipe.ZAdd(ctx, key, goredis.Z{Score: float64(now.UnixNano()), Member: now.UnixNano()})
	countCmd := pipe.ZCard(ctx, key)
	pipe.Expire(ctx, key, cfg.window)

	if _, err := pipe.Exec(ctx); err != nil {
		return cfg.requests, now.Add(cfg.window).Unix(), true
	}

	count := int(countCmd.Val())
	remaining := cfg.requests - count
	if remaining < 0 {
		remaining = 0
	}
	return remaining, now.Add(cfg.window).Unix(), count <= cfg.requests
}

func (rl *RateLimiter) checkLocal(key string, cfg rateConfig, now time.Time) (int, int64, bool) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	windowStart := now.Add(-cfg.window)
	timestamps := rl.local[key]

	valid := timestamps[:0]
	for _, t := range timestamps {
		if t.After(windowStart) {
			valid = append(valid, t)
		}
	}
	valid = append(valid, now)
	rl.local[key] = valid

	remaining := cfg.requests - len(valid)
	if remaining < 0 {
		remaining = 0
	}
	return remaining, now.Add(cfg.window).Unix(), len(valid) <= cfg.requests
}
