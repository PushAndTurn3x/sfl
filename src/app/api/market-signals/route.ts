import { NextResponse } from "next/server";
import { getPriceHistoryBulk } from "@/lib/db";
import { analyzeMarket, DEFAULT_KEY_ITEMS } from "@/lib/market-analyzer";

export const dynamic = "force-dynamic";

/**
 * Returns EMA/RSI-based signals for a configurable list of liquid items.
 * Defaults to DEFAULT_KEY_ITEMS; override with MARKET_SIGNAL_ITEMS env.
 */
export async function GET() {
  try {
    const envItems = (process.env.MARKET_SIGNAL_ITEMS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const keyItems = envItems.length > 0 ? envItems : [...DEFAULT_KEY_ITEMS];

    const since = Date.now() - 24 * 60 * 60 * 1000; // last 24h window
    const historyBulk = getPriceHistoryBulk(keyItems, since);

    const signals = keyItems.map((item) => {
      const history = historyBulk[item] ?? [];
      // analyzeMarket handles the "too few samples" case internally.
      return analyzeMarket(item, history);
    });

    return NextResponse.json({
      success: true,
      signals,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[api/market-signals] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
