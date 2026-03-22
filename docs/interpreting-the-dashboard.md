# Interpreting the Bookstaber Risk Monitor Dashboard

## 1. The Thesis

In March 2026, risk researcher Richard Bookstaber published an analysis arguing that
the major threats to financial stability are not isolated -- they are deeply
interconnected. Private credit markets, the concentration of the stock market in a
handful of giant tech companies, energy price shocks driven by geopolitical conflict,
and the feedback loops that tie all of these together form a web of risk. A crisis in
any one of these areas can cascade into the others through forced selling, margin
calls, and investor panic.

This dashboard monitors those four risk domains and, critically, measures how
correlated they are with each other over time. In normal markets, private credit,
big tech stocks, and energy prices move somewhat independently. When they start moving
in lockstep -- when the rolling correlations between them spike -- it signals that
stress is propagating across markets. Bookstaber calls this "contagion": a shock
in one domain is forcing selling in others, creating a self-reinforcing spiral.

The goal of this tool is to give you an early warning when that contagion is building.
It is not a trading signal or financial advice. It is a monitoring system that helps
you stay aware of systemic risk conditions so you can make informed decisions about
your own portfolio.

---

## 2. Reading the Composite Score

### The 0-100 Score

The composite threat score is the single number at the top of the dashboard. It
combines all four risk domains into one figure. A score of 0 means every indicator
is calm. A score of 100 means every indicator is at its most stressed level
simultaneously.

The composite score is a weighted average of the four domain scores:

| Domain                  | Weight |
| ----------------------- | ------ |
| Private Credit Stress   | 30%    |
| AI / Tech Concentration | 20%    |
| Energy & Geopolitical   | 25%    |
| Cross-Domain Contagion  | 25%    |

Private Credit gets the highest weight because the private credit market is
enormous, opaque, and has historically been where cracks appear first.

### Threat Level Bands

| Score   | Level    | Color  | What it means                                                                                                                                                                  |
| ------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0-25   | LOW      | Green  | Markets are functioning normally. Risk indicators are within historical norms. No action needed.                                                                               |
| 26-50  | ELEVATED | Yellow | Some indicators are above normal. Worth paying attention but not alarming on its own.                                                                                          |
| 51-75  | HIGH     | Orange | Multiple risk indicators are flashing warnings. Review your portfolio exposure. Consider whether you are comfortable with your current risk level.                             |
| 76-100 | CRITICAL | Red    | Systemic stress is widespread. Correlations are likely elevated, meaning diversification may not protect you. This is the time to act on whatever risk plan you have in place. |

### The Domain Badges

Below the composite score you will see four badges, one per domain, each showing
that domain's individual score (0-100) and colored by the same threat level bands.
These let you see at a glance which domain is driving the composite score up. If
the composite is 60 but three domains are at 20 and one is at 90, the badges
immediately tell you where the problem is.

---

## 3. Domain Deep Dives

### 3.1 Private Credit Stress (weight: 30%)

#### What it measures and why it matters

Private credit is the market where non-bank lenders make loans to companies that
cannot easily borrow from traditional banks. These loans are typically illiquid --
you cannot sell them quickly if you need cash. Business Development Companies (BDCs)
are publicly traded funds that hold these private loans, and their stock prices
give us a window into how the private credit market is doing.

When this domain's score rises, it means the cost of risky borrowing is going up,
BDC investors are getting nervous, and/or the private credit market is showing signs
of strain. Because private credit is a $1.7 trillion market with limited
transparency, problems here can grow large before they become visible.

#### Key indicators

- **HY Credit Spread** (`BAMLH0A0HYM2`): The extra yield -- measured in basis
  points, where 100 basis points = 1 percentage point -- that investors demand to hold
  risky corporate bonds instead of safe government Treasuries. If this number is 300
  basis points (3%), investors are relatively calm. If it goes above 500-600 basis
  points (5-6%), there is significant fear of corporate defaults. This indicator is
  "inverted" on the dashboard: red means rising (bad), unlike stock prices where
  red means falling.

