import { NextRequest, NextResponse } from "next/server";
import { computeYieldRows } from "@/lib/yield-analyzer";

export const dynamic = "force-dynamic";

/**
 * GET /api/yield?buffs=Scarecrow,Kuebiko
 *
 * The `buffs` query param is a comma-separated list of collectible names
 * the Master wants to SIMULATE owning, on top of whatever the live farm
 * state already reveals. Unknown names are ignored safely by the analyzer.
 */
export async function GET(req: NextRequest) {
  try {
    const buffsRaw = req.nextUrl.searchParams.get("buffs") ?? "";
    const manualBuffs = buffsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const data = await computeYieldRows(manualBuffs);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
