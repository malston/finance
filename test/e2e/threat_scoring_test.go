//go:build e2e

package e2e

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// baseURL is the root URL for the Next.js app, configurable via E2E_APP_URL.
func baseURL(t *testing.T) string {
	t.Helper()
	if u := os.Getenv("E2E_APP_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "http://localhost:3000"
}

// waitForApp polls the app URL until it responds or the timeout expires.
func waitForApp(t *testing.T, timeout time.Duration) {
	t.Helper()

	base := baseURL(t)
	deadline := time.Now().Add(timeout)
	var lastErr error

	for time.Now().Before(deadline) {
		resp, err := http.Get(base)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				t.Logf("app is ready at %s", base)
				return
			}
		}
		lastErr = err
		time.Sleep(2 * time.Second)
	}

	t.Fatalf("app at %s not ready after %v: %v", base, timeout, lastErr)
}

// scoreResponse represents the JSON shape of GET /api/risk/scores.
type scoreResponse struct {
	Composite compositeScore         `json:"composite"`
	Domains   map[string]domainScore `json:"domains"`
	UpdatedAt *string                `json:"updated_at"`
}

type compositeScore struct {
	Score *float64 `json:"score"`
	Level *string  `json:"level"`
	Color *string  `json:"color"`
}

type domainScore struct {
	Score  *float64 `json:"score"`
	Weight float64  `json:"weight"`
	Level  *string  `json:"level"`
	Color  *string  `json:"color"`
}

// threatLevelExpectation maps a score to its expected level and color.
func threatLevelExpectation(score float64) (string, string) {
	if score <= 25 {
		return "LOW", "#22c55e"
	}
	if score <= 50 {
		return "ELEVATED", "#eab308"
	}
	if score <= 75 {
		return "HIGH", "#f97316"
	}
	return "CRITICAL", "#ef4444"
}

// domainWeights mirrors the weights from the scoring config and the API route.
var domainWeights = map[string]float64{
	"private_credit":   0.30,
	"ai_concentration": 0.20,
	"energy_geo":       0.25,
	"contagion":        0.25,
}

// expectedDomains is the complete list of domain keys expected in the response.
var expectedDomains = []string{
	"private_credit",
	"ai_concentration",
	"energy_geo",
	"contagion",
}

// waitForScores polls GET /api/risk/scores until the composite score is non-null
// or the timeout expires. Returns the last successful response body.
func waitForScores(t *testing.T, timeout time.Duration) scoreResponse {
	t.Helper()

	base := baseURL(t)
	url := fmt.Sprintf("%s/api/risk/scores", base)
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil || resp.StatusCode != http.StatusOK {
			time.Sleep(5 * time.Second)
			continue
		}

		var scores scoreResponse
		if err := json.Unmarshal(body, &scores); err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		if scores.Composite.Score != nil {
			t.Logf("scores available: composite=%.2f", *scores.Composite.Score)
			return scores
		}

		time.Sleep(5 * time.Second)
	}

	t.Fatalf("no composite score available at %s after %v", url, timeout)
	return scoreResponse{} // unreachable
}

// TestE2E_ScoresEndpointReturnsValidJSON verifies that GET /api/risk/scores
// returns a 200 with correct JSON structure containing composite and domain scores.
func TestE2E_ScoresEndpointReturnsValidJSON(t *testing.T) {
	waitForApp(t, 2*time.Minute)

	base := baseURL(t)
	url := fmt.Sprintf("%s/api/risk/scores", base)

	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s failed: %v", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, string(body))
	}

	// Verify response is valid JSON with the expected top-level keys
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("response is not valid JSON: %v\nbody: %s", err, string(body))
	}

	for _, key := range []string{"composite", "domains", "updated_at"} {
		if _, ok := raw[key]; !ok {
			t.Errorf("response missing top-level key %q", key)
		}
	}

	// Parse composite and verify it has score, level, color fields
	var composite map[string]json.RawMessage
	if err := json.Unmarshal(raw["composite"], &composite); err != nil {
		t.Fatalf("composite is not a JSON object: %v", err)
	}
	for _, field := range []string{"score", "level", "color"} {
		if _, ok := composite[field]; !ok {
			t.Errorf("composite missing field %q", field)
		}
	}

	// Parse domains and verify each has score, weight, level, color
	var domains map[string]map[string]json.RawMessage
	if err := json.Unmarshal(raw["domains"], &domains); err != nil {
		t.Fatalf("domains is not a JSON object: %v", err)
	}
	for _, name := range expectedDomains {
		domain, ok := domains[name]
		if !ok {
			t.Errorf("domains missing %q", name)
			continue
		}
		for _, field := range []string{"score", "weight", "level", "color"} {
			if _, ok := domain[field]; !ok {
				t.Errorf("domain %q missing field %q", name, field)
			}
		}
	}

	t.Logf("response shape valid: composite + %d domains", len(domains))
}

// TestE2E_DomainScoresInRange verifies that all present domain scores are
// between 0 and 100.
func TestE2E_DomainScoresInRange(t *testing.T) {
	waitForApp(t, 2*time.Minute)
	scores := waitForScores(t, 5*time.Minute)

	for _, name := range expectedDomains {
		t.Run(name, func(t *testing.T) {
			domain, ok := scores.Domains[name]
			if !ok {
				t.Fatalf("domain %q not found in response", name)
			}
			if domain.Score == nil {
				t.Fatalf("domain %q score is null; scoring pipeline has not computed it", name)
			}
			score := *domain.Score
			if score < 0 || score > 100 {
				t.Errorf("domain %q score %.2f is outside [0, 100]", name, score)
			}
			t.Logf("%s: score=%.2f", name, score)
		})
	}
}

