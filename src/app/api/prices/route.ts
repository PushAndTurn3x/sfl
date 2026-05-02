import { NextResponse } from "next/server";
import { getPrices } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  try {
    const snap = await getPrices(force);
    return NextResponse.json({
      source: "sfl.world",
      fetchedAt: snap.fetchedAt,
      p2p: snap.prices.p2p,
      exchange: snap.exchange,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
