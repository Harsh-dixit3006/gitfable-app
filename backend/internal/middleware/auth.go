package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/firebase"
	"github.com/nishantg96/gitfable/internal/handler"
)

type ctxKeyUser struct{}

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

		ctx := context.WithValue(r.Context(), ctxKeyUser{}, &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserFromContext(ctx context.Context) *database.User {
	user, _ := ctx.Value(ctxKeyUser{}).(*database.User)
	return user
}