- **OWL** (Blue Owl Capital): A major private credit manager. Its stock price
  reflects market confidence in the private lending business.

- **ARCC** (Ares Capital Corp): One of the largest BDCs. A declining ARCC price
  suggests investors are worried about the quality of its loan portfolio.

- **BXSL** (Blackstone Secured Lending): A BDC managed by Blackstone, focused on
  senior secured loans. Moves in BXSL reflect sentiment about the safest tier of
  private credit.

- **OBDC** (Blue Owl BDC): Another large BDC. Together, these four BDCs give a
  broad view of private credit market health.

- **HYG** (iShares High Yield Bond ETF): Tracks a basket of high-yield (junk)
  corporate bonds. When HYG drops, it means investors are selling risky bonds --
  a sign of credit stress.

#### Sub-component scoring

The Private Credit domain score (0-100) is computed from four sub-components:

| Sub-component         | Weight | What it captures                                                 | Score range inputs              |
| --------------------- | ------ | ---------------------------------------------------------------- | ------------------------------- |
| HY Spread Level       | 35%    | The current credit spread level                                  | 300 bps = 0, 600+ bps = 100     |
| BDC Discount to NAV   | 25%    | How much BDC stock prices are below their net asset value        | 0% discount = 0, 20%+ = 100     |
| Redemption Flow       | 15%    | Proxy for redemption pressure based on BDC trading volume spikes | 1x normal volume = 0, 3x+ = 100 |
| Spread Rate of Change | 25%    | How fast spreads are widening over 5 days                        | 0 bps change = 0, 50+ bps = 100 |

The domain score is the weighted sum of these four sub-component scores.

#### What to watch for

- HY spreads rising above 500 basis points while BDC prices are simultaneously
  falling -- this suggests credit stress is real, not just a data blip.
- A spike in BDC trading volume (the redemption flow proxy) combined with falling
  BDC prices -- investors are trying to exit.
- Rapidly widening spreads (the rate of change component) are more alarming than
  a slowly rising spread level, because speed signals panic.

---

### 3.2 AI / Tech Concentration (weight: 20%)

#### What it measures and why it matters

A small number of giant technology companies now dominate the stock market by
market capitalization. When the largest 5-10 stocks make up an outsized share of
the S&P 500, the entire market becomes vulnerable to anything that affects those
specific companies -- an antitrust ruling, an AI spending pullback, a semiconductor
shortage.

This domain measures how concentrated the stock market has become and whether
that concentration is increasing. If you own an S&P 500 index fund, you may have
far more exposure to a few tech companies than you realize.

#### Key indicators

- **SPY/RSP Ratio** (Cap-Weight vs Equal-Weight Spread): SPY is the S&P 500
  weighted by company size (so the biggest companies dominate). RSP is the same 500
  companies weighted equally. When the SPY/RSP ratio goes up, it means big companies
  are pulling further ahead of smaller ones -- concentration is increasing. A higher
  ratio means more concentration risk.

- **NVDA**: A major semiconductor and AI chip company. Its stock price is a
  barometer for AI investment sentiment.

- **MSFT**, **GOOGL**, **META**, **AMZN**: The other mega-cap tech companies that
  dominate the S&P 500. Their collective movement drives the concentration thesis.

- **SMH** (VanEck Semiconductor ETF): Tracks the semiconductor industry. Because
  AI depends on chips, SMH's performance relative to the broader market signals
  whether the AI trade is overheating.

#### Sub-component scoring

| Sub-component       | Weight | What it captures                                                | Score range inputs                |
| ------------------- | ------ | --------------------------------------------------------------- | --------------------------------- |
| SPY/RSP Deviation   | 40%    | How far the SPY/RSP ratio has deviated from its 200-day average | 0% deviation = 0, 15%+ = 100      |
| SMH Relative Perf.  | 30%    | How much semiconductors are outperforming the broad market      | 0% outperformance = 0, 20%+ = 100 |
| Top-10 Weight Proxy | 30%    | Another measure of concentration using the SPY/RSP ratio level  | Ratio at 1.5 = 0, 2.5+ = 100      |

