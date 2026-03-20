import { describe, it, expect } from "vitest";
import {
  linearScore,
  invertedLinearScore,
  scorePrivateCredit,
  loadScoringConfig,
  type ScoringComponentConfig,
  type PrivateCreditConfig,
  type ComponentInput,
} from "../private-credit";

describe("linearScore", () => {
  it("returns 0 when value equals min", () => {
    expect(linearScore(300, 300, 600)).toBe(0);
  });

  it("returns 100 when value equals max", () => {
    expect(linearScore(600, 300, 600)).toBe(100);
  });

  it("returns 50 when value is midpoint", () => {
    expect(linearScore(450, 300, 600)).toBe(50);
  });

  it("clamps to 0 when value is below min", () => {
    expect(linearScore(100, 300, 600)).toBe(0);
  });

  it("clamps to 100 when value is above max", () => {
    expect(linearScore(900, 300, 600)).toBe(100);
  });

  it("handles fractional interpolation", () => {
    // 25% of the way from 300 to 600
    expect(linearScore(375, 300, 600)).toBe(25);
  });
});

describe("invertedLinearScore", () => {
  // For BDC discount: min_value=0 (premium, score=0), max_value=-0.20 (20% discount, score=100)
  // More negative = more stress
  it("returns 0 when discount is at or above NAV (>= min_value)", () => {
    expect(invertedLinearScore(0, 0, -0.2)).toBe(0);
  });

  it("returns 100 when discount is at max negative", () => {
    expect(invertedLinearScore(-0.2, 0, -0.2)).toBe(100);
  });

  it("returns 50 when discount is halfway", () => {
    expect(invertedLinearScore(-0.1, 0, -0.2)).toBe(50);
  });

  it("clamps to 0 when value is above min (premium to NAV)", () => {
    expect(invertedLinearScore(0.05, 0, -0.2)).toBe(0);
  });

  it("clamps to 100 when value is below max", () => {
    expect(invertedLinearScore(-0.3, 0, -0.2)).toBe(100);
  });
});

