package config_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/config"
)

func TestLoadConfig_ParsesSeriesAndInterval(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: test-key-123
  series:
    - BAMLH0A0HYM2
    - DGS10
    - DGS2
    - T10Y2Y
  poll_interval: 24h
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Fred.APIKey != "test-key-123" {
		t.Errorf("APIKey = %q, want %q", cfg.Fred.APIKey, "test-key-123")
	}
	if len(cfg.Fred.Series) != 4 {
		t.Fatalf("Series count = %d, want 4", len(cfg.Fred.Series))
	}
	expected := []string{"BAMLH0A0HYM2", "DGS10", "DGS2", "T10Y2Y"}
	for i, s := range expected {
		if cfg.Fred.Series[i] != s {
			t.Errorf("Series[%d] = %q, want %q", i, cfg.Fred.Series[i], s)
		}
	}
	if cfg.Fred.PollInterval != 24*time.Hour {
		t.Errorf("PollInterval = %v, want 24h", cfg.Fred.PollInterval)
	}
}

func TestLoadConfig_ExpandsEnvVarInAPIKey(t *testing.T) {
	t.Setenv("FRED_API_KEY", "env-key-abc")

	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: ${FRED_API_KEY}
  series:
    - DGS10
  poll_interval: 1h
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Fred.APIKey != "env-key-abc" {
		t.Errorf("APIKey = %q, want %q", cfg.Fred.APIKey, "env-key-abc")
	}
}

func TestLoadConfig_DefaultPollInterval(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: ""
  series:
    - DGS10
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Fred.PollInterval != 24*time.Hour {
		t.Errorf("PollInterval = %v, want 24h (default)", cfg.Fred.PollInterval)
	}
}

func TestLoadConfig_EmptySeriesReturnsError(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: ""
  series: []
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	_, err = config.Load(cfgPath)
	if err == nil {
		t.Fatal("expected error for empty series, got nil")
	}
}

func TestLoadConfig_MissingFileReturnsError(t *testing.T) {
	_, err := config.Load("/nonexistent/config.yaml")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoadConfig_ParsesFinnhubConfig(t *testing.T) {
	t.Setenv("FINNHUB_API_KEY", "fh-key-xyz")

	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: test
  series:
    - DGS10
finnhub:
  api_key: ${FINNHUB_API_KEY}
  rest_tickers:
    - NVDA
    - MSFT
    - SPY
  websocket_tickers:
    - VIX
    - CL=F
  poll_interval: 5m
  rate_limit_delay: 1s
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Finnhub.APIKey != "fh-key-xyz" {
		t.Errorf("Finnhub.APIKey = %q, want %q", cfg.Finnhub.APIKey, "fh-key-xyz")
	}
	if len(cfg.Finnhub.RESTTickers) != 3 {
		t.Fatalf("Finnhub.RESTTickers count = %d, want 3", len(cfg.Finnhub.RESTTickers))
	}
	if cfg.Finnhub.RESTTickers[0] != "NVDA" {
		t.Errorf("Finnhub.RESTTickers[0] = %q, want %q", cfg.Finnhub.RESTTickers[0], "NVDA")
	}
	if len(cfg.Finnhub.WebSocketTickers) != 2 {
		t.Fatalf("Finnhub.WebSocketTickers count = %d, want 2", len(cfg.Finnhub.WebSocketTickers))
	}
	if cfg.Finnhub.PollInterval != 5*time.Minute {
		t.Errorf("Finnhub.PollInterval = %v, want 5m", cfg.Finnhub.PollInterval)
	}
	if cfg.Finnhub.RateLimitDelay != 1*time.Second {
		t.Errorf("Finnhub.RateLimitDelay = %v, want 1s", cfg.Finnhub.RateLimitDelay)
	}
}

func TestLoadConfig_FinnhubDefaultPollInterval(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: ""
  series:
    - DGS10
finnhub:
  api_key: test
  rest_tickers:
    - NVDA
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Finnhub.PollInterval != 5*time.Minute {
		t.Errorf("Finnhub.PollInterval = %v, want 5m (default)", cfg.Finnhub.PollInterval)
	}
	if cfg.Finnhub.RateLimitDelay != 1*time.Second {
		t.Errorf("Finnhub.RateLimitDelay = %v, want 1s (default)", cfg.Finnhub.RateLimitDelay)
	}
}
