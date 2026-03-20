package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/fred"
	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/store"
)

// Store defines the persistence operations the scheduler needs.
type Store interface {
	WritePoints(ctx context.Context, points []store.TimeSeriesPoint) error
	LatestTimestamp(ctx context.Context, ticker string) (time.Time, error)
}

// FetchOnce fetches all configured series from FRED and writes new observations
// to the store. Retryable errors (rate limit, server errors) are logged and
// skipped; other errors are also logged but do not halt remaining series.
func FetchOnce(ctx context.Context, client *fred.Client, s Store, series []string, lookbackDays int) error {
	for _, seriesID := range series {
		if err := fetchSeries(ctx, client, s, seriesID, lookbackDays); err != nil {
			var retryErr *fred.RetryableError
			if errors.As(err, &retryErr) {
				slog.Warn("retryable error fetching series, will retry next cycle",
					"series", seriesID, "status", retryErr.StatusCode)
				continue
			}
			slog.Warn("error fetching series", "series", seriesID, "error", err)
			continue
		}
	}
	return nil
}

func fetchSeries(ctx context.Context, client *fred.Client, s Store, seriesID string, lookbackDays int) error {
	// Determine start date: incremental from latest stored, or lookback
	startDate, err := incrementalStartDate(ctx, s, seriesID, lookbackDays)
	if err != nil {
		return fmt.Errorf("determining start date for %s: %w", seriesID, err)
	}

	slog.Info("fetching FRED series", "series", seriesID, "start_date", startDate)

	observations, err := client.FetchSeries(ctx, seriesID, startDate)
	if err != nil {
		return err
	}

	if len(observations) == 0 {
		slog.Info("no observations returned", "series", seriesID)
		return nil
	}

	points := make([]store.TimeSeriesPoint, len(observations))
	for i, obs := range observations {
		points[i] = store.TimeSeriesPoint{
			Time:   obs.Date,
			Ticker: seriesID,
			Value:  obs.Value,
			Source: "fred",
		}
	}

	if err := s.WritePoints(ctx, points); err != nil {
		return fmt.Errorf("writing points for %s: %w", seriesID, err)
	}

	slog.Info("wrote observations", "series", seriesID, "count", len(points))
	return nil
}

func incrementalStartDate(ctx context.Context, s Store, seriesID string, lookbackDays int) (string, error) {
	latest, err := s.LatestTimestamp(ctx, seriesID)
	if err != nil {
		return "", err
	}

	if latest.IsZero() {
		// No data yet -- use lookback
		return time.Now().AddDate(0, 0, -lookbackDays).Format("2006-01-02"), nil
	}

	// Start from the day after the latest stored observation
	return latest.AddDate(0, 0, 1).Format("2006-01-02"), nil
}