#### What to watch for

- The SPY/RSP ratio climbing steadily while the semiconductor ETF outperforms --
  the market is becoming more top-heavy and more dependent on the AI trade.
- A sharp reversal in semiconductor stocks while the broad market has not yet
  reacted -- this can precede a broader sell-off because so much of the market's
  weight is in these names.
- If this domain is scoring high alongside the Contagion domain, it means tech
  concentration is actively creating systemic risk, not just sector risk.

---

### 3.3 Energy & Geopolitical (weight: 25%)

#### What it measures and why it matters

Energy prices affect every part of the economy. A spike in crude oil raises costs
for businesses and consumers, squeezes corporate margins, and can trigger
inflation. Geopolitical conflict -- particularly around Taiwan, which produces
the vast majority of advanced semiconductors -- adds another layer of risk that
can disrupt both energy markets and the tech supply chain.

This domain tracks energy price levels, energy price volatility, and a proxy for
Taiwan-related geopolitical risk.

#### Key indicators

- **CL=F** (WTI Crude Oil Futures): The benchmark price for U.S. crude oil, quoted
  in dollars per barrel. Oil at $50-70 is relatively calm. Above $100, it starts
  causing economic stress. Above $120, it is historically associated with recessions.

- **NG=F** (Natural Gas Futures): The price of natural gas. Spikes in natural gas
  affect electricity costs and industrial production, especially in regions that
  depend on gas for power generation.

- **XLU** (Utilities Select Sector SPDR ETF): Tracks U.S. utility companies.
  Utilities are sensitive to both energy costs (as inputs) and interest rates.
  A falling XLU can signal that energy costs are squeezing margins or that
  investors are rotating out of defensive sectors.

- **EWT** (iShares MSCI Taiwan ETF): Tracks the Taiwanese stock market. Because
  Taiwan is critical to the global semiconductor supply chain, a sharp decline
  in EWT can signal geopolitical tension (e.g., military threats, trade
  restrictions) that would have enormous downstream effects on the tech sector
  and global economy.

#### Sub-component scoring

| Sub-component        | Weight | What it captures                                         | Score range inputs                   |
| -------------------- | ------ | -------------------------------------------------------- | ------------------------------------ |
| Crude Oil Level      | 30%    | The absolute price of oil                                | $50/barrel = 0, $120+/barrel = 100   |
| Crude Oil Volatility | 35%    | How wildly oil prices are swinging over the past 30 days | 15% annualized vol = 0, 50%+ = 100   |
| EWT Drawdown         | 35%    | How far the Taiwan ETF has fallen from its 52-week high  | 0% drawdown = 0, 25%+ drawdown = 100 |

Note that crude oil volatility gets the highest weight because rapid, unpredictable
oil price swings are more destabilizing than a steadily high price level. The EWT
drawdown component serves as a geopolitical canary -- if Taiwan's market drops
sharply, something significant may be happening.

#### What to watch for

- Oil above $100/barrel with rising volatility -- this is the combination that
  historically precedes economic disruptions.
- A sharp EWT drawdown (more than 10-15% from its 52-week high) even when other
  markets are calm -- this may signal a geopolitical development that has not yet
  been priced into U.S. markets.
- This domain spiking alongside Private Credit Stress -- energy shocks can
  trigger defaults in overleveraged companies, creating a credit-energy feedback
  loop.

---

### 3.4 Cross-Domain Contagion (weight: 25%)

#### What it measures and why it matters

This is the domain that ties everything together. It does not track a specific
sector -- instead, it measures whether the other three domains are starting to move
in lockstep. In normal times, private credit, tech stocks, and energy prices
respond to different forces. When they all start falling together, it means
something systemic is happening: forced selling, margin calls, or broad investor
panic is overriding sector-specific fundamentals.

