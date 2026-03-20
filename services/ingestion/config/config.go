package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds all ingestion service configuration.
type Config struct {
	Fred FredConfig `yaml:"fred"`
}

// FredConfig holds FRED API settings and series list.
type FredConfig struct {
	APIKey       string        `yaml:"api_key"`
	Series       []string      `yaml:"series"`
	PollInterval time.Duration `yaml:"poll_interval"`
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

	// Expand env vars in the API key (e.g., ${FRED_API_KEY})
	cfg.Fred.APIKey = os.ExpandEnv(cfg.Fred.APIKey)

	// Default poll interval to 24h
	if cfg.Fred.PollInterval == 0 {
		cfg.Fred.PollInterval = 24 * time.Hour
	}

	if len(cfg.Fred.Series) == 0 {
		return nil, fmt.Errorf("fred.series must contain at least one series ID")
	}

	return &cfg, nil
}
