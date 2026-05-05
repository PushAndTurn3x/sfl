/**
 * Debug helper: decodes the SFL_JWT currently loaded on the server (Railway)
 * and reports its tier + validity. Useful for confirming that the env var
 * actually contains a Game User JWT and hasn't quietly expired or rotated.
 *
 * Hit at: GET /api/debug/jwt-decode
 *
 * Signature is NOT verified (we don't have SFL's secret) — we only inspect
 * the payload claims. The signature itself is masked in the response.
 */

import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

function b64UrlDecode(s: string): unknown {
  try {
    const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
    const std = padded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(std, "base64").toString("utf8"));
  } catch (e) {
    return { _decodeError: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const jwt = config.sfl.jwt;
  if (!jwt) {
    return NextResponse.json({ error: "SFL_JWT not set in env" }, { status: 400 });
  }

  const parts = jwt.split(".");
  if (parts.length !== 3) {
    return NextResponse.json(
      {
        error: "Invalid JWT format (expected 3 dot-separated parts)",
        partsCount: parts.length,
        length: jwt.length,
        hint:
          "If pasted from localStorage Supabase JSON, you may have grabbed " +
          "the wrapping object instead of the inner access_token string. " +
          "The token itself starts with 'eyJ' and contains exactly two dots.",
      },
      { status: 400 },
    );
  }

  const header = b64UrlDecode(parts[0]) as Record<string, unknown>;
  const payload = b64UrlDecode(parts[1]) as Record<string, unknown>;
  const signaturePreview = parts[2].slice(0, 8) + "..." + parts[2].slice(-4);

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  const iat = typeof payload?.iat === "number" ? payload.iat : null;
  const userAccess = (payload?.userAccess as Record<string, boolean> | undefined) ?? {};

  // Heuristic: Game User JWT typically carries userAccess.sync.
  // Portal JWTs typically carry a portalId field instead.
  const isGameUserJwt = Boolean(userAccess.sync);
  const isPortalJwt = "portalId" in (payload ?? {});

  const isExpired = exp !== null && exp < now;
  const minutesUntilExpiry = exp !== null ? Math.round((exp - now) / 60) : null;

  return NextResponse.json({
    length: jwt.length,
    firstChars: jwt.slice(0, 16) + "...",
    lastChars: "..." + jwt.slice(-8),
    header,
    payload,
    signaturePreview,
    analysis: {
      tokenType: isGameUserJwt
        ? "Game User JWT ✅"
        : isPortalJwt
          ? "Portal JWT ❌ (wrong tier for marketplace)"
          : "Unknown JWT type ⚠️",
      isGameUserJwt,
      isPortalJwt,
      isExpired,
      issuedAt: iat ? new Date(iat * 1000).toISOString() : null,
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      minutesUntilExpiry,
      farmId: payload?.farmId ?? null,
      farmIdMatchesEnv: String(payload?.farmId ?? "") === String(config.sfl.farmId),
      userAccessFlags: Object.keys(userAccess).filter((k) => userAccess[k]),
    },
    nextSteps: {
      verifyAgainstBrowser:
        "Open sunflower-land.com → DevTools → Application → Local Storage → " +
        "find the 'sb_wiz.zpc.ng.sunflower-land.com-/play/' key. " +
        "Compare the value with `firstChars` and `lastChars` above. " +
        "If they DON'T match, your Railway SFL_JWT is stale — refresh it.",
    },
  });
}