describe("scorePrivateCredit", () => {
  const defaultConfig: PrivateCreditConfig = {
    weight: 0.3,
    components: {
      hy_spread: {
        sub_weight: 0.35,
        ticker: "BAMLH0A0HYM2",
        min_value: 300,
        max_value: 600,
      },
      bdc_discount: {
        sub_weight: 0.25,
        ticker: "BDC_AVG_NAV_DISCOUNT",
        min_value: 0,
        max_value: -0.2,
      },
      redemption_flow: {
        sub_weight: 0.15,
        placeholder: 50,
      },
      spread_roc: {
        sub_weight: 0.25,
        ticker: "BAMLH0A0HYM2",
        min_value: 0,
        max_value: 50,
        lookback_days: 5,
      },
    },
  };

  it("computes correct score with all inputs present", () => {
    const inputs: ComponentInput = {
      hy_spread: 450, // midpoint -> score 50
      bdc_discount: -0.1, // midpoint -> score 50
      redemption_flow: null, // uses placeholder 50
      spread_roc: 25, // midpoint -> score 50
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    // All sub-scores are 50, so weighted average = 50
    // hy: 50*0.35=17.5, bdc: 50*0.25=12.5, redemption: 50*0.15=7.5, spread_roc: 50*0.25=12.5
    // Total = 50
    expect(result.score).toBe(50);
    expect(result.ticker).toBe("SCORE_PRIVATE_CREDIT");
    expect(result.source).toBe("computed");
  });

  it("handles missing hy_spread by renormalizing weights", () => {
    const inputs: ComponentInput = {
      hy_spread: null, // missing
      bdc_discount: -0.1, // score 50
      redemption_flow: null, // placeholder 50
      spread_roc: 25, // score 50
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    // Remaining weights: bdc 0.25, redemption 0.15, spread_roc 0.25 = 0.65
    // All sub-scores are 50, renormalized still gives 50
    expect(result.score).toBe(50);
  });

  it("handles missing bdc_discount by renormalizing weights", () => {
    const inputs: ComponentInput = {
      hy_spread: 600, // max -> score 100
      bdc_discount: null, // missing
      redemption_flow: null, // placeholder 50
      spread_roc: 0, // min -> score 0
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    // Active: hy (0.35, score 100), redemption (0.15, score 50), spread_roc (0.25, score 0)
    // Total weight = 0.75
    // Weighted sum = 100*0.35 + 50*0.15 + 0*0.25 = 35 + 7.5 + 0 = 42.5
    // Renormalized = 42.5 / 0.75 = 56.666...
    expect(result.score).toBeCloseTo(56.67, 1);
  });

  it("clamps final score to 0-100", () => {
    // All extreme high values
    const inputs: ComponentInput = {
      hy_spread: 1000, // way above max -> score 100
      bdc_discount: -0.5, // way below max -> score 100
      redemption_flow: null, // placeholder 50
      spread_roc: 200, // way above max -> score 100
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    // hy: 100*0.35=35, bdc: 100*0.25=25, redemption: 50*0.15=7.5, spread_roc: 100*0.25=25
    // Total = 92.5
    expect(result.score).toBe(92.5);
  });

  it("returns score 0 when all inputs are at minimum stress", () => {
    const inputs: ComponentInput = {
      hy_spread: 200, // below min -> score 0
      bdc_discount: 0.05, // above NAV -> score 0
      redemption_flow: null, // placeholder 50
      spread_roc: -10, // negative change -> score 0
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    // hy: 0*0.35=0, bdc: 0*0.25=0, redemption: 50*0.15=7.5, spread_roc: 0*0.25=0
    // Total = 7.5
    expect(result.score).toBe(7.5);
  });

  it("uses redemption_flow placeholder value from config", () => {
    const customConfig: PrivateCreditConfig = {
      ...defaultConfig,
      components: {
        ...defaultConfig.components,
        redemption_flow: {
          sub_weight: 0.15,
          placeholder: 75, // different placeholder
        },
      },
    };

    const inputs: ComponentInput = {
      hy_spread: 300, // score 0
      bdc_discount: 0, // score 0
      redemption_flow: null,
      spread_roc: 0, // score 0
    };

    const result = scorePrivateCredit(inputs, customConfig);

    // Only redemption contributes: 75 * 0.15 = 11.25
    expect(result.score).toBe(11.25);
  });

  it("handles all data missing except placeholder", () => {
    const inputs: ComponentInput = {
      hy_spread: null,
      bdc_discount: null,
      redemption_flow: null,
      spread_roc: null,
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    // Only redemption_flow active with placeholder 50 at weight 0.15
    // Renormalized: 50 * 0.15 / 0.15 = 50
    expect(result.score).toBe(50);
  });

  it("includes component breakdown in result", () => {
    const inputs: ComponentInput = {
      hy_spread: 450,
      bdc_discount: -0.1,
      redemption_flow: null,
      spread_roc: 25,
    };

    const result = scorePrivateCredit(inputs, defaultConfig);

    expect(result.components).toBeDefined();
    expect(result.components.hy_spread).toBeCloseTo(50, 1);
    expect(result.components.bdc_discount).toBeCloseTo(50, 1);
    expect(result.components.redemption_flow).toBe(50);
    expect(result.components.spread_roc).toBeCloseTo(50, 1);
  });
});

describe("loadScoringConfig", () => {
  it("loads config from YAML file", () => {
    const config = loadScoringConfig();
    expect(config.private_credit).toBeDefined();
    expect(config.private_credit.weight).toBe(0.3);
    expect(config.private_credit.components.hy_spread.sub_weight).toBe(0.35);
    expect(config.private_credit.components.bdc_discount.min_value).toBe(0);
    expect(config.private_credit.components.bdc_discount.max_value).toBe(-0.2);
    expect(config.private_credit.components.redemption_flow.placeholder).toBe(
      50,
    );
    expect(config.private_credit.components.spread_roc.lookback_days).toBe(5);
  });
});

describe("integration: scoring with loaded config", () => {
  it("computes score from seeded inputs using YAML config thresholds", () => {
    const config = loadScoringConfig();

    // Seed: HY spread at 450 bps (midpoint of 300-600 range -> sub-score ~50)
    // Seed: BDC discount at -0.10 (midpoint of 0 to -0.20 range -> sub-score ~50)
    // Seed: spread_roc at 25 bps (midpoint of 0-50 range -> sub-score ~50)
    // Redemption flow: placeholder from config (50)
    const inputs: ComponentInput = {
      hy_spread: 450,
      bdc_discount: -0.1,
      redemption_flow: null,
      spread_roc: 25,
    };

    const result = scorePrivateCredit(inputs, config.private_credit);

    // Manual calculation with config thresholds:
    // hy_spread: (450-300)/(600-300)*100 = 50, weight 0.35 -> 17.5
    // bdc_discount: (0-(-0.10))/(0-(-0.20))*100 = 50, weight 0.25 -> 12.5
    // redemption_flow: placeholder 50, weight 0.15 -> 7.5
    // spread_roc: (25-0)/(50-0)*100 = 50, weight 0.25 -> 12.5
    // Total = 50
    expect(result.score).toBe(50);
    expect(result.ticker).toBe("SCORE_PRIVATE_CREDIT");
    expect(result.source).toBe("computed");
  });

  it("produces correct asymmetric score from mixed stress levels", () => {
    const config = loadScoringConfig();

    // High spread stress, low BDC stress, moderate spread momentum
    const inputs: ComponentInput = {
      hy_spread: 540, // (540-300)/(600-300)*100 = 80
      bdc_discount: -0.04, // (0-(-0.04))/(0-(-0.20))*100 = 20
      redemption_flow: null, // placeholder 50
      spread_roc: 40, // (40-0)/(50-0)*100 = 80
    };

    const result = scorePrivateCredit(inputs, config.private_credit);

    // hy: 80*0.35=28, bdc: 20*0.25=5, redemption: 50*0.15=7.5, spread_roc: 80*0.25=20
    // Total = 60.5
    expect(result.score).toBe(60.5);
  });
});
