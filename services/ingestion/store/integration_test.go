//go:build integration

package store_test

import (
	"context"
	"errors"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

func initSQLPath() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "db", "init.sql")
}

func startTimescaleDB(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()

	container, err := postgres.Run(ctx,
		"timescale/timescaledb:latest-pg16",
		postgres.WithDatabase("riskmonitor"),
		postgres.WithUsername("risk"),
		postgres.WithPassword("testpassword"),
		postgres.WithInitScripts(initSQLPath()),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("starting TimescaleDB container: %v", err)
	}
	t.Cleanup(func() {
		if err := container.Terminate(context.Background()); err != nil {
			t.Logf("terminating container: %v", err)
		}
	})

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("getting connection string: %v", err)
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("creating connection pool: %v", err)
	}
	t.Cleanup(func() { pool.Close() })

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("pinging database: %v", err)
	}

	return pool
}

func TestIntegration_UpdateSourceHealth_Success(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	// Record a successful poll for finnhub
	if err := tsStore.UpdateSourceHealth(ctx, "finnhub", nil); err != nil {
		t.Fatalf("UpdateSourceHealth (success): %v", err)
	}

	// Verify the row exists
	results, err := tsStore.GetSourceHealth(ctx)
	if err != nil {
		t.Fatalf("GetSourceHealth: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 row, got %d", len(results))
	}

	h := results[0]
	if h.Source != "finnhub" {
		t.Errorf("Source = %q, want %q", h.Source, "finnhub")
	}
	if h.ConsecutiveFailures != 0 {
		t.Errorf("ConsecutiveFailures = %d, want 0", h.ConsecutiveFailures)
	}
	if time.Since(h.LastSuccess) > 5*time.Second {
		t.Errorf("LastSuccess too old: %v", h.LastSuccess)
	}
}

func TestIntegration_UpdateSourceHealth_Failure(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	// Record a success first
	if err := tsStore.UpdateSourceHealth(ctx, "fred", nil); err != nil {
		t.Fatalf("initial success: %v", err)
	}

	// Then record failures
	for i := 0; i < 3; i++ {
		if err := tsStore.UpdateSourceHealth(ctx, "fred", errors.New("API timeout")); err != nil {
			t.Fatalf("UpdateSourceHealth (failure %d): %v", i+1, err)
		}
	}

	results, err := tsStore.GetSourceHealth(ctx)
	if err != nil {
		t.Fatalf("GetSourceHealth: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 row, got %d", len(results))
	}

	h := results[0]
	if h.ConsecutiveFailures != 3 {
		t.Errorf("ConsecutiveFailures = %d, want 3", h.ConsecutiveFailures)
	}
	if h.LastError == nil {
		t.Fatal("LastError should not be nil")
	}
	if h.LastErrorMsg == nil || *h.LastErrorMsg != "API timeout" {
		t.Errorf("LastErrorMsg = %v, want %q", h.LastErrorMsg, "API timeout")
	}
}

func TestIntegration_UpdateSourceHealth_ResetsOnSuccess(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	// Fail twice
	for i := 0; i < 2; i++ {
		if err := tsStore.UpdateSourceHealth(ctx, "finnhub", errors.New("down")); err != nil {
			t.Fatalf("failure: %v", err)
		}
	}

	// Then succeed
	if err := tsStore.UpdateSourceHealth(ctx, "finnhub", nil); err != nil {
		t.Fatalf("success: %v", err)
	}

	results, err := tsStore.GetSourceHealth(ctx)
	if err != nil {
		t.Fatalf("GetSourceHealth: %v", err)
	}

	h := results[0]
	if h.ConsecutiveFailures != 0 {
		t.Errorf("ConsecutiveFailures should reset to 0, got %d", h.ConsecutiveFailures)
	}
}

func TestIntegration_MultipleSources(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	sources := []string{"finnhub", "fred", "valyu_filings", "valyu_sentiment", "valyu_insider"}
	for _, src := range sources {
		if err := tsStore.UpdateSourceHealth(ctx, src, nil); err != nil {
			t.Fatalf("UpdateSourceHealth(%s): %v", src, err)
		}
	}

	results, err := tsStore.GetSourceHealth(ctx)
	if err != nil {
		t.Fatalf("GetSourceHealth: %v", err)
	}
	if len(results) != 5 {
		t.Fatalf("expected 5 sources, got %d", len(results))
	}

	// Results should be ordered by source name
	for i := 1; i < len(results); i++ {
		if results[i].Source < results[i-1].Source {
			t.Errorf("results not sorted: %q after %q", results[i].Source, results[i-1].Source)
		}
	}
}

func TestIntegration_StalenessDetection_FinnhubVsFRED(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	// Set Finnhub last_success to 20 minutes ago
	twentyMinAgo := time.Now().Add(-20 * time.Minute)
	_, err := pool.Exec(ctx, `
		INSERT INTO source_health (source, last_success, consecutive_failures)
		VALUES ('finnhub', $1, 0)
	`, twentyMinAgo)
	if err != nil {
		t.Fatalf("inserting finnhub: %v", err)
	}

	// Set FRED last_success to 20 minutes ago (should NOT be stale -- threshold is 24h)
	_, err = pool.Exec(ctx, `
		INSERT INTO source_health (source, last_success, consecutive_failures)
		VALUES ('fred', $1, 0)
	`, twentyMinAgo)
	if err != nil {
		t.Fatalf("inserting fred: %v", err)
	}

	results, err := tsStore.GetSourceHealth(ctx)
	if err != nil {
		t.Fatalf("GetSourceHealth: %v", err)
	}

	for _, h := range results {
		switch h.Source {
		case "finnhub":
			// Finnhub threshold is 15 min. 20 min ago = stale.
			if !store.IsStale(h.LastSuccess, 15*time.Minute) {
				t.Error("finnhub should be stale at 20 min with 15m threshold")
			}
		case "fred":
			// FRED threshold is 24h. 20 min ago = not stale.
			if store.IsStale(h.LastSuccess, 24*time.Hour) {
				t.Error("fred should NOT be stale at 20 min with 24h threshold")
			}
		}
	}
}
