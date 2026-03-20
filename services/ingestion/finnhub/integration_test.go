//go:build integration

package finnhub_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/computed"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/finnhub"
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

func TestIntegration_FinnhubREST_IngestsAndQueries(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	// Fake Finnhub API returning quotes for multiple tickers
	prices := map[string]float64{
		"NVDA": 875.50,
		"MSFT": 425.00,
		"SPY":  520.30,
		"RSP":  160.10,
		"OWL":  19.85,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sym := r.URL.Query().Get("symbol")
		price, ok := prices[sym]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]interface{}{
			"c": price,
			"t": time.Now().Unix(),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := finnhub.NewClient(finnhub.Config{BaseURL: srv.URL, APIKey: "test"})
	tickers := []string{"NVDA", "MSFT", "SPY", "RSP", "OWL"}

	// Fetch quotes and write to DB
	points, err := client.FetchQuotes(ctx, tickers, 10*time.Millisecond)
	if err != nil {
		t.Fatalf("FetchQuotes: %v", err)
	}
	if len(points) != 5 {
		t.Fatalf("expected 5 points, got %d", len(points))
	}

	if err := tsStore.WritePoints(ctx, points); err != nil {
		t.Fatalf("WritePoints: %v", err)
	}

	// Verify at least 5 tickers are queryable
	var count int
	err = pool.QueryRow(ctx, "SELECT COUNT(DISTINCT ticker) FROM time_series WHERE source = 'finnhub'").Scan(&count)
	if err != nil {
		t.Fatalf("counting tickers: %v", err)
	}
	if count < 5 {
		t.Fatalf("expected at least 5 distinct tickers, got %d", count)
	}

	// Verify NVDA price is correct
	var value float64
	err = pool.QueryRow(ctx,
		"SELECT value FROM time_series WHERE ticker = $1 ORDER BY time DESC LIMIT 1",
		"NVDA",
	).Scan(&value)
	if err != nil {
		t.Fatalf("querying NVDA: %v", err)
	}
	if value != 875.50 {
		t.Errorf("NVDA value = %f, want 875.50", value)
	}

	// Compute and store SPY/RSP ratio
	ratioPoint, err := computed.ComputeRatio(ctx, tsStore, "SPY", "RSP")
	if err != nil {
		t.Fatalf("ComputeRatio: %v", err)
	}
	if err := tsStore.WritePoints(ctx, []store.TimeSeriesPoint{*ratioPoint}); err != nil {
		t.Fatalf("writing ratio: %v", err)
	}

	// Verify ratio was stored
	var ratioValue float64
	err = pool.QueryRow(ctx,
		"SELECT value FROM time_series WHERE ticker = 'SPY_RSP_RATIO' ORDER BY time DESC LIMIT 1",
	).Scan(&ratioValue)
	if err != nil {
		t.Fatalf("querying ratio: %v", err)
	}
	expectedRatio := 520.30 / 160.10
	if fmt.Sprintf("%.4f", ratioValue) != fmt.Sprintf("%.4f", expectedRatio) {
		t.Errorf("SPY_RSP_RATIO = %f, want %f", ratioValue, expectedRatio)
	}
}

func TestIntegration_FinnhubWebSocket_ReceivesTrade(t *testing.T) {
	ctx := context.Background()
	pool := startTimescaleDB(t, ctx)
	tsStore := store.New(pool)

	wsUpgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

	// Fake Finnhub WebSocket server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := wsUpgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Read subscriptions
		go func() {
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()

		// Send a VIX trade
		trade := `{"data":[{"p":25.50,"s":"VIX","t":1710000000000,"v":100}],"type":"trade"}`
		conn.WriteMessage(websocket.TextMessage, []byte(trade))

		time.Sleep(2 * time.Second)
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	sink := make(chan store.TimeSeriesPoint, 10)

	wsCtx, wsCancel := context.WithTimeout(ctx, 3*time.Second)
	defer wsCancel()

	go finnhub.StartWebSocket(wsCtx, wsURL, "test", []string{"VIX"}, sink)

	// Wait for at least one trade
	select {
	case point := <-sink:
		if point.Ticker != "VIX" {
			t.Errorf("Ticker = %q, want VIX", point.Ticker)
		}
		// Write to DB
		if err := tsStore.WritePoints(ctx, []store.TimeSeriesPoint{point}); err != nil {
			t.Fatalf("writing WebSocket point: %v", err)
		}

		// Verify in DB
		var dbValue float64
		err := pool.QueryRow(ctx,
			"SELECT value FROM time_series WHERE ticker = 'VIX' ORDER BY time DESC LIMIT 1",
		).Scan(&dbValue)
		if err != nil {
			t.Fatalf("querying VIX: %v", err)
		}
		if dbValue != 25.50 {
			t.Errorf("VIX value = %f, want 25.50", dbValue)
		}
	case <-wsCtx.Done():
		t.Fatal("timed out waiting for WebSocket trade")
	}
}
