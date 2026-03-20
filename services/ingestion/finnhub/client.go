package finnhub

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

// Quote holds the parsed fields from a Finnhub /quote response.
type Quote struct {
	CurrentPrice float64
	Timestamp    int64
}

// Config holds Finnhub client settings.
type Config struct {
	BaseURL string
	APIKey  string
}

// Client fetches price data from the Finnhub API.
type Client struct {
	config Config
	http   *http.Client
}

// NewClient creates a Finnhub API client.
func NewClient(cfg Config) *Client {
	return &Client{
		config: cfg,
		http:   &http.Client{Timeout: 10 * time.Second},
	}
}

type quoteResponse struct {
	C  float64  `json:"c"`  // current price
	D  *float64 `json:"d"`  // change (nullable)
	DP *float64 `json:"dp"` // percent change (nullable)
	H  float64  `json:"h"`  // high
	L  float64  `json:"l"`  // low
	O  float64  `json:"o"`  // open
	PC float64  `json:"pc"` // previous close
	T  int64    `json:"t"`  // timestamp
}

// FetchQuote retrieves the current quote for a single symbol.
func (c *Client) FetchQuote(ctx context.Context, symbol string) (*Quote, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.config.BaseURL+"/api/v1/quote", nil)
	if err != nil {
		return nil, fmt.Errorf("creating request for %s: %w", symbol, err)
	}

	q := req.URL.Query()
	q.Set("symbol", symbol)
	q.Set("token", c.config.APIKey)
	req.URL.RawQuery = q.Encode()

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching quote for %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Finnhub API returned status %d for %s", resp.StatusCode, symbol)
	}

	var qr quoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&qr); err != nil {
		return nil, fmt.Errorf("decoding Finnhub response for %s: %w", symbol, err)
	}

	// Finnhub returns c=0 and t=0 for unknown/invalid symbols
	if qr.C == 0 && qr.T == 0 {
		return nil, fmt.Errorf("Finnhub returned null/zero price for %s (symbol may be invalid)", symbol)
	}

	return &Quote{
		CurrentPrice: qr.C,
		Timestamp:    qr.T,
	}, nil
}

// FetchQuotes retrieves quotes for multiple symbols with rate limiting.
// Failed tickers are logged and skipped; the function returns all successful results.
func (c *Client) FetchQuotes(ctx context.Context, symbols []string, rateDelay time.Duration) ([]store.TimeSeriesPoint, error) {
	var points []store.TimeSeriesPoint

	for i, sym := range symbols {
		// Check context before each request
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("context cancelled during FetchQuotes: %w", ctx.Err())
		default:
		}

		// Rate limit: wait between requests (skip delay before the first)
		if i > 0 {
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("context cancelled during rate delay: %w", ctx.Err())
			case <-time.After(rateDelay):
			}
		}

		quote, err := c.FetchQuote(ctx, sym)
		if err != nil {
			slog.Warn("skipping ticker due to error", "ticker", sym, "error", err)
			continue
		}

		points = append(points, store.TimeSeriesPoint{
			Time:   time.Unix(quote.Timestamp, 0).UTC(),
			Ticker: sym,
			Value:  quote.CurrentPrice,
			Source: "finnhub",
		})
	}

	return points, nil
}
