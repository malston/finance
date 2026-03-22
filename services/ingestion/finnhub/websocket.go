package finnhub

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
	"github.com/malston/financial-risk-monitor/services/ingestion/store"
)

type wsMessage struct {
	Type string    `json:"type"`
	Data []wsTrade `json:"data"`
}

type wsTrade struct {
	Price     float64 `json:"p"`
	Symbol    string  `json:"s"`
	Timestamp int64   `json:"t"` // milliseconds
	Volume    float64 `json:"v"`
}

type subscribeMsg struct {
	Type   string `json:"type"`
	Symbol string `json:"symbol"`
}

// ParseTradeMessage parses a Finnhub WebSocket trade message into TimeSeriesPoints.
// Returns nil points (no error) for non-trade message types like ping.
func ParseTradeMessage(data []byte) ([]store.TimeSeriesPoint, error) {
	var msg wsMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, fmt.Errorf("parsing WebSocket message: %w", err)
	}

	if msg.Type != "trade" {
		return nil, nil
	}

	points := make([]store.TimeSeriesPoint, len(msg.Data))
	for i, trade := range msg.Data {
		points[i] = store.TimeSeriesPoint{
			Time:   time.Unix(trade.Timestamp/1000, 0).UTC(),
			Ticker: trade.Symbol,
			Value:  trade.Price,
			Source: "finnhub",
		}
	}

	return points, nil
}

// StartWebSocket connects to the Finnhub WebSocket, subscribes to the given symbols,
// and sends received trade data to the sink channel. It reconnects automatically
// on disconnect with exponential backoff (max 60s).
func StartWebSocket(ctx context.Context, wsURL string, apiKey string, symbols []string, sink chan<- store.TimeSeriesPoint) error {
	initialBackoff := 500 * time.Millisecond
	backoff := initialBackoff
	maxBackoff := 60 * time.Second
	stableConnectionThreshold := 60 * time.Second

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		connStart := time.Now()
		err := runWebSocket(ctx, wsURL, apiKey, symbols, sink)
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Reset backoff if the connection was stable for the threshold duration
		if time.Since(connStart) >= stableConnectionThreshold {
			backoff = initialBackoff
		}

		slog.Warn("WebSocket disconnected, reconnecting", "error", err, "backoff", backoff)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}

		// Exponential backoff
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func runWebSocket(ctx context.Context, wsURL string, apiKey string, symbols []string, sink chan<- store.TimeSeriesPoint) error {
	dialURL := wsURL + "?token=" + apiKey
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, dialURL, nil)
	if err != nil {
		return fmt.Errorf("connecting to WebSocket: %w", err)
	}
	defer conn.Close()

	// Subscribe to symbols
	for _, sym := range symbols {
		msg := subscribeMsg{Type: "subscribe", Symbol: sym}
		if err := conn.WriteJSON(msg); err != nil {
			return fmt.Errorf("subscribing to %s: %w", sym, err)
		}
	}

	// Read messages
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("reading WebSocket message: %w", err)
		}

		points, err := ParseTradeMessage(data)
		if err != nil {
			slog.Warn("failed to parse WebSocket message", "error", err)
			continue
		}

		for _, p := range points {
			select {
			case sink <- p:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
}
