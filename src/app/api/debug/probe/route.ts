/**
 * Debug helper: hits every candidate Sunflower Land endpoint with the
 * configured x-api-key and reports status + a snippet of the response body.
 *
 * Use this to figure out which path your access tier expects, then update
 * `src/lib/sfl-client.ts` accordingly.
 *
 * Hit it at:  GET /api/debug/probe
 */

import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = config.sfl.baseUrl.replace(/\/$/, "");
  const farmId = config.sfl.farmId;
  const apiKey = config.sfl.apiKey;
  const jwt = config.sfl.jwt;

  if (!apiKey && !jwt) {
    return NextResponse.json(
      { error: "Set SFL_API_KEY or SFL_JWT first" },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (jwt) headers["authorization"] = `Bearer ${jwt}`;

  const paths = [
    `/v1/farms/${farmId}`,
    `/community/farms/${farmId}`,
    `/farms/${farmId}`,
    `/community/farms?ids=${farmId}`,
    `/community/getFarms?ids=${farmId}`,
    `/community/farm/${farmId}`,
    `/data?type=session&farmId=${farmId}`,
    `/session/${farmId}`,
    `/portal/yield-optimizer/player`,
    // POST variants tried via GET to see if route exists at all
    `/sessions/${farmId}`,
    `/v1/community/farms/${farmId}`,
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
          contentType: res.headers.get("content-type"),
          bodySnippet: text.slice(0, 400),
        };
      } catch (e) {
        return { path, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return NextResponse.json({
    base,
    farmId,
    hasApiKey: Boolean(apiKey),
    hasJwt: Boolean(jwt),
    results,
  });
}
