package valyu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// SearchResult represents a single result from a Valyu search.
type SearchResult struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	URL     string `json:"url"`
}

// Config holds Valyu client settings.
type Config struct {
	BaseURL string
	APIKey  string
}

// Client searches the Valyu API for SEC filings, news, and insider trades.
type Client struct {
	config Config
	http   *http.Client
}

// NewClient creates a Valyu API client.
func NewClient(cfg Config) *Client {
	return &Client{
		config: cfg,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

type searchRequest struct {
	Query      string `json:"query"`
	SearchType string `json:"search_type"`
	MaxResults int    `json:"max_num_results,omitempty"`
}

type searchResponse struct {
	Results []SearchResult `json:"results"`
}

func (c *Client) search(ctx context.Context, query string, maxResults int) ([]SearchResult, error) {
	body := searchRequest{
		Query:      query,
		SearchType: "all",
		MaxResults: maxResults,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshaling search request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.config.BaseURL+"/v1/search", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("creating search request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.config.APIKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing search request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Valyu API returned status %d", resp.StatusCode)
	}

	var sr searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, fmt.Errorf("decoding search response: %w", err)
	}

	return sr.Results, nil
}

// SearchFilings searches Valyu for SEC filings matching the given query.
func (c *Client) SearchFilings(ctx context.Context, query string) ([]SearchResult, error) {
	return c.search(ctx, query, 5)
}

// SearchNews searches Valyu for recent news related to the given domain.
func (c *Client) SearchNews(ctx context.Context, domain string) ([]SearchResult, error) {
	domainQueries := map[string]string{
		"private_credit": "private credit stress BDC defaults CLO leveraged lending breaking news",
		"ai_tech":        "AI technology mega-cap earnings antitrust chip export controls breaking news",
		"energy_geo":     "energy disruption oil supply OPEC pipeline LNG breaking news",
		"geopolitical":   "Taiwan China geopolitical military trade semiconductor supply chain breaking news",
	}

	query, ok := domainQueries[domain]
	if !ok {
		query = domain + " financial risk breaking news"
	}

	return c.search(ctx, query, 10)
}

// SearchInsiderTrades searches Valyu for SEC Form 4 insider transaction filings.
func (c *Client) SearchInsiderTrades(ctx context.Context, ticker string) ([]SearchResult, error) {
	query := fmt.Sprintf("%s SEC Form 4 insider trading transaction buy sell", ticker)
	return c.search(ctx, query, 10)
}
