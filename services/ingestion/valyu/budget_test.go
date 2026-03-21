package valyu_test

import (
	"testing"

	"github.com/yorkeccak/financial-risk-monitor/services/ingestion/valyu"
)

func TestBudgetTracker_TrackCall_IncrementsCount(t *testing.T) {
	tracker := valyu.NewBudgetTracker(100, 80)
	if err := tracker.TrackCall(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tracker.DailyCount() != 1 {
		t.Errorf("DailyCount = %d, want 1", tracker.DailyCount())
	}
}

func TestBudgetTracker_TrackCall_RejectsAtLimit(t *testing.T) {
	tracker := valyu.NewBudgetTracker(2, 1)
	tracker.TrackCall()
	tracker.TrackCall()
	err := tracker.TrackCall()
	if err == nil {
		t.Fatal("expected error when exceeding daily limit, got nil")
	}
}

func TestBudgetTracker_WarningThreshold(t *testing.T) {
	tracker := valyu.NewBudgetTracker(100, 80)
	for i := 0; i < 80; i++ {
		tracker.TrackCall()
	}
	if !tracker.IsWarning() {
		t.Error("expected IsWarning() to return true at 80/100")
	}
}

func TestBudgetTracker_NotWarningBelowThreshold(t *testing.T) {
	tracker := valyu.NewBudgetTracker(100, 80)
	for i := 0; i < 79; i++ {
		tracker.TrackCall()
	}
	if tracker.IsWarning() {
		t.Error("expected IsWarning() to return false at 79/100")
	}
}

func TestBudgetTracker_Reset_ClearsCount(t *testing.T) {
	tracker := valyu.NewBudgetTracker(100, 80)
	for i := 0; i < 50; i++ {
		tracker.TrackCall()
	}
	tracker.Reset()
	if tracker.DailyCount() != 0 {
		t.Errorf("DailyCount after Reset = %d, want 0", tracker.DailyCount())
	}
}

func TestBudgetTracker_TrackCall_ConcurrentSafe(t *testing.T) {
	tracker := valyu.NewBudgetTracker(1000, 800)
	done := make(chan struct{})
	for i := 0; i < 100; i++ {
		go func() {
			tracker.TrackCall()
			done <- struct{}{}
		}()
	}
	for i := 0; i < 100; i++ {
		<-done
	}
	if tracker.DailyCount() != 100 {
		t.Errorf("DailyCount = %d, want 100 (concurrent safety)", tracker.DailyCount())
	}
}
