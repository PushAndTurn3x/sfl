/**
 * Sunflower Land API client.
 *
 * IMPORTANT: SFL's API surface depends on the type of access granted.
 * - The Community / "x-api-key" tier exposes endpoints under
 *   `/community/...` (read-only farm snapshots).
 * - Portal / Minigame access uses JWTs and exposes `/portal/<id>/player`
 *   and `/data?type=session`.
 *
 * We try multiple known endpoints and return the first successful response,
 * then normalize it into our internal `FarmState` shape. This keeps the rest
 * of the app stable even if SFL renames or relocates an endpoint.
 *
 * If your access pattern is different, edit `fetchRaw` below.
 */

import { config } from "./config";
import type {
  ActiveBuff,
  Animal,
  BalanceMap,
  Chore,
  CropPlot,
  DailyReward,
  FarmState,
  ResourceNode,
} from "./types";

// ---------- Crop growth times (seconds) ----------
// Source: Sunflower Land game data (approximate; tuned for ChapterX baseline).
// These let us compute readyAt locally even if the API only returns plantedAt.
const CROP_SECONDS: Record<string, number> = {
  Sunflower: 60,
  Potato: 5 * 60,
  Pumpkin: 30 * 60,
  Carrot: 60 * 60,
  Cabbage: 2 * 60 * 60,
  Beetroot: 4 * 60 * 60,
  Cauliflower: 8 * 60 * 60,
  Parsnip: 12 * 60 * 60,
  Eggplant: 16 * 60 * 60,
  Corn: 20 * 60 * 60,
  Radish: 24 * 60 * 60,
  Wheat: 24 * 60 * 60,
  Kale: 36 * 60 * 60,
};

// ---------- Animal cooldown times (seconds) ----------
const ANIMAL_SECONDS: Record<string, number> = {
  Chicken: 24 * 60 * 60,
  Cow: 48 * 60 * 60,
  Sheep: 60 * 60 * 60,
};

// ---------- Resource node recovery times (seconds) ----------
// Approximate; in-game skills can shorten these.
const RESOURCE_SECONDS: Record<string, number> = {
  Tree: 2 * 60 * 60,
  Stone: 4 * 60 * 60,
  Iron: 8 * 60 * 60,
  Gold: 24 * 60 * 60,
  Crimstone: 24 * 60 * 60,
  Sunstone: 72 * 60 * 60,
  Oil: 24 * 60 * 60,
  FruitPatch: 12 * 60 * 60,
};

// ---------- Buff durations (seconds) ----------
// Skills don't expire (they're passive perks); only timed boosts are listed here.
const BUFF_SECONDS: Record<string, number> = {
  "Time Warp Totem": 2 * 60 * 60,
  "Super Totem": 7 * 24 * 60 * 60,
};

export interface SFLClient {
  /** Returns a normalized farm snapshot for the configured farm id. */
  getFarmState(): Promise<FarmState>;
  /** Returns the raw, unmodified API response (for debugging / advanced use). */
  getRaw(): Promise<unknown>;
}

