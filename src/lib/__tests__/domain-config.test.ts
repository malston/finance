import { describe, it, expect } from "vitest";
import { DOMAINS, type DomainConfig } from "@/lib/domain-config";

describe("DOMAINS configuration", () => {
  it("has exactly four domains", () => {
    expect(DOMAINS).toHaveLength(4);
  });

  it("has Private Credit Stress as first domain", () => {
    expect(DOMAINS[0].name).toBe("Private Credit Stress");
  });

  it("has AI / Tech Concentration as second domain", () => {
    expect(DOMAINS[1].name).toBe("AI / Tech Concentration");
  });

  it("has Energy & Geopolitical as third domain", () => {
    expect(DOMAINS[2].name).toBe("Energy & Geopolitical");
  });

  it("has Cross-Domain Contagion as fourth domain", () => {
    expect(DOMAINS[3].name).toBe("Cross-Domain Contagion");
  });

  it("Private Credit has 6 tickers: OWL, ARCC, BXSL, OBDC, HYG, BAMLH0A0HYM2", () => {
    const tickers = DOMAINS[0].tickers.map((t) => t.symbol);
    expect(tickers).toEqual([
      "OWL",
      "ARCC",
      "BXSL",
      "OBDC",
      "HYG",
      "BAMLH0A0HYM2",
    ]);
  });

  it("AI / Tech has 7 tickers: SPY_RSP_RATIO, NVDA, MSFT, GOOGL, META, AMZN, SMH", () => {
    const tickers = DOMAINS[1].tickers.map((t) => t.symbol);
    expect(tickers).toEqual([
      "SPY_RSP_RATIO",
      "NVDA",
      "MSFT",
      "GOOGL",
      "META",
      "AMZN",
      "SMH",
    ]);
  });

  it("Energy & Geopolitical has 4 tickers: CL=F, NG=F, XLU, EWT", () => {
    const tickers = DOMAINS[2].tickers.map((t) => t.symbol);
    expect(tickers).toEqual(["CL=F", "NG=F", "XLU", "EWT"]);
  });

  it("Cross-Domain Contagion has 2 tickers: CORR, VIXY", () => {
    const tickers = DOMAINS[3].tickers.map((t) => t.symbol);
    expect(tickers).toEqual(["CORR", "VIXY"]);
  });

  it("each domain has a color string", () => {
    for (const domain of DOMAINS) {
      expect(domain.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("Private Credit color is orange (#f97316)", () => {
    expect(DOMAINS[0].color).toBe("#f97316");
  });

  it("AI / Tech color is purple (#a855f7)", () => {
    expect(DOMAINS[1].color).toBe("#a855f7");
  });

  it("Energy & Geopolitical color is cyan (#06b6d4)", () => {
    expect(DOMAINS[2].color).toBe("#06b6d4");
  });

  it("Cross-Domain Contagion color is red (#ef4444)", () => {
    expect(DOMAINS[3].color).toBe("#ef4444");
  });

  it("each domain has a description string", () => {
    for (const domain of DOMAINS) {
      expect(typeof domain.description).toBe("string");
      expect(domain.description.length).toBeGreaterThan(0);
    }
  });

  it("each domain has an icon string", () => {
    for (const domain of DOMAINS) {
      expect(typeof domain.icon).toBe("string");
      expect(domain.icon.length).toBeGreaterThan(0);
    }
  });

  it("each domain has a scoreKey matching the scores API", () => {
    const expectedKeys = [
      "private_credit",
      "ai_concentration",
      "energy_geo",
      "contagion",
    ];
    const actualKeys = DOMAINS.map((d) => d.scoreKey);
    expect(actualKeys).toEqual(expectedKeys);
  });

  it("BAMLH0A0HYM2 is marked as inverted", () => {
    const baml = DOMAINS[0].tickers.find((t) => t.symbol === "BAMLH0A0HYM2");
    expect(baml).toBeDefined();
    expect(baml!.inverted).toBe(true);
  });

  it("BAMLH0A0HYM2 has label 'HY Credit Spread'", () => {
    const baml = DOMAINS[0].tickers.find((t) => t.symbol === "BAMLH0A0HYM2");
    expect(baml!.label).toBe("HY Credit Spread");
  });

  it("SPY_RSP_RATIO has label 'Cap-Weight vs Equal-Weight Spread'", () => {
    const spy = DOMAINS[1].tickers.find((t) => t.symbol === "SPY_RSP_RATIO");
    expect(spy!.label).toBe("Cap-Weight vs Equal-Weight Spread");
  });

  it("CORR has label 'Max Pairwise Correlation'", () => {
    const corr = DOMAINS[3].tickers.find((t) => t.symbol === "CORR");
    expect(corr!.label).toBe("Max Pairwise Correlation");
  });

  it("non-inverted tickers have inverted as false or undefined", () => {
    for (const domain of DOMAINS) {
      for (const ticker of domain.tickers) {
        if (ticker.symbol !== "BAMLH0A0HYM2") {
          expect(ticker.inverted).toBeFalsy();
        }
      }
    }
  });
});
