"use client";

import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";

interface DiscountRow {
  time: string;
  ticker: string;
  value: number;
  source: string;
}

interface BDCDetail {
  ticker: string;
  nav: number | null;
  price: number | null;
  discount: number | null;
}

interface BDCData {
  avgDiscount: number | null;
  details: BDCDetail[];
}

const BDC_TICKERS = ["OWL", "ARCC", "BXSL", "OBDC"];
const NAV_TICKERS = BDC_TICKERS.map((t) => `NAV_${t}`);

function discountColor(discount: number): string {
  if (discount > -0.02) return C.green;
  if (discount > -0.1) return C.yellow;
  return C.red;
}

async function fetchBDCData(): Promise<BDCData> {
  const [discountRes, pricesRes] = await Promise.all([
    fetch("/api/risk/timeseries?ticker=BDC_AVG_NAV_DISCOUNT&days=1"),
    fetch(
      `/api/risk/latest-prices?tickers=${[...NAV_TICKERS, ...BDC_TICKERS].join(",")}`,
    ),
  ]);

  if (!discountRes.ok || !pricesRes.ok) {
    throw new Error("Failed to fetch BDC data");
  }

  const discountData: DiscountRow[] = await discountRes.json();
  const priceData: DiscountRow[] = await pricesRes.json();

  const priceMap = new Map<string, number>();
  for (const row of priceData) {
    priceMap.set(row.ticker, row.value);
  }

  const avgDiscount =
    discountData.length > 0
      ? discountData[discountData.length - 1].value
      : null;

  const details: BDCDetail[] = BDC_TICKERS.map((ticker) => {
    const nav = priceMap.get(`NAV_${ticker}`) ?? null;
    const price = priceMap.get(ticker) ?? null;
    const discount = nav && price ? (price - nav) / nav : null;
    return { ticker, nav, price, discount };
  });

  return { avgDiscount, details };
}

export function BDCNavCard() {
  const { data, isLoading, isError } = useQuery<BDCData>({
    queryKey: ["bdc-nav"],
    queryFn: fetchBDCData,
  });

  return (
    <div
      data-testid="bdc-nav-card"
      style={{
        background: C.panel,
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: "14px 16px",
        minHeight: 60,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
          marginBottom: 8,
        }}
      >
        BDC NAV Discount
      </div>

      {isLoading && (
        <div
          data-testid="bdc-nav-loading"
          style={{
            fontSize: 11,
            color: C.textMuted,
            fontFamily: "var(--font-mono)",
          }}
        >
          Loading...
        </div>
      )}

      {isError && (
        <div
          data-testid="bdc-nav-error"
          style={{
            display: "inline-block",
            background: C.orange,
            color: "#fff",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Data unavailable
        </div>
      )}

      {data && (
        <div>
          <div
            data-testid="bdc-nav-value"
            style={{
              fontSize: 28,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color:
                data.avgDiscount !== null
                  ? discountColor(data.avgDiscount)
                  : C.textMuted,
              marginBottom: 12,
            }}
          >
            {data.avgDiscount !== null
              ? `${(data.avgDiscount * 100).toFixed(1)}%`
              : "--"}
          </div>

          <div data-testid="bdc-nav-table">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  {["Ticker", "NAV", "Price", "Discount"].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: "left",
                        fontSize: 11,
                        color: C.textMuted,
                        fontWeight: 400,
                        padding: "4px 8px 6px",
                        borderBottom: `1px solid ${C.panelBorder}`,
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.details.map((row) => (
                  <tr key={row.ticker}>
                    <td
                      style={{
                        padding: "4px 8px",
                        color: C.text,
                        fontWeight: 600,
                      }}
                    >
                      {row.ticker}
                    </td>
                    <td style={{ padding: "4px 8px", color: C.text }}>
                      {row.nav !== null ? `$${row.nav.toFixed(2)}` : "--"}
                    </td>
                    <td style={{ padding: "4px 8px", color: C.text }}>
                      {row.price !== null ? `$${row.price.toFixed(2)}` : "--"}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        color:
                          row.discount !== null
                            ? discountColor(row.discount)
                            : C.textMuted,
                      }}
                    >
                      {row.discount !== null
                        ? `${(row.discount * 100).toFixed(1)}%`
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
