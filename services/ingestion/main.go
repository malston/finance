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
)

const (
	// Fetch 6 months of history on first run
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

	slog.Info("ingestion service started",
		"fred_series", cfg.Fred.Series,
		"fred_interval", cfg.Fred.PollInterval,
		"finnhub_rest_tickers", cfg.Finnhub.RESTTickers,
		"finnhub_ws_tickers", cfg.Finnhub.WebSocketTickers,
		"finnhub_interval", cfg.Finnhub.PollInterval,
	)

	// Start Finnhub WebSocket for streaming tickers
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

	// Fetch FRED immediately on startup
	if err := scheduler.FetchOnce(ctx, fredClient, tsStore, cfg.Fred.Series, lookbackDays); err != nil {
		slog.Warn("initial FRED fetch failed", "error", err)
	}

	// Fetch Finnhub immediately on startup
	if len(cfg.Finnhub.RESTTickers) > 0 && cfg.Finnhub.APIKey != "" {
		fetchFinnhub(ctx, finnhubClient, tsStore, cfg)
	}

	fredTicker := time.NewTicker(cfg.Fred.PollInterval)
	defer fredTicker.Stop()

	finnhubTicker := time.NewTicker(cfg.Finnhub.PollInterval)
	defer finnhubTicker.Stop()

	for {
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

	// Compute SPY/RSP ratio if both tickers were fetched
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
