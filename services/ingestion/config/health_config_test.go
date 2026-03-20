package config_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/config"
)

func TestLoadConfig_ParsesHealthThresholds(t *testing.T) {
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
		source    string
		threshold time.Duration
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
			if src.StalenessThreshold != tt.threshold {
				t.Errorf("StalenessThreshold = %v, want %v", src.StalenessThreshold, tt.threshold)
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

	// When no health config is provided, defaults should apply
	if cfg.Health.Sources == nil {
		t.Fatal("Health.Sources should have defaults, got nil")
	}

	// finnhub default: 15m
	fh, ok := cfg.Health.Sources["finnhub"]
	if !ok {
		t.Fatal("default finnhub source not found")
	}
	if fh.StalenessThreshold != 15*time.Minute {
		t.Errorf("finnhub default threshold = %v, want 15m", fh.StalenessThreshold)
	}

	// fred default: 24h
	fr, ok := cfg.Health.Sources["fred"]
	if !ok {
		t.Fatal("default fred source not found")
	}
	if fr.StalenessThreshold != 24*time.Hour {
		t.Errorf("fred default threshold = %v, want 24h", fr.StalenessThreshold)
	}
}
