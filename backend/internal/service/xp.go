package service

import (
	"context"

	"github.com/nishantg96/gitfable/internal/database"
)

type XPStore interface {
	GetUserByID(ctx context.Context, id int64) (database.User, error)
	UpdateUserXP(ctx context.Context, arg database.UpdateUserXPParams) (database.User, error)
}

type XPService struct {
	store XPStore
}

func NewXPService(store XPStore) *XPService {
	return &XPService{store: store}
}

func CalcLevel(xp int) int {
	return (xp / 500) + 1
}

func (s *XPService) AwardXP(ctx context.Context, userID int64, amount int) (newXP, newLevel int, err error) {
	user, err := s.store.GetUserByID(ctx, userID)
	if err != nil {
		return 0, 0, err
	}

	newXP = int(user.Xp) + amount
	newLevel = CalcLevel(newXP)

	_, err = s.store.UpdateUserXP(ctx, database.UpdateUserXPParams{
		ID:    userID,
		Xp:    int32(newXP),
		Level: int32(newLevel),
	})
	return newXP, newLevel, err
}
