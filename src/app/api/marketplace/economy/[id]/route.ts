/**
 * GET /api/marketplace/economy/[id]?economy=<slug>
 *   Wraps the official Sunflower Land endpoint:
 *     GET {API_URL}/collection/economies/{id}?type=economies&economy={slug}
 *
 * Returns full marketplace detail for one tradeable: listings, offers,
 * sale history. Requires a *Game User JWT*.
 *
 * Path params:
 *   id        Collection id / token id of the tradeable
 *
 * Query params:
 *   economy   Economy slug (default: "collectibles"). Common values:
 *             collectibles, wearables, resources, buds, etc.
 *   force=1   Bypass the 10-min cache.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getEconomyDetail } from "@/lib/marketplace-jwt";
import { resolveItemName } from "@/lib/item-ids";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!config.sfl.jwt) {
    return NextResponse.json(
      { error: "SFL_JWT not configured. Set a Game User JWT to enable this endpoint." },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const economy = req.nextUrl.searchParams.get("economy") ?? "collectibles";
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!id) {
    return NextResponse.json({ error: "Missing id path param" }, { status: 400 });
  }

  try {
    const result = await getEconomyDetail(id, economy, { force });
    if (result.gated) {
      return NextResponse.json(
        {
          error:
            "403 from SFL — likely a Portal JWT instead of a Game User JWT, " +
            "or this farm doesn't have the player-economies feature enabled.",
          status: result.status,
          gated: true,
        },
        { status: 403 },
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Upstream returned status ${result.status}`,
          status: result.status,
          upstreamUrl: result.url,
          upstreamBody: result.errorBody,
        },
        { status: 502 },
      );
    }
    const idNum = parseInt(id, 10);
    const resolvedName = Number.isFinite(idNum) ? resolveItemName(idNum) : null;
    return NextResponse.json({
      fetchedAt: result.fetchedAt,
      id,
      economy,
      name: resolvedName,
      data: result.data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
