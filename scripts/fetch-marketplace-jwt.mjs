#!/usr/bin/env node
/**
 * Full marketplace discovery via JWT-authenticated endpoint.
 *
 * Mirrors the Python proof-of-concept Master shared:
 *   GET https://api.sunflower-land.com/marketplace?filters=<category>
 *
 * Unlike `update-marketplace.mjs` (which parses TS source from GitHub),
 * this script hits the LIVE marketplace API so we get current supply +
 * price data alongside real item names. Output is written to
 * `src/data/marketplace_live.json` so it doesn't clobber the static
 * GitHub-derived `marketplace_items.json`.
 *
 * Usage:
 *   $env:SFL_JWT = "eyJhbGciOi..."
 *   node scripts/fetch-marketplace-jwt.mjs
 *
 * Optional env:
 *   SFL_API_BASE_URL  (default: https://api.sunflower-land.com)
 *   MARKETPLACE_FILTERS  comma-separated override of categories
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "src/data/marketplace_live.json");

const BASE_URL = (process.env.SFL_API_BASE_URL ?? "https://api.sunflower-land.com").replace(
  /\/$/,
  "",
);
const JWT = process.env.SFL_JWT ?? "";

if (!JWT) {
  console.error("ERROR: SFL_JWT env var is required.");
  console.error("Grab a fresh token from sunflower-land.com DevTools → Network → Authorization header.");
  process.exit(1);
}

const FILTERS = (process.env.MARKETPLACE_FILTERS ??
  "collectibles,wearables,resources,buds,decoration,beast,utility,food,coupons")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HEADERS = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9,id;q=0.8",
  authorization: JWT.startsWith("Bearer ") ? JWT : `Bearer ${JWT}`,
  "content-type": "application/json;charset=UTF-8",
  origin: "https://sunflower-land.com",
  referer: "https://sunflower-land.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
};

async function fetchCategory(filter) {
  const url = `${BASE_URL}/marketplace?filters=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    return { ok: false, status: res.status, items: [] };
  }
  const json = await res.json();
  const items = Array.isArray(json?.items) ? json.items : [];
  return { ok: true, status: 200, items, raw: json };
}

async function main() {
  console.log(`[marketplace-jwt] base=${BASE_URL}`);
  console.log(`[marketplace-jwt] filters=${FILTERS.join(", ")}`);
  console.log("");

  const byCategory = {};
  let total = 0;
  const failed = [];

  for (const filter of FILTERS) {
    process.stdout.write(`  ${filter.padEnd(14)} `);
    try {
      const result = await fetchCategory(filter);
      if (!result.ok) {
        console.log(`✗ HTTP ${result.status}`);
        failed.push({ filter, status: result.status });
        continue;
      }
      byCategory[filter] = result.items;
      total += result.items.length;
      console.log(`✓ ${result.items.length} items`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
      failed.push({ filter, error: e.message });
    }
  }

  // Flatten into a single array with category tag for easier downstream use.
  const flat = [];
  for (const [cat, items] of Object.entries(byCategory)) {
    for (const it of items) flat.push({ category: cat, ...it });
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: Date.now(),
        baseUrl: BASE_URL,
        totalItems: total,
        categoryCounts: Object.fromEntries(
          Object.entries(byCategory).map(([c, items]) => [c, items.length]),
        ),
        failed,
        byCategory,
        flat,
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log(`[marketplace-jwt] total=${total} categories=${Object.keys(byCategory).length}`);
  if (failed.length) console.log(`[marketplace-jwt] failed=${failed.length}`);
  console.log(`[marketplace-jwt] saved → ${OUT_PATH}`);
}

main().catch((e) => {
  console.error("[marketplace-jwt] fatal:", e);
  process.exit(1);
});
