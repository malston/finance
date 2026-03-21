package valyu_test

import (
	"context"
	"testing"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/store"
	"github.com/malston/financial-risk-monitor/services/ingestion/valyu"
)

type fakeStore struct {
	values map[string]float64
	times  map[string]time.Time
	points []store.TimeSeriesPoint
}

func (f *fakeStore) LatestValue(ctx context.Context, ticker string) (float64, time.Time, error) {
	val, ok := f.values[ticker]
	if !ok {
		return 0, time.Time{}, nil
	}
	return val, f.times[ticker], nil
}

func (f *fakeStore) WritePoints(ctx context.Context, points []store.TimeSeriesPoint) error {
	f.points = append(f.points, points...)
	return nil
}

func (f *fakeStore) LatestTimestamp(ctx context.Context, ticker string) (time.Time, error) {
	ts, ok := f.times[ticker]
	if !ok {
		return time.Time{}, nil
	}
	return ts, nil
}

func TestComputeAvgDiscount_CalculatesCorrectly(t *testing.T) {
	now := time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC)
	s := &fakeStore{
		values: map[string]float64{"OWL": 18.00, "ARCC": 20.00, "BXSL": 26.00, "OBDC": 13.00},
		times:  map[string]time.Time{"OWL": now, "ARCC": now, "BXSL": now, "OBDC": now},
	}

	navs := []valyu.NAVData{
		{Ticker: "OWL", NAVPerShare: 20.00},
		{Ticker: "ARCC", NAVPerShare: 22.00},
		{Ticker: "BXSL", NAVPerShare: 28.00},
		{Ticker: "OBDC", NAVPerShare: 15.00},
	}

	point, err := valyu.ComputeAvgDiscount(context.Background(), s, navs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedAvg := ((18.0-20.0)/20.0 + (20.0-22.0)/22.0 + (26.0-28.0)/28.0 + (13.0-15.0)/15.0) / 4.0
	if abs(point.Value-expectedAvg) > 0.0001 {
		t.Errorf("Value = %f, want %f", point.Value, expectedAvg)
	}
	if point.Ticker != "BDC_AVG_NAV_DISCOUNT" {
		t.Errorf("Ticker = %q, want %q", point.Ticker, "BDC_AVG_NAV_DISCOUNT")
	}
	if point.Source != "computed" {
		t.Errorf("Source = %q, want %q", point.Source, "computed")
	}
}

func TestComputeAvgDiscount_ErrorsOnMissingMarketPrice(t *testing.T) {
	s := &fakeStore{
		values: map[string]float64{"ARCC": 20.00},
		times:  map[string]time.Time{"ARCC": time.Now()},
	}
	navs := []valyu.NAVData{{Ticker: "OWL", NAVPerShare: 20.00}, {Ticker: "ARCC", NAVPerShare: 22.00}}
	_, err := valyu.ComputeAvgDiscount(context.Background(), s, navs)
	if err == nil {
		t.Fatal("expected error for missing market price, got nil")
	}
}

func TestComputeAvgDiscount_ErrorsOnZeroNAV(t *testing.T) {
	s := &fakeStore{
		values: map[string]float64{"OWL": 18.00},
		times:  map[string]time.Time{"OWL": time.Now()},
	}
	navs := []valyu.NAVData{{Ticker: "OWL", NAVPerShare: 0}}
	_, err := valyu.ComputeAvgDiscount(context.Background(), s, navs)
	if err == nil {
		t.Fatal("expected error for zero NAV, got nil")
	}
}

func TestComputeAvgDiscount_ErrorsOnEmptyNAVs(t *testing.T) {
	s := &fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}
	_, err := valyu.ComputeAvgDiscount(context.Background(), s, []valyu.NAVData{})
	if err == nil {
		t.Fatal("expected error for empty NAVs, got nil")
	}
}

func TestComputeAvgDiscount_PremiumValues(t *testing.T) {
	s := &fakeStore{
		values: map[string]float64{"OWL": 22.00},
		times:  map[string]time.Time{"OWL": time.Now()},
	}
	navs := []valyu.NAVData{{Ticker: "OWL", NAVPerShare: 20.00}}
	point, err := valyu.ComputeAvgDiscount(context.Background(), s, navs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := (22.0 - 20.0) / 20.0
	if abs(point.Value-expected) > 0.0001 {
		t.Errorf("Value = %f, want %f (positive premium)", point.Value, expected)
	}
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
