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

  // We test ONE endpoint that previously worked (/marketplace?filters=collectibles)
  // against four header-variation profiles. If status changes between profiles,
  // we know the failure is header-related; if all four return 500, it's a pure
  // SFL outage / per-account gating.
  const targetPath = `/marketplace?filters=collectibles`;

  const baseHeaders: Record<string, string> = { accept: "*/*" };
  const fullHeaders: Record<string, string> = {
    ...baseHeaders,
    authorization: jwt.startsWith("Bearer ") ? jwt : `Bearer ${jwt}`,
    "content-type": "application/json;charset=UTF-8",
    origin: "https://sunflower-land.com",
    referer: "https://sunflower-land.com/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  };

  const profiles: Array<{ name: string; headers: Record<string, string> }> = [
    { name: "full (jwt+origin+referer+ua)", headers: fullHeaders },
    {
      name: "jwt only (no origin/referer)",
      headers: { ...baseHeaders, authorization: fullHeaders.authorization },
    },
    {
      name: "no auth (anonymous)",
      headers: baseHeaders,
    },
    {
      name: "x-api-key only",
      headers: config.sfl.apiKey
        ? { ...baseHeaders, "x-api-key": config.sfl.apiKey }
        : baseHeaders,
    },
  ];

  const probe = async (path: string, headers: Record<string, string>) => {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      const text = await res.text();
      return {
        status: res.status,
        ok: res.ok,
        bytes: text.length,
        snippet: text.slice(0, 200),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };

  const headerVariations = await Promise.all(
    profiles.map(async (p) => ({
      profile: p.name,
      ...(await probe(targetPath, p.headers)),
    })),
  );

  // Also run the original path matrix so we still see which routes exist.
  const pathMatrix = [
    `/data?type=marketplaceEconomies`,
    `/data?type=marketplaceEconomies&farmId=${farmId}`,
    `/v1/data?type=marketplaceEconomies`,
    `/collection/economies/1212?type=economies&economy=collectibles`,
    `/collection/economies/1212?economy=collectibles`,
    `/data?type=session&farmId=${farmId}`,
    `/data?type=farm&farmId=${farmId}`,
    `/community/farms/${farmId}`,
  ];
  const pathResults = await Promise.all(
    pathMatrix.map(async (p) => ({ path: p, ...(await probe(p, fullHeaders)) })),
  );

  return NextResponse.json({
    base,
    farmId,
    jwtLength: jwt.length,
    hasApiKey: Boolean(config.sfl.apiKey),
    targetPath,
    headerVariations,
    pathMatrix: pathResults,
  });
}
