package fred_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/fred"
)

func TestFetchSeries_ParsesObservations(t *testing.T) {
	// Real HTTP server (httptest.Server), not a mock
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("series_id") != "BAMLH0A0HYM2" {
			t.Errorf("unexpected series_id: %s", r.URL.Query().Get("series_id"))
		}
		if r.URL.Query().Get("file_type") != "json" {
			t.Errorf("expected file_type=json, got %s", r.URL.Query().Get("file_type"))
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"observations": [
				{"date": "2026-01-15", "value": "3.80"},
				{"date": "2026-01-16", "value": "3.85"},
				{"date": "2026-01-17", "value": "."}
			]
		}`)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "test-key",
	})

	obs, err := c.FetchSeries(context.Background(), "BAMLH0A0HYM2", "2026-01-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should skip the "." observation (missing data marker in FRED)
	if len(obs) != 2 {
		t.Fatalf("expected 2 observations, got %d", len(obs))
	}

	expectedDate1 := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	if !obs[0].Date.Equal(expectedDate1) {
		t.Errorf("obs[0].Date = %v, want %v", obs[0].Date, expectedDate1)
	}
	if obs[0].Value != 3.80 {
		t.Errorf("obs[0].Value = %f, want 3.80", obs[0].Value)
	}

	if obs[1].Value != 3.85 {
		t.Errorf("obs[1].Value = %f, want 3.85", obs[1].Value)
	}
}

func TestFetchSeries_HandlesHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "test-key",
	})

	_, err := c.FetchSeries(context.Background(), "BAMLH0A0HYM2", "2026-01-15")
	if err == nil {
		t.Fatal("expected error for HTTP 500, got nil")
	}
}

func TestFetchSeries_HandlesInvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{invalid json}`)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "test-key",
	})

	_, err := c.FetchSeries(context.Background(), "BAMLH0A0HYM2", "2026-01-15")
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestFetchSeries_EmptyObservations(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": []}`)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "test-key",
	})

	obs, err := c.FetchSeries(context.Background(), "BAMLH0A0HYM2", "2026-01-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(obs) != 0 {
		t.Fatalf("expected 0 observations, got %d", len(obs))
	}
}

func TestFetchSeries_SendsAPIKeyWhenProvided(t *testing.T) {
	var receivedKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedKey = r.URL.Query().Get("api_key")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": []}`)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "my-fred-key",
	})

	_, err := c.FetchSeries(context.Background(), "TEST", "2026-01-01")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedKey != "my-fred-key" {
		t.Errorf("expected api_key=my-fred-key, got %s", receivedKey)
	}
}

func TestFetchSeries_OmitsAPIKeyWhenEmpty(t *testing.T) {
	var receivedKey string
	var hasKey bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedKey = r.URL.Query().Get("api_key")
		hasKey = r.URL.Query().Has("api_key")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": []}`)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "",
	})

	_, err := c.FetchSeries(context.Background(), "TEST", "2026-01-01")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hasKey {
		t.Errorf("expected no api_key param, got %q", receivedKey)
	}
}

func TestFetchSeries_HTTP429ReturnsRetryableError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test-key"})

	_, err := c.FetchSeries(context.Background(), "DGS10", "2026-01-01")
	if err == nil {
		t.Fatal("expected error for HTTP 429, got nil")
	}

	var retryErr *fred.RetryableError
	if !errors.As(err, &retryErr) {
		t.Fatalf("expected RetryableError, got %T: %v", err, err)
	}
	if retryErr.StatusCode != 429 {
		t.Errorf("StatusCode = %d, want 429", retryErr.StatusCode)
	}
}

func TestFetchSeries_HTTP5xxReturnsRetryableError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test-key"})

	_, err := c.FetchSeries(context.Background(), "DGS10", "2026-01-01")
	if err == nil {
		t.Fatal("expected error for HTTP 502, got nil")
	}

	var retryErr *fred.RetryableError
	if !errors.As(err, &retryErr) {
		t.Fatalf("expected RetryableError, got %T: %v", err, err)
	}
	if retryErr.StatusCode != 502 {
		t.Errorf("StatusCode = %d, want 502", retryErr.StatusCode)
	}
}

func TestFetchSeries_HTTP400IsNotRetryable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test-key"})

	_, err := c.FetchSeries(context.Background(), "DGS10", "2026-01-01")
	if err == nil {
		t.Fatal("expected error for HTTP 400, got nil")
	}

	var retryErr *fred.RetryableError
	if errors.As(err, &retryErr) {
		t.Fatalf("HTTP 400 should NOT be a RetryableError, but got one: %v", retryErr)
	}
}

func TestFetchSeries_RespectsContext(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"observations": []}`)
	}))
	defer srv.Close()

	c := fred.NewClient(fred.Config{
		BaseURL: srv.URL,
		APIKey:  "",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := c.FetchSeries(ctx, "TEST", "2026-01-01")
	if err == nil {
		t.Fatal("expected context deadline error, got nil")
	}
}
