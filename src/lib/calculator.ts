/**
 * Resource / crafting calculator.
 *
 * Recipes are loaded from `src/data/recipes.json`, which is auto-generated
 * from the open-source Sunflower Land repo via `scripts/import-recipes.mjs`.
 * Run that script periodically to refresh after game updates.
 */

import type { BalanceMap } from "./types";
import rawRecipes from "@/data/recipes.json";

export type RecipeCategory =
  | "Buildings"
  | "Tools"
  | "Food"
  | "Decorations"
  | "Other";

interface ImportedRecipe {
  key: string;
  name: string;
  category: RecipeCategory;
  ingredients: Record<string, number>;
  coins?: number;
  flower?: number;
  cookingSeconds?: number;
  constructionSeconds?: number;
  building?: string;
}

export interface Recipe {
  name: string;
  category: RecipeCategory;
  ingredients: BalanceMap;
  flower?: number;
  coins?: number;
  note?: string;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(s % 3600 ? 1 : 0)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function buildNote(r: ImportedRecipe): string | undefined {
  if (r.cookingSeconds && r.building) {
    return `${r.building} · ~${formatSeconds(r.cookingSeconds)}`;
  }
  if (r.cookingSeconds) {
    return `~${formatSeconds(r.cookingSeconds)}`;
  }
  if (r.constructionSeconds && r.constructionSeconds > 0) {
    return `Build time: ${formatSeconds(r.constructionSeconds)}`;
  }
  return undefined;
}

function buildDefaultRecipes(): Record<string, Recipe> {
  const out: Record<string, Recipe> = {};
  for (const r of rawRecipes as ImportedRecipe[]) {
    out[r.key] = {
      name: r.name,
      category: r.category,
      ingredients: { ...r.ingredients },
      coins: r.coins,
      flower: r.flower,
      note: buildNote(r),
    };
  }
  return out;
}

export const DEFAULT_RECIPES: Record<string, Recipe> = buildDefaultRecipes();

export interface CalcInput {
  recipe: string | Recipe;
  quantity: number;
  balances: BalanceMap;
  flower: number;
  coins?: number;
  prices?: Record<string, number>;
  recipes?: Record<string, Recipe>;
}

export interface IngredientPlan {
  resource: string;
  required: number;
  have: number;
  missing: number;
  buyCost?: number;
  recommendation: "have_enough" | "grow" | "buy" | "missing_price";
}

export interface CalcResult {
  recipeName: string;
  category: RecipeCategory;
  quantity: number;
  ingredients: IngredientPlan[];
  flowerRequired: number;
  flowerHave: number;
  flowerMissing: number;
  coinsRequired: number;
  coinsHave: number;
  coinsMissing: number;
  totalBuyCost: number | null;
  craftableNow: boolean;
  note?: string;
}

const BUY_THRESHOLD_RATIO = 0.5;

export function calculate(input: CalcInput): CalcResult {
  const recipes = { ...DEFAULT_RECIPES, ...(input.recipes ?? {}) };
  const recipe = typeof input.recipe === "string" ? recipes[input.recipe] : input.recipe;
  if (!recipe) {
    throw new Error(`Unknown recipe: ${String(input.recipe)}`);
  }

  const qty = Math.max(1, Math.floor(input.quantity));
  const ingredients: IngredientPlan[] = [];
  let totalBuyCost = 0;
  let allBuyable = true;

  for (const [resource, perUnit] of Object.entries(recipe.ingredients)) {
    const required = perUnit * qty;
    const have = input.balances[resource] ?? 0;
    const missing = Math.max(0, required - have);
    const price = input.prices?.[resource];
    let buyCost: number | undefined;
    let recommendation: IngredientPlan["recommendation"] = "have_enough";

    if (missing === 0) {
      recommendation = "have_enough";
    } else if (price !== undefined) {
      buyCost = price * missing;
      totalBuyCost += buyCost;
      recommendation = price < BUY_THRESHOLD_RATIO ? "buy" : "grow";
    } else {
      allBuyable = false;
      recommendation = "missing_price";
    }

    ingredients.push({ resource, required, have, missing, buyCost, recommendation });
  }

  const flowerRequired = (recipe.flower ?? 0) * qty;
  const flowerHave = input.flower;
  const flowerMissing = Math.max(0, flowerRequired - flowerHave);

  const coinsRequired = (recipe.coins ?? 0) * qty;
  const coinsHave = input.coins ?? 0;
  const coinsMissing = Math.max(0, coinsRequired - coinsHave);

  const craftableNow =
    ingredients.every((i) => i.missing === 0) &&
    flowerMissing === 0 &&
    coinsMissing === 0;

  return {
    recipeName: recipe.name,
    category: recipe.category,
    quantity: qty,
    ingredients,
    flowerRequired,
    flowerHave,
    flowerMissing,
    coinsRequired,
    coinsHave,
    coinsMissing,
    totalBuyCost: allBuyable ? totalBuyCost : null,
    craftableNow,
    note: recipe.note,
  };
}

export interface RecipeListEntry {
  key: string;
  name: string;
  category: RecipeCategory;
}

export function listRecipes(extra: Record<string, Recipe> = {}): RecipeListEntry[] {
  const all = { ...DEFAULT_RECIPES, ...extra };
  return Object.entries(all).map(([key, r]) => ({
    key,
    name: r.name,
    category: r.category,
  }));
}

export function listRecipesByCategory(
  extra: Record<string, Recipe> = {},
): Record<RecipeCategory, RecipeListEntry[]> {
  const grouped: Record<RecipeCategory, RecipeListEntry[]> = {
    Buildings: [],
    Tools: [],
    Food: [],
    Decorations: [],
    Other: [],
  };
  for (const r of listRecipes(extra)) {
    grouped[r.category].push(r);
  }
  for (const k of Object.keys(grouped) as RecipeCategory[]) {
    grouped[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}
