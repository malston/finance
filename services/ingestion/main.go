package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/computed"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/config"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/finnhub"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/fred"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/scheduler"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/valyu"
)

const (
	lookbackDays = 180
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfgPath := os.Getenv("CONFIG_PATH")
	if cfgPath == "" {
		cfgPath = "config.yaml"
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		slog.Error("loading config", "error", err)
		os.Exit(1)
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		slog.Error("DATABASE_URL environment variable is required")
		os.Exit(1)
	}

	fredBaseURL := os.Getenv("FRED_BASE_URL")
	if fredBaseURL == "" {
		fredBaseURL = "https://api.stlouisfed.org"
	}

	finnhubBaseURL := os.Getenv("FINNHUB_BASE_URL")
	if finnhubBaseURL == "" {
		finnhubBaseURL = "https://finnhub.io"
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig)
		cancel()
	}()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("connecting to TimescaleDB", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := waitForDB(ctx, pool); err != nil {
		slog.Error("database not ready", "error", err)
		os.Exit(1)
	}

	fredClient := fred.NewClient(fred.Config{
		BaseURL: fredBaseURL,
		APIKey:  cfg.Fred.APIKey,
	})

	finnhubClient := finnhub.NewClient(finnhub.Config{
		BaseURL: finnhubBaseURL,
		APIKey:  cfg.Finnhub.APIKey,
	})

	tsStore := store.New(pool)

	valyuBaseURL := os.Getenv("VALYU_BASE_URL")
	if valyuBaseURL == "" {
		valyuBaseURL = "https://api.valyu.network"
	}

	valyuClient := valyu.NewClient(valyu.Config{
		BaseURL: valyuBaseURL,
		APIKey:  cfg.Valyu.APIKey,
	})

	valyuBudget := valyu.NewBudgetTracker(
		cfg.Valyu.Budget.DailyMaxCalls,
		cfg.Valyu.Budget.WarnAtCalls,
	)

	valyuStore := &valyu.StoreAdapter{S: tsStore}

	slog.Info("ingestion service started",
		"fred_series", cfg.Fred.Series,
		"fred_interval", cfg.Fred.PollInterval,
		"finnhub_rest_tickers", cfg.Finnhub.RESTTickers,
		"finnhub_ws_tickers", cfg.Finnhub.WebSocketTickers,
		"finnhub_interval", cfg.Finnhub.PollInterval,
		"valyu_enabled", cfg.Valyu.APIKey != "",
	)

	if len(cfg.Finnhub.WebSocketTickers) > 0 && cfg.Finnhub.APIKey != "" {
		wsSink := make(chan store.TimeSeriesPoint, 100)
		wsURL := "wss://ws.finnhub.io"

		go func() {
			if err := finnhub.StartWebSocket(ctx, wsURL, cfg.Finnhub.APIKey, cfg.Finnhub.WebSocketTickers, wsSink); err != nil {
				slog.Error("WebSocket stopped", "error", err)
			}
		}()

		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case point := <-wsSink:
					if err := tsStore.WritePoints(ctx, []store.TimeSeriesPoint{point}); err != nil {
						slog.Error("writing WebSocket point", "error", err, "ticker", point.Ticker)
					}
				}
			}
		}()
	}

	if err := scheduler.FetchOnce(ctx, fredClient, tsStore, cfg.Fred.Series, lookbackDays); err != nil {
		slog.Warn("initial FRED fetch failed", "error", err)
	}

	if len(cfg.Finnhub.RESTTickers) > 0 && cfg.Finnhub.APIKey != "" {
		fetchFinnhub(ctx, finnhubClient, tsStore, cfg)
	}

	fredTicker := time.NewTicker(cfg.Fred.PollInterval)
	defer fredTicker.Stop()

	finnhubTicker := time.NewTicker(cfg.Finnhub.PollInterval)
	defer finnhubTicker.Stop()

	var valyuFilingsTicker, valyuSentimentTicker, valyuInsiderTicker *time.Ticker
	if cfg.Valyu.APIKey != "" {
		valyuFilingsTicker = time.NewTicker(cfg.Valyu.Schedules.SECFilings.Interval)
		defer valyuFilingsTicker.Stop()
		valyuSentimentTicker = time.NewTicker(cfg.Valyu.Schedules.NewsSentiment.Interval)
		defer valyuSentimentTicker.Stop()
		valyuInsiderTicker = time.NewTicker(cfg.Valyu.Schedules.InsiderTrading.Interval)
		defer valyuInsiderTicker.Stop()

		go fetchValyuFilings(ctx, valyuClient, valyuStore, valyuBudget, cfg)
		go fetchValyuInsider(ctx, valyuClient, valyuStore, valyuBudget, cfg)
		if valyu.IsMarketHours(time.Now()) {
			go fetchValyuSentiment(ctx, valyuClient, valyuStore, valyuBudget, cfg)
		}
	}

	budgetResetTicker := time.NewTicker(1 * time.Hour)
	defer budgetResetTicker.Stop()
	lastResetDay := time.Now().YearDay()

	for {
		var filingsCh, sentimentCh, insiderCh <-chan time.Time
		if valyuFilingsTicker != nil {
			filingsCh = valyuFilingsTicker.C
		}
		if valyuSentimentTicker != nil {
			sentimentCh = valyuSentimentTicker.C
		}
		if valyuInsiderTicker != nil {
			insiderCh = valyuInsiderTicker.C
		}

		select {
		case <-ctx.Done():
			slog.Info("ingestion service stopped")
			return
		case <-fredTicker.C:
			if err := scheduler.FetchOnce(ctx, fredClient, tsStore, cfg.Fred.Series, lookbackDays); err != nil {
				slog.Warn("periodic FRED fetch failed", "error", err)
			}
		case <-finnhubTicker.C:
			if len(cfg.Finnhub.RESTTickers) > 0 && cfg.Finnhub.APIKey != "" {
				fetchFinnhub(ctx, finnhubClient, tsStore, cfg)
			}
		case <-filingsCh:
			go fetchValyuFilings(ctx, valyuClient, valyuStore, valyuBudget, cfg)
		case <-sentimentCh:
			if !cfg.Valyu.Schedules.NewsSentiment.MarketHoursOnly || valyu.IsMarketHours(time.Now()) {
				go fetchValyuSentiment(ctx, valyuClient, valyuStore, valyuBudget, cfg)
			}
		case <-insiderCh:
			go fetchValyuInsider(ctx, valyuClient, valyuStore, valyuBudget, cfg)
		case <-budgetResetTicker.C:
			today := time.Now().YearDay()
			if today != lastResetDay {
				valyuBudget.Reset()
				lastResetDay = today
				slog.Info("reset Valyu daily budget counter")
			}
		}
	}
}

