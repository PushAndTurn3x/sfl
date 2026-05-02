import { NextResponse } from "next/server";
import { z } from "zod";
import { calculate, listRecipesByCategory } from "@/lib/calculator";
import { loadSnapshot } from "@/lib/db";
import { getSFLClient } from "@/lib/sfl-client";
import { getMergedPrices, getPrices } from "@/lib/prices";
import type { FarmState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ recipesByCategory: listRecipesByCategory() });
}

const inputSchema = z.object({
  recipe: z.string(),
  quantity: z.number().int().min(1).max(10000),
  prices: z.record(z.string(), z.number()).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Prefer cached snapshot for speed; fall back to live fetch.
  let farm: FarmState | null = null;
  const snap = loadSnapshot<FarmState>();
  if (snap && Date.now() - snap.fetchedAt < 5 * 60_000) {
    farm = snap.payload;
  } else {
    try {
      farm = await getSFLClient().getFarmState();
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  }

  // Merge auto-fetched P2P prices (sfl.world) with any user-supplied overrides.
  const mergedPrices = await getMergedPrices(parsed.data.prices);
  const snap2 = await getPrices().catch(() => null);

  const result = calculate({
    recipe: parsed.data.recipe,
    quantity: parsed.data.quantity,
    balances: farm.balances,
    flower: farm.flower || farm.sfl,
    coins: farm.coins,
    prices: mergedPrices,
  });
  return NextResponse.json({
    result,
    priceMeta: {
      autoPriceCount: Object.keys(snap2?.prices.p2p ?? {}).length,
      overrideCount: Object.keys(parsed.data.prices ?? {}).length,
      fetchedAt: snap2?.fetchedAt,
      flowerToUsd: snap2?.exchange?.sfl?.usd,
    },
  });
}
