/**
 * Live marketplace fetcher (JWT-tier).
 *
 * Hits `https://api.sunflower-land.com/marketplace?filters=<category>` using
 * the JWT in `SFL_JWT`. Unlike the static `marketplace_items.json` (which is
 * generated from GitHub source files at build time), this returns LIVE
 * supply / price / listing data with real item names already resolved
 * server-side.
 *
 * Cached in-memory for 10 minutes per category, with request coalescing so
 * concurrent calls don't trigger duplicate fetches.
 */

import { config } from "./config";
import { resolveItemName } from "./item-ids";

export const DEFAULT_FILTERS = [
  "collectibles",
  "wearables",
  "resources",
  "buds",
  "decoration",
  "beast",
  "utility",
  "food",
  "coupons",
] as const;

export type MarketplaceFilter = (typeof DEFAULT_FILTERS)[number] | string;

export interface MarketplaceItem {
  /** Token ID as returned by the API (sometimes a string, sometimes a number). */
  id?: string | number;
  name?: string;
  type?: string;
  /** Floor price in $FLOWER (when listings exist). */
  floor?: number;
  /** Number of active listings. */
  listings?: number;
  /** Total minted supply, when reported. */
  supply?: number;
  /** Item image URL. */
  image?: string;
  /** True when the name was successfully resolved from marketplace_items.json
   *  (or synthesized for unique-supply buds); false for unknown IDs. */
  resolved?: boolean;
  [key: string]: unknown;
}

export interface CategoryResult {
  fetchedAt: number;
  filter: MarketplaceFilter;
  items: MarketplaceItem[];
  ok: boolean;
  status: number;
}

interface CacheEntry {
  expiresAt: number;
  result: CategoryResult;
}

const CACHE_MS = 10 * 60 * 1000; // 10 min
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CategoryResult>>();

