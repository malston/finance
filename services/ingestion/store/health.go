package store

import (
	"context"
	"fmt"
	"time"
)

// SourceHealth represents the health status of a single data source.
type SourceHealth struct {
	Source              string
	LastSuccess         *time.Time
	LastError           *time.Time
	LastErrorMsg        *string
	ConsecutiveFailures int
}

// HealthStore defines the health tracking operations.
type HealthStore interface {
	UpdateSourceHealth(ctx context.Context, source string, err error) error
	GetSourceHealth(ctx context.Context) ([]SourceHealth, error)
}

// UpdateSourceHealth upserts a row in source_health after a poll cycle.
// On success (err == nil): sets last_success = now, resets consecutive_failures to 0.
// On failure (err != nil): sets last_error = now, last_error_msg, increments consecutive_failures.
func (s *Store) UpdateSourceHealth(ctx context.Context, source string, pollErr error) error {
	if pollErr == nil {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO source_health (source, last_success, consecutive_failures)
			VALUES ($1, NOW(), 0)
			ON CONFLICT (source) DO UPDATE SET
				last_success = NOW(),
				consecutive_failures = 0
		`, source)
		if err != nil {
			return fmt.Errorf("UpdateSourceHealth success for %s: %w", source, err)
		}
		return nil
	}

	errMsg := pollErr.Error()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO source_health (source, last_error, last_error_msg, consecutive_failures)
		VALUES ($1, NOW(), $2, 1)
		ON CONFLICT (source) DO UPDATE SET
			last_error = NOW(),
			last_error_msg = $2,
			consecutive_failures = source_health.consecutive_failures + 1
	`, source, errMsg)
	if err != nil {
		return fmt.Errorf("UpdateSourceHealth failure for %s: %w", source, err)
	}
	return nil
}

// GetSourceHealth returns all rows from the source_health table, ordered by source name.
func (s *Store) GetSourceHealth(ctx context.Context) ([]SourceHealth, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT source, last_success, last_error, last_error_msg, consecutive_failures
		FROM source_health
		ORDER BY source
	`)
	if err != nil {
		return nil, fmt.Errorf("GetSourceHealth: %w", err)
	}
	defer rows.Close()

	var results []SourceHealth
	for rows.Next() {
		var h SourceHealth
		if err := rows.Scan(&h.Source, &h.LastSuccess, &h.LastError, &h.LastErrorMsg, &h.ConsecutiveFailures); err != nil {
			return nil, fmt.Errorf("GetSourceHealth scan: %w", err)
		}
		results = append(results, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetSourceHealth rows: %w", err)
	}

	return results, nil
}
