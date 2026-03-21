export interface TickerConfig {
  symbol: string;
  label: string;
  inverted?: boolean;
}

export interface DomainConfig {
  name: string;
  description: string;
  icon: string;
  color: string;
  scoreKey: string;
  tickers: TickerConfig[];
}

export const DOMAINS: DomainConfig[] = [
  {
    name: "Private Credit Stress",
    description: "BDC discounts, HY spreads, redemption pressure",
    icon: "building2",
    color: "#f97316",
    scoreKey: "private_credit",
    tickers: [
      { symbol: "OWL", label: "OWL" },
      { symbol: "ARCC", label: "ARCC" },
      { symbol: "BXSL", label: "BXSL" },
      { symbol: "OBDC", label: "OBDC" },
      { symbol: "HYG", label: "HYG" },
      { symbol: "BAMLH0A0HYM2", label: "HY Credit Spread", inverted: true },
    ],
  },
  {
    name: "AI / Tech Concentration",
    description: "Mag-10 weight, SPY vs RSP spread, sector momentum",
    icon: "cpu",
    color: "#a855f7",
    scoreKey: "ai_concentration",
    tickers: [
      {
        symbol: "SPY_RSP_RATIO",
        label: "Cap-Weight vs Equal-Weight Spread",
      },
      { symbol: "NVDA", label: "NVDA" },
      { symbol: "MSFT", label: "MSFT" },
      { symbol: "GOOGL", label: "GOOGL" },
      { symbol: "META", label: "META" },
      { symbol: "AMZN", label: "AMZN" },
      { symbol: "SMH", label: "SMH" },
    ],
  },
  {
    name: "Energy & Geopolitical",
    description: "Crude, natural gas, shipping, Taiwan risk proxy",
    icon: "fuel",
    color: "#06b6d4",
    scoreKey: "energy_geo",
    tickers: [
      { symbol: "CL=F", label: "CL=F" },
      { symbol: "NG=F", label: "NG=F" },
      { symbol: "XLU", label: "XLU" },
      { symbol: "EWT", label: "EWT" },
    ],
  },
  {
    name: "Cross-Domain Contagion",
    description: "Rolling correlations across sectors, VIX, MOVE",
    icon: "link",
    color: "#ef4444",
    scoreKey: "contagion",
    tickers: [
      { symbol: "CORR", label: "Max Pairwise Correlation" },
      { symbol: "VIX", label: "VIX" },
      { symbol: "MOVE", label: "MOVE" },
      { symbol: "SKEW", label: "SKEW" },
    ],
  },
];
