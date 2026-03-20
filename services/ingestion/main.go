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
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/config"
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
	tsStore := store.New(pool)

	slog.Info("ingestion service started",
		"series", cfg.Fred.Series,
		"interval", cfg.Fred.PollInterval,
	)

	// fetchAndTrackHealth runs a FRED fetch cycle and records the result in source_health.
	fetchAndTrackHealth := func() {
		fetchErr := scheduler.FetchOnce(ctx, fredClient, tsStore, cfg.Fred.Series, lookbackDays)
		if fetchErr != nil {
			slog.Warn("fetch failed", "error", fetchErr)
		}
		if healthErr := tsStore.UpdateSourceHealth(ctx, "fred", fetchErr); healthErr != nil {
			slog.Error("updating source health", "error", healthErr)
		}
	}

	// Fetch immediately on startup
	fetchAndTrackHealth()

	// Then fetch on configured interval
	ticker := time.NewTicker(cfg.Fred.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("ingestion service stopped")
			return
		case <-ticker.C:
			fetchAndTrackHealth()
		}
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
