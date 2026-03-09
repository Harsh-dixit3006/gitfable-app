package handler

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

func TestChooseStatusAndExpiry_BookmarkImmediately(t *testing.T) {
	status, expiresAt := chooseStatusAndExpiry(true, time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC))

	if status != database.DrawStatusBookmarked {
		t.Fatalf("chooseStatusAndExpiry() status = %q, want %q", status, database.DrawStatusBookmarked)
	}
	if !expiresAt.Valid {
		t.Fatal("chooseStatusAndExpiry() expiresAt should be valid when bookmarking immediately")
	}
}

func TestChooseStatusAndExpiry_DrawOnly(t *testing.T) {
	status, expiresAt := chooseStatusAndExpiry(false, time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC))

	if status != database.DrawStatusDrawn {
		t.Fatalf("chooseStatusAndExpiry() status = %q, want %q", status, database.DrawStatusDrawn)
	}
	if expiresAt != (pgtype.Timestamptz{}) {
		t.Fatalf("chooseStatusAndExpiry() expiresAt = %+v, want zero value", expiresAt)
	}
}

func TestChooseBookmarkReturnsLimitReachedAtFiveActiveItems(t *testing.T) {
	if got := activeBookmarkLimitReached(4); got {
		t.Fatal("activeBookmarkLimitReached(4) = true, want false")
	}
	if got := activeBookmarkLimitReached(5); !got {
		t.Fatal("activeBookmarkLimitReached(5) = false, want true")
	}
}

func TestChooseBookmarkSwapsExistingActiveWorkAtomically(t *testing.T) {
	if !isSwappableActiveStatus(database.DrawStatusBookmarked) {
		t.Fatal("bookmarked draw should be swappable")
	}
	if !isSwappableActiveStatus(database.DrawStatusPrSubmitted) {
		t.Fatal("pr_submitted draw should be swappable")
	}
	if isSwappableActiveStatus(database.DrawStatusMerged) {
		t.Fatal("merged draw should not be swappable")
	}
}

func TestDuplicateActiveIssueIsRejected(t *testing.T) {
	if !hasDuplicateActiveIssue(10, []database.ListActiveWorkForUserRow{{IssueID: 10}}) {
		t.Fatal("expected duplicate active issue to be detected")
	}
	if hasDuplicateActiveIssue(11, []database.ListActiveWorkForUserRow{{IssueID: 10}}) {
		t.Fatal("different issue should not be treated as duplicate")
	}
}
