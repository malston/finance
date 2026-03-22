package computed

import (
	"context"
	"fmt"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/store"
)

// LatestValueStore provides access to the most recent value for a ticker.
type LatestValueStore interface {
	LatestValue(ctx context.Context, ticker string) (float64, time.Time, error)
}

// ComputeRatio divides the latest value of the numerator ticker by the denominator ticker
// and returns the result as a TimeSeriesPoint with source="computed".
func ComputeRatio(ctx context.Context, s LatestValueStore, numerator string, denominator string) (*store.TimeSeriesPoint, error) {
	numVal, numTime, err := s.LatestValue(ctx, numerator)
	if err != nil {
		return nil, fmt.Errorf("fetching %s: %w", numerator, err)
	}
	if numVal == 0 && numTime.IsZero() {
		return nil, fmt.Errorf("no data available for %s", numerator)
	}

	denVal, denTime, err := s.LatestValue(ctx, denominator)
	if err != nil {
		return nil, fmt.Errorf("fetching %s: %w", denominator, err)
	}
	if denVal == 0 && denTime.IsZero() {
		return nil, fmt.Errorf("no data available for %s", denominator)
	}

	if denVal == 0 {
		return nil, fmt.Errorf("denominator %s has zero value, cannot divide", denominator)
	}

	// Use the later of the two timestamps
	ts := numTime
	if denTime.After(ts) {
		ts = denTime
	}

	return &store.TimeSeriesPoint{
		Time:   ts,
		Ticker: numerator + "_" + denominator + "_RATIO",
		Value:  numVal / denVal,
		Source: "computed",
	}, nil
}
