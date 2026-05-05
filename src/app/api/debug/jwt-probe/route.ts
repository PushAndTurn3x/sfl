/**
 * Debug helper: probes multiple variations of JWT-tier marketplace endpoints
 * to figure out which exact path SFL accepts for this account.
 *
 * Hit at: GET /api/debug/jwt-probe
 *
 * Returns a list of {path, status, ok, snippet} so Master can spot the
 * working endpoint among 500/403/404 failures.
 */

import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const jwt = config.sfl.jwt;
  const farmId = config.sfl.farmId;
  const base = config.sfl.baseUrl.replace(/\/$/, "");

  if (!jwt) {
    return NextResponse.json({ error: "SFL_JWT not set" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    accept: "*/*",
    authorization: jwt.startsWith("Bearer ") ? jwt : `Bearer ${jwt}`,
    "content-type": "application/json;charset=UTF-8",
    origin: "https://sunflower-land.com",
    referer: "https://sunflower-land.com/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  };

  // Variations of the marketplace economies endpoint.
  const paths = [
    // Per official docs
    `/data?type=marketplaceEconomies`,
    // With farmId variations
    `/data?type=marketplaceEconomies&farmId=${farmId}`,
    `/data?type=marketplaceEconomies&id=${farmId}`,
    // Maybe the route lives under /v1
    `/v1/data?type=marketplaceEconomies`,
    // Maybe POST? (we still GET first to see route existence)
    `/data?type=economies`,
    `/data?type=marketplace`,
    // Detail endpoint variations (use a known collectible id 1212)
    `/collection/economies/1212?type=economies&economy=collectibles`,
    `/collection/economies/1212?economy=collectibles`,
    `/collection/economies/1212`,
    // Direct marketplace list (already working — sanity check)
    `/marketplace?filters=collectibles`,
    // Session endpoint as JWT auth sanity check
    `/data?type=session&farmId=${farmId}`,
  ];

  const results = await Promise.all(
    paths.map(async (path) => {
      const url = `${base}${path}`;
      try {
        const res = await fetch(url, { headers, cache: "no-store" });
        const text = await res.text();
        return {
          path,
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get("content-type"),
          bodySnippet: text.slice(0, 300),
        };
      } catch (e) {
        return { path, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return NextResponse.json({
    base,
    farmId,
    jwtLength: jwt.length,
    results,
  });
}
