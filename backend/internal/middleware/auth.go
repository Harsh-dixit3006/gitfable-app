package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nishantg96/gitfable/internal/auth"
	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/handler"
)

type AuthMiddleware struct {
	jwt     *auth.JWTManager
	queries *database.Queries
}

func NewAuthMiddleware(jwt *auth.JWTManager, q *database.Queries) *AuthMiddleware {
	return &AuthMiddleware{jwt: jwt, queries: q}
}

func (a *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			handler.Unauthorized(w)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := a.jwt.Verify(token)
		if err != nil {
			handler.Unauthorized(w)
			return
		}

		// Only accept access tokens (reject registration/refresh tokens)
		if claims.TokenType != auth.TokenTypeAccess {
			handler.Unauthorized(w)
			return
		}

		user, err := a.queries.GetUserByAuthID(r.Context(), claims.Sub)
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