function jwtHeaders(): Record<string, string> | null {
  const jwt = config.sfl.jwt;
  if (!jwt) return null;
  return {
    accept: "*/*",
    authorization: jwt.startsWith("Bearer ") ? jwt : `Bearer ${jwt}`,
    "content-type": "application/json;charset=UTF-8",
    origin: "https://sunflower-land.com",
    referer: "https://sunflower-land.com/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  };
}

/**
 * Each Bud in SFL is a unique NFT (each ID is one bud), so they will never
 * appear in the static name map. We synthesize 'Bud #<id>' for visibility.
 */
function enrichWithName(items: MarketplaceItem[]): MarketplaceItem[] {
  return items.map((it) => {
    if (it.name) return it; // some endpoints already include name
    const idNum = typeof it.id === "number" ? it.id : parseInt(String(it.id ?? ""), 10);
    if (!Number.isFinite(idNum)) return it;
    const isBud = it.collection === "buds";
    const resolved = resolveItemName(idNum);
    const name = resolved ?? (isBud ? `Bud #${idNum}` : `Unknown #${idNum}`);
    return { ...it, name, resolved: Boolean(resolved) || isBud };
  });
}

async function fetchCategoryFresh(filter: MarketplaceFilter): Promise<CategoryResult> {
  const headers = jwtHeaders();
  if (!headers) {
    throw new Error("SFL_JWT not set — cannot reach marketplace JWT endpoint.");
  }
  const base = config.sfl.baseUrl.replace(/\/$/, "");
  const url = `${base}/marketplace?filters=${encodeURIComponent(String(filter))}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  const ok = res.ok;
  let items: MarketplaceItem[] = [];
  if (ok) {
    try {
      const json = (await res.json()) as { items?: MarketplaceItem[] };
      if (Array.isArray(json?.items)) items = enrichWithName(json.items);
    } catch {
      // swallow — leave items empty on parse failure
    }
  }
  return {
    fetchedAt: Date.now(),
    filter,
    items,
    ok,
    status: res.status,
  };
}

/**
 * Returns marketplace items for a single category, served from the 10-minute
 * in-memory cache when fresh. Concurrent callers share a single inflight
 * fetch.
 */
export async function getMarketplaceCategory(
  filter: MarketplaceFilter,
  opts: { force?: boolean } = {},
): Promise<CategoryResult> {
  const key = String(filter);
  const now = Date.now();
  if (!opts.force) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.result;
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetchCategoryFresh(filter)
    .then((result) => {
      // Only cache successful responses — failures should retry on next call.
      if (result.ok) {
        cache.set(key, { expiresAt: Date.now() + CACHE_MS, result });
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

// ============================================================================
// Economies API (Game User JWT, official endpoints)
// ============================================================================
//
// Per the Sunflower Land "Other useful APIs & data" docs:
//   GET /data?type=marketplaceEconomies
//     -> leaderboard-style economy rows (the global UGC economy list)
//   GET /collection/economies/{id}?type=economies&economy={slug}
//     -> detail for one tradeable: listings + offers + sales history
//
// Both require a *Game User JWT* (NOT a Portal JWT). When a portal-tier token
// is supplied, the API returns 403 with a "feature gating" message; we
// surface that as gated=true so callers can render a helpful hint.

interface JwtFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  /** True when the response was a 403 — signals wrong JWT tier or farm
   *  feature gating per the SFL docs. */
  gated: boolean;
  data: T | null;
  fetchedAt: number;
}

/** Generic JWT GET helper that respects the same in-memory cache. */
async function jwtGet<T = unknown>(
  cacheKey: string,
  path: string,
  opts: { force?: boolean } = {},
): Promise<JwtFetchResult<T>> {
  const headers = jwtHeaders();
  if (!headers) {
    throw new Error("SFL_JWT not set — cannot reach JWT-tier endpoints.");
  }
  const now = Date.now();
  if (!opts.force) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      // CategoryResult and JwtFetchResult share enough shape that callers
      // never look at the wrong fields — but we still cast carefully.
      return cached.result as unknown as JwtFetchResult<T>;
    }
  }
  const existing = inflight.get(cacheKey);
  if (existing) return existing as unknown as Promise<JwtFetchResult<T>>;

  const base = config.sfl.baseUrl.replace(/\/$/, "");
  const url = `${base}${path}`;
  const promise = (async (): Promise<JwtFetchResult<T>> => {
    let status = 0;
    let data: T | null = null;
    let ok = false;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      status = res.status;
      ok = res.ok;
      if (ok) {
        try {
          data = (await res.json()) as T;
        } catch {
          data = null;
        }
      }
    } catch (e) {
      console.warn(`[marketplace-jwt] ${path} threw`, e);
    }
    const result: JwtFetchResult<T> = {
      ok,
      status,
      gated: status === 403,
      data,
      fetchedAt: Date.now(),
    };
    if (ok) {
      cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_MS,
        result: result as unknown as CategoryResult,
      });
    }
    return result;
  })().finally(() => {
    inflight.delete(cacheKey);
  });
  inflight.set(cacheKey, promise as unknown as Promise<CategoryResult>);
  return promise;
}

/** Leaderboard-style economy rows. */
export function getMarketplaceEconomies(opts: { force?: boolean } = {}) {
  return jwtGet<unknown>("economies:list", "/data?type=marketplaceEconomies", opts);
}

/**
 * Detail (listings, offers, sales history) for a single tradeable.
 * @param id      The collection id (token id or economy-specific identifier)
 * @param economy The economy slug, e.g. "collectibles" / "wearables"
 */
export function getEconomyDetail(
  id: string | number,
  economy: string,
  opts: { force?: boolean } = {},
) {
  const path = `/collection/economies/${encodeURIComponent(String(id))}?type=economies&economy=${encodeURIComponent(economy)}`;
  return jwtGet<unknown>(`economy:${economy}:${id}`, path, opts);
}

/** Fetches every category in parallel. */
export async function getAllMarketplace(
  opts: { force?: boolean; filters?: readonly MarketplaceFilter[] } = {},
): Promise<{
  fetchedAt: number;
  totalItems: number;
  resolvedCount: number;
  unresolvedCount: number;
  byCategory: Record<string, MarketplaceItem[]>;
  failed: Array<{ filter: string; status: number }>;
}> {
  const filters = opts.filters ?? DEFAULT_FILTERS;
  const results = await Promise.all(
    filters.map((f) => getMarketplaceCategory(f, { force: opts.force })),
  );
  const byCategory: Record<string, MarketplaceItem[]> = {};
  const failed: Array<{ filter: string; status: number }> = [];
  let totalItems = 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;
  for (const r of results) {
    if (r.ok) {
      byCategory[String(r.filter)] = r.items;
      totalItems += r.items.length;
      for (const it of r.items) {
        if (it.resolved) resolvedCount++;
        else unresolvedCount++;
      }
    } else {
      failed.push({ filter: String(r.filter), status: r.status });
    }
  }
  return {
    fetchedAt: Date.now(),
    totalItems,
    resolvedCount,
    unresolvedCount,
    byCategory,
    failed,
  };
}
