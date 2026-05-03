/**
 * Debug helper: shows how the SFL raw inventory response is being normalized.
 *
 * - `resolved`    → entries whose numeric/name key mapped cleanly to a
 *                   known item (translation succeeded)
 * - `unresolved`  → numeric IDs with NO entry in marketplace_items.json
 *                   (indicates the mapping file is stale; rerun
 *                   `node scripts/update-marketplace.mjs`)
 * - `passthrough` → non-numeric keys that were kept as-is (community API)
 *
 * Hit it at: GET /api/debug/inventory
 */

import { NextResponse } from "next/server";
import { getSFLClient } from "@/lib/sfl-client";
import { getLookupStats, resolveItemName } from "@/lib/item-ids";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = getSFLClient();
    const raw = await client.getRaw();
    const r = raw as Record<string, unknown>;
    const farm =
      (r?.farms as Record<string, unknown> | undefined)?.[
        Object.keys((r?.farms as Record<string, unknown>) ?? {})[0] ?? ""
      ] ??
      (r?.farm as Record<string, unknown> | undefined) ??
      r;

    const rawInv =
      ((farm as Record<string, unknown>)?.inventory as Record<
        string,
        string | number
      >) ?? {};

    const resolved: Record<string, { qty: number; id: number }> = {};
    const unresolved: Record<string, number> = {};
    const passthrough: Record<string, number> = {};

    for (const [k, v] of Object.entries(rawInv)) {
      const qty = typeof v === "number" ? v : parseFloat(v);
      if (!Number.isFinite(qty)) continue;
      if (/^\d+$/.test(k)) {
        const name = resolveItemName(k);
        if (name) resolved[name] = { qty, id: Number(k) };
        else unresolved[k] = qty;
      } else {
        passthrough[k] = qty;
      }
    }

    return NextResponse.json({
      mappingStats: getLookupStats(),
      inventorySummary: {
        totalEntries: Object.keys(rawInv).length,
        resolvedCount: Object.keys(resolved).length,
        unresolvedCount: Object.keys(unresolved).length,
        passthroughCount: Object.keys(passthrough).length,
      },
      resolved,
      unresolved,
      passthrough,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
