package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/firebase"
	"github.com/nishantg96/gitfable/internal/handler"
)

type AuthMiddleware struct {
	fb      *firebase.Client
	queries *database.Queries
}

func NewAuthMiddleware(fb *firebase.Client, q *database.Queries) *AuthMiddleware {
	return &AuthMiddleware{fb: fb, queries: q}
}

func (a *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			handler.Unauthorized(w)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		tokenInfo, err := a.fb.VerifyToken(r.Context(), token)
		if err != nil {
			handler.Unauthorized(w)
			return
		}

		user, err := a.queries.GetUserByFirebaseUID(r.Context(), tokenInfo.UID)
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
// Deprecated: Use ctxutil.UserFromContext directly.
func UserFromContext(ctx context.Context) *database.User {
	return ctxutil.UserFromContext(ctx)
}
