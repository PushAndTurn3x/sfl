/**
 * Yield analyzer — ranks SFL produce by $FLOWER earning potential.
 *
 * Joins static produce metadata (from `src/data/produce.json`, imported from
 * the SFL repo) with live P2P marketplace prices from sfl.world.
 *
 * The core metric is **FLOWER per hour per plot**:
 *     flowerPerHour = p2pPrice * yieldPerPlant / (plantSeconds / 3600)
 *
 * We also compute:
 *   - dailyFlower: FLOWER/hour × 24 (what one plot earns in a full day)
 *   - seedCostFlower: seed price in coins, converted via rough coin→FLOWER
 *     ratio (see `COIN_TO_FLOWER`) for ROI display only
 *   - shopFlowerPerHour: coin sell price × coin→FLOWER rate per hour, so
 *     Master can compare selling to NPC vs. selling P2P
 */

import produceJson from "@/data/produce.json";
import { getPriceHistoryBulk } from "./db";
import { getPrices } from "./prices";

/** Rough conversion: 1 $FLOWER ≈ how many in-game coins?
 *
 * Coins are earned plentifully and cannot be withdrawn, while $FLOWER is the
 * scarce on-chain token. There's no fixed peg, but observed NPC-shop rates
 * put ~1 FLOWER ≈ 1000 coins as a reasonable order-of-magnitude estimate.
 * This is used only for displaying seed-ROI figures; the main ranking uses
 * live P2P FLOWER prices directly.
 */
const COIN_TO_FLOWER = 1 / 1000;

export interface ProduceEntry {
  name: string;
  category: "Crop" | "Greenhouse Crop" | "Fruit" | "Greenhouse Fruit";
  seedName: string;
  seedPriceCoins: number;
  bumpkinLevel: number;
  plantingSpot: string;
  plantSeconds: number;
  sellPriceCoins: number;
  yieldPerPlant: number;
  isBush: boolean;
}

export interface YieldRow extends ProduceEntry {
  /** Live P2P marketplace price per unit in $FLOWER (0 if not listed). */
  p2pPrice: number;
  /** Whether the P2P feed has a price for this item. */
  hasP2P: boolean;
  /** FLOWER earned per hour per plot (P2P path). */
  flowerPerHour: number;
  /** FLOWER earned per 24h per plot. */
  dailyFlower: number;
  /** Seed cost in coins converted to an approximate FLOWER figure. */
  seedCostFlower: number;
  /** Net FLOWER/hour after subtracting seed cost (approx). */
  netFlowerPerHour: number;
  /** Hours to pay back the seed cost at current market rate. */
  paybackHours: number | null;
  /** FLOWER/hour if selling to the NPC shop instead of P2P (coin-converted). */
  shopFlowerPerHour: number;
  /** Up to ~24 downsampled price points over the last 24h, for sparkline. */
  sparkline: number[];
  /** Percentage change vs. the oldest sample in the 24h window, or null. */
  pctChange24h: number | null;
}

interface Dataset {
  generatedAt: string;
  source: string;
  count: number;
  produce: ProduceEntry[];
}

const dataset = produceJson as Dataset;

export function listProduce(): ProduceEntry[] {
  return dataset.produce;
}

/** Builds yield rows for every produce item, joining live P2P prices. */
export async function computeYieldRows(): Promise<{
  rows: YieldRow[];
  fetchedAt: number;
  flowerToUsd?: number;
  unpriced: string[];
}> {
  const snap = await getPrices();
  const p2p = snap.prices.p2p ?? {};

  // Pull 24h history for every produce item in one SQL round-trip.
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const names = dataset.produce.map((p) => p.name);
  const history = getPriceHistoryBulk(names, sinceMs);

  const rows: YieldRow[] = dataset.produce.map((p) => {
    const price = p2p[p.name] ?? 0;
    const hours = p.plantSeconds / 3600;
    const flowerPerHour = (price * p.yieldPerPlant) / hours;
    const seedCostFlower = p.seedPriceCoins * COIN_TO_FLOWER;
    const revenuePerCycle = price * p.yieldPerPlant;
    const netPerCycle = revenuePerCycle - seedCostFlower;
    const netFlowerPerHour = netPerCycle / hours;
    const paybackHours =
      flowerPerHour > 0 ? seedCostFlower / flowerPerHour : null;
    const shopRevenueFlower = p.sellPriceCoins * COIN_TO_FLOWER * p.yieldPerPlant;
    const shopFlowerPerHour = shopRevenueFlower / hours;

    const samples = history[p.name] ?? [];
    const sparkline = downsample(samples.map((s) => s.price), 24);
    // Append current live price so the sparkline ends at "now".
    if (price > 0) sparkline.push(price);
    const pctChange24h =
      sparkline.length >= 2 && sparkline[0] > 0
        ? ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100
        : null;

    return {
      ...p,
      p2pPrice: price,
      hasP2P: price > 0,
      flowerPerHour,
      dailyFlower: flowerPerHour * 24,
      seedCostFlower,
      netFlowerPerHour,
      paybackHours,
      shopFlowerPerHour,
      sparkline,
      pctChange24h,
    };
  });

  const unpriced = rows.filter((r) => !r.hasP2P).map((r) => r.name);

  return {
    rows,
    fetchedAt: snap.fetchedAt,
    flowerToUsd: snap.exchange?.sfl?.usd,
    unpriced,
  };
}

/**
 * Reduces an ordered sample array to at most `buckets` averaged values.
 * Used to keep sparkline payloads small regardless of polling frequency.
 */
function downsample(values: number[], buckets: number): number[] {
  if (values.length <= buckets) return values.slice();
  const out: number[] = [];
  const size = values.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * size);
    const end = Math.floor((i + 1) * size);
    const slice = values.slice(start, Math.max(end, start + 1));
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    out.push(avg);
  }
  return out;
}
