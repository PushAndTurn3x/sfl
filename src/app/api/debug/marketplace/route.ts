/**
 * Probes likely Sunflower Land marketplace endpoints to discover which (if any)
 * are accessible with the configured x-api-key. Once you know which works,
 * we can wire it into the calculator.
 */

import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = config.sfl.baseUrl.replace(/\/$/, "");
  const apiKey = config.sfl.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "SFL_API_KEY not set" }, { status: 400 });
  }
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    accept: "application/json",
  };

  const paths = [
    "/community/marketplace",
    "/community/marketplace/Wood",
    "/community/prices",
    "/community/prices/Wood",
    "/marketplace",
    "/marketplace/listings",
    "/marketplace/listings?item=Wood",
    "/v1/marketplace",
    "/v1/marketplace/Wood",
    "/v1/prices",
    "/community/farms/marketplace",
    "/community/marketplace/listings",
    "/community/marketplace/floor",
  ];

  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
        const text = await res.text();
        return {
          path,
          status: res.status,
          ok: res.ok,
          bodySnippet: text.slice(0, 300),
        };
      } catch (e) {
        return { path, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return NextResponse.json({ base, results });
}
