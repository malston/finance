package valyu

import (
	"fmt"
	"sync/atomic"
)

// BudgetTracker tracks Valyu API call counts against daily limits.
type BudgetTracker struct {
	dailyMax  int64
	warnAt    int64
	callCount atomic.Int64
}

// NewBudgetTracker creates a tracker with the given daily maximum and warning threshold.
func NewBudgetTracker(dailyMax, warnAt int) *BudgetTracker {
	return &BudgetTracker{
		dailyMax: int64(dailyMax),
		warnAt:   int64(warnAt),
	}
}

// TrackCall increments the daily call counter. Returns an error if the daily
// limit has been reached.
func (b *BudgetTracker) TrackCall() error {
	newCount := b.callCount.Add(1)
	if newCount > int64(b.dailyMax) {
		b.callCount.Add(-1)
		return fmt.Errorf("daily Valyu API call limit reached (%d/%d)", b.dailyMax, b.dailyMax)
	}
	return nil
}

// DailyCount returns the number of calls made today.
func (b *BudgetTracker) DailyCount() int {
	return int(b.callCount.Load())
}

// IsWarning returns true if the call count has reached the warning threshold.
func (b *BudgetTracker) IsWarning() bool {
	return b.callCount.Load() >= b.warnAt
}

// Reset clears the daily counter. Called at midnight or start of each day.
func (b *BudgetTracker) Reset() {
	b.callCount.Store(0)
}
