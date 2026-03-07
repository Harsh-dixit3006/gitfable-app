package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	Pool  *pgxpool.Pool
	Redis *redis.Client
}

func (h *HealthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/health", h.Health)
	r.Get("/ready", h.Ready)
	return r
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	OK(w, map[string]string{"status": "healthy"})
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if err := h.Pool.Ping(ctx); err != nil {
		Error(w, http.StatusServiceUnavailable, ErrCodeInternal, "Database is not ready")
		return
	}

	if h.Redis != nil {
		if err := h.Redis.Ping(ctx).Err(); err != nil {
			Error(w, http.StatusServiceUnavailable, ErrCodeInternal, "Redis is not ready")
			return
		}
	}

	OK(w, map[string]string{"status": "ready"})
}
