package store

import (
	"context"
	"fmt"
	"time"
)

// SourceHealth represents the health status of a data source.
type SourceHealth struct {
	Source              string
	LastSuccess         time.Time
	LastError           *time.Time
	LastErrorMsg        *string
	ConsecutiveFailures int
}

// IsStale returns true if the given timestamp is older than the threshold,
// or if the timestamp is zero (no data ever received).
func IsStale(lastSuccess time.Time, threshold time.Duration) bool {
	if lastSuccess.IsZero() {
		return true
	}
	return time.Since(lastSuccess) >= threshold
}

// UpdateSourceHealth upserts the source_health row for the given source.
// On success (err == nil): sets last_success = now, consecutive_failures = 0.
// On failure (err != nil): sets last_error = now, last_error_msg, consecutive_failures += 1.
func (s *Store) UpdateSourceHealth(ctx context.Context, source string, pollErr error) error {
	if source == "" {
		return fmt.Errorf("source must not be empty")
	}
	if s.pool == nil {
		return fmt.Errorf("database pool is nil")
	}

	now := time.Now()

	if pollErr == nil {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO source_health (source, last_success, consecutive_failures)
			VALUES ($1, $2, 0)
			ON CONFLICT (source) DO UPDATE SET
				last_success = $2,
				consecutive_failures = 0
		`, source, now)
		if err != nil {
			return fmt.Errorf("updating source health (success) for %s: %w", source, err)
		}
		return nil
	}

	errMsg := pollErr.Error()
	// Use epoch as placeholder for last_success on first failure (source never succeeded).
	// This ensures the source appears stale, which is correct behavior.
	epoch := time.Unix(0, 0).UTC()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO source_health (source, last_success, last_error, last_error_msg, consecutive_failures)
		VALUES ($1, $2, $3, $4, 1)
		ON CONFLICT (source) DO UPDATE SET
			last_error = $3,
			last_error_msg = $4,
			consecutive_failures = source_health.consecutive_failures + 1
	`, source, epoch, now, errMsg)
	if err != nil {
		return fmt.Errorf("updating source health (failure) for %s: %w", source, err)
	}
	return nil
}

// GetSourceHealth returns the health status of all tracked sources.
func (s *Store) GetSourceHealth(ctx context.Context) ([]SourceHealth, error) {
	if s.pool == nil {
		return nil, fmt.Errorf("database pool is nil")
	}

	rows, err := s.pool.Query(ctx,
		`SELECT source, last_success, last_error, last_error_msg, consecutive_failures
		 FROM source_health ORDER BY source`)
	if err != nil {
		return nil, fmt.Errorf("querying source health: %w", err)
	}
	defer rows.Close()

	var results []SourceHealth
	for rows.Next() {
		var h SourceHealth
		if err := rows.Scan(&h.Source, &h.LastSuccess, &h.LastError, &h.LastErrorMsg, &h.ConsecutiveFailures); err != nil {
			return nil, fmt.Errorf("scanning source health row: %w", err)
		}
		results = append(results, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating source health rows: %w", err)
	}

	return results, nil
}
