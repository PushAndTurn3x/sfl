/**
 * GET /api/marketplace
 *   Returns marketplace items grouped by category. Powered by the JWT-tier
 *   `/marketplace?filters=...` endpoint with a 10-minute in-memory cache.
 *
 * Query params:
 *   ?filters=collectibles,wearables   (default: all 9 categories)
 *   ?force=1                          bypass cache and refetch fresh
 *
 * Requires SFL_JWT to be configured.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_FILTERS,
  getAllMarketplace,
  type MarketplaceFilter,
} from "@/lib/marketplace-jwt";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!config.sfl.jwt) {
    return NextResponse.json(
      {
        error:
          "SFL_JWT is not configured. Set it in your environment to enable the marketplace endpoint.",
      },
      { status: 400 },
    );
  }

  const filtersParam = req.nextUrl.searchParams.get("filters");
  const force = req.nextUrl.searchParams.get("force") === "1";
  const filters: readonly MarketplaceFilter[] = filtersParam
    ? filtersParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_FILTERS;

  try {
    const data = await getAllMarketplace({ force, filters });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