// TestE2E_CompositeMatchesWeightedAverage verifies the composite score equals
// the weighted average of the domain scores within a rounding tolerance.
func TestE2E_CompositeMatchesWeightedAverage(t *testing.T) {
	waitForApp(t, 2*time.Minute)
	scores := waitForScores(t, 5*time.Minute)

	if scores.Composite.Score == nil {
		t.Fatal("composite score is null")
	}

	composite := *scores.Composite.Score

	// Compute expected weighted average from the domain scores
	weightedSum := 0.0
	totalWeight := 0.0

	for _, name := range expectedDomains {
		domain, ok := scores.Domains[name]
		if !ok || domain.Score == nil {
			t.Logf("domain %q missing or null; excluded from weighted average", name)
			continue
		}
		weight := domainWeights[name]
		weightedSum += *domain.Score * weight
		totalWeight += weight
	}

	if totalWeight == 0 {
		t.Fatal("no domain scores available; cannot verify composite")
	}

	expected := weightedSum / totalWeight

	// Allow rounding tolerance of 0.1 (scores are rounded to 2 decimals on the server)
	tolerance := 0.1
	if math.Abs(composite-expected) > tolerance {
		t.Errorf(
			"composite=%.2f does not match weighted average=%.4f (tolerance=%.1f)",
			composite, expected, tolerance,
		)
	}

	t.Logf("composite=%.2f, expected=%.4f, delta=%.4f", composite, expected, math.Abs(composite-expected))
}

// TestE2E_ThreatLevelsMatchScores verifies that each domain's level and color
// match its score according to the threshold rules:
// LOW 0-25 #22c55e, ELEVATED 26-50 #eab308, HIGH 51-75 #f97316, CRITICAL 76-100 #ef4444
func TestE2E_ThreatLevelsMatchScores(t *testing.T) {
	waitForApp(t, 2*time.Minute)
	scores := waitForScores(t, 5*time.Minute)

	// Verify composite level and color
	t.Run("composite", func(t *testing.T) {
		if scores.Composite.Score == nil {
			t.Fatal("composite score is null")
		}
		if scores.Composite.Level == nil {
			t.Fatal("composite level is null")
		}
		if scores.Composite.Color == nil {
			t.Fatal("composite color is null")
		}

		expectedLevel, expectedColor := threatLevelExpectation(*scores.Composite.Score)
		if *scores.Composite.Level != expectedLevel {
			t.Errorf(
				"composite level=%q for score=%.2f, want %q",
				*scores.Composite.Level, *scores.Composite.Score, expectedLevel,
			)
		}
		if *scores.Composite.Color != expectedColor {
			t.Errorf(
				"composite color=%q for score=%.2f, want %q",
				*scores.Composite.Color, *scores.Composite.Score, expectedColor,
			)
		}
		t.Logf("composite: score=%.2f level=%s color=%s", *scores.Composite.Score, *scores.Composite.Level, *scores.Composite.Color)
	})

	// Verify each domain level and color
	for _, name := range expectedDomains {
		t.Run(name, func(t *testing.T) {
			domain, ok := scores.Domains[name]
			if !ok {
				t.Fatalf("domain %q not found", name)
			}
			if domain.Score == nil {
				t.Fatalf("domain %q score is null", name)
			}
			if domain.Level == nil {
				t.Fatalf("domain %q level is null", name)
			}
			if domain.Color == nil {
				t.Fatalf("domain %q color is null", name)
			}

			expectedLevel, expectedColor := threatLevelExpectation(*domain.Score)
			if *domain.Level != expectedLevel {
				t.Errorf(
					"%s: level=%q for score=%.2f, want %q",
					name, *domain.Level, *domain.Score, expectedLevel,
				)
			}
			if *domain.Color != expectedColor {
				t.Errorf(
					"%s: color=%q for score=%.2f, want %q",
					name, *domain.Color, *domain.Score, expectedColor,
				)
			}
			t.Logf("%s: score=%.2f level=%s color=%s", name, *domain.Score, *domain.Level, *domain.Color)
		})
	}
}

// TestE2E_DomainWeightsCorrect verifies that each domain reports its correct weight.
func TestE2E_DomainWeightsCorrect(t *testing.T) {
	waitForApp(t, 2*time.Minute)

	base := baseURL(t)
	url := fmt.Sprintf("%s/api/risk/scores", base)

	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s failed: %v", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d: %s", resp.StatusCode, string(body))
	}

	var scores scoreResponse
	if err := json.Unmarshal(body, &scores); err != nil {
		t.Fatalf("decoding response: %v", err)
	}

	for name, expectedWeight := range domainWeights {
		t.Run(name, func(t *testing.T) {
			domain, ok := scores.Domains[name]
			if !ok {
				t.Fatalf("domain %q not found", name)
			}
			if math.Abs(domain.Weight-expectedWeight) > 0.001 {
				t.Errorf("%s: weight=%.2f, want %.2f", name, domain.Weight, expectedWeight)
			}
			t.Logf("%s: weight=%.2f", name, domain.Weight)
		})
	}

	// Verify weights sum to 1.0
	totalWeight := 0.0
	for _, w := range domainWeights {
		totalWeight += w
	}
	if math.Abs(totalWeight-1.0) > 0.001 {
		t.Errorf("domain weights sum to %.3f, want 1.000", totalWeight)
	}
}