class HttpSFLClient implements SFLClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly farmId: string;
  private readonly jwt: string;

  constructor() {
    this.baseUrl = config.sfl.baseUrl.replace(/\/$/, "");
    this.apiKey = config.sfl.apiKey;
    this.farmId = config.sfl.farmId;
    this.jwt = config.sfl.jwt;
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (this.apiKey) h["x-api-key"] = this.apiKey;
    if (this.jwt) h["authorization"] = `Bearer ${this.jwt}`;
    return h;
  }

  private async tryFetch(path: string): Promise<unknown | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: this.headers(),
        cache: "no-store",
      });
      if (!res.ok) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[sfl-client] ${path} -> ${res.status}`);
        }
        return null;
      }
      return await res.json();
    } catch (e) {
      console.warn(`[sfl-client] ${path} threw`, e);
      return null;
    }
  }

  async getRaw(): Promise<unknown> {
    // Try endpoints in order of preference. Stop at first success.
    const candidates = [
      // Confirmed working with x-api-key (community tier).
      `/community/farms/${this.farmId}`,
      // Fallbacks kept for resilience if SFL renames the path in a future chapter.
      `/v1/farms/${this.farmId}`,
      `/farms/${this.farmId}`,
      `/community/farm/${this.farmId}`,
    ];
    for (const c of candidates) {
      const data = await this.tryFetch(c);
      if (data) return data;
    }
    throw new Error(
      "[sfl-client] Could not fetch farm data from any known endpoint. " +
        "Check SFL_API_BASE_URL, SFL_API_KEY, SFL_FARM_ID, and your access tier.",
    );
  }

  async getFarmState(): Promise<FarmState> {
    const raw = await this.getRaw();
    return normalize(raw, this.farmId);
  }
}

/**
 * Normalizes the various possible SFL response shapes into our `FarmState`.
 * SFL has historically returned either an array of farms keyed under
 * `farms[id]` or a single object under `farm`, so we handle both.
 */
function normalize(raw: unknown, farmId: string): FarmState {
  const r = raw as Record<string, unknown>;
  const farmEnvelope =
    (r?.farms as Record<string, unknown> | undefined)?.[farmId] ??
    (r?.farm as Record<string, unknown> | undefined) ??
    r;

  const farm = (farmEnvelope ?? {}) as Record<string, unknown>;

  const inventory = (farm.inventory ?? {}) as Record<string, string | number>;
  const balances: BalanceMap = {};
  for (const [k, v] of Object.entries(inventory)) {
    const n = typeof v === "number" ? v : parseFloat(v);
    if (!Number.isNaN(n)) balances[k] = n;
  }

  // Post-migration: `balance` is the on-chain $FLOWER balance.
  // `coins` is the in-game soft currency.
  const flower = parseFloatSafe((farm.flower ?? farm.balance) as string | number | undefined);
  const sfl = parseFloatSafe(farm.balance as string | number | undefined);
  const coins = parseFloatSafe(farm.coins as string | number | undefined);

  const crops = extractCrops(farm);
  const animals = extractAnimals(farm);
  const resources = extractResources(farm);
  const dailyReward = extractDailyReward(farm);
  const chores = extractChores(farm);
  const buffs = extractBuffs(farm);

  return {
    farmId,
    fetchedAt: Date.now(),
    balances,
    coins,
    flower,
    sfl,
    crops,
    animals,
    resources,
    dailyReward,
    chores,
    buffs,
    raw,
  };
}

function parseFloatSafe(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function extractCrops(farm: Record<string, unknown>): CropPlot[] {
  // Possible shapes: farm.crops (object id->plot) or farm.cropPlots, or under buildings.
  const plotsObj =
    (farm.crops as Record<string, unknown> | undefined) ??
    (farm.cropPlots as Record<string, unknown> | undefined) ??
    {};
  const result: CropPlot[] = [];
  for (const [id, plotRaw] of Object.entries(plotsObj)) {
    const plot = plotRaw as Record<string, unknown>;
    const cropObj = (plot?.crop ?? plot?.plant) as Record<string, unknown> | undefined;
    if (!cropObj) {
      result.push({ id });
      continue;
    }
    const cropName = (cropObj.name ?? cropObj.type) as string | undefined;
    const plantedAt = (cropObj.plantedAt ?? cropObj.planted_at) as number | undefined;
    const seconds = cropName ? CROP_SECONDS[cropName] : undefined;
    const readyAt =
      plantedAt && seconds ? plantedAt + seconds * 1000 : (cropObj.readyAt as number | undefined);
    result.push({ id, crop: cropName, plantedAt, readyAt });
  }
  return result;
}

function extractAnimals(farm: Record<string, unknown>): Animal[] {
  const animals: Animal[] = [];
  // Modern shape: { henHouse: { animals: {...} }, barn: { animals: {...} } }
  const buildings = [
    farm.henHouse as Record<string, unknown> | undefined,
    farm.barn as Record<string, unknown> | undefined,
  ];
  for (const b of buildings) {
    if (!b) continue;
    const inner = (b.animals ?? {}) as Record<string, unknown>;
    for (const [id, aRaw] of Object.entries(inner)) {
      const a = aRaw as Record<string, unknown>;
      const type = (a.type as string | undefined) ?? "Animal";
      const fedAt = (a.fedAt ?? a.lastFed ?? a.asleepAt) as number | undefined;
      const awakeAt = a.awakeAt as number | undefined;
      const seconds = ANIMAL_SECONDS[type];
      let readyAt: number | undefined;
      if (awakeAt && awakeAt > 0) {
        readyAt = awakeAt;
      } else if (fedAt && seconds && fedAt > 0) {
        readyAt = fedAt + seconds * 1000;
      }
      animals.push({ id, type, fedAt, readyAt, state: a.state as string | undefined });
    }
  }
  // Legacy shape fallback.
  const legacy: Array<[string, Record<string, unknown> | undefined]> = [
    ["Chicken", farm.chickens as Record<string, unknown> | undefined],
    ["Cow", farm.cows as Record<string, unknown> | undefined],
    ["Sheep", farm.sheep as Record<string, unknown> | undefined],
  ];
  for (const [type, obj] of legacy) {
    if (!obj) continue;
    for (const [id, aRaw] of Object.entries(obj)) {
      const a = aRaw as Record<string, unknown>;
      const fedAt = (a.fedAt ?? a.lastFed) as number | undefined;
      const seconds = ANIMAL_SECONDS[type];
      const readyAt =
        fedAt && seconds ? fedAt + seconds * 1000 : (a.readyAt as number | undefined);
      animals.push({ id, type, fedAt, readyAt, state: a.state as string | undefined });
    }
  }
  return animals;
}

function extractResources(farm: Record<string, unknown>): ResourceNode[] {
  const out: ResourceNode[] = [];
  // (top-level key, resource type, inner key holding the timestamp)
  const sources: Array<[string, string, string, string]> = [
    ["trees", "Tree", "wood", "choppedAt"],
    ["stones", "Stone", "stone", "minedAt"],
    ["iron", "Iron", "stone", "minedAt"],
    ["gold", "Gold", "stone", "minedAt"],
    ["crimstones", "Crimstone", "stone", "minedAt"],
    ["sunstones", "Sunstone", "stone", "minedAt"],
    ["oilReserves", "Oil", "oil", "drilledAt"],
    ["fruitPatches", "FruitPatch", "fruit", "harvestedAt"],
  ];
  for (const [topKey, type, innerKey, tsKey] of sources) {
    const obj = farm[topKey] as Record<string, unknown> | undefined;
    if (!obj) continue;
    for (const [id, nodeRaw] of Object.entries(obj)) {
      const node = nodeRaw as Record<string, unknown>;
      const inner = (node[innerKey] ?? {}) as Record<string, unknown>;
      const lastHarvestedAt = inner[tsKey] as number | undefined;
      const seconds = RESOURCE_SECONDS[type];
      const readyAt =
        lastHarvestedAt && seconds && lastHarvestedAt > 0
          ? lastHarvestedAt + seconds * 1000
          : 0;
      out.push({ id, type, lastHarvestedAt, readyAt });
    }
  }
  return out;
}

function extractDailyReward(farm: Record<string, unknown>): DailyReward | undefined {
  const dr = farm.dailyRewards as Record<string, unknown> | undefined;
  if (!dr) return undefined;
  const chest = (dr.chest ?? {}) as Record<string, unknown>;
  const collectedAt = (chest.collectedAt as number | undefined) ?? 0;
  // Daily reward refreshes every 24h. If last collection was more than 24h ago,
  // a new chest is available now.
  const nextAvailableAt = collectedAt > 0 ? collectedAt + 24 * 60 * 60 * 1000 : Date.now();
  return {
    streaks: (dr.streaks as number | undefined) ?? 0,
    lastCollectedAt: collectedAt,
    collectedToday: nextAvailableAt > Date.now(),
    nextAvailableAt,
  };
}

function extractChores(farm: Record<string, unknown>): Chore[] {
  const out: Chore[] = [];
  const board = farm.choreBoard as Record<string, unknown> | undefined;
  if (!board) return out;
  const chores = (board.chores ?? {}) as Record<string, unknown>;
  for (const [id, cRaw] of Object.entries(chores)) {
    const c = cRaw as Record<string, unknown>;
    const completedAt = c.completedAt as number | undefined;
    out.push({
      id,
      description: (c.name ?? c.description) as string | undefined,
      completed: Boolean(completedAt),
      expiresAt: c.expiresAt as number | undefined,
    });
  }
  return out;
}

function extractBuffs(farm: Record<string, unknown>): ActiveBuff[] {
  const out: ActiveBuff[] = [];
  const used = (farm.boostsUsedAt as Record<string, number> | undefined) ?? {};
  const now = Date.now();
  for (const [name, startedAt] of Object.entries(used)) {
    if (!startedAt) continue;
    const seconds = BUFF_SECONDS[name];
    if (!seconds) continue; // skip skill perks (no cooldown to track)
    const expiresAt = startedAt + seconds * 1000;
    out.push({ name, startedAt, expiresAt, active: expiresAt > now });
  }
  return out;
}

let singleton: SFLClient | null = null;
export function getSFLClient(): SFLClient {
  if (!singleton) singleton = new HttpSFLClient();
  return singleton;
}
