package ctxutil

import (
	"context"

	"github.com/nishantg96/gitfable/internal/database"
)

type ctxKeyUser struct{}

// SetUser stores the user in the context.
func SetUser(ctx context.Context, user *database.User) context.Context {
	return context.WithValue(ctx, ctxKeyUser{}, user)
}

// UserFromContext extracts the authenticated user from the context.
func UserFromContext(ctx context.Context) *database.User {
	user, _ := ctx.Value(ctxKeyUser{}).(*database.User)
	return user
}
