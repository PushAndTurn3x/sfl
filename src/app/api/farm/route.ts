import { NextResponse } from "next/server";
import { getSFLClient } from "@/lib/sfl-client";
import { loadSnapshot, saveSnapshot } from "@/lib/db";
import type { FarmState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";

  // Try cache first to keep UI snappy.
  const snap = loadSnapshot<FarmState>();
  const fresh = snap && Date.now() - snap.fetchedAt < 60_000;
  if (snap && fresh && !force) {
    return NextResponse.json({ source: "cache", ...snap.payload, fetchedAt: snap.fetchedAt });
  }
  try {
    const farm = await getSFLClient().getFarmState();
    saveSnapshot(farm);
    return NextResponse.json({ source: "live", ...farm });
  } catch (e) {
    if (snap) {
      return NextResponse.json({
        source: "stale-cache",
        error: e instanceof Error ? e.message : String(e),
        ...snap.payload,
        fetchedAt: snap.fetchedAt,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
