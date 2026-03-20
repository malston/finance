package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds all ingestion service configuration.
type Config struct {
	Fred    FredConfig    `yaml:"fred"`
	Finnhub FinnhubConfig `yaml:"finnhub"`
	Health  HealthConfig  `yaml:"health"`
}

// HealthConfig holds per-source staleness thresholds.
type HealthConfig struct {
	Sources map[string]SourceHealthConfig `yaml:"sources"`
}

// SourceHealthConfig holds the staleness threshold for a single source.
type SourceHealthConfig struct {
	StalenessThreshold time.Duration `yaml:"staleness_threshold"`
}

// FredConfig holds FRED API settings and series list.
type FredConfig struct {
	APIKey       string        `yaml:"api_key"`
	Series       []string      `yaml:"series"`
	PollInterval time.Duration `yaml:"poll_interval"`
}

// FinnhubConfig holds Finnhub API settings and ticker lists.
type FinnhubConfig struct {
	APIKey           string        `yaml:"api_key"`
	RESTTickers      []string      `yaml:"rest_tickers"`
	WebSocketTickers []string      `yaml:"websocket_tickers"`
	PollInterval     time.Duration `yaml:"poll_interval"`
	RateLimitDelay   time.Duration `yaml:"rate_limit_delay"`
}

// Load reads a config file from disk, expands environment variables in the
// API key, and validates required fields.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	// Expand env vars in API keys
	cfg.Fred.APIKey = os.ExpandEnv(cfg.Fred.APIKey)
	cfg.Finnhub.APIKey = os.ExpandEnv(cfg.Finnhub.APIKey)

	// Default poll intervals
	if cfg.Fred.PollInterval == 0 {
		cfg.Fred.PollInterval = 24 * time.Hour
	}
	if cfg.Finnhub.PollInterval == 0 {
		cfg.Finnhub.PollInterval = 5 * time.Minute
	}
	if cfg.Finnhub.RateLimitDelay == 0 {
		cfg.Finnhub.RateLimitDelay = 1 * time.Second
	}

	if len(cfg.Fred.Series) == 0 {
		return nil, fmt.Errorf("fred.series must contain at least one series ID")
	}

	// Apply default health thresholds for known sources
	if cfg.Health.Sources == nil {
		cfg.Health.Sources = make(map[string]SourceHealthConfig)
	}
	defaults := map[string]time.Duration{
		"finnhub":         15 * time.Minute,
		"fred":            24 * time.Hour,
		"valyu_filings":   24 * time.Hour,
		"valyu_sentiment": 2 * time.Hour,
		"valyu_insider":   24 * time.Hour,
	}
	for source, threshold := range defaults {
		if _, ok := cfg.Health.Sources[source]; !ok {
			cfg.Health.Sources[source] = SourceHealthConfig{StalenessThreshold: threshold}
		}
	}

	return &cfg, nil
}
