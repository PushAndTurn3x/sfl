/**
 * Lightweight healthcheck used by Railway's uptime probe.
 *
 * Returns 200 if the process can serve requests and the SQLite DB is
 * reachable (this implicitly exercises the filesystem volume too).
 * Deliberately does NOT hit upstream APIs so a transient sfl.world
 * outage never marks our own service as unhealthy.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = getDb().prepare("SELECT 1 AS ok").get() as { ok: number };
    return NextResponse.json({
      status: "ok",
      db: row?.ok === 1,
      uptimeSec: Math.round(process.uptime()),
      now: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "degraded", error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