This domain also tracks overall market fear through the VIX.

#### Key indicators

- **CORR** (Max Pairwise Correlation): The highest of the three rolling
  30-day correlations (Credit-Tech, Credit-Energy, Tech-Energy). This is a
  computed value, not a traded ticker. When it goes above 0.5, at least two of the
  three domains are moving together more than they normally should. See Section 4
  for details.

- **VIXY** (ProShares VIX Short-Term Futures ETF): A tradable proxy for the VIX
  (the "fear index"). The VIX itself measures expected stock market volatility over
  the next 30 days, derived from S&P 500 options prices. A VIX level below 15 is
  calm. Between 15 and 25 is normal. Above 30 indicates significant fear. Above 40
  is panic territory. Note: VIXY is an ETF that tracks VIX futures, not the VIX
  index directly, so its price level differs from the VIX value -- but it moves in
  the same direction.

#### Sub-component scoring

| Sub-component    | Weight | What it captures                                              | Score range inputs  |
| ---------------- | ------ | ------------------------------------------------------------- | ------------------- |
| Max Correlation  | 60%    | The highest pairwise rolling correlation across the 3 domains | 0.1 = 0, 0.7+ = 100 |
| VIX Level (VIXY) | 40%    | Overall market fear level                                     | 15 = 0, 50+ = 100   |

The max correlation sub-component gets 60% of the weight because it is the direct
measure of contagion -- the core thesis of this monitor. The VIX provides context:
high correlation plus high VIX means the contagion is happening in a fearful market,
which is far more dangerous than high correlation in a calm market.

#### What to watch for

- The max correlation crossing above 0.5 while the VIX is above 25 -- this is
  the central warning signal of the entire dashboard. It means contagion is
  happening in a stressed market.
- All three pairwise correlations rising simultaneously -- when even the least
  related domains start correlating, forced selling is likely driving all markets.
- A Contagion score above 75 (CRITICAL) when any other domain is also above 50 --
  this suggests the crisis is both severe and spreading.

---

## 4. The Correlation Monitor

### What Pearson Correlation Is

Imagine plotting two data series on a chart -- say, daily returns for private
credit stocks and daily returns for tech stocks. If they tend to go up on the same
days and down on the same days, they are positively correlated. If they move in
opposite directions, they are negatively correlated. If there is no pattern, they
are uncorrelated.

Pearson correlation puts a number on this relationship, ranging from -1.0 to +1.0:

- **+1.0**: Perfect lockstep -- they always move the same direction by the same relative amount.
- **0.0**: No relationship -- knowing one tells you nothing about the other.
- **-1.0**: Perfect opposition -- they always move in opposite directions.

In practice, financial assets rarely hit the extremes. A correlation of 0.3 between
two domains is normal. A correlation of 0.5 or higher between domains that are
supposed to be independent is a warning sign.

### The Three Pairwise Combinations

The monitor computes rolling 30-day Pearson correlations for three pairs:

1. **Credit -- Tech**: Are private credit BDC returns moving with big tech stock returns?
2. **Credit -- Energy**: Are private credit returns moving with crude oil returns?
3. **Tech -- Energy**: Are tech stock returns moving with crude oil returns?

Each pair uses a domain index: the Credit index is the equal-weighted daily return
of OWL, ARCC, BXSL, and OBDC. The Tech index is the equal-weighted daily return
of NVDA, MSFT, GOOGL, META, and AMZN. The Energy index is the daily return of
CL=F (crude oil).

### Why the 0.5 Contagion Threshold Matters

The dashboard draws a horizontal reference line at 0.5 on the correlation chart,
labeled "CONTAGION THRESHOLD." This is not an arbitrary number. A correlation of
0.5 means that 25% of the variance in one domain's returns can be statistically
explained by the other domain's returns. For sectors that should be fundamentally
independent, this level of co-movement suggests an outside force -- like broad
forced selling or a liquidity crunch -- is pushing them together.

