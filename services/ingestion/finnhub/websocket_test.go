package finnhub_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/finnhub"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func TestParseTradeMessage_ValidTrade(t *testing.T) {
	msg := `{"data":[{"p":25.50,"s":"VIX","t":1710000000000,"v":100}],"type":"trade"}`
	points, err := finnhub.ParseTradeMessage([]byte(msg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("expected 1 point, got %d", len(points))
	}
	if points[0].Ticker != "VIX" {
		t.Errorf("Ticker = %q, want %q", points[0].Ticker, "VIX")
	}
	if points[0].Value != 25.50 {
		t.Errorf("Value = %f, want 25.50", points[0].Value)
	}
	if points[0].Source != "finnhub" {
		t.Errorf("Source = %q, want %q", points[0].Source, "finnhub")
	}
	// Timestamp 1710000000000 ms -> 1710000000 s
	expected := time.Unix(1710000000, 0).UTC()
	if !points[0].Time.Equal(expected) {
		t.Errorf("Time = %v, want %v", points[0].Time, expected)
	}
}

func TestParseTradeMessage_MultipleTrades(t *testing.T) {
	msg := `{"data":[{"p":25.50,"s":"VIX","t":1710000000000,"v":100},{"p":72.30,"s":"CL=F","t":1710000001000,"v":50}],"type":"trade"}`
	points, err := finnhub.ParseTradeMessage([]byte(msg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(points) != 2 {
		t.Fatalf("expected 2 points, got %d", len(points))
	}
}

func TestParseTradeMessage_NonTradeType(t *testing.T) {
	msg := `{"type":"ping"}`
	points, err := finnhub.ParseTradeMessage([]byte(msg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(points) != 0 {
		t.Errorf("expected 0 points for ping message, got %d", len(points))
	}
}

func TestParseTradeMessage_InvalidJSON(t *testing.T) {
	_, err := finnhub.ParseTradeMessage([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestStartWebSocket_ReceivesTrades(t *testing.T) {
	// Create a test WebSocket server that sends trade messages
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("upgrade error: %v", err)
			return
		}
		defer conn.Close()

		// Read subscription messages
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var sub struct {
				Type   string `json:"type"`
				Symbol string `json:"symbol"`
			}
			if err := json.Unmarshal(msg, &sub); err != nil {
				continue
			}
			if sub.Type != "subscribe" {
				continue
			}
			// All symbols subscribed, break out
			break
		}

		// Read remaining subscribe messages
		go func() {
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()

		// Send a trade message
		trade := `{"data":[{"p":25.50,"s":"VIX","t":1710000000000,"v":100}],"type":"trade"}`
		conn.WriteMessage(websocket.TextMessage, []byte(trade))

		// Keep connection open briefly
		time.Sleep(500 * time.Millisecond)
	}))
	defer srv.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	sink := make(chan store.TimeSeriesPoint, 10)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	go func() {
		err := finnhub.StartWebSocket(ctx, wsURL, "test-key", []string{"VIX"}, sink)
		if err != nil && ctx.Err() == nil {
			t.Logf("StartWebSocket returned: %v", err)
		}
	}()

	// Wait for a trade to arrive
	select {
	case point := <-sink:
		if point.Ticker != "VIX" {
			t.Errorf("Ticker = %q, want VIX", point.Ticker)
		}
		if point.Value != 25.50 {
			t.Errorf("Value = %f, want 25.50", point.Value)
		}
		if point.Source != "finnhub" {
			t.Errorf("Source = %q, want finnhub", point.Source)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for trade message")
	}
}

func TestStartWebSocket_SendsSubscriptions(t *testing.T) {
	subscribed := make(chan string, 10)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var sub struct {
				Type   string `json:"type"`
				Symbol string `json:"symbol"`
			}
			if err := json.Unmarshal(msg, &sub); err != nil {
				continue
			}
			if sub.Type == "subscribe" {
				subscribed <- sub.Symbol
			}
		}
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	sink := make(chan store.TimeSeriesPoint, 10)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	go finnhub.StartWebSocket(ctx, wsURL, "test-key", []string{"VIX", "CL=F", "NG=F"}, sink)

	received := make(map[string]bool)
	timeout := time.After(2 * time.Second)
	for len(received) < 3 {
		select {
		case sym := <-subscribed:
			received[sym] = true
		case <-timeout:
			t.Fatalf("timed out waiting for subscriptions; got %v", received)
		}
	}

	for _, sym := range []string{"VIX", "CL=F", "NG=F"} {
		if !received[sym] {
			t.Errorf("missing subscription for %s", sym)
		}
	}
}

func TestStartWebSocket_ReconnectsOnDisconnect(t *testing.T) {
	connectCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		connectCount++

		if connectCount == 1 {
			// Close immediately on first connection to trigger reconnect
			conn.Close()
			return
		}

		// Second connection: send a trade and stay open
		defer conn.Close()
		// Drain subscription messages
		go func() {
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()

		trade := `{"data":[{"p":30.00,"s":"VIX","t":1710000000000,"v":50}],"type":"trade"}`
		conn.WriteMessage(websocket.TextMessage, []byte(trade))
		time.Sleep(1 * time.Second)
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	sink := make(chan store.TimeSeriesPoint, 10)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	go finnhub.StartWebSocket(ctx, wsURL, "test-key", []string{"VIX"}, sink)

	select {
	case point := <-sink:
		if point.Ticker != "VIX" {
			t.Errorf("Ticker = %q, want VIX", point.Ticker)
		}
		// Verify reconnection happened
		if connectCount < 2 {
			t.Errorf("expected at least 2 connections (reconnect), got %d", connectCount)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for trade after reconnect")
	}
}
