/**
 * Yield analyzer — ranks SFL produce by $FLOWER earning potential.
 */

import produceJson from "@/data/produce.json";
import buffsJson from "@/data/buffs.json";
import marketplaceData from "@/data/marketplace_items.json";
import { getPriceHistoryBulk, loadSnapshot } from "./db";
import { getPrices } from "./prices";
import type { FarmState } from "./types";

const COIN_TO_FLOWER = 1 / 1000;

export interface ProduceEntry {
  name: string;
  category: string;
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
  p2pPrice: number;
  hasP2P: boolean;
  flowerPerHour: number;
  dailyFlower: number;
  seedCostFlower: number;
  netFlowerPerHour: number;
  paybackHours: number | null;
  shopFlowerPerHour: number;
  sparkline: number[];
  pctChange24h: number | null;
  boostedYield: number;
  boostedSeconds: number;
}

interface Dataset {
  generatedAt: string;
  source: string;
  count: number;
  produce: ProduceEntry[];
}

const dataset = produceJson as Dataset;

/** Upgrade chains where only one item can be placed at a time. When Master
 *  owns multiple tiers we must pick ONE (the strongest), not stack them.
 *  Keys are chain IDs; values are lists from weakest → strongest. */
const BUFF_CHAINS: Record<string, string[]> = {
  generalScarecrow: ["Basic Scarecrow", "Nancy", "Scarecrow", "Kuebiko"],
  // Future chains (if SFL adds more): eggplantBoost, cornBoost, etc.
};

/** For each chain, returns only the single highest-tier buff the master owns. */
function dedupeChains(owned: Set<string>): string[] {
  const result: string[] = [];
  const consumed = new Set<string>();

  for (const [, chain] of Object.entries(BUFF_CHAINS)) {
    // Iterate strongest → weakest, keep the first one owned.
    for (let i = chain.length - 1; i >= 0; i--) {
      const name = chain[i];
      if (owned.has(name)) {
        result.push(name);
        chain.forEach((n) => consumed.add(n));
        break;
      }
    }
  }
  // Append anything not part of any chain.
  for (const name of owned) {
    if (!consumed.has(name)) result.push(name);
  }
  return result;
}

export function detectFarmBuffs(farm: FarmState): string[] {
  // FarmState.balances is the master inventory (placed + held). Note: a truly
  // accurate reading would require distinguishing placed-on-farm vs. held-in-
  // inventory, since unplaced collectibles grant no buff. The public SFL API
  // doesn't cleanly expose "placed" status yet, so we treat ownership as proxy
  // and let the UI's "manual override" picker refine it if needed.
  const collectibles = farm.balances || {};
  const allBuffs = { ...buffsJson.cropBoosts, ...buffsJson.fruitBoosts };
  const owned = new Set<string>();

  for (const buffName of Object.keys(allBuffs)) {
    const qty = Number(collectibles[buffName] ?? 0);
    if (qty > 0) owned.add(buffName);
  }
  return dedupeChains(owned);
}

export function applyBuffs(
  produce: ProduceEntry,
  activeBuffs: string[],
): { yield: number; seconds: number } {
  // Ensure chain exclusivity even when called with a manual list so the
  // UI picker can't accidentally double-count Nancy + Kuebiko.
  const buffs = dedupeChains(new Set(activeBuffs));

  let yieldBonus = 0;
  let speedBonus = 0;

  for (const buffName of buffs) {
    const cropBuff = (buffsJson.cropBoosts as Record<string, any>)[buffName];
    const fruitBuff = (buffsJson.fruitBoosts as Record<string, any>)[buffName];
    const buff = cropBuff || fruitBuff;
    if (!buff) continue;
    // Targeted buffs: skip if this produce isn't in the allow-list.
    if (Array.isArray(buff.crops) && !buff.crops.includes(produce.name)) continue;
    if (Array.isArray(buff.fruits) && !buff.fruits.includes(produce.name)) continue;
    yieldBonus += buff.yield || 0;
    speedBonus += buff.speed || 0;
  }

  // Speed bonus caps at 90% to avoid pathological < 1-second cycles.
  speedBonus = Math.min(0.9, speedBonus);

  const boostedYield = produce.yieldPerPlant * (1 + yieldBonus);
  const boostedSeconds = produce.plantSeconds * (1 - speedBonus);
  return {
    yield: Math.max(0, boostedYield),
    seconds: Math.max(1, boostedSeconds),
  };
}

export async function computeYieldRows(manualBuffs: string[] = []): Promise<{
  rows: YieldRow[];
  fetchedAt: number;
  flowerToUsd?: number;
  unpriced: string[];
  detectedBuffs: string[];
  trending: any[];
  allMarketItems: any[];
}> {
  const snap = await getPrices();
  const p2p = snap.prices.p2p ?? {};
  const farmSnap = loadSnapshot<FarmState>();
  const detectedBuffs = farmSnap ? detectFarmBuffs(farmSnap.payload) : [];
  const activeBuffs = Array.from(new Set([...manualBuffs, ...detectedBuffs]));

  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  
  // Optimization: Only fetch history for items that actually have a current price
  const pricedItemNames = marketplaceData.items
    .filter(i => p2p[i.name] !== undefined)
    .map(i => i.name);
  
  const allItemNames = Array.from(new Set([
    ...dataset.produce.map(p => p.name),
    ...pricedItemNames
  ]));
  
  const history = getPriceHistoryBulk(allItemNames, sinceMs);

  const rows: YieldRow[] = dataset.produce.map((p) => {
    const price = p2p[p.name] ?? 0;
    const { yield: boostedYield, seconds: boostedSeconds } = applyBuffs(p, activeBuffs);
    const hours = boostedSeconds / 3600;
    const flowerPerHour = (price * boostedYield) / hours;
    const seedCostFlower = p.seedPriceCoins * COIN_TO_FLOWER;
    const revenuePerCycle = price * boostedYield;
    const netPerCycle = revenuePerCycle - seedCostFlower;
    const netFlowerPerHour = netPerCycle / hours;
    const paybackHours = flowerPerHour > 0 ? seedCostFlower / flowerPerHour : null;
    const shopRevenueFlower = p.sellPriceCoins * COIN_TO_FLOWER * boostedYield;
    const shopFlowerPerHour = shopRevenueFlower / hours;

    const samples = history[p.name] ?? [];
    const sparkline = downsample(samples.map((s) => s.price), 24);
    if (price > 0) sparkline.push(price);
    const pctChange24h = sparkline.length >= 2 && sparkline[0] > 0
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
      boostedYield,
      boostedSeconds
    };
  });

  const allMarketItems = marketplaceData.items.map(item => {
    const price = p2p[item.name] ?? 0;
    const samples = history[item.name] ?? [];
    const sparkline = downsample(samples.map((s) => s.price), 24);
    if (price > 0) sparkline.push(price);
    const pctChange24h = sparkline.length >= 2 && sparkline[0] > 0
        ? ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100
        : null;
    
    return {
      ...item,
      p2pPrice: price,
      hasP2P: price > 0,
      sparkline,
      pctChange24h
    };
  });

  const trending = [...allMarketItems]
    .filter(i => i.hasP2P && i.pctChange24h !== null)
    .sort((a, b) => (b.pctChange24h || 0) - (a.pctChange24h || 0))
    .slice(0, 10);

  const unpriced = rows.filter((r) => !r.hasP2P).map((r) => r.name);

  return {
    rows,
    fetchedAt: snap.fetchedAt,
    flowerToUsd: snap.exchange?.sfl?.usd,
    unpriced,
    detectedBuffs,
    trending,
    allMarketItems
  };
}

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