When any pairwise correlation crosses above 0.5, diversification between those two
domains stops working as well as you might expect. If you thought you were protected
because you own both tech stocks and energy stocks, a correlation above 0.5 means
those positions are now moving together and may both lose value simultaneously.

### When Correlations Spike vs Stay Low

- **Low correlations (below 0.3)**: Normal. The three domains are responding to their
  own sector-specific forces. Your diversification is working.
- **Rising correlations (0.3 to 0.5)**: Worth watching. Something may be causing
  cross-sector linkages. Check if any individual domain is under stress.
- **High correlations (above 0.5)**: Contagion is likely occurring. Check the VIX
  and individual domain scores. If other indicators are also elevated, consider
  reducing risk exposure.
- **Sustained high correlations (above 0.5 for multiple weeks)**: This is the most
  dangerous pattern. It means contagion is not a one-day event but a persistent
  condition. Past financial crises (2008, 2020) showed sustained high cross-sector
  correlations before the worst of the drawdowns.

### How to Read the Area Chart

The correlation monitor displays an area chart covering the most recent 79 trading
days (roughly 4 calendar months). Each of the three pairwise correlations is plotted
as a separate line/area. The horizontal reference line at 0.5 makes it easy to see
when any pair crosses the contagion threshold.

The chart uses a 30-day rolling window, which means:

- It takes 30 trading days of data before the first correlation can be computed.
- Each point represents the correlation over the preceding 30 trading days.
- Sudden jumps mean a high-volatility day entered the window or a calm day exited it.

The current (most recent) value of the maximum pairwise correlation is displayed
prominently alongside the chart.

---

## 5. Data Freshness

### The Status Dots

Each ticker on the dashboard has a colored dot indicating how recently its data
was updated:

| Dot Color | Status  | Meaning                                               |
| --------- | ------- | ----------------------------------------------------- |
| Green     | Live    | Data is current and within the expected update window |
| Yellow    | Stale   | Data is older than expected but not critically so     |
| Red       | Offline | Data is significantly outdated                        |

### Staleness Thresholds by Source Type

Different data sources update at different frequencies, so the thresholds vary:

| Source   | Tickers affected                                   | Green (live) | Yellow (stale) | Red (offline) |
| -------- | -------------------------------------------------- | ------------ | -------------- | ------------- |
| Finnhub  | All stock/ETF prices (OWL, ARCC, NVDA, VIXY, etc.) | Under 15 min | 15 min - 1 hr  | Over 1 hr     |
| FRED     | HY Credit Spread (`BAMLH0A0HYM2`)                  | Under 24 hr  | 24 - 48 hr     | Over 48 hr    |
| Computed | SPY/RSP Ratio, CORR, domain scores                 | Under 24 hr  | 24 - 48 hr     | Over 48 hr    |

### What to Do When You See Stale Data

- **One or two yellow dots**: Likely a brief delay from the data provider. No action
  needed -- just be aware that those specific values may be slightly outdated.
- **Several yellow dots from the same source**: The data provider may be experiencing
  issues. Treat the dashboard readings as less reliable until they recover.
- **Red dots**: The data source has not updated in a long time. Any scores that
  depend on those tickers are stale. Do not make decisions based on stale data --
  check the underlying data source directly.

### Weekends and After-Hours Behavior

U.S. stock markets are open Monday through Friday, 9:30 AM to 4:00 PM Eastern time.
Outside these hours:

- Stock and ETF prices stop updating. This is normal, not a data problem.
- Freshness dots may turn yellow or red over a weekend -- this is expected.
- FRED data (credit spreads) updates once per business day, so it will naturally
  show as yellow on day two of a weekend.
- The dashboard scores remain valid -- they reflect the most recent trading session.
  Just know they will not change until markets reopen.

---

## 6. Alerts

### How Alert Rules Work

