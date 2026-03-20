package finnhub_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/finnhub"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

func TestFetchQuote_ParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("symbol") != "NVDA" {
			t.Errorf("expected symbol=NVDA, got %q", r.URL.Query().Get("symbol"))
		}
		if r.URL.Query().Get("token") != "test-key" {
			t.Errorf("expected token=test-key, got %q", r.URL.Query().Get("token"))
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"c":875.50,"d":-2.30,"dp":-0.26,"h":880.00,"l":870.00,"o":878.00,"pc":877.80,"t":1710000000}`)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{
		BaseURL: srv.URL,
		APIKey:  "test-key",
	})

	quote, err := client.FetchQuote(context.Background(), "NVDA")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if quote.CurrentPrice != 875.50 {
		t.Errorf("CurrentPrice = %f, want 875.50", quote.CurrentPrice)
	}
	if quote.Timestamp != 1710000000 {
		t.Errorf("Timestamp = %d, want 1710000000", quote.Timestamp)
	}
}

func TestFetchQuote_ReturnsErrorOnHTTPFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	_, err := client.FetchQuote(context.Background(), "NVDA")
	if err == nil {
		t.Fatal("expected error for 429 response, got nil")
	}
}

func TestFetchQuote_ReturnsErrorOnNullPrice(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Finnhub returns 0 for unknown symbols
		fmt.Fprint(w, `{"c":0,"d":null,"dp":null,"h":0,"l":0,"o":0,"pc":0,"t":0}`)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	_, err := client.FetchQuote(context.Background(), "INVALID")
	if err == nil {
		t.Fatal("expected error for zero price, got nil")
	}
}

func TestFetchQuote_RespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"c":100,"t":1710000000}`)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := client.FetchQuote(ctx, "NVDA")
	if err == nil {
		t.Fatal("expected context deadline error, got nil")
	}
}

func TestFetchQuotes_ReturnsPointsForMultipleTickers(t *testing.T) {
	prices := map[string]float64{
		"NVDA": 875.50,
		"MSFT": 425.00,
		"SPY":  520.30,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sym := r.URL.Query().Get("symbol")
		price, ok := prices[sym]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]interface{}{
			"c": price,
			"t": 1710000000,
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	points, err := client.FetchQuotes(context.Background(), []string{"NVDA", "MSFT", "SPY"}, 10*time.Millisecond)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(points) != 3 {
		t.Fatalf("expected 3 points, got %d", len(points))
	}

	pointMap := make(map[string]store.TimeSeriesPoint)
	for _, p := range points {
		pointMap[p.Ticker] = p
	}

	for ticker, expectedPrice := range prices {
		p, ok := pointMap[ticker]
		if !ok {
			t.Errorf("missing point for ticker %s", ticker)
			continue
		}
		if p.Value != expectedPrice {
			t.Errorf("ticker %s: Value = %f, want %f", ticker, p.Value, expectedPrice)
		}
		if p.Source != "finnhub" {
			t.Errorf("ticker %s: Source = %q, want %q", ticker, p.Source, "finnhub")
		}
	}
}

func TestFetchQuotes_RateLimitsRequests(t *testing.T) {
	var requestCount atomic.Int32
	var timestamps []time.Time

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		timestamps = append(timestamps, time.Now())
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"c":100.00,"t":1710000000}`)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	rateDelay := 50 * time.Millisecond
	start := time.Now()
	_, err := client.FetchQuotes(context.Background(), []string{"A", "B", "C"}, rateDelay)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// With 3 tickers and 50ms delay between each, should take at least 100ms (2 delays between 3 requests)
	minExpected := 2 * rateDelay
	if elapsed < minExpected {
		t.Errorf("elapsed %v, expected at least %v (rate limiting)", elapsed, minExpected)
	}

	if requestCount.Load() != 3 {
		t.Errorf("expected 3 requests, got %d", requestCount.Load())
	}
}

func TestFetchQuotes_SkipsFailedTickersAndContinues(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sym := r.URL.Query().Get("symbol")
		if sym == "INVALID" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"c":100.00,"t":1710000000}`)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	points, err := client.FetchQuotes(context.Background(), []string{"NVDA", "INVALID", "MSFT"}, 10*time.Millisecond)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should get 2 points (INVALID skipped)
	if len(points) != 2 {
		t.Fatalf("expected 2 points (INVALID skipped), got %d", len(points))
	}

	tickers := make(map[string]bool)
	for _, p := range points {
		tickers[p.Ticker] = true
	}
	if tickers["INVALID"] {
		t.Error("INVALID ticker should have been skipped")
	}
	if !tickers["NVDA"] || !tickers["MSFT"] {
		t.Errorf("expected NVDA and MSFT, got %v", tickers)
	}
}

func TestFetchQuotes_RespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"c":100.00,"t":1710000000}`)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test-key"})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, err := client.FetchQuotes(ctx, []string{"NVDA", "MSFT"}, 10*time.Millisecond)
	if err == nil {
		t.Fatal("expected context cancellation error, got nil")
	}
}
