//go:build integration

package scheduler_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/fred"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/scheduler"
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

	// Verify we can reach the database
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("pinging database: %v", err)
	}

	return pool
}

func TestIntegration_FetchOnce_RealTimescaleDB(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	// Fake FRED API returning observations for each series
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seriesID := r.URL.Query().Get("series_id")
		w.Header().Set("Content-Type", "application/json")
		switch seriesID {
		case "DGS10":
			fmt.Fprint(w, `{"observations": [
				{"date": "2026-01-15", "value": "4.25"},
				{"date": "2026-01-16", "value": "4.30"}
			]}`)
		case "DGS2":
			fmt.Fprint(w, `{"observations": [
				{"date": "2026-01-15", "value": "3.80"},
				{"date": "2026-01-16", "value": "3.85"}
			]}`)
		default:
			fmt.Fprint(w, `{"observations": []}`)
		}
	}))
	defer srv.Close()

	client := fred.NewClient(fred.Config{BaseURL: srv.URL, APIKey: "test"})
	series := []string{"DGS10", "DGS2"}

	// First fetch: should write rows for both series
	err := scheduler.FetchOnce(ctx, client, tsStore, series, 180)
	if err != nil {
		t.Fatalf("first FetchOnce: %v", err)
	}

	// Verify rows in time_series table
	var count int
	err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM time_series").Scan(&count)
	if err != nil {
		t.Fatalf("counting rows: %v", err)
	}
	if count != 4 {
		t.Fatalf("expected 4 rows after first fetch, got %d", count)
	}

	// Verify both tickers are present
	rows, err := pool.Query(ctx, "SELECT DISTINCT ticker FROM time_series ORDER BY ticker")
	if err != nil {
		t.Fatalf("querying tickers: %v", err)
	}
	defer rows.Close()

	var tickers []string
	for rows.Next() {
		var ticker string
		if err := rows.Scan(&ticker); err != nil {
			t.Fatalf("scanning ticker: %v", err)
		}
		tickers = append(tickers, ticker)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating tickers: %v", err)
	}

	if len(tickers) != 2 || tickers[0] != "DGS10" || tickers[1] != "DGS2" {
		t.Fatalf("expected tickers [DGS10, DGS2], got %v", tickers)
	}

	// Second fetch with same data: no duplicates due to upsert
	err = scheduler.FetchOnce(ctx, client, tsStore, series, 180)
	if err != nil {
		t.Fatalf("second FetchOnce: %v", err)
	}

	err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM time_series").Scan(&count)
	if err != nil {
		t.Fatalf("counting rows after second fetch: %v", err)
	}
	if count != 4 {
		t.Fatalf("expected 4 rows after second fetch (no duplicates), got %d", count)
	}

	// Verify values are correct
	var value float64
	err = pool.QueryRow(ctx,
		"SELECT value FROM time_series WHERE ticker = $1 AND time = $2",
		"DGS10", time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
	).Scan(&value)
	if err != nil {
		t.Fatalf("querying specific value: %v", err)
	}
	if value != 4.25 {
		t.Errorf("DGS10 value on 2026-01-15 = %f, want 4.25", value)
	}
}
