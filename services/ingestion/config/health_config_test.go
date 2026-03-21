package config_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/config"
)

func TestLoadConfig_ParsesHealthStalenessThresholds(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: test
  series:
    - DGS10
health:
  sources:
    finnhub:
      staleness_threshold: 15m
    fred:
      staleness_threshold: 24h
    valyu_filings:
      staleness_threshold: 24h
    valyu_sentiment:
      staleness_threshold: 2h
    valyu_insider:
      staleness_threshold: 24h
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Health.Sources == nil {
		t.Fatal("Health.Sources is nil")
	}

	tests := []struct {
		source   string
		expected time.Duration
	}{
		{"finnhub", 15 * time.Minute},
		{"fred", 24 * time.Hour},
		{"valyu_filings", 24 * time.Hour},
		{"valyu_sentiment", 2 * time.Hour},
		{"valyu_insider", 24 * time.Hour},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			src, ok := cfg.Health.Sources[tt.source]
			if !ok {
				t.Fatalf("source %q not found in config", tt.source)
			}
			if src.StalenessThreshold != tt.expected {
				t.Errorf("StalenessThreshold = %v, want %v", src.StalenessThreshold, tt.expected)
			}
		})
	}
}

func TestLoadConfig_DefaultHealthThresholds(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
fred:
  api_key: test
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

	// When no health config is provided, defaults should be applied
	if cfg.Health.Sources == nil {
		t.Fatal("Health.Sources should have defaults")
	}

	// Finnhub default: 15m
	finnhub, ok := cfg.Health.Sources["finnhub"]
	if !ok {
		t.Fatal("default 'finnhub' health config missing")
	}
	if finnhub.StalenessThreshold != 15*time.Minute {
		t.Errorf("finnhub StalenessThreshold = %v, want 15m", finnhub.StalenessThreshold)
	}

	// FRED default: 24h
	fred, ok := cfg.Health.Sources["fred"]
	if !ok {
		t.Fatal("default 'fred' health config missing")
	}
	if fred.StalenessThreshold != 24*time.Hour {
		t.Errorf("fred StalenessThreshold = %v, want 24h", fred.StalenessThreshold)
	}
}
