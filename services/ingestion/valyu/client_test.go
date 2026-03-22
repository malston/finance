package valyu_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/valyu"
)

func TestSearchFilings_ParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("x-api-key") != "test-key" {
			t.Errorf("expected x-api-key test-key, got %q", r.Header.Get("x-api-key"))
		}

		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		if body["query"] == nil {
			t.Error("expected query field in request body")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{
					"title":   "Blue Owl Capital 10-Q Q3 2026",
					"content": "Net Asset Value per share: $15.42. PIK loans represent 8.2% of total portfolio.",
					"url":     "https://www.sec.gov/Archives/edgar/data/0001823945/filing.htm",
				},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})

	results, err := client.SearchFilings(context.Background(), "OWL 10-Q quarterly filing NAV")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Title != "Blue Owl Capital 10-Q Q3 2026" {
		t.Errorf("Title = %q, want %q", results[0].Title, "Blue Owl Capital 10-Q Q3 2026")
	}
	if results[0].Content == "" {
		t.Error("expected non-empty Content")
	}
	if results[0].URL != "https://www.sec.gov/Archives/edgar/data/0001823945/filing.htm" {
		t.Errorf("URL = %q, want SEC EDGAR URL", results[0].URL)
	}
}

func TestSearchFilings_ReturnsErrorOnHTTPFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	_, err := client.SearchFilings(context.Background(), "OWL 10-Q")
	if err == nil {
		t.Fatal("expected error for 500 response, got nil")
	}
}

func TestSearchFilings_ReturnsErrorOnUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "bad-key"})
	_, err := client.SearchFilings(context.Background(), "OWL 10-Q")
	if err == nil {
		t.Fatal("expected error for 401 response, got nil")
	}
}

func TestSearchFilings_RespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := client.SearchFilings(ctx, "OWL 10-Q")
	if err == nil {
		t.Fatal("expected context deadline error, got nil")
	}
}

func TestSearchNews_ParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "BDC defaults spike", "content": "Multiple BDCs reported defaults...", "url": "https://example.com/1"},
				{"title": "CLO headwinds", "content": "CLO market stress signals...", "url": "https://example.com/2"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	results, err := client.SearchNews(context.Background(), "private_credit")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
}

func TestSearchNews_ReturnsErrorOnHTTPFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	_, err := client.SearchNews(context.Background(), "private_credit")
	if err == nil {
		t.Fatal("expected error for 503 response, got nil")
	}
}

func TestSearchInsiderTrades_ParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Form 4: John Doe - NVDA - Sale", "content": "John Doe sold 10000 shares at $875.50", "url": "https://www.sec.gov/cgi-bin/browse-edgar"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	results, err := client.SearchInsiderTrades(context.Background(), "NVDA")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
}

func TestSearchInsiderTrades_ReturnsErrorOnHTTPFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	_, err := client.SearchInsiderTrades(context.Background(), "NVDA")
	if err == nil {
		t.Fatal("expected error for 429 response, got nil")
	}
}

func TestSearchFilings_HandlesEmptyResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"results": []map[string]interface{}{}})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	results, err := client.SearchFilings(context.Background(), "nonexistent filing")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}

func TestSearchFilings_SendsCorrectRequestBody(t *testing.T) {
	var receivedBody map[string]interface{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"results":[]}`)
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	_, err := client.SearchFilings(context.Background(), "OWL 10-Q quarterly filing NAV")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	query, ok := receivedBody["query"].(string)
	if !ok || query != "OWL 10-Q quarterly filing NAV" {
		t.Errorf("query = %v, want %q", receivedBody["query"], "OWL 10-Q quarterly filing NAV")
	}
	searchType, ok := receivedBody["search_type"].(string)
	if !ok || searchType != "all" {
		t.Errorf("search_type = %v, want %q", receivedBody["search_type"], "all")
	}
}