Alerts fire when a specific metric exceeds a threshold for a required number of
consecutive readings. This prevents false alarms from momentary data spikes. Once
an alert fires, it enters a cooldown period during which it will not fire again,
even if the condition persists. This prevents you from being flooded with
notifications.

### The Default Alert Rules

The system ships with three alert rules:

1. **Composite Threat CRITICAL** -- Fires when the composite score is above 75 for
   3 consecutive readings. This means the overall risk level has been in CRITICAL
   territory persistently, not just for a single data refresh. Dispatches to email,
   Slack, and browser push notifications. Cooldown: 4 hours.

2. **VIX Above 30** -- Fires when VIXY exceeds 30 for even a single reading. A VIX
   above 30 is significant enough to warrant immediate attention -- the market is
   pricing in substantially more volatility than normal. Dispatches to Slack only.
   Cooldown: 4 hours.

3. **Contagion Correlation Above Threshold** -- Fires when the maximum pairwise
   correlation exceeds 0.5 for 2 consecutive readings. This is the core contagion
   signal. Two consecutive readings filters out one-off spikes while still alerting
   quickly. Dispatches to email and Slack. Cooldown: 4 hours.

### What to Do When You Receive an Alert

An alert is a prompt to look at the dashboard, not an instruction to trade. When
you receive one:

1. Open the dashboard and check the composite score and individual domain scores.
2. Look at which domain(s) are elevated and review their individual indicators.
3. Check the correlation chart -- is contagion occurring or is this isolated?
4. Verify data freshness -- make sure the alert is not based on stale data.
5. Make your own assessment about whether your portfolio exposure needs adjusting
   based on your personal risk tolerance and investment horizon.

---

## 7. Limitations and Caveats

**This is a monitoring tool, not trading advice.** The Bookstaber Risk Monitor
provides information about systemic risk conditions. It does not tell you what to
buy, sell, or hold. Your financial decisions should account for your personal
situation, risk tolerance, and investment timeline.

**VIXY is a VIX proxy, not the actual VIX index.** The VIX is a computed index that
cannot be bought or sold directly. VIXY is an ETF that tracks VIX short-term futures.
Its price level is different from the VIX index value, and it suffers from
"contango decay" over time (its price tends to erode in calm markets). The dashboard
uses VIXY because it is available from standard price feeds, but be aware that VIXY
at 30 does not mean the VIX is exactly 30.

**MOVE and SKEW indices are not currently tracked.** The original Bookstaber thesis
references the MOVE index (bond market volatility) and the SKEW index (tail risk
pricing) as important contagion indicators. These are not available on the free
Finnhub tier, so they are excluded from the current scoring model. This means the
Contagion domain has less breadth than the original thesis envisions.

**Correlation requires 30+ trading days to compute.** When the system first starts
or after a data gap, the correlation chart will be empty until 30 trading days of
data have accumulated. During this period, the Contagion domain score relies solely
on the VIX level component.

**Scores during market close reflect last trading session data.** The composite
score and domain scores do not change when markets are closed. A score displayed
on Saturday reflects the closing data from Friday. This is normal and expected --
the risk conditions have not changed because no trading is happening.

**Intraday scores can be noisy.** During trading hours, individual data points may
cause scores to fluctuate. Focus on sustained trends rather than moment-to-moment
changes. The alert system's "consecutive readings" requirement is specifically
designed to filter out this noise.

**The 0.5 contagion threshold is a guideline, not a law of nature.** Historical
analysis suggests correlations above 0.5 between normally-independent domains are
abnormal, but there is no magic number. Correlations in the 0.4-0.5 range during
a clearly stressed market are also worth paying attention to. Use the threshold as
a reference point, not a binary trigger.

**Data source outages affect accuracy.** If Finnhub or FRED goes down, the
dashboard will display the last known data with freshness warnings. Scores based on
stale data may not reflect current conditions. Always check the freshness indicators
before acting on the dashboard's readings.
