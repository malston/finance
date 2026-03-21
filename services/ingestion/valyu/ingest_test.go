package valyu_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/valyu"
)

func TestExtractNAV_FindsNAVInContent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	budget := valyu.NewBudgetTracker(100, 80)
	s := &fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}

	navs, err := valyu.FetchFilings(context.Background(), client, s, budget, []string{"OWL"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(navs) != 1 {
		t.Fatalf("expected 1 NAV result, got %d", len(navs))
	}
	if navs[0].NAVPerShare != 15.42 {
		t.Errorf("NAVPerShare = %f, want 15.42", navs[0].NAVPerShare)
	}
	if navs[0].Ticker != "OWL" {
		t.Errorf("Ticker = %q, want %q", navs[0].Ticker, "OWL")
	}
	if len(s.points) != 1 {
		t.Fatalf("expected 1 point written, got %d", len(s.points))
	}
	if s.points[0].Ticker != "NAV_OWL" {
		t.Errorf("written ticker = %q, want %q", s.points[0].Ticker, "NAV_OWL")
	}
	if s.points[0].Source != "valyu" {
		t.Errorf("written source = %q, want %q", s.points[0].Source, "valyu")
	}
}

func TestFetchFilings_SkipsOnNoNAV(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Unrelated", "content": "No NAV data here.", "url": "https://example.com"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(100, 80)
	s := &fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}

	navs, err := valyu.FetchFilings(context.Background(), client, s, budget, []string{"OWL"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(navs) != 0 {
		t.Errorf("expected 0 NAVs, got %d", len(navs))
	}
}

func TestFetchFilings_RespectsBudgetLimit(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Filing", "content": "NAV per share: $20.00", "url": "https://example.com"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(2, 1)
	s := &fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}

	valyu.FetchFilings(context.Background(), client, s, budget, []string{"OWL", "ARCC", "BXSL", "OBDC"})
	if callCount > 2 {
		t.Errorf("expected max 2 API calls (budget limit), got %d", callCount)
	}
}

func TestFetchFilings_SkipsOnAPIError(t *testing.T) {
	requestNum := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestNum++
		if requestNum == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Filing", "content": "NAV per share: $20.00", "url": "https://example.com"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(100, 80)
	s := &fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}

	navs, err := valyu.FetchFilings(context.Background(), client, s, budget, []string{"OWL", "ARCC"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(navs) != 1 {
		t.Errorf("expected 1 NAV (first failed, second succeeded), got %d", len(navs))
	}
}

func TestEstimateSentiment_NegativeTerms(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "BDC defaults spike as stress mounts, fear of recession", "content": "Increased defaults amid recession concerns.", "url": "https://example.com/1"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(100, 80)
	es := &fakeExtendedStore{fakeStore: fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}}

	err := valyu.FetchNewsSentiment(context.Background(), client, es, budget, []string{"private_credit"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(es.newsRows) != 1 {
		t.Fatalf("expected 1 news row, got %d", len(es.newsRows))
	}
	if es.newsRows[0].Sentiment >= 0 {
		t.Errorf("expected negative sentiment, got %f", es.newsRows[0].Sentiment)
	}
}

func TestFetchNewsSentiment_WritesDomainAggregate(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Tech growth rally continues", "content": "Innovation drives strong gains.", "url": "https://example.com/1"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(100, 80)
	es := &fakeExtendedStore{fakeStore: fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}}

	err := valyu.FetchNewsSentiment(context.Background(), client, es, budget, []string{"ai_tech"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	found := false
	for _, p := range es.points {
		if p.Ticker == "SENTIMENT_AI_TECH" {
			found = true
			if p.Source != "valyu" {
				t.Errorf("aggregate source = %q, want %q", p.Source, "valyu")
			}
		}
	}
	if !found {
		t.Error("expected SENTIMENT_AI_TECH point to be written")
	}
}

func TestFetchInsiderTrades_ParsesTradeData(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Form 4: John Doe - Sale", "content": "John Doe sold 10000 shares at $875.50 on March 15, 2026", "url": "https://www.sec.gov/cgi-bin/browse-edgar"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(100, 80)
	es := &fakeExtendedStore{fakeStore: fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}}

	err := valyu.FetchInsiderTrades(context.Background(), client, es, budget, []string{"NVDA"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(es.insiderRows) != 1 {
		t.Fatalf("expected 1 insider trade row, got %d", len(es.insiderRows))
	}
	row := es.insiderRows[0]
	if row.Ticker != "NVDA" {
		t.Errorf("Ticker = %q, want %q", row.Ticker, "NVDA")
	}
	if row.Shares != 10000 {
		t.Errorf("Shares = %d, want 10000", row.Shares)
	}
	if row.TradeType != "sell" {
		t.Errorf("TradeType = %q, want %q", row.TradeType, "sell")
	}
}

func TestExtractSourceName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"title": "Test headline", "content": "Test content with risk concern.", "url": "https://www.reuters.com/business/article-123"},
			},
		})
	}))
	defer srv.Close()

	client := valyu.NewClient(valyu.Config{BaseURL: srv.URL, APIKey: "test-key"})
	budget := valyu.NewBudgetTracker(100, 80)
	es := &fakeExtendedStore{fakeStore: fakeStore{values: map[string]float64{}, times: map[string]time.Time{}}}

	valyu.FetchNewsSentiment(context.Background(), client, es, budget, []string{"private_credit"})
	if len(es.newsRows) == 0 {
		t.Fatal("expected at least 1 news row")
	}
	if es.newsRows[0].SourceName != "reuters.com" {
		t.Errorf("SourceName = %q, want %q", es.newsRows[0].SourceName, "reuters.com")
	}
}

type fakeExtendedStore struct {
	fakeStore
	newsRows    []valyu.NewsRow
	insiderRows []valyu.InsiderTradeRow
}

func (f *fakeExtendedStore) WriteNewsSentiment(ctx context.Context, rows []valyu.NewsRow) error {
	f.newsRows = append(f.newsRows, rows...)
	return nil
}

func (f *fakeExtendedStore) WriteInsiderTrades(ctx context.Context, rows []valyu.InsiderTradeRow) error {
	f.insiderRows = append(f.insiderRows, rows...)
	return nil
}

var _ valyu.ExtendedStore = (*fakeExtendedStore)(nil)
