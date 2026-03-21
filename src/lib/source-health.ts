export interface SourceStatus {
  source: string;
  last_success: string | null;
  stale: boolean;
  staleness_threshold: string;
  consecutive_failures: number;
}

export interface SourceHealthResponse {
  sources: SourceStatus[];
}

/**
 * Maps each data source to the tickers it provides.
 * finnhub covers all equity/ETF price data (REST and WebSocket).
 * fred covers Treasury and credit spread series from the FRED API.
 * valyu covers search/analysis data (sentiment, filings, insider trades) -- NOT price data.
 */
export const SOURCE_TICKER_MAP: Record<string, string[]> = {
  finnhub: [
    "OWL",
    "ARCC",
    "BXSL",
    "OBDC",
    "HYG",
    "NVDA",
    "MSFT",
    "GOOGL",
    "META",
    "AMZN",
    "SPY",
    "RSP",
    "SMH",
    "XLU",
    "EWT",
    "VIX",
    "MOVE",
    "SKEW",
    "CL=F",
    "NG=F",
  ],
  fred: ["BAMLH0A0HYM2", "DGS10", "DGS2", "T10Y2Y"],
  valyu: ["news_sentiment", "sec_filings", "insider_trades"],
};

const tickerToSource: Record<string, string> = {};
for (const [source, tickers] of Object.entries(SOURCE_TICKER_MAP)) {
  for (const ticker of tickers) {
    tickerToSource[ticker] = source;
  }
}

/**
 * Returns the data source name for a given ticker symbol,
 * or null if the ticker is synthetic/computed (e.g. SPY_RSP_RATIO, CORR).
 */
export function getSourceForTicker(ticker: string): string | null {
  return tickerToSource[ticker] ?? null;
}
