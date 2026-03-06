package service

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

type StreakStore interface {
	GetUserByID(ctx context.Context, id int64) (database.User, error)
	UpdateUserStreak(ctx context.Context, arg database.UpdateUserStreakParams) error
}

type StreakService struct {
	store StreakStore
}

func NewStreakService(store StreakStore) *StreakService {
	return &StreakService{store: store}
}

func CalcStreak(currentStreak, longestStreak int, lastContrib, now time.Time) (newCurrent, newLongest int) {
	if lastContrib.IsZero() {
		return 1, max(longestStreak, 1)
	}

	hours := now.Sub(lastContrib).Hours()

	switch {
	case hours < 24:
		return currentStreak, longestStreak
	case hours < 48:
		newCurrent = currentStreak + 1
	default:
		newCurrent = 1
	}

	newLongest = max(longestStreak, newCurrent)
	return newCurrent, newLongest
}

func (s *StreakService) UpdateStreak(ctx context.Context, userID int64) error {
	user, err := s.store.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	var lastContrib time.Time
	if user.LastContributionDate.Valid {
		lastContrib = user.LastContributionDate.Time
	}

	now := time.Now()
	newCurrent, newLongest := CalcStreak(int(user.CurrentStreak), int(user.LongestStreak), lastContrib, now)

	return s.store.UpdateUserStreak(ctx, database.UpdateUserStreakParams{
		ID:                   userID,
		CurrentStreak:        int32(newCurrent),
		LongestStreak:        int32(newLongest),
		LastContributionDate: pgtype.Timestamptz{Time: now, Valid: true},
	})
}
