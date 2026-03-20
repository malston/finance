package fred

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// Observation represents a single FRED data point.
type Observation struct {
	Date  time.Time
	Value float64
}

// Config holds FRED client settings.
type Config struct {
	BaseURL string
	APIKey  string
}

// Client fetches time series data from the FRED API.
type Client struct {
	config Config
	http   *http.Client
}

// NewClient creates a FRED API client.
func NewClient(cfg Config) *Client {
	return &Client{
		config: cfg,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

type fredResponse struct {
	Observations []fredObservation `json:"observations"`
}

type fredObservation struct {
	Date  string `json:"date"`
	Value string `json:"value"`
}

// FetchSeries retrieves observations for a FRED series starting from startDate (YYYY-MM-DD).
func (c *Client) FetchSeries(ctx context.Context, seriesID string, startDate string) ([]Observation, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.config.BaseURL+"/fred/series/observations", nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	q := req.URL.Query()
	q.Set("series_id", seriesID)
	q.Set("file_type", "json")
	q.Set("observation_start", startDate)
	if c.config.APIKey != "" {
		q.Set("api_key", c.config.APIKey)
	}
	req.URL.RawQuery = q.Encode()

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching series %s: %w", seriesID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("FRED API returned status %d for series %s", resp.StatusCode, seriesID)
	}

	var fredResp fredResponse
	if err := json.NewDecoder(resp.Body).Decode(&fredResp); err != nil {
		return nil, fmt.Errorf("decoding FRED response for series %s: %w", seriesID, err)
	}

	var observations []Observation
	for _, raw := range fredResp.Observations {
		// FRED uses "." to indicate missing data
		if raw.Value == "." {
			continue
		}

		val, err := strconv.ParseFloat(raw.Value, 64)
		if err != nil {
			continue
		}

		date, err := time.Parse("2006-01-02", raw.Date)
		if err != nil {
			continue
		}

		observations = append(observations, Observation{
			Date:  date,
			Value: val,
		})
	}

	return observations, nil
}
