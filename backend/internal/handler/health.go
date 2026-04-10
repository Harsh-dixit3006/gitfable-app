package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthCheck represents a health check response
type HealthCheck struct {
	Status string `json:"status" example:"healthy"`
}

// ReadinessCheck represents a readiness check response
type ReadinessCheck struct {
	Status string `json:"status" example:"ready"`
}

type HealthHandler struct {
	Pool            *pgxpool.Pool
	Redis           *redis.Client
	OAuthConfigured bool
	DevLoginEnabled bool
}

func (h *HealthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/health", h.Health)
	r.Get("/ready", h.Ready)
	return r
}

// Health godoc
// @Summary     Health check
// @Description Returns the health status of the API
// @Tags        health
// @Accept      json
// @Produce     json
// @Success     200 {object} HealthCheck
// @Router      /health [get]
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	OK(w, map[string]string{"status": "healthy"})
}

// Ready godoc
// @Summary     Readiness check
// @Description Returns the readiness status including database and Redis connectivity
// @Tags        health
// @Accept      json
// @Produce     json
// @Success     200 {object} ReadinessCheck
// @Failure     503 {object} Response
// @Router      /ready [get]
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

// Config returns client-facing feature flags (auth mode, etc.).
func (h *HealthHandler) Config(w http.ResponseWriter, r *http.Request) {
	OK(w, map[string]any{
		"oauth_configured":  h.OAuthConfigured,
		"dev_login_enabled": h.DevLoginEnabled,
	})
}
