package valyu

import (
	"context"
	"fmt"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/store"
)

// NAVData holds the net asset value per share for a BDC ticker.
type NAVData struct {
	Ticker      string
	NAVPerShare float64
}

// Store defines persistence operations needed for NAV discount computation.
type Store interface {
	LatestValue(ctx context.Context, ticker string) (float64, time.Time, error)
	WritePoints(ctx context.Context, points []store.TimeSeriesPoint) error
	LatestTimestamp(ctx context.Context, ticker string) (time.Time, error)
}

// ComputeAvgDiscount computes the average discount-to-NAV across the given BDCs.
// Discount = (market_price - NAV) / NAV. Negative means trading below NAV.
// Market prices are fetched from the store (written by Finnhub).
func ComputeAvgDiscount(ctx context.Context, s Store, navs []NAVData) (*store.TimeSeriesPoint, error) {
	if len(navs) == 0 {
		return nil, fmt.Errorf("no NAV data provided")
	}

	var totalDiscount float64
	var latestTime time.Time

	for _, nav := range navs {
		if nav.NAVPerShare == 0 {
			return nil, fmt.Errorf("zero NAV per share for %s", nav.Ticker)
		}

		marketPrice, ts, err := s.LatestValue(ctx, nav.Ticker)
		if err != nil {
			return nil, fmt.Errorf("fetching market price for %s: %w", nav.Ticker, err)
		}
		if marketPrice == 0 && ts.IsZero() {
			return nil, fmt.Errorf("no market price available for %s", nav.Ticker)
		}

		discount := (marketPrice - nav.NAVPerShare) / nav.NAVPerShare
		totalDiscount += discount

		if ts.After(latestTime) {
			latestTime = ts
		}
	}

	avgDiscount := totalDiscount / float64(len(navs))

	return &store.TimeSeriesPoint{
		Time:   latestTime,
		Ticker: "BDC_AVG_NAV_DISCOUNT",
		Value:  avgDiscount,
		Source: "computed",
	}, nil
}
