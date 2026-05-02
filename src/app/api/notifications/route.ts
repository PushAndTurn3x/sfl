import { NextResponse } from "next/server";
import { listLog } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  return NextResponse.json({ log: listLog(limit) });
}
