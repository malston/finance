/**
 * Plain-language definitions for financial jargon used in the dashboard.
 * Displayed in tooltips for non-finance users.
 */
export const JARGON_DEFINITIONS: Record<string, string> = {
  "Pearson Correlation":
    "A statistical measure of how two data series move together, from -1 (opposite) to +1 (identical). Above 0.5 indicates strong co-movement.",
  "HY Credit Spread":
    "The extra yield investors demand to hold risky corporate bonds instead of safe government bonds. Wider spreads indicate more fear.",
  BDC: "Business Development Company -- a publicly traded fund that lends to private companies. Their stock price can signal private credit market stress.",
  VIX: "The 'fear index' -- measures expected stock market volatility over the next 30 days. Higher values mean more fear.",
  MOVE: "Measures expected bond market volatility. Rising with VIX suggests stress is spreading across asset classes.",
  "SPY/RSP Ratio":
    "Compares the cap-weighted S&P 500 (dominated by mega-caps) to the equal-weighted version. Higher ratio = more concentration in big tech.",
  Contagion:
    "When stress in one market sector spreads to others through forced selling, margin calls, or investor panic.",
};