func fetchFinnhub(ctx context.Context, client *finnhub.Client, tsStore *store.Store, cfg *config.Config) {
	points, err := client.FetchQuotes(ctx, cfg.Finnhub.RESTTickers, cfg.Finnhub.RateLimitDelay)
	if err != nil {
		slog.Warn("Finnhub fetch failed", "error", err)
		return
	}
	if len(points) > 0 {
		if err := tsStore.WritePoints(ctx, points); err != nil {
			slog.Error("writing Finnhub points", "error", err)
		} else {
			slog.Info("wrote Finnhub quotes", "count", len(points))
		}
	}
	ratioPoint, err := computed.ComputeRatio(ctx, tsStore, "SPY", "RSP")
	if err != nil {
		slog.Warn("computing SPY/RSP ratio", "error", err)
		return
	}
	if err := tsStore.WritePoints(ctx, []store.TimeSeriesPoint{*ratioPoint}); err != nil {
		slog.Error("writing SPY_RSP_RATIO", "error", err)
	} else {
		slog.Info("wrote SPY_RSP_RATIO", "value", ratioPoint.Value)
	}
}

func fetchValyuFilings(ctx context.Context, client *valyu.Client, es valyu.ExtendedStore, budget *valyu.BudgetTracker, cfg *config.Config) {
	if budget.IsWarning() {
		slog.Warn("Valyu budget warning", "daily_count", budget.DailyCount())
	}
	bdcs := cfg.Valyu.Schedules.SECFilings.BDCs
	navs, err := valyu.FetchFilings(ctx, client, es, budget, bdcs)
	if err != nil {
		slog.Warn("Valyu filing fetch failed", "error", err)
		return
	}
	if len(navs) > 0 {
		discountPoint, err := valyu.ComputeAvgDiscount(ctx, es, navs)
		if err != nil {
			slog.Warn("computing BDC avg NAV discount", "error", err)
			return
		}
		if err := es.WritePoints(ctx, []store.TimeSeriesPoint{*discountPoint}); err != nil {
			slog.Error("writing BDC_AVG_NAV_DISCOUNT", "error", err)
		} else {
			slog.Info("wrote BDC_AVG_NAV_DISCOUNT", "value", discountPoint.Value)
		}
	}
}

func fetchValyuSentiment(ctx context.Context, client *valyu.Client, es valyu.ExtendedStore, budget *valyu.BudgetTracker, cfg *config.Config) {
	if budget.IsWarning() {
		slog.Warn("Valyu budget warning", "daily_count", budget.DailyCount())
	}
	domains := cfg.Valyu.Schedules.NewsSentiment.Domains
	if err := valyu.FetchNewsSentiment(ctx, client, es, budget, domains); err != nil {
		slog.Warn("Valyu sentiment fetch failed", "error", err)
	}
}

func fetchValyuInsider(ctx context.Context, client *valyu.Client, es valyu.ExtendedStore, budget *valyu.BudgetTracker, cfg *config.Config) {
	if budget.IsWarning() {
		slog.Warn("Valyu budget warning", "daily_count", budget.DailyCount())
	}
	tickers := cfg.Valyu.Schedules.InsiderTrading.Tickers
	if err := valyu.FetchInsiderTrades(ctx, client, es, budget, tickers); err != nil {
		slog.Warn("Valyu insider trade fetch failed", "error", err)
	}
}

func waitForDB(ctx context.Context, pool *pgxpool.Pool) error {
	for i := 0; i < 30; i++ {
		if err := pool.Ping(ctx); err == nil {
			slog.Info("database connection established")
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(1 * time.Second):
		}
	}
	return fmt.Errorf("database not ready after 30 seconds")
}
