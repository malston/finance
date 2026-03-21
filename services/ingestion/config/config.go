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
	Valyu   ValyuConfig   `yaml:"valyu"`
	Health  HealthConfig  `yaml:"health"`
}

// HealthConfig holds per-source staleness thresholds. These values are consumed
// by the Next.js health API route via the source_health table to determine
// whether a data source is stale.
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

// ValyuConfig holds Valyu API settings, budget limits, and schedule configuration.
type ValyuConfig struct {
	APIKey    string            `yaml:"api_key"`
	Budget    ValyuBudgetConfig `yaml:"budget"`
	Schedules ValyuSchedules    `yaml:"schedules"`
}

// ValyuBudgetConfig holds daily API call limits.
type ValyuBudgetConfig struct {
	DailyMaxCalls int `yaml:"daily_max_calls"`
	WarnAtCalls   int `yaml:"warn_at_calls"`
}

// ValyuSchedules holds schedule settings for each Valyu data stream.
type ValyuSchedules struct {
	SECFilings     ValyuFilingsSchedule   `yaml:"sec_filings"`
	NewsSentiment  ValyuSentimentSchedule `yaml:"news_sentiment"`
	InsiderTrading ValyuInsiderSchedule   `yaml:"insider_trading"`
}

// ValyuFilingsSchedule holds SEC filing search schedule settings.
type ValyuFilingsSchedule struct {
	Interval time.Duration `yaml:"interval"`
	BDCs     []string      `yaml:"bdcs"`
}

// ValyuSentimentSchedule holds news sentiment search schedule settings.
type ValyuSentimentSchedule struct {
	Interval        time.Duration `yaml:"interval"`
	MarketHoursOnly bool          `yaml:"market_hours_only"`
	Domains         []string      `yaml:"domains"`
}

// ValyuInsiderSchedule holds insider trading search schedule settings.
type ValyuInsiderSchedule struct {
	Interval time.Duration `yaml:"interval"`
	Tickers  []string      `yaml:"tickers"`
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
	cfg.Valyu.APIKey = os.ExpandEnv(cfg.Valyu.APIKey)

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

	// Valyu defaults
	if cfg.Valyu.Budget.DailyMaxCalls == 0 {
		cfg.Valyu.Budget.DailyMaxCalls = 100
	}
	if cfg.Valyu.Budget.WarnAtCalls == 0 {
		cfg.Valyu.Budget.WarnAtCalls = 80
	}
	if cfg.Valyu.Schedules.SECFilings.Interval == 0 {
		cfg.Valyu.Schedules.SECFilings.Interval = 24 * time.Hour
	}
	if cfg.Valyu.Schedules.NewsSentiment.Interval == 0 {
		cfg.Valyu.Schedules.NewsSentiment.Interval = 1 * time.Hour
	}
	if cfg.Valyu.Schedules.InsiderTrading.Interval == 0 {
		cfg.Valyu.Schedules.InsiderTrading.Interval = 24 * time.Hour
	}

	if len(cfg.Fred.Series) == 0 {
		return nil, fmt.Errorf("fred.series must contain at least one series ID")
	}

	// Apply default health staleness thresholds
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
