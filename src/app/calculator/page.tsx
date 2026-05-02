"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCalculator, IconWarning } from "@/components/icons";

type RecipeCategory = "Buildings" | "Tools" | "Food" | "Decorations" | "Other";

interface RecipeEntry {
  key: string;
  name: string;
  category: RecipeCategory;
}

interface IngredientPlan {
  resource: string;
  required: number;
  have: number;
  missing: number;
  buyCost?: number;
  recommendation: string;
}

interface CalcResult {
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

const CATEGORY_ORDER: RecipeCategory[] = [
  "Buildings",
  "Tools",
  "Food",
  "Decorations",
  "Other",
];

const CATEGORY_EMOJI: Record<RecipeCategory, string> = {
  Buildings: "🏠",
  Tools: "🛠️",
  Food: "🍞",
  Decorations: "🎨",
  Other: "📦",
};

export default function CalculatorPage() {
  const [groups, setGroups] = useState<Record<RecipeCategory, RecipeEntry[]>>({
    Buildings: [],
    Tools: [],
    Food: [],
    Decorations: [],
    Other: [],
  });
  const [activeCategory, setActiveCategory] = useState<RecipeCategory>("Buildings");
  const [recipe, setRecipe] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [pricesText, setPricesText] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [priceMeta, setPriceMeta] = useState<{
    autoPriceCount: number;
    overrideCount: number;
    fetchedAt?: number;
    flowerToUsd?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calculator")
      .then((r) => r.json())
      .then((j: { recipesByCategory: Record<RecipeCategory, RecipeEntry[]> }) => {
        setGroups(j.recipesByCategory);
        const firstCat =
          (Object.keys(j.recipesByCategory) as RecipeCategory[]).find(
            (c) => j.recipesByCategory[c].length > 0,
          ) ?? "Buildings";
        setActiveCategory(firstCat);
        setRecipe(j.recipesByCategory[firstCat][0]?.key ?? "");
      });
  }, []);

  const activeRecipes = useMemo(() => groups[activeCategory] ?? [], [groups, activeCategory]);

  function selectCategory(c: RecipeCategory) {
    setActiveCategory(c);
    setRecipe(groups[c][0]?.key ?? "");
    setResult(null);
  }

