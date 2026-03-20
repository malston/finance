import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface ScoringComponentConfig {
  sub_weight: number;
  ticker?: string;
  min_value?: number;
  max_value?: number;
  placeholder?: number;
  lookback_days?: number;
}

export interface PrivateCreditConfig {
  weight: number;
  components: {
    hy_spread: ScoringComponentConfig;
    bdc_discount: ScoringComponentConfig;
    redemption_flow: ScoringComponentConfig;
    spread_roc: ScoringComponentConfig;
  };
}

export interface ScoringConfig {
  private_credit: PrivateCreditConfig;
}

export interface ComponentInput {
  hy_spread: number | null;
  bdc_discount: number | null;
  redemption_flow: number | null;
  spread_roc: number | null;
}

export interface ScoringResult {
  score: number;
  ticker: string;
  source: string;
  components: Record<string, number>;
}

/**
 * Linear interpolation from min to max, clamped to 0-100.
 * score = clamp((value - min) / (max - min) * 100, 0, 100)
 */
export function linearScore(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const raw = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Inverted linear score for scales where min > max (e.g., BDC discount).
 * score = clamp((min - value) / (min - max) * 100, 0, 100)
 */
export function invertedLinearScore(
  value: number,
  min: number,
  max: number,
): number {
  if (min === max) return 0;
  const raw = ((min - value) / (min - max)) * 100;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Compute Private Credit Stress score (0-100) from market data inputs.
 * Missing inputs are excluded and remaining weights are renormalized.
 */
export function scorePrivateCredit(
  inputs: ComponentInput,
  config: PrivateCreditConfig,
): ScoringResult {
  const components: Record<string, number> = {};
  let weightedSum = 0;
  let totalWeight = 0;

  const { hy_spread, bdc_discount, redemption_flow, spread_roc } =
    config.components;

  // HY Spread: standard linear score
  if (inputs.hy_spread !== null) {
    const subScore = linearScore(
      inputs.hy_spread,
      hy_spread.min_value!,
      hy_spread.max_value!,
    );
    components.hy_spread = subScore;
    weightedSum += subScore * hy_spread.sub_weight;
    totalWeight += hy_spread.sub_weight;
  }

  // BDC Discount: inverted scale (more negative = more stress)
  if (inputs.bdc_discount !== null) {
    const subScore = invertedLinearScore(
      inputs.bdc_discount,
      bdc_discount.min_value!,
      bdc_discount.max_value!,
    );
    components.bdc_discount = subScore;
    weightedSum += subScore * bdc_discount.sub_weight;
    totalWeight += bdc_discount.sub_weight;
  }

  // Redemption Flow: use placeholder when no real data available
  const redemptionScore =
    inputs.redemption_flow !== null
      ? inputs.redemption_flow
      : redemption_flow.placeholder!;
  components.redemption_flow = redemptionScore;
  weightedSum += redemptionScore * redemption_flow.sub_weight;
  totalWeight += redemption_flow.sub_weight;

  // Spread Rate of Change: standard linear score
  if (inputs.spread_roc !== null) {
    const subScore = linearScore(
      inputs.spread_roc,
      spread_roc.min_value!,
      spread_roc.max_value!,
    );
    components.spread_roc = subScore;
    weightedSum += subScore * spread_roc.sub_weight;
    totalWeight += spread_roc.sub_weight;
  }

  // Renormalize if some components are missing
  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const clampedScore =
    Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;

  return {
    score: clampedScore,
    ticker: "SCORE_PRIVATE_CREDIT",
    source: "computed",
    components,
  };
}

/**
 * Load scoring configuration from the YAML config file.
 */
export function loadScoringConfig(): ScoringConfig {
  const configPath = join(
    process.cwd(),
    "services",
    "correlation",
    "scoring_config.yaml",
  );
  const raw = readFileSync(configPath, "utf-8");
  const parsed = parse(raw);
  return parsed.scoring as ScoringConfig;
}
