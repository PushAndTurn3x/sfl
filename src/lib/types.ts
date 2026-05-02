/**
 * Shared types representing a normalized view of Sunflower Land farm state.
 *
 * NOTE: Sunflower Land's actual API response is large and evolves with each
 * Chapter. We deliberately keep these types loose (records keyed by string)
 * to remain forward-compatible. Adapters in `sfl-client.ts` normalize the raw
 * response into this shape.
 */

export type Resource = string; // e.g. "Wood", "Stone", "Sunflower"

/** Inventory and balance balances are typically string-encoded BigDecimal in SFL. */
export type BalanceMap = Record<Resource, number>;

export interface CropPlot {
  id: string;
  /** Crop name, e.g. "Sunflower", "Potato". Empty/undefined when plot is empty. */
  crop?: Resource;
  /** Planted timestamp (ms). */
  plantedAt?: number;
  /** Computed time the crop becomes harvestable (ms). */
  readyAt?: number;
}

export interface Animal {
  id: string;
  /** "Chicken", "Cow", "Sheep", etc. */
  type: string;
  /** Last fed timestamp (ms). */
  fedAt?: number;
  /** When the animal becomes hungry / ready to milk again (ms). */
  readyAt?: number;
  /** Free-form state string from the game. */
  state?: string;
}

/** A renewable resource node (tree, stone, iron, gold, etc.). */
export interface ResourceNode {
  id: string;
  /** "Tree" | "Stone" | "Iron" | "Gold" | "Crimstone" | "Sunstone" | "Oil" | "FruitPatch" */
  type: string;
  /** Last harvested/chopped/mined timestamp (ms). */
  lastHarvestedAt?: number;
  /** When it becomes ready again (ms). */
  readyAt?: number;
}

export interface DailyReward {
  streaks: number;
  lastCollectedAt: number;
  /** Whether today's chest is already collected. */
  collectedToday: boolean;
  /** When the next chest becomes available (ms). */
  nextAvailableAt: number;
}

export interface Chore {
  id: string;
  description?: string;
  completed: boolean;
  expiresAt?: number;
}

export interface ActiveBuff {
  name: string;
  startedAt: number;
  /** When the buff expires (ms). null = no known cooldown. */
  expiresAt: number | null;
  /** True if buff is still active (now < expiresAt). */
  active: boolean;
}

export interface FarmState {
  farmId: string;
  fetchedAt: number; // ms
  balances: BalanceMap; // resources & items
  coins: number; // in-game soft currency (was "coins")
  flower: number; // $FLOWER token balance (on-chain)
  sfl: number; // legacy SFL balance (kept for backwards compat)
  crops: CropPlot[];
  animals: Animal[];
  resources: ResourceNode[];
  dailyReward?: DailyReward;
  chores: Chore[];
  buffs: ActiveBuff[];
  /** Anything else we don't model strongly yet, kept for forwards-compat. */
  raw?: unknown;
}

export type RuleKind =
  | "harvest_ready"
  | "animal_ready"
  | "resource_ready"
  | "daily_reward"
  | "buff_expired"
  | "balance_threshold"
  | "price_target"
  | "custom";

export interface NotificationRule {
  id: number;
  kind: RuleKind;
  /** Resource or item name the rule targets (e.g. "Sunflower" or "Wood"). */
  target?: string;
  /** Optional comparator value (e.g. price target or balance threshold). */
  threshold?: number;
  /** Whether this rule is currently active. */
  enabled: 1 | 0;
  createdAt: number;
}

export interface NotificationLog {
  id: number;
  ruleId: number | null;
  kind: string;
  message: string;
  sentAt: number;
  success: 1 | 0;
  error?: string | null;
}
