package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TimeSeriesPoint represents a single data point in the time_series table.
type TimeSeriesPoint struct {
	Time   time.Time
	Ticker string
	Value  float64
	Source string
}

// Store handles writing time series data to TimescaleDB.
type Store struct {
	pool *pgxpool.Pool
}

// New creates a Store connected to TimescaleDB via the given connection pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// WritePoints inserts time series points using COPY for bulk performance.
// It uses ON CONFLICT DO UPDATE to handle duplicate (time, ticker) pairs.
func (s *Store) WritePoints(ctx context.Context, points []TimeSeriesPoint) error {
	if len(points) == 0 {
		return nil
	}

	// Use a transaction with batch insert and upsert semantics
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Create a temporary table for staging
	_, err = tx.Exec(ctx, `
		CREATE TEMP TABLE _staging (
			time TIMESTAMPTZ NOT NULL,
			ticker TEXT NOT NULL,
			value DOUBLE PRECISION NOT NULL,
			source TEXT NOT NULL
		) ON COMMIT DROP
	`)
	if err != nil {
		return fmt.Errorf("creating staging table: %w", err)
	}

	// COPY data into staging table
	rows := make([][]interface{}, len(points))
	for i, p := range points {
		rows[i] = []interface{}{p.Time, p.Ticker, p.Value, p.Source}
	}

	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"_staging"},
		[]string{"time", "ticker", "value", "source"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return fmt.Errorf("copying to staging: %w", err)
	}

	// Upsert from staging into time_series
	_, err = tx.Exec(ctx, `
		INSERT INTO time_series (time, ticker, value, source)
		SELECT time, ticker, value, source FROM _staging
		ON CONFLICT (time, ticker) DO UPDATE SET
			value = EXCLUDED.value,
			source = EXCLUDED.source
	`)
	if err != nil {
		return fmt.Errorf("upserting from staging: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}

	return nil
}
