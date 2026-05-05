/**
 * GET /api/marketplace/economies
 *   Wraps the official Sunflower Land endpoint:
 *     GET {API_URL}/data?type=marketplaceEconomies
 *
 * Returns leaderboard-style economy rows (global UGC economy list).
 * Requires a *Game User JWT* in SFL_JWT — Portal JWTs will hit a 403,
 * which we surface via gated=true with a helpful hint.
 *
 * Query params:
 *   ?force=1   bypass the 10-min cache and refetch fresh
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getMarketplaceEconomies } from "@/lib/marketplace-jwt";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!config.sfl.jwt) {
    return NextResponse.json(
      { error: "SFL_JWT not configured. Set a Game User JWT to enable this endpoint." },
      { status: 400 },
    );
  }

  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    const result = await getMarketplaceEconomies({ force });
    if (result.gated) {
      return NextResponse.json(
        {
          error:
            "403 from SFL — likely a Portal JWT instead of a Game User JWT, " +
            "or the farm doesn't have player-economies feature enabled.",
          status: result.status,
          gated: true,
        },
        { status: 403 },
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: `Upstream returned status ${result.status}`, status: result.status },
        { status: 502 },
      );
    }
    return NextResponse.json({
      fetchedAt: result.fetchedAt,
      data: result.data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
