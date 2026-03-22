import { NextResponse } from "next/server";
import { query } from "@/lib/timescaledb";

/**
 * GET /api/risk/alerts
 * Returns recent alerts from alert_history, ordered by most recent first.
 * Optional query param: limit (default 50).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
      200,
    );

    const rows = await query(
      `SELECT id, rule_id, triggered_at, value, message, channels, delivered
       FROM alert_history
       ORDER BY triggered_at DESC
       LIMIT $1`,
      [limit],
    );

    return NextResponse.json({ alerts: rows });
  } catch (err) {
    console.error("[/api/risk/alerts]", err);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/risk/alerts
 * Acknowledge an alert by setting delivered=true.
 * Body: { id: number }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const alertId = body?.id;

    if (typeof alertId !== "number" || !Number.isInteger(alertId)) {
      return NextResponse.json(
        { error: "Request body must include 'id' as an integer" },
        { status: 400 },
      );
    }

    const rows = await query(
      `UPDATE alert_history
       SET delivered = true
       WHERE id = $1
       RETURNING id, rule_id, delivered`,
      [alertId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ alert: rows[0] });
  } catch (err) {
    console.error("[/api/risk/alerts]", err);
    return NextResponse.json(
      { error: "Failed to acknowledge alert" },
      { status: 500 },
    );
  }
}
