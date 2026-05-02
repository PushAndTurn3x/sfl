/**
 * Public price feed client for sfl.world.
 *
 * - `/api/v1/prices` returns P2P marketplace prices in $FLOWER per unit for
 *   ~60 tradeable game items (crops, fruits, fish, etc.).
 * - `/api/v1/exchange` returns the $FLOWER→fiat exchange rates.
 *
 * Both endpoints are unauthenticated. We cache in-memory for 5 minutes to
 * avoid hammering them on every calculator request.
 */

export interface P2PPrices {
  /** Price in $FLOWER per unit, keyed by item name (e.g. "Wood", "Sunflower"). */
  p2p: Record<string, number>;
  /** Server-reported sequence / fetch marker, forwarded as-is. */
  seq?: unknown;
  /** Server-reported "ge" (Grand Exchange?) data, forwarded as-is. */
  ge?: unknown;
}

export interface ExchangeRates {
  /** fiat→SFL rates (e.g. exchange.sfl.usd = USD value of 1 SFL). */
  sfl: Record<string, number>;
  /** fiat→FLOWER rates. */
  flower?: Record<string, number>;
}

export interface PricesSnapshot {
  prices: P2PPrices;
  exchange?: ExchangeRates;
  /** ms since epoch when the snapshot was fetched. */
  fetchedAt: number;
}

const PRICE_URL = "https://sfl.world/api/v1/prices";
const EXCHANGE_URL = "https://sfl.world/api/v1/exchange";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: PricesSnapshot | null = null;
let inFlight: Promise<PricesSnapshot> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`[prices] ${url} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Returns a fresh (or cached) snapshot of public prices. Cache is shared
 * across all callers; concurrent requests coalesce into one upstream fetch.
 */
export async function getPrices(force = false): Promise<PricesSnapshot> {
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [pricesRaw, exchangeRaw] = await Promise.allSettled([
        fetchJson<{ data: P2PPrices }>(PRICE_URL),
        fetchJson<ExchangeRates>(EXCHANGE_URL),
      ]);

      const pricesData =
        pricesRaw.status === "fulfilled" ? pricesRaw.value.data : { p2p: {} };
      const exchangeData =
        exchangeRaw.status === "fulfilled" ? exchangeRaw.value : undefined;

      cached = {
        prices: pricesData,
        exchange: exchangeData,
        fetchedAt: Date.now(),
      };
      return cached;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Convenience: returns a flat `{ itemName: priceFlower }` map, merging any
 * user-supplied overrides on top of the auto-fetched prices. User values win.
 */
export async function getMergedPrices(
  overrides?: Record<string, number>,
): Promise<Record<string, number>> {
  const snap = await getPrices().catch(() => null);
  const auto = snap?.prices.p2p ?? {};
  return { ...auto, ...(overrides ?? {}) };
}
