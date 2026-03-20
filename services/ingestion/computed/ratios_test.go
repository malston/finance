package computed_test

import (
	"context"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/computed"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

// fakeLatestStore implements computed.LatestValueStore for testing.
type fakeLatestStore struct {
	values map[string]float64
	times  map[string]time.Time
}

func (f *fakeLatestStore) LatestValue(ctx context.Context, ticker string) (float64, time.Time, error) {
	val, ok := f.values[ticker]
	if !ok {
		return 0, time.Time{}, nil
	}
	return val, f.times[ticker], nil
}

func TestComputeRatio_CalculatesCorrectly(t *testing.T) {
	s := &fakeLatestStore{
		values: map[string]float64{
			"SPY": 520.00,
			"RSP": 160.00,
		},
		times: map[string]time.Time{
			"SPY": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
			"RSP": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
		},
	}

	point, err := computed.ComputeRatio(context.Background(), s, "SPY", "RSP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedRatio := 520.00 / 160.00 // 3.25
	if point.Value != expectedRatio {
		t.Errorf("Value = %f, want %f", point.Value, expectedRatio)
	}
	if point.Ticker != "SPY_RSP_RATIO" {
		t.Errorf("Ticker = %q, want %q", point.Ticker, "SPY_RSP_RATIO")
	}
	if point.Source != "computed" {
		t.Errorf("Source = %q, want %q", point.Source, "computed")
	}
}

func TestComputeRatio_ErrorsOnZeroDenominator(t *testing.T) {
	s := &fakeLatestStore{
		values: map[string]float64{
			"SPY": 520.00,
			"RSP": 0,
		},
		times: map[string]time.Time{
			"SPY": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
			"RSP": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
		},
	}

	_, err := computed.ComputeRatio(context.Background(), s, "SPY", "RSP")
	if err == nil {
		t.Fatal("expected error for zero denominator, got nil")
	}
}

func TestComputeRatio_ErrorsOnMissingNumerator(t *testing.T) {
	s := &fakeLatestStore{
		values: map[string]float64{
			"RSP": 160.00,
		},
		times: map[string]time.Time{
			"RSP": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
		},
	}

	_, err := computed.ComputeRatio(context.Background(), s, "SPY", "RSP")
	if err == nil {
		t.Fatal("expected error for missing numerator, got nil")
	}
}

func TestComputeRatio_ErrorsOnMissingDenominator(t *testing.T) {
	s := &fakeLatestStore{
		values: map[string]float64{
			"SPY": 520.00,
		},
		times: map[string]time.Time{
			"SPY": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
		},
	}

	_, err := computed.ComputeRatio(context.Background(), s, "SPY", "RSP")
	if err == nil {
		t.Fatal("expected error for missing denominator, got nil")
	}
}

func TestComputeRatio_UsesLatestTimestamp(t *testing.T) {
	spyTime := time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC)
	rspTime := time.Date(2026, 3, 20, 15, 5, 0, 0, time.UTC) // 5 min later

	s := &fakeLatestStore{
		values: map[string]float64{
			"SPY": 520.00,
			"RSP": 160.00,
		},
		times: map[string]time.Time{
			"SPY": spyTime,
			"RSP": rspTime,
		},
	}

	point, err := computed.ComputeRatio(context.Background(), s, "SPY", "RSP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should use the later timestamp
	if !point.Time.Equal(rspTime) {
		t.Errorf("Time = %v, want %v (the later of the two)", point.Time, rspTime)
	}
}

func TestComputeRatio_ReturnsTimeSeriesPoint(t *testing.T) {
	s := &fakeLatestStore{
		values: map[string]float64{
			"SPY": 520.00,
			"RSP": 160.00,
		},
		times: map[string]time.Time{
			"SPY": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
			"RSP": time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
		},
	}

	point, err := computed.ComputeRatio(context.Background(), s, "SPY", "RSP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the returned type matches store.TimeSeriesPoint
	var _ store.TimeSeriesPoint = *point
}
