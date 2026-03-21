package valyu

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/malston/financial-risk-monitor/services/ingestion/store"
)

// BDC CIK mappings for SEC EDGAR searches.
var bdcCIKs = map[string]string{
	"OWL":  "0001823945",
	"ARCC": "0001287750",
	"BXSL": "0001838831",
	"OBDC": "0001544206",
}

// SentimentTicker maps a domain to its time_series ticker for aggregated sentiment.
var SentimentTicker = map[string]string{
	"private_credit": "SENTIMENT_PRIVATE_CREDIT",
	"ai_tech":        "SENTIMENT_AI_TECH",
	"energy_geo":     "SENTIMENT_ENERGY_GEO",
	"geopolitical":   "SENTIMENT_GEOPOLITICAL",
}

// NewsRow represents a row to insert into the news_sentiment table.
type NewsRow struct {
	Time       time.Time
	Domain     string
	Headline   string
	Sentiment  float64
	SourceName string
	SourceURL  string
}

// InsiderTradeRow represents a row to insert into the insider_trades table.
type InsiderTradeRow struct {
	Time        time.Time
	Ticker      string
	InsiderName string
	TradeType   string
	Shares      int
	Price       float64
	SourceURL   string
}

// ExtendedStore extends Store with methods for news_sentiment and insider_trades tables.
type ExtendedStore interface {
	Store
	WriteNewsSentiment(ctx context.Context, rows []NewsRow) error
	WriteInsiderTrades(ctx context.Context, rows []InsiderTradeRow) error
}

// FetchFilings searches Valyu for BDC filings and writes NAV values to the store.
// Returns the NAV data for downstream discount computation.
func FetchFilings(ctx context.Context, client *Client, s Store, budget *BudgetTracker, bdcs []string) ([]NAVData, error) {
	var navs []NAVData
	total := len(bdcs)
	successCount := 0

	for _, ticker := range bdcs {
		if err := budget.TrackCall(); err != nil {
			slog.Warn("budget limit reached, stopping filing search", "error", err)
			break
		}

		cik := bdcCIKs[ticker]
		query := fmt.Sprintf("%s CIK %s 10-Q 10-K quarterly filing NAV net asset value per share", ticker, cik)

		results, err := client.SearchFilings(ctx, query)
		if err != nil {
			slog.Warn("filing search failed, skipping", "ticker", ticker, "error", err)
			continue
		}

		successCount++ // API call succeeded, even if NAV extraction fails

		nav := extractNAV(results)
		if nav == 0 {
			slog.Warn("no NAV found in filing results", "ticker", ticker)
			continue
		}
		navs = append(navs, NAVData{Ticker: ticker, NAVPerShare: nav})

		point := store.TimeSeriesPoint{
			Time:   time.Now().UTC(),
			Ticker: "NAV_" + ticker,
			Value:  nav,
			Source: "valyu",
		}
		if err := s.WritePoints(ctx, []store.TimeSeriesPoint{point}); err != nil {
			slog.Error("writing NAV point", "ticker", ticker, "error", err)
		}
	}

	if total > 0 && successCount == 0 {
		return navs, fmt.Errorf("all %d filing lookups failed", total)
	}

	return navs, nil
}

// FetchNewsSentiment searches Valyu for news across risk domains and writes
// headlines with sentiment scores to the news_sentiment table.
func FetchNewsSentiment(ctx context.Context, client *Client, es ExtendedStore, budget *BudgetTracker, domains []string) error {
	total := len(domains)
	successCount := 0

	for _, domain := range domains {
		if err := budget.TrackCall(); err != nil {
			slog.Warn("budget limit reached, stopping news scan", "error", err)
			break
		}

		results, err := client.SearchNews(ctx, domain)
		if err != nil {
			slog.Warn("news search failed, skipping", "domain", domain, "error", err)
			continue
		}

		var rows []NewsRow
		var sentimentSum float64

		for _, r := range results {
			sentiment := estimateSentiment(r.Title + " " + r.Content)
			rows = append(rows, NewsRow{
				Time:       time.Now().UTC(),
				Domain:     domain,
				Headline:   r.Title,
				Sentiment:  sentiment,
				SourceName: extractSourceName(r.URL),
				SourceURL:  r.URL,
			})
			sentimentSum += sentiment
		}

		if len(rows) > 0 {
			successCount++
			if err := es.WriteNewsSentiment(ctx, rows); err != nil {
				slog.Error("writing news sentiment", "domain", domain, "error", err)
			}

			// Write domain-level aggregate to time_series
			avgSentiment := sentimentSum / float64(len(rows))
			ticker := SentimentTicker[domain]
			if ticker != "" {
				point := store.TimeSeriesPoint{
					Time:   time.Now().UTC(),
					Ticker: ticker,
					Value:  avgSentiment,
					Source: "valyu",
				}
				if err := es.WritePoints(ctx, []store.TimeSeriesPoint{point}); err != nil {
					slog.Error("writing sentiment aggregate", "domain", domain, "error", err)
				}
			}
		}
	}

	if total > 0 && successCount == 0 {
		return fmt.Errorf("all %d news sentiment lookups failed", total)
	}

	return nil
}

