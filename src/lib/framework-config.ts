export type Framework = "bookstaber" | "yardeni";

export type ThreatLevelName = "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";

interface ThreatBand {
  readonly max: number;
  readonly level: ThreatLevelName;
  readonly color: string;
}

interface FrameworkSettings {
  readonly tickerPrefix: string;
  readonly contagionThreshold: number;
  readonly weights: {
    readonly private_credit: number;
    readonly ai_concentration: number;
    readonly energy_geo: number;
    readonly contagion: number;
  };
  readonly threatLevels: readonly ThreatBand[];
  readonly newsSortDirection: "asc" | "desc";
}

export const FRAMEWORK_CONFIG = {
  bookstaber: {
    tickerPrefix: "",
    contagionThreshold: 0.5,
    weights: {
      private_credit: 0.3,
      ai_concentration: 0.2,
      energy_geo: 0.25,
      contagion: 0.25,
    },
    threatLevels: [
      { max: 25, level: "LOW", color: "#22c55e" },
      { max: 50, level: "ELEVATED", color: "#eab308" },
      { max: 75, level: "HIGH", color: "#f97316" },
      { max: 100, level: "CRITICAL", color: "#ef4444" },
    ],
    newsSortDirection: "asc",
  },
  yardeni: {
    tickerPrefix: "YARDENI_",
    contagionThreshold: 0.85,
    weights: {
      private_credit: 0.25,
      ai_concentration: 0.2,
      energy_geo: 0.3,
      contagion: 0.25,
    },
    threatLevels: [
      { max: 30, level: "LOW", color: "#22c55e" },
      { max: 55, level: "ELEVATED", color: "#eab308" },
      { max: 80, level: "HIGH", color: "#f97316" },
      { max: 100, level: "CRITICAL", color: "#ef4444" },
    ],
    newsSortDirection: "desc",
  },
} as const satisfies Record<Framework, FrameworkSettings>;

/**
 * Parses a framework query parameter, defaulting to "bookstaber" for
 * null, empty, or unrecognized values.
 */
export function parseFramework(param: string | null): Framework {
  if (param === "bookstaber" || param === "yardeni") {
    return param;
  }
  if (param) {
    console.warn(
      `Unrecognized framework "${param}", defaulting to "bookstaber"`,
    );
  }
  return "bookstaber";
}
