package seed

import "testing"

func TestParseDailyDrawLimitOverrides_ParsesValidEntries(t *testing.T) {
	overrides, err := parseDailyDrawLimitOverrides("nishantg96:5,tester:7")
	if err != nil {
		t.Fatalf("parseDailyDrawLimitOverrides() error = %v", err)
	}

	if got := overrides["nishantg96"]; got != 5 {
		t.Fatalf("override for nishantg96 = %d, want 5", got)
	}
	if got := overrides["tester"]; got != 7 {
		t.Fatalf("override for tester = %d, want 7", got)
	}
}

func TestParseDailyDrawLimitOverrides_RejectsInvalidFormat(t *testing.T) {
	if _, err := parseDailyDrawLimitOverrides("broken-entry"); err == nil {
		t.Fatal("parseDailyDrawLimitOverrides() error = nil, want invalid format error")
	}
}

func TestParseDailyDrawLimitOverrides_RejectsNonPositiveValues(t *testing.T) {
	if _, err := parseDailyDrawLimitOverrides("nishantg96:0"); err == nil {
		t.Fatal("parseDailyDrawLimitOverrides() error = nil, want non-positive value error")
	}
}