  async function calc() {
    setLoading(true);
    setError(null);
    try {
      let prices: Record<string, number> | undefined;
      const trimmed = pricesText.trim();
      if (trimmed) {
        try {
          prices = JSON.parse(trimmed);
        } catch {
          throw new Error('Prices must be valid JSON, e.g. { "Wood": 0.05 }');
        }
      }
      const res = await fetch("/api/calculator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe, quantity, prices }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.toString() ?? "Calculation failed");
      setResult(json.result);
      setPriceMeta(json.priceMeta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <IconCalculator className="size-3.5" /> Crafting calculator
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
          Hitung kebutuhan resep
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Pilih kategori dan recipe, lalu lihat berapa banyak yang masih kurang berdasarkan saldo
          farm Master. Harga P2P di-fetch otomatis dari <code>sfl.world</code>.
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_ORDER.map((c) => {
          const count = groups[c].length;
          const active = activeCategory === c;
          return (
            <button
              key={c}
              onClick={() => selectCategory(c)}
              disabled={count === 0}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                active
                  ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 font-medium"
                  : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
              } ${count === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <span className="mr-1.5">{CATEGORY_EMOJI[c]}</span>
              {c}
              <span className="ml-1.5 text-xs text-zinc-500">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Recipe</span>
            <select
              value={recipe}
              onChange={(e) => setRecipe(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {activeRecipes.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Quantity</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={calc}
              disabled={loading || !recipe}
              className="w-full px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 text-sm font-medium"
            >
              {loading ? "Calculating…" : "Calculate"}
            </button>
          </div>
        </div>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Price overrides ($FLOWER per unit) — opsional JSON
          </span>
          <textarea
            value={pricesText}
            onChange={(e) => setPricesText(e.target.value)}
            rows={2}
            placeholder='Kosongkan untuk pakai harga live. Contoh override: { "Wood": 0.05 }'
            className="mt-1 w-full font-mono text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2"
          />
        </label>
        {priceMeta && (
          <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              {priceMeta.autoPriceCount} harga live dari sfl.world
            </span>
            {priceMeta.overrideCount > 0 && (
              <span>· {priceMeta.overrideCount} override manual</span>
            )}
            {priceMeta.fetchedAt && (
              <span>· diperbarui {formatAge(priceMeta.fetchedAt)}</span>
            )}
            {priceMeta.flowerToUsd && (
              <span>· 1 $FLOWER ≈ ${priceMeta.flowerToUsd.toFixed(4)}</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-800 dark:text-red-200 flex items-start gap-2">
          <IconWarning className="shrink-0 mt-0.5 text-red-500 size-4" />
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide">
                {CATEGORY_EMOJI[result.category]} {result.category}
              </div>
              <h2 className="text-xl font-semibold mt-0.5">
                {result.quantity}× {result.recipeName}
              </h2>
              {result.note && (
                <p className="text-xs text-zinc-500 mt-1 italic">{result.note}</p>
              )}
            </div>
            <span
              className={`text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 ${
                result.craftableNow
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}
            >
              {result.craftableNow ? "✅ Ready to craft" : "⚠ Missing resources"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="text-left py-2">Resource</th>
                  <th className="text-right py-2">Required</th>
                  <th className="text-right py-2">Have</th>
                  <th className="text-right py-2">Missing</th>
                  <th className="text-right py-2">Buy cost</th>
                  <th className="text-right py-2">Plan</th>
                </tr>
              </thead>
              <tbody>
                {result.ingredients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-2 text-center text-zinc-500 italic">
                      No ingredient resources required
                    </td>
                  </tr>
                )}
                {result.ingredients.map((i) => (
                  <tr key={i.resource} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 font-medium">{i.resource}</td>
                    <td className="py-1.5 text-right font-mono">{fmt(i.required)}</td>
                    <td className="py-1.5 text-right font-mono">{fmt(i.have)}</td>
                    <td className="py-1.5 text-right font-mono">
                      {i.missing > 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">{fmt(i.missing)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {i.buyCost !== undefined ? i.buyCost.toFixed(2) : "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      <Badge rec={i.recommendation} />
                    </td>
                  </tr>
                ))}
                {result.coinsRequired > 0 && (
                  <tr className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="py-1.5 font-medium">Coins</td>
                    <td className="py-1.5 text-right font-mono">{fmt(result.coinsRequired)}</td>
                    <td className="py-1.5 text-right font-mono">{fmt(result.coinsHave)}</td>
                    <td className="py-1.5 text-right font-mono">
                      {result.coinsMissing > 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          {fmt(result.coinsMissing)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )}
                {result.flowerRequired > 0 && (
                  <tr className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="py-1.5 font-medium">$FLOWER</td>
                    <td className="py-1.5 text-right font-mono">{fmt(result.flowerRequired)}</td>
                    <td className="py-1.5 text-right font-mono">
                      {fmt(Math.floor(result.flowerHave * 100) / 100)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {result.flowerMissing > 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          {fmt(result.flowerMissing)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {result.totalBuyCost !== null && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Estimated total buy cost (missing items at marketplace):{" "}
              <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                {result.totalBuyCost.toFixed(2)} $FLOWER
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ rec }: { rec: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    have_enough: { label: "OK", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    grow: { label: "Grow", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    buy: { label: "Buy", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
    missing_price: { label: "No price", cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
  };
  const c = cfg[rec] ?? cfg.missing_price;
  return (
    <span className={`inline-block text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${c.cls}`}>
      {c.label}
    </span>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

function formatAge(ts: number): string {
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return "baru saja";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h lalu`;
}
