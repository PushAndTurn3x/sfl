"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_ORDER,
  getCategoryEmoji,
  groupByCategory,
  type ItemCategory,
} from "@/lib/item-category";

interface Props {
  balances: Record<string, number>;
  /** Optional floor prices (in $FLOWER) keyed by item name. Show "—" when missing. */
  prices?: Record<string, number>;
}

const NUMBER_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
function fmt(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return NUMBER_FMT.format(n);
}

export function InventoryPanel({ balances, prices }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<ItemCategory> | null>(null);

  const grouped = useMemo(() => groupByCategory(balances), [balances]);

  // Categories that actually have items, in the canonical display order.
  const categoriesPresent = useMemo(
    () => CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0),
    [grouped],
  );

  const totalItems = Object.keys(balances).length;
  const filteredQuery = query.trim().toLowerCase();

  const visibleByCategory = useMemo(() => {
    const out = new Map<ItemCategory, Array<{ name: string; qty: number }>>();
    for (const cat of categoriesPresent) {
      if (activeCategories && !activeCategories.has(cat)) continue;
      const list = grouped.get(cat) ?? [];
      const filtered = filteredQuery
        ? list.filter((x) => x.name.toLowerCase().includes(filteredQuery))
        : list;
      if (filtered.length > 0) out.set(cat, filtered);
    }
    return out;
  }, [grouped, categoriesPresent, activeCategories, filteredQuery]);

  const visibleCount = useMemo(() => {
    let n = 0;
    for (const list of visibleByCategory.values()) n += list.length;
    return n;
  }, [visibleByCategory]);

  function toggleCategory(c: ItemCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev ?? categoriesPresent);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      // If all are selected, treat as null (no filter) to keep state simple.
      if (next.size === categoriesPresent.length) return null;
      return next;
    });
  }

  function resetFilters() {
    setQuery("");
    setActiveCategories(null);
  }

  const hasActiveFilter = query.length > 0 || activeCategories !== null;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold">Inventory</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {hasActiveFilter ? `${visibleCount} of ${totalItems}` : `${totalItems} items`}
            {prices ? " · prices live" : " · prices unavailable"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 w-40 sm:w-56"
          />
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {categoriesPresent.map((c) => {
          const isActive = activeCategories === null || activeCategories.has(c);
          const count = grouped.get(c)?.length ?? 0;
          return (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                isActive
                  ? "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              <span className="mr-1">{getCategoryEmoji(c)}</span>
              {c}
              <span className="ml-1.5 opacity-60 font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Grouped list */}
      {visibleCount === 0 ? (
        <div className="text-sm text-zinc-500 italic py-8 text-center">
          {query ? `No items match "${query}"` : "No items"}
        </div>
      ) : (
        <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
          {Array.from(visibleByCategory.entries()).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5 sticky top-0 bg-white dark:bg-zinc-950/40 py-1 -mx-1 px-1">
                <span className="mr-1.5">{getCategoryEmoji(cat)}</span>
                {cat}
                <span className="ml-2 text-zinc-300 dark:text-zinc-600 font-normal">
                  {items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {items.map((item) => {
                  const price = prices?.[item.name];
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 hover:bg-zinc-100/60 dark:hover:bg-zinc-900 transition-colors"
                      title={item.name}
                    >
                      <span className="truncate text-xs">{item.name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                          {fmt(item.qty)}
                        </span>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                            price !== undefined
                              ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                          }`}
                          title={price !== undefined ? "Floor price ($FLOWER)" : "Marketplace price unavailable"}
                        >
                          {price !== undefined ? `${fmt(price)} ⚘` : "—"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
