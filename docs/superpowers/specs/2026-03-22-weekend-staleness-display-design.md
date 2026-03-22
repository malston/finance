# Weekend Staleness Display

**Issue**: [#19](https://github.com/malston/financial-risk-monitor/issues/19)
**Date**: 2026-03-22

## Problem

On weekends and market holidays, the dashboard shows numeric scores from Friday's last scoring run but provides no indication of when those scores were computed. Users cannot distinguish between a live 5-minute-old score and a 2-day-old weekend score.

The scoring pipeline runs 24/7 on a 5-minute interval. During non-market hours, `fetch_latest_value(max_age_hours=2)` returns `None` for stale market data, so scorers skip writing new `SCORE_*` rows. The dashboard's `queryLatestPrices` query has no time filter, so Friday's last scores persist and are returned by the API.

## Decision

Display-only change. The scoring pipeline's 2-hour staleness window remains untouched -- it correctly prevents stale-data alerts. The dashboard surfaces the existing `updated_at` timestamp so users know the data age.

## Design

### Staleness threshold

A score is considered "aged" when `updated_at` is older than 30 minutes. This threshold is defined as a constant in the component (not config-driven -- YAGNI).

### CompositeScore component

When data is aged, render an "as of" line below the threat level:

```
● THREAT LEVEL: ELEVATED
  as of Fri, Mar 20 4:00 PM
```

- Format: `as of {weekday}, {month} {day} {time}` using the browser's locale-aware formatting.
- When data is fresh (< 30 min old), the line is hidden to keep the UI clean during market hours.
- When `updated_at` is null, no timestamp line is shown (the `--` score already signals missing data).

### SectorPanel component

The sector panel already receives `updated_at` from the scores API response (via the parent query). When data is aged, show the same "as of" timestamp in the domain header area, next to the domain name. Reuse the same formatting and threshold logic.

### Shared utility

Extract a small helper into `src/lib/format-score-age.ts`:

- `isScoreAged(updatedAt: string | null, thresholdMs?: number): boolean` -- returns true when the score timestamp is older than the threshold (default 30 min).
- `formatScoreTimestamp(updatedAt: string): string` -- returns the "as of ..." display string.

This avoids duplicating the threshold constant and date formatting between CompositeScore and SectorPanel.

### What does NOT change

- **Scoring pipeline**: No changes to `fetch_latest_value`, `max_age_hours`, or any Python code.
- **API routes**: No changes. The `/api/risk/scores` route already returns `updated_at`.
- **Database**: No schema changes.
- **Alert evaluation**: Unaffected.

## Testing

### Unit tests

- `format-score-age.test.ts`: Test `isScoreAged` with fresh, aged, and null timestamps. Test `formatScoreTimestamp` output format.
- `composite-score.test.tsx`: Add test case for aged data rendering the "as of" line. Add test case for fresh data not rendering the "as of" line.
- `sector-panel.test.tsx`: Add test case for aged data rendering the timestamp in domain header.

### Manual verification

- Run the dashboard with the scoring pipeline stopped (simulates weekend -- stale SCORE\_\* rows in DB).
- Confirm scores display with "as of" timestamp.
- Restart the pipeline, confirm the "as of" line disappears once scores are fresh.

## Files to create

| File                                         | Purpose                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `src/lib/format-score-age.ts`                | `isScoreAged` and `formatScoreTimestamp` helpers |
| `src/lib/__tests__/format-score-age.test.ts` | Unit tests for the helpers                       |

## Files to modify

| File                                                     | Change                                              |
| -------------------------------------------------------- | --------------------------------------------------- |
| `src/components/risk/composite-score.tsx`                | Render "as of" line when data is aged               |
| `src/components/risk/sector-panel.tsx`                   | Render "as of" timestamp in domain header when aged |
| `src/components/risk/__tests__/composite-score.test.tsx` | Add aged/fresh timestamp display tests              |
| `src/components/risk/__tests__/sector-panel.test.tsx`    | Add aged timestamp display test                     |
