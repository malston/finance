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
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/fred"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

const (
	seriesID      = "BAMLH0A0HYM2"
	source        = "fred"
	fetchInterval = 1 * time.Hour
	// Fetch 6 months of history on first run
	lookbackDays = 180
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		slog.Error("DATABASE_URL environment variable is required")
		os.Exit(1)
	}

	fredBaseURL := os.Getenv("FRED_BASE_URL")
	if fredBaseURL == "" {
		fredBaseURL = "https://api.stlouisfed.org"
	}

	fredAPIKey := os.Getenv("FRED_API_KEY")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
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

	// Wait for database to be ready
	if err := waitForDB(ctx, pool); err != nil {
		slog.Error("database not ready", "error", err)
		os.Exit(1)
	}

	fredClient := fred.NewClient(fred.Config{
		BaseURL: fredBaseURL,
		APIKey:  fredAPIKey,
	})
	tsStore := store.New(pool)

	slog.Info("ingestion service started", "series", seriesID, "interval", fetchInterval)

	// Fetch immediately on startup
	if err := fetchAndStore(ctx, fredClient, tsStore); err != nil {
		slog.Warn("initial fetch failed", "error", err)
	}

	// Then fetch on interval
	ticker := time.NewTicker(fetchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("ingestion service stopped")
			return
		case <-ticker.C:
			if err := fetchAndStore(ctx, fredClient, tsStore); err != nil {
				slog.Warn("periodic fetch failed", "error", err)
			}
		}
	}
}

func fetchAndStore(ctx context.Context, fredClient *fred.Client, tsStore *store.Store) error {
	startDate := time.Now().AddDate(0, 0, -lookbackDays).Format("2006-01-02")

	slog.Info("fetching FRED series", "series", seriesID, "start_date", startDate)

	observations, err := fredClient.FetchSeries(ctx, seriesID, startDate)
	if err != nil {
		return fmt.Errorf("fetching FRED series: %w", err)
	}

	if len(observations) == 0 {
		slog.Info("no observations returned from FRED")
		return nil
	}

	points := make([]store.TimeSeriesPoint, len(observations))
	for i, obs := range observations {
		points[i] = store.TimeSeriesPoint{
			Time:   obs.Date,
			Ticker: seriesID,
			Value:  obs.Value,
			Source: source,
		}
	}

	if err := tsStore.WritePoints(ctx, points); err != nil {
		return fmt.Errorf("writing points to TimescaleDB: %w", err)
	}

	slog.Info("wrote observations to TimescaleDB", "count", len(points))
	return nil
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
