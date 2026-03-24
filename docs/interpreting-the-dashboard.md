# Interpreting the Risk Monitor Dashboard

## 1. Two Frameworks, One Dashboard

This dashboard monitors four interconnected risk domains -- Private Credit, AI/Tech
Concentration, Energy & Geopolitical, and Cross-Domain Contagion -- and measures how
correlated they are with each other over time. What makes it distinctive is that it
applies two competing interpretive frameworks to the same underlying data, letting
you see how different risk philosophies reach different conclusions from identical
market signals.

A toggle in the dashboard header switches between frameworks. The raw data, tickers,
and correlation calculations are identical in both views. What changes is the scoring
weights, threat level bands, and the interpretive lens applied to the numbers.

### 1.1 Bookstaber: Systemic Risk

[Richard Bookstaber](https://en.wikipedia.org/wiki/Richard_Bookstaber) is a risk
researcher who published an analysis in March 2026
arguing that private credit, AI concentration, energy/geopolitical shocks, and
cross-domain contagion are interconnected risks that could cascade through the
financial system. His core thesis: shocks propagate through a tightly coupled
structure faster than they can be contained.

In the Bookstaber framework, when rolling correlations between normally-independent
domains spike, it signals that forced selling in one domain is propagating into
others -- a self-reinforcing spiral he calls "contagion." The Bookstaber lens treats
elevated signals as warnings of systemic fragility requiring defensive action.

**Key characteristics:**

- Higher weight on Private Credit (0.30) -- credit markets are where cracks appear first
- Lower contagion threshold (correlation > 0.5) -- correlation spikes are danger signals
- Tighter threat bands: LOW 0-25, ELEVATED 26-50, HIGH 51-75, CRITICAL 76-100
- Interprets correlation spikes as evidence of cascading forced selling

### 1.2 Yardeni: Resilience

[Ed Yardeni](https://en.wikipedia.org/wiki/Ed_Yardeni) is a veteran Wall Street
strategist known for a resilience-oriented view
of markets. Where Bookstaber sees fragility and contagion, Yardeni sees self-correcting
mechanisms: distressed funds stepping in as buyers, sector rotation absorbing shocks,
and the U.S. economy's structural capacity to absorb elevated readings.

In the Yardeni framework, the same correlation spike that Bookstaber reads as
"cascading forced selling" gets interpreted as "sector rotation in progress --
distressed buyers are circling, buying opportunity incoming." The Yardeni lens
treats elevated signals as stress that the system has historically absorbed.

**Key characteristics:**

- Higher weight on Energy & Geopolitical (0.30) -- geopolitics matters but self-corrects
- Higher contagion threshold (correlation > 0.85) -- only extreme correlation is alarming
- Wider threat bands: LOW 0-30, ELEVATED 31-55, HIGH 56-80, CRITICAL 81-100
- Interprets correlation spikes as transient dislocations that create opportunities

### 1.3 Why Both Matter

The hardest problem in risk monitoring is not getting the data right -- it is
interpreting it. Having both frameworks side-by-side forces you to think critically
about which regime the market is actually in rather than anchoring on one narrative.

When both frameworks agree (both showing HIGH or both showing LOW), the signal is
stronger. When they diverge -- Bookstaber at HIGH while Yardeni stays at ELEVATED --
that divergence itself is information. It tells you the data is in a range where
reasonable analysts disagree, and your own judgment about market conditions matters
most.

This tool is not a trading signal or financial advice. It is a monitoring system that
helps you stay aware of systemic risk conditions so you can make informed decisions
about your own portfolio.

---

## 2. Reading the Composite Score

### The 0-100 Score

The composite threat score is the single number at the top of the dashboard. It
combines all four risk domains into one figure. A score of 0 means every indicator
is calm. A score of 100 means every indicator is at its most stressed level
simultaneously.

The composite score is a weighted average of the four domain scores. The weights
differ by framework, reflecting each framework's view of where risk originates:

| Domain                  | Bookstaber | Yardeni |
| ----------------------- | ---------- | ------- |
| Private Credit Stress   | 30%        | 25%     |
| AI / Tech Concentration | 20%        | 20%     |
| Energy & Geopolitical   | 25%        | 30%     |
| Cross-Domain Contagion  | 25%        | 25%     |

Bookstaber weights Private Credit highest because the credit market is enormous,
opaque, and historically where cracks appear first. Yardeni weights Energy &
Geopolitical highest because geopolitical shocks have immediate economic transmission
but also trigger self-correcting market mechanisms.

### Threat Level Bands

The frameworks use different band widths. Yardeni's wider LOW and ELEVATED bands
reflect the view that markets routinely absorb readings that Bookstaber would flag
as concerning.

**Bookstaber:**

| Score  | Level    | Color  | What it means                                                                                                                                                                  |
| ------ | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0-25   | LOW      | Green  | Markets are functioning normally. Risk indicators are within historical norms. No action needed.                                                                               |
| 26-50  | ELEVATED | Yellow | Some indicators are above normal. Worth paying attention but not alarming on its own.                                                                                          |
| 51-75  | HIGH     | Orange | Multiple risk indicators are flashing warnings. Review your portfolio exposure. Consider whether you are comfortable with your current risk level.                             |
| 76-100 | CRITICAL | Red    | Systemic stress is widespread. Correlations are likely elevated, meaning diversification may not protect you. This is the time to act on whatever risk plan you have in place. |

**Yardeni:**

| Score  | Level    | Color  | What it means                                                                                                                                                            |
| ------ | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0-30   | LOW      | Green  | Markets are functioning within normal parameters. Stress readings are within the range the economy has historically absorbed.                                            |
| 31-55  | ELEVATED | Yellow | Some indicators are elevated but within historical norms for recoverable stress. Monitor for persistence rather than reacting to the level.                              |
| 56-80  | HIGH     | Orange | Multiple indicators are stressed. The system has absorbed similar readings before, but the combination warrants attention. Review whether conditions are mean-reverting. |
| 81-100 | CRITICAL | Red    | Extreme stress across domains. Even under the resilience view, this level of simultaneous stress exceeds what markets typically absorb without significant repricing.    |

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
of strain. Because private credit is a roughly $2 trillion market with limited
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

---

## 8. Expert Perspectives: Why These Domains Matter

The four risk domains this dashboard monitors are not arbitrary groupings. They
reflect concerns raised by experienced market participants with track records of
identifying systemic risk. This section captures perspectives that provide context
for interpreting domain scores.

### 8.1 Private Credit: The $2 Trillion Blind Spot

Steve Eisman -- the investment analyst who predicted and profited from the 2008
subprime mortgage crisis (depicted in "The Big Short") -- identifies private credit
as one of the two biggest long-term risks to the market.

His core argument: almost all U.S. loan growth since the 2008 financial crisis has
occurred outside the traditional banking system, in private credit. This market has
grown to approximately $2 trillion, and it has never been tested by a credit cycle.
The last significant credit downturn was 17 years ago.

What makes this different from 2008 is the lack of data. Subprime mortgage
securitizations reported their performance to Moody's and S&P every month -- analysts
could track delinquency rates across every securitization in the country. Private
credit, by definition, does not report publicly. Eisman's own assessment: "there are
a couple of bad credits here and there and that's all I can say because I don't have
any data."

The risk is compounded by structural leverage. Over the past decade, private equity
firms have acquired life insurance companies and directed those companies to invest
in the PE firms' own loan paper. Some have then reinsured portions of those books
through their own offshore reinsurers -- transactions that are opaque and appear to
increase leverage in hidden ways. The result: private credit sitting in life
insurance companies, controlled by private equity, with additional hidden leverage
layered on top.

Banks are better capitalized than at any point in recent history, so a private credit
downturn would not replay 2008's near-collapse of the banking system. The primary
casualties would be institutional investors and, more troublingly, individual
policyholders at PE-owned life insurance companies.

**What this means for the Private Credit domain:** A calm score does not mean absence
of risk -- it may mean absence of visible stress in a market that is structurally
opaque. When BDC discounts widen or HY spreads start moving, pay close attention to
the _rate of change_ (the Spread Rate of Change sub-component), because the first visible signs
of a credit cycle turning will likely appear as acceleration rather than level shifts.
The 17-year absence of a credit cycle means current market participants have no
muscle memory for what deterioration looks like in this asset class.

### 8.2 AI / Tech Concentration: The Capex-to-Returns Question

Eisman's second major concern is AI investment -- not that the technology lacks value,
but that the returns may not justify the spending. Total AI infrastructure spend was
approximately $450 billion in 2024. In 2025, just four companies (Amazon, Google,
Meta, Microsoft) are spending $650 billion collectively.

He draws a direct parallel to the internet bubble: the first generation of internet
companies largely failed, and it was the second generation that delivered the
internet's real value. A similar pattern in AI -- where current leaders fail to
generate returns sufficient to justify their valuations, triggering a pullback and
recession, before a stronger second wave emerges -- is one plausible scenario.

Eisman is explicit that this is not an imminent risk ("we won't know for a year") and
that he does not expect a sudden halt to AI spending. The risk is the gap between
capital deployed and returns generated, which would manifest as earnings
disappointments and valuation compression.

He is also skeptical of the "AI destroys SaaS" narrative. Major SaaS companies
(ServiceNow, Salesforce, Adobe) are reporting strong numbers with no evidence of AI
disruption in their earnings. Their stocks are declining on narrative, not data --
which he views as an opportunity, not a signal of fundamental weakness.

**What this means for the AI / Tech Concentration domain:** The SPY/RSP ratio and
semiconductor relative performance are leading indicators for the concentration
thesis. But the real risk Eisman highlights is not measurable in daily price data --
it is the long-term question of whether AI capex generates adequate ROI. A high
concentration score means the market is increasingly dependent on AI spending
continuing to grow, which makes it more vulnerable to even a modest deceleration.

### 8.3 Markets Are Amoral: Interpreting Political and Geopolitical Noise

Eisman offers a framework for filtering signal from noise: markets do not respond to
political narratives, rule-of-law concerns, or geopolitical anxiety -- they respond
to margins, revenue growth, and earnings per share growth. If political or
geopolitical events impact those numbers, stocks move. If they don't, markets shrug.

This has direct implications for reading this dashboard during geopolitical events.
Energy & Geopolitical domain spikes during conflicts (like oil price increases during
Middle East tensions) tend to be short-lived unless they actually impair corporate
earnings. The Contagion domain is the more reliable signal: if a geopolitical event
is truly systemic, it will show up as rising cross-domain correlations, not just an
isolated energy price spike.

### 8.4 Paradigm Shifts and Misinterpreted Data

Perhaps Eisman's most valuable insight for interpreting any monitoring system: the
2008 crisis was not caused by hidden data. The data was public, reported monthly, and
scrutinized by the entire fixed income industry. The problem was interpretation.
Market participants whose careers depended on the existing paradigm -- that U.S.
housing prices could not decline nationally -- systematically misread deteriorating
data because accepting the alternative was professionally unthinkable.

This applies directly to how you use this dashboard. When domain scores rise, the
natural human response is to find reasons why the signals are wrong, especially if
your portfolio is long the affected sectors. Eisman's experience suggests that when
you find yourself arguing with the data, that is precisely the moment to take it most
seriously.

The corollary: predictions without supporting data are not actionable. End-of-the-world
theses about fiat currency collapse, unsustainable deficits, or AI existential risk
share a common trait -- they lack the kind of trackable, deteriorating data that
preceded 2008. This dashboard is designed to surface exactly that kind of data. If a
thesis cannot point to a measurable, worsening signal, it remains academic regardless
of how compelling the narrative.