// FetchInsiderTrades searches Valyu for Form 4 insider transactions and writes
// results to the insider_trades table.
func FetchInsiderTrades(ctx context.Context, client *Client, es ExtendedStore, budget *BudgetTracker, tickers []string) error {
	total := len(tickers)
	successCount := 0

	for _, ticker := range tickers {
		if err := budget.TrackCall(); err != nil {
			slog.Warn("budget limit reached, stopping insider search", "error", err)
			break
		}

		results, err := client.SearchInsiderTrades(ctx, ticker)
		if err != nil {
			slog.Warn("insider trade search failed, skipping", "ticker", ticker, "error", err)
			continue
		}

		var rows []InsiderTradeRow
		for _, r := range results {
			trade := parseInsiderTrade(r, ticker)
			if trade != nil {
				rows = append(rows, *trade)
			}
		}

		if len(rows) > 0 {
			successCount++
			if err := es.WriteInsiderTrades(ctx, rows); err != nil {
				slog.Error("writing insider trades", "ticker", ticker, "error", err)
			}
		}
	}

	if total > 0 && successCount == 0 {
		return fmt.Errorf("all %d insider trade lookups failed", total)
	}

	return nil
}

// extractNAV attempts to find a NAV per share value from filing search results.
var navPattern = regexp.MustCompile(`(?i)(?:net asset value|NAV)\s*(?:per share)?\s*(?:of|:|\$)?\s*\$?([\d]+\.[\d]+)`)

func extractNAV(results []SearchResult) float64 {
	for _, r := range results {
		matches := navPattern.FindStringSubmatch(r.Content)
		if len(matches) >= 2 {
			val, err := strconv.ParseFloat(matches[1], 64)
			if err == nil && val > 0 {
				return val
			}
		}
	}
	return 0
}

// estimateSentiment provides a simple keyword-based sentiment score.
// Returns a value between -1.0 (very negative) and 1.0 (very positive).
func estimateSentiment(text string) float64 {
	lower := strings.ToLower(text)

	negativeTerms := []string{
		"default", "stress", "decline", "loss", "crash", "warning",
		"risk", "bearish", "downgrade", "sell-off", "selloff",
		"concern", "fear", "tension", "escalation", "threat",
		"sanctions", "tariff", "recession", "layoff", "bankruptcy",
	}

	positiveTerms := []string{
		"growth", "rally", "gain", "upgrade", "bullish", "recovery",
		"profit", "surge", "boom", "optimistic", "strong", "beat",
		"exceed", "innovation", "breakthrough", "deal", "agreement",
	}

	var score float64
	for _, term := range negativeTerms {
		if strings.Contains(lower, term) {
			score -= 0.15
		}
	}
	for _, term := range positiveTerms {
		if strings.Contains(lower, term) {
			score += 0.15
		}
	}

	// Clamp to [-1, 1]
	if score > 1.0 {
		score = 1.0
	}
	if score < -1.0 {
		score = -1.0
	}

	return score
}

// extractSourceName extracts a readable source name from a URL.
func extractSourceName(url string) string {
	if url == "" {
		return ""
	}
	s := strings.TrimPrefix(url, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "www.")

	if idx := strings.Index(s, "/"); idx > 0 {
		s = s[:idx]
	}
	return s
}

// parseInsiderTrade extracts insider trade data from a Valyu search result.
var tradePattern = regexp.MustCompile(`(?i)([\w\s\.]+?)\s+(?:sold|bought|sale|purchase)\s+(\d[\d,]*)\s+shares?\s*(?:of\s+\w+\s+)?(?:at\s+\$?([\d]+\.?\d*))`)

func parseInsiderTrade(result SearchResult, ticker string) *InsiderTradeRow {
	text := result.Title + " " + result.Content
	matches := tradePattern.FindStringSubmatch(text)

	if len(matches) < 3 {
		return nil
	}

	insiderName := strings.TrimSpace(matches[1])
	sharesStr := strings.ReplaceAll(matches[2], ",", "")
	shares, err := strconv.Atoi(sharesStr)
	if err != nil {
		return nil
	}

	var price float64
	if len(matches) >= 4 && matches[3] != "" {
		price, _ = strconv.ParseFloat(matches[3], 64)
	}

	tradeType := "sell"
	lower := strings.ToLower(text)
	if strings.Contains(lower, "bought") || strings.Contains(lower, "purchase") || strings.Contains(lower, "buy") {
		tradeType = "buy"
	}

	return &InsiderTradeRow{
		Time:        time.Now().UTC(),
		Ticker:      ticker,
		InsiderName: insiderName,
		TradeType:   tradeType,
		Shares:      shares,
		Price:       price,
		SourceURL:   result.URL,
	}
}
