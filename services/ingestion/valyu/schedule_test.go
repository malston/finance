package valyu_test

import (
	"testing"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/valyu"
)

func TestIsMarketHours_DuringTradingHours(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 18, 10, 30, 0, 0, loc)
	if !valyu.IsMarketHours(ts) {
		t.Error("expected true for 10:30 AM ET on Wednesday")
	}
}

func TestIsMarketHours_BeforeOpen(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 18, 9, 0, 0, 0, loc)
	if valyu.IsMarketHours(ts) {
		t.Error("expected false for 9:00 AM ET")
	}
}

func TestIsMarketHours_AfterClose(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 18, 16, 1, 0, 0, loc)
	if valyu.IsMarketHours(ts) {
		t.Error("expected false for 4:01 PM ET")
	}
}

func TestIsMarketHours_ExactOpen(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 18, 9, 30, 0, 0, loc)
	if !valyu.IsMarketHours(ts) {
		t.Error("expected true for exactly 9:30 AM ET")
	}
}

func TestIsMarketHours_ExactClose(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 18, 16, 0, 0, 0, loc)
	if valyu.IsMarketHours(ts) {
		t.Error("expected false for exactly 4:00 PM ET")
	}
}

func TestIsMarketHours_Weekend(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 21, 11, 0, 0, 0, loc)
	if valyu.IsMarketHours(ts) {
		t.Error("expected false on Saturday")
	}
}

func TestIsMarketHours_Sunday(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("tzdata not available")
	}
	ts := time.Date(2026, 3, 22, 11, 0, 0, 0, loc)
	if valyu.IsMarketHours(ts) {
		t.Error("expected false on Sunday")
	}
}

func TestIsMarketHours_UTCInput(t *testing.T) {
	ts := time.Date(2026, 3, 18, 14, 0, 0, 0, time.UTC)
	if !valyu.IsMarketHours(ts) {
		t.Error("expected true for 2:00 PM UTC (10:00 AM ET)")
	}
}
