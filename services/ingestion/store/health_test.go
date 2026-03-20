package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

// mockPool implements a minimal interface for testing the health store logic
// without a real database. The integration test covers real DB behavior.

func TestSourceHealth_StructFields(t *testing.T) {
	h := store.SourceHealth{
		Source:              "finnhub",
		LastSuccess:         time.Now(),
		LastError:           nil,
		LastErrorMsg:        nil,
		ConsecutiveFailures: 0,
	}

	if h.Source != "finnhub" {
		t.Errorf("Source = %q, want %q", h.Source, "finnhub")
	}
	if h.ConsecutiveFailures != 0 {
		t.Errorf("ConsecutiveFailures = %d, want 0", h.ConsecutiveFailures)
	}
}

func TestSourceHealth_WithError(t *testing.T) {
	now := time.Now()
	errMsg := "connection refused"
	h := store.SourceHealth{
		Source:              "fred",
		LastSuccess:         now.Add(-1 * time.Hour),
		LastError:           &now,
		LastErrorMsg:        &errMsg,
		ConsecutiveFailures: 3,
	}

	if h.LastError == nil {
		t.Fatal("LastError should not be nil")
	}
	if *h.LastErrorMsg != "connection refused" {
		t.Errorf("LastErrorMsg = %q, want %q", *h.LastErrorMsg, "connection refused")
	}
	if h.ConsecutiveFailures != 3 {
		t.Errorf("ConsecutiveFailures = %d, want 3", h.ConsecutiveFailures)
	}
}

func TestIsStale(t *testing.T) {
	tests := []struct {
		name      string
		last      time.Time
		threshold time.Duration
		want      bool
	}{
		{
			name:      "not stale when within threshold",
			last:      time.Now().Add(-10 * time.Minute),
			threshold: 15 * time.Minute,
			want:      false,
		},
		{
			name:      "stale when past threshold",
			last:      time.Now().Add(-20 * time.Minute),
			threshold: 15 * time.Minute,
			want:      true,
		},
		{
			name:      "stale when exactly at threshold",
			last:      time.Now().Add(-15 * time.Minute),
			threshold: 15 * time.Minute,
			want:      true,
		},
		{
			name:      "FRED not stale within 24h",
			last:      time.Now().Add(-23 * time.Hour),
			threshold: 24 * time.Hour,
			want:      false,
		},
		{
			name:      "FRED stale after 24h",
			last:      time.Now().Add(-25 * time.Hour),
			threshold: 24 * time.Hour,
			want:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := store.IsStale(tt.last, tt.threshold)
			if got != tt.want {
				t.Errorf("IsStale() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsStale_ZeroTime(t *testing.T) {
	// Zero time should always be stale
	got := store.IsStale(time.Time{}, 15*time.Minute)
	if !got {
		t.Error("IsStale(zero time) = false, want true")
	}
}

func TestUpdateSourceHealth_RequiresNonEmptySource(t *testing.T) {
	s := store.New(nil)
	err := s.UpdateSourceHealth(context.Background(), "", nil)
	if err == nil {
		t.Fatal("expected error for empty source, got nil")
	}
}
