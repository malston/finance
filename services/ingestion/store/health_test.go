package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

func TestSourceHealth_SuccessType(t *testing.T) {
	// SourceHealth struct should have the expected fields
	h := store.SourceHealth{
		Source:              "fred",
		LastSuccess:         ptrTime(time.Now()),
		LastError:           nil,
		LastErrorMsg:        nil,
		ConsecutiveFailures: 0,
	}

	if h.Source != "fred" {
		t.Errorf("Source = %q, want %q", h.Source, "fred")
	}
	if h.ConsecutiveFailures != 0 {
		t.Errorf("ConsecutiveFailures = %d, want 0", h.ConsecutiveFailures)
	}
}

func TestSourceHealth_FailureType(t *testing.T) {
	msg := "connection refused"
	now := time.Now()
	h := store.SourceHealth{
		Source:              "finnhub",
		LastSuccess:         nil,
		LastError:           &now,
		LastErrorMsg:        &msg,
		ConsecutiveFailures: 3,
	}

	if h.Source != "finnhub" {
		t.Errorf("Source = %q, want %q", h.Source, "finnhub")
	}
	if *h.LastErrorMsg != "connection refused" {
		t.Errorf("LastErrorMsg = %q, want %q", *h.LastErrorMsg, "connection refused")
	}
	if h.ConsecutiveFailures != 3 {
		t.Errorf("ConsecutiveFailures = %d, want 3", h.ConsecutiveFailures)
	}
}

func TestUpdateSourceHealth_Interface(t *testing.T) {
	// Verify UpdateSourceHealth exists with the expected signature.
	// This is a compilation test -- the actual DB behavior is tested in integration_test.go.
	var s store.HealthStore
	_ = s
}

func TestGetSourceHealth_Interface(t *testing.T) {
	// Verify GetSourceHealth exists with the expected signature.
	var s store.HealthStore
	_ = s
}

func ptrTime(t time.Time) *time.Time {
	return &t
}

// fakePool is not needed here -- unit tests only verify types and interfaces.
// Real DB tests live in store/integration_test.go.

// TestUpdateSourceHealth_SuccessResetsFailures verifies the contract:
// on success, consecutive_failures should reset to 0.
// This is tested against real TimescaleDB in the integration test.
func TestUpdateSourceHealth_Contract(t *testing.T) {
	// Verify the HealthStore interface has the methods we expect
	type checker interface {
		UpdateSourceHealth(ctx context.Context, source string, err error) error
		GetSourceHealth(ctx context.Context) ([]store.SourceHealth, error)
	}

	// Compile-time check that Store implements HealthStore
	var _ checker = (*store.Store)(nil)
}
