package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

type WebhookHandler struct {
	pool          *pgxpool.Pool
	queries       *database.Queries
	webhookSecret string
}

func NewWebhookHandler(
	pool *pgxpool.Pool,
	queries *database.Queries,
	webhookSecret string,
) *WebhookHandler {
	return &WebhookHandler{
		pool:          pool,
		queries:       queries,
		webhookSecret: webhookSecret,
	}
}

func (h *WebhookHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/github", h.GitHub)
	return r
}

// GitHub handles POST /github — GitHub webhook endpoint for PR merge events.
func (h *WebhookHandler) GitHub(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Read raw body for signature verification.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("read webhook body", "error", err)
		InternalError(w)
		return
	}

	// 2. Verify HMAC-SHA256 signature.
	signature := r.Header.Get("X-Hub-Signature-256")
	if !service.VerifyWebhookSignature(body, signature, h.webhookSecret) {
		Unauthorized(w)
		return
	}

	// 3. Parse JSON payload.
	var payload struct {
		Action      string `json:"action"`
		PullRequest struct {
			Merged         bool   `json:"merged"`
			HTMLURL        string `json:"html_url"`
			MergeCommitSHA string `json:"merge_commit_sha"`
		} `json:"pull_request"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid JSON payload")
		return
	}

	// Only process closed+merged PRs.
	if payload.Action != "closed" || !payload.PullRequest.Merged {
		OK(w, map[string]any{"ignored": true, "reason": "not a merged PR"})
		return
	}

	prURL := payload.PullRequest.HTMLURL
	mergeCommitSHA := payload.PullRequest.MergeCommitSHA

	// 4. Find draw by PR URL.
	draw, err := h.queries.GetDrawByPRURL(ctx, pgtype.Text{String: prURL, Valid: true})
	if err != nil {
		// No matching draw — this PR is not tracked by GitFable.
		slog.Info("webhook: no draw found for PR URL", "pr_url", prURL)
		OK(w, map[string]any{"ignored": true, "reason": "no matching draw"})
		return
	}

	// 5. Use shared merge service for transactional merge.
	result, err := service.CompleteMerge(ctx, h.pool, h.queries, service.MergeParams{
		DrawID:         draw.ID,
		UserID:         draw.UserID,
		IssueID:        draw.IssueID,
		Source:         draw.Source,
		MergeCommitSHA: mergeCommitSHA,
		RewardSource:   "webhook",
	})
	if err != nil {
		if errors.Is(err, service.ErrAlreadyMerged) {
			slog.Info("webhook: draw already merged or status changed", "draw_id", draw.ID)
			OK(w, map[string]any{"ignored": true, "reason": "draw already merged"})
			return
		}
		slog.Error("webhook: complete merge", "error", err)
		InternalError(w)
		return
	}

	// 6. Return success.
	OK(w, map[string]any{
		"draw_id":    uuidToString(result.Draw.PublicID),
		"xp_awarded": result.XPAwarded,
		"new_badges": result.NewBadges,
	})
}
