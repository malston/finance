/**
 * Plain-language definitions for financial jargon used in the dashboard.
 * Each term has two variants: one per analytical framework.
 * Displayed in tooltips for non-finance users.
 */
export const JARGON_DEFINITIONS: Record<
  string,
  { bookstaber: string; yardeni: string }
> = {
  "Pearson Correlation": {
    bookstaber:
      "Measures how risk domains move together. Above 0.5 signals contagion -- stress spreading across sectors through forced selling and margin calls.",
    yardeni:
      "Measures co-movement across sectors. Even high correlations (up to 0.85) are normal during selloffs and typically revert. Only extreme, sustained correlation signals structural breakdown.",
  },
  "HY Credit Spread": {
    bookstaber:
      "The extra yield investors demand for risky corporate bonds. Widening spreads signal growing fear of defaults and credit market stress.",
    yardeni:
      "The risk premium on corporate bonds. Spread widening is cyclical and self-correcting -- distressed asset funds step in when spreads hit attractive levels, providing a natural floor.",
  },
  BDC: {
    bookstaber:
      "Business Development Company -- a publicly traded private credit fund. Deep NAV discounts signal that markets expect loan losses, a leading indicator of private credit stress.",
    yardeni:
      "Business Development Company -- a publicly traded private credit fund. NAV discounts often reflect retail panic rather than fundamental credit deterioration. Bank substitution limits systemic risk.",
  },
  VIX: {
    bookstaber:
      "The 'fear index' -- expected 30-day stock volatility. Elevated VIX combined with rising correlations is the classic contagion signature.",
    yardeni:
      "Expected 30-day stock volatility. VIX spikes are typically short-lived -- markets have consistently recovered from VIX readings above 40 within months. A fear signal, not a collapse signal.",
  },
  MOVE: {
    bookstaber:
      "Expected bond market volatility. Rising with VIX suggests stress is spreading from equities to fixed income -- a cross-asset contagion signal.",
    yardeni:
      "Expected bond market volatility. Bond vol spikes alongside equity vol during major events but historically normalizes as the Fed and market participants adjust.",
  },
  "SPY/RSP Ratio": {
    bookstaber:
      "Cap-weighted vs equal-weighted S&P 500. A rising ratio means mega-cap tech is driving the index -- concentration risk that amplifies when those names sell off.",
    yardeni:
      "Cap-weighted vs equal-weighted S&P 500. Concentration in productive, cash-rich companies is a feature of the AI-driven productivity boom, not a vulnerability. Yardeni sees S&P 10k by 2029.",
  },
  Contagion: {
    bookstaber:
      "When stress in one market sector spreads to others through forced selling, margin calls, or investor panic. The core risk this monitor tracks.",
    yardeni:
      "Cross-sector stress transmission. While temporary spillovers occur during selloffs, structural circuit breakers (central bank backstops, deep capital markets, distressed buyers) limit sustained contagion.",
  },
  "Crude Oil Volatility": {
    bookstaber:
      "Oil price swings that can destabilize energy-dependent economies and trigger inflation spikes, feeding into broader financial stress.",
    yardeni:
      "Oil price volatility is blunted by US energy independence. Price spikes create supply responses and substitution effects that self-correct within quarters.",
  },
  "Composite Threat Score": {
    bookstaber:
      "Weighted average of all four domain scores (0-100). Reflects the overall level of systemic risk across private credit, AI concentration, energy/geo, and contagion channels.",
    yardeni:
      "Weighted average of all four domain scores (0-100). Higher thresholds reflect structural resilience -- what looks alarming through a fragility lens may be within normal bounds for a resilient economy.",
  },
};
