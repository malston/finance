package valyu

import (
	"context"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/store"
)

// StoreAdapter wraps a *store.Store to implement the ExtendedStore interface,
// converting between valyu types and store types.
type StoreAdapter struct {
	S *store.Store
}

func (a *StoreAdapter) WritePoints(ctx context.Context, points []store.TimeSeriesPoint) error {
	return a.S.WritePoints(ctx, points)
}

func (a *StoreAdapter) LatestValue(ctx context.Context, ticker string) (float64, time.Time, error) {
	return a.S.LatestValue(ctx, ticker)
}

func (a *StoreAdapter) LatestTimestamp(ctx context.Context, ticker string) (time.Time, error) {
	return a.S.LatestTimestamp(ctx, ticker)
}

func (a *StoreAdapter) WriteNewsSentiment(ctx context.Context, rows []NewsRow) error {
	storeRows := make([]store.NewsSentimentRow, len(rows))
	for i, r := range rows {
		storeRows[i] = store.NewsSentimentRow{
			Time:       r.Time,
			Domain:     r.Domain,
			Headline:   r.Headline,
			Sentiment:  r.Sentiment,
			SourceName: r.SourceName,
			SourceURL:  r.SourceURL,
		}
	}
	return a.S.WriteNewsSentiment(ctx, storeRows)
}

func (a *StoreAdapter) WriteInsiderTrades(ctx context.Context, rows []InsiderTradeRow) error {
	storeRows := make([]store.InsiderTradeRow, len(rows))
	for i, r := range rows {
		storeRows[i] = store.InsiderTradeRow{
			Time:        r.Time,
			Ticker:      r.Ticker,
			InsiderName: r.InsiderName,
			TradeType:   r.TradeType,
			Shares:      r.Shares,
			Price:       r.Price,
			SourceURL:   r.SourceURL,
		}
	}
	return a.S.WriteInsiderTrades(ctx, storeRows)
}
