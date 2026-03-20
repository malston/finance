package scheduler_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/fred"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/scheduler"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

// fakeStore implements scheduler.Store for testing without a real database.
type fakeStore struct {
	mu     sync.Mutex
	points []store.TimeSeriesPoint
	latest map[string]time.Time // ticker -> latest timestamp
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		latest: make(map[string]time.Time),
	}
}

func (f *fakeStore) WritePoints(ctx context.Context, pts []store.TimeSeriesPoint) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.points = append(f.points, pts...)
	for _, p := range pts {
		if existing, ok := f.latest[p.Ticker]; !ok || p.Time.After(existing) {
			f.latest[p.Ticker] = p.Time
		}
	}
	return nil
}

func (f *fakeStore) LatestTimestamp(ctx context.Context, ticker string) (time.Time, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if t, ok := f.latest[ticker]; ok {
		return t, nil
	}
	return time.Time{}, nil
}

func (f *fakeStore) getPoints() []store.TimeSeriesPoint {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]store.TimeSeriesPoint, len(f.points))
	copy(cp, f.points)
	return cp
}

func TestFetchOnce_IngestsMultipleSeries(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seriesID := r.URL.Query().Get("series_id")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"observations": [{"date": "2026-01-15", "value": "4.25"}]}`)
		_ = seriesID
	}))
	defer srv.Close()

	client := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test"})
	s := newFakeStore()

	series := []string{"DGS10", "DGS2", "T10Y2Y", "BAMLH0A0HYM2"}
	err := scheduler.FetchOnce(context.Background(), client, s, series, 180)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	points := s.getPoints()
	if len(points) != 4 {
		t.Fatalf("expected 4 points (one per series), got %d", len(points))
	}

	// Verify all tickers are present
	tickers := make(map[string]bool)
	for _, p := range points {
		tickers[p.Ticker] = true
		if p.Source != "fred" {
			t.Errorf("point.Source = %q, want %q", p.Source, "fred")
		}
	}
	for _, s := range series {
		if !tickers[s] {
			t.Errorf("missing ticker %q in stored points", s)
		}
	}
}

func TestFetchOnce_UsesIncrementalStartDate(t *testing.T) {
	var receivedStarts []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedStarts = append(receivedStarts, r.URL.Query().Get("observation_start"))
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": [{"date": "2026-03-15", "value": "4.00"}]}`)
	}))
	defer srv.Close()

	client := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test"})
	s := newFakeStore()

	// Pre-populate a latest timestamp for DGS10
	latestTime := time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)
	s.latest["DGS10"] = latestTime

	err := scheduler.FetchOnce(context.Background(), client, s, []string{"DGS10"}, 180)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(receivedStarts) != 1 {
		t.Fatalf("expected 1 request, got %d", len(receivedStarts))
	}

	// Incremental: should use latest + 1 day
	expected := "2026-03-11"
	if receivedStarts[0] != expected {
		t.Errorf("observation_start = %q, want %q (latest + 1 day)", receivedStarts[0], expected)
	}
}

func TestFetchOnce_SkipsSeriesOnRetryableError(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		seriesID := r.URL.Query().Get("series_id")
		if seriesID == "DGS10" {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": [{"date": "2026-01-15", "value": "3.80"}]}`)
	}))
	defer srv.Close()

	client := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test"})
	s := newFakeStore()

	// Should NOT return an error -- just skip the failed series and continue
	err := scheduler.FetchOnce(context.Background(), client, s, []string{"DGS10", "DGS2"}, 180)
	if err != nil {
		t.Fatalf("expected no error (retryable errors are logged, not fatal), got: %v", err)
	}

	points := s.getPoints()
	if len(points) != 1 {
		t.Fatalf("expected 1 point (DGS2 only, DGS10 skipped), got %d", len(points))
	}
	if points[0].Ticker != "DGS2" {
		t.Errorf("expected ticker DGS2, got %q", points[0].Ticker)
	}
}

func TestFetchOnce_HandlesEmptyObservations(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": []}`)
	}))
	defer srv.Close()

	client := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test"})
	s := newFakeStore()

	err := scheduler.FetchOnce(context.Background(), client, s, []string{"DGS10"}, 180)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	points := s.getPoints()
	if len(points) != 0 {
		t.Fatalf("expected 0 points for empty observations, got %d", len(points))
	}
}

func TestFetchOnce_SkipsMissingValueDots(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": [
			{"date": "2026-01-15", "value": "."},
			{"date": "2026-01-16", "value": "4.25"}
		]}`)
	}))
	defer srv.Close()

	client := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test"})
	s := newFakeStore()

	err := scheduler.FetchOnce(context.Background(), client, s, []string{"DGS10"}, 180)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	points := s.getPoints()
	if len(points) != 1 {
		t.Fatalf("expected 1 point (skipping '.'), got %d", len(points))
	}
	if points[0].Value != 4.25 {
		t.Errorf("Value = %f, want 4.25", points[0].Value)
	}
}
