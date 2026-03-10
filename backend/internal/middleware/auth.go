package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/handler"
	"github.com/nishantg96/gitfable/internal/supabase"
)

type AuthMiddleware struct {
	sb      *supabase.Client
	queries *database.Queries
}

func NewAuthMiddleware(sb *supabase.Client, q *database.Queries) *AuthMiddleware {
	return &AuthMiddleware{sb: sb, queries: q}
}

func (a *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			handler.Unauthorized(w)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		tokenInfo, err := a.sb.VerifyToken(r.Context(), token)
		if err != nil {
			handler.Unauthorized(w)
			return
		}

		// Use new GetUserByAuthID query
		user, err := a.queries.GetUserByAuthID(r.Context(), tokenInfo.UID)
		if err != nil {
			handler.Unauthorized(w)
			return
		}

		if user.Status != database.UserStatusActive {
			handler.Forbidden(w, "Account is disabled")
			return
		}

		ctx := ctxutil.SetUser(r.Context(), &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserFromContext extracts the authenticated user from the context.
func UserFromContext(ctx context.Context) *database.User {
	return ctxutil.UserFromContext(ctx)
}
