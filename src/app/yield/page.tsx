"use client";

import { useEffect, useMemo, useState } from "react";
import { IconTrendingUp, IconWarning } from "@/components/icons";
import { Sparkline } from "@/components/sparkline";
import { InventoryPanel } from "@/components/InventoryPanel";
import buffsJson from "@/data/buffs.json";

type Category = "Crop" | "Greenhouse Crop" | "Fruit" | "Greenhouse Fruit";

interface YieldRow {
  name: string;
  category: Category;
  plantSeconds: number;
  sellPriceCoins: number;
  seedPriceCoins: number;
  bumpkinLevel: number;
  plantingSpot: string;
  isBush: boolean;
  yieldPerPlant: number;
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

/** Collectibles that occupy the same slot — only the strongest applies. The
 *  analyzer enforces this server-side; UI uses it to warn Master when they
 *  pick two items from the same chain in the simulator. */
const BUFF_CHAINS: string[][] = [
  ["Basic Scarecrow", "Nancy", "Scarecrow", "Kuebiko"],
];

/** Which buff belongs to which chain (reverse lookup). */
const BUFF_TO_CHAIN = new Map<string, number>();
BUFF_CHAINS.forEach((chain, idx) => chain.forEach((n) => BUFF_TO_CHAIN.set(n, idx)));

type SortKey =
  | "flowerPerHour"
  | "dailyFlower"
  | "netFlowerPerHour"
  | "p2pPrice"
  | "plantSeconds"
  | "bumpkinLevel"
  | "pctChange24h";

const SORT_LABELS: Record<SortKey, string> = {
  flowerPerHour: "FLOWER / jam",
  netFlowerPerHour: "Net / jam (dikurangi benih)",
  dailyFlower: "FLOWER / 24 jam",
  p2pPrice: "Harga P2P",
  pctChange24h: "Perubahan 24 jam",
  plantSeconds: "Growth cepat",
  bumpkinLevel: "Bumpkin level",
};

const CATEGORIES: (Category | "All")[] = [
  "All",
  "Crop",
  "Greenhouse Crop",
  "Fruit",
  "Greenhouse Fruit",
];

const CAT_EMOJI: Record<Category, string> = {
  Crop: "🌾",
  "Greenhouse Crop": "🏡",
  Fruit: "🍎",
  "Greenhouse Fruit": "🍇",
};

export default function YieldPage() {
  const [rows, setRows] = useState<YieldRow[]>([]);
  const [meta, setMeta] = useState<{
    fetchedAt: number;
    flowerToUsd?: number;
    unpriced: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | "All">("All");
  const [sort, setSort] = useState<SortKey>("flowerPerHour");
  const [hideUnpriced, setHideUnpriced] = useState(true);
  const [maxLevel, setMaxLevel] = useState<number | null>(null);
  const [manualBuffs, setManualBuffs] = useState<string[]>([]);
  const [detectedBuffs, setDetectedBuffs] = useState<string[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const qs = manualBuffs.length > 0 ? `?buffs=${manualBuffs.join(",")}` : "";
        // Fetch yields + farm in parallel; missing farm shouldn't block yields.
        const [yieldRes, farmRes] = await Promise.all([
          fetch(`/api/yield${qs}`),
          fetch("/api/farm").catch(() => null),
        ]);
        const yieldJson = await yieldRes.json();
        if (!yieldRes.ok) throw new Error(yieldJson.error ?? "Failed to load yields");
        if (cancelled) return;
        setRows(yieldJson.rows ?? []);
        setDetectedBuffs(yieldJson.detectedBuffs ?? []);
        setMeta({
          fetchedAt: yieldJson.fetchedAt,
          flowerToUsd: yieldJson.flowerToUsd,
          unpriced: yieldJson.unpriced ?? [],
        });
        if (farmRes && farmRes.ok) {
          const farmJson = await farmRes.json();
          if (!cancelled && farmJson?.balances) setBalances(farmJson.balances);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [manualBuffs]);

  /**
   * Resolves the seed/plant name for a produce. Most produce share the
   * pattern '<name> Seed' (Sunflower -> Sunflower Seed) but bushes use
   * '<name> Plant' (Banana -> Banana Plant).
   */
  const seedName = (produce: YieldRow) =>
    produce.isBush && produce.name === "Banana"
      ? "Banana Plant"
      : `${produce.name} Seed`;

  /** Detect chain conflicts so we can warn Master in the picker. */
  const chainConflicts = useMemo(() => {
    const perChain = new Map<number, string[]>();
    for (const b of manualBuffs) {
      const idx = BUFF_TO_CHAIN.get(b);
      if (idx === undefined) continue;
      if (!perChain.has(idx)) perChain.set(idx, []);
      perChain.get(idx)!.push(b);
    }
    return Array.from(perChain.values()).filter((list) => list.length > 1);
  }, [manualBuffs]);

  const toggleBuff = (name: string) => {
    setManualBuffs((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (category !== "All") r = r.filter((x) => x.category === category);
    if (hideUnpriced) r = r.filter((x) => x.hasP2P);
    if (maxLevel !== null) r = r.filter((x) => x.bumpkinLevel <= maxLevel);
    return [...r].sort((a, b) => {
      if (sort === "plantSeconds" || sort === "bumpkinLevel") {
        return a[sort] - b[sort];
      }
      if (sort === "pctChange24h") {
        const av = a.pctChange24h ?? -Infinity;
        const bv = b.pctChange24h ?? -Infinity;
        return bv - av;
      }
      return b[sort] - a[sort];
    });
  }, [rows, category, sort, hideUnpriced, maxLevel]);

  const top3 = useMemo(() => filtered.slice(0, 3), [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <IconTrendingUp className="size-3.5" /> Top yield picks
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
          Pilihan terbaik untuk dulang $FLOWER, Master
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Ranking produce berdasarkan <span className="text-zinc-300">FLOWER per jam per plot</span>
          {" "}— memperhitungkan harga P2P live × waktu tumbuh. Bukan sekadar harga tertinggi.
        </p>
      </div>

      {/* Buff awareness */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 mb-1.5">
            Buff aktif (terdeteksi dari farm)
          </div>
          {detectedBuffs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detectedBuffs.map((b) => (
                <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  {b}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500 italic">
              Belum ada buff terdeteksi (set SFL_API_KEY + SFL_FARM_ID di Railway env).
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 mb-1.5">
            Simulasi buff (klik untuk pakai)
          </div>
          <div className="flex flex-wrap gap-1">
            {[...Object.keys(buffsJson.cropBoosts), ...Object.keys(buffsJson.fruitBoosts)].map((b) => {
              const active = manualBuffs.includes(b);
              const chainIdx = BUFF_TO_CHAIN.get(b);
              const conflicted = active && chainIdx !== undefined && chainConflicts.some((list) => list.includes(b));
              return (
                <button
                  key={b}
                  onClick={() => toggleBuff(b)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                    active
                      ? conflicted
                        ? "bg-rose-500/20 border-rose-400 text-rose-200"
                        : "bg-amber-500/30 border-amber-400 text-amber-100"
                      : "border-zinc-700 text-zinc-500 hover:border-amber-500/50 hover:text-amber-300"
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
          {chainConflicts.length > 0 && (
            <div className="mt-2 text-[10px] text-rose-300 flex items-center gap-1">
              <IconWarning className="size-3" />
              Chain conflict: hanya tier terkuat yang dihitung ({chainConflicts.flat().join(" + ")}).
            </div>
          )}
        </div>
      </div>

      {/* Top 3 hero cards */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {top3.map((r, i) => (
            <div
              key={r.name}
              className={`rounded-2xl border p-4 relative overflow-hidden ${
                i === 0
                  ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent"
                  : "border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50"
              }`}
            >
              <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wide font-medium text-zinc-500">
                #{i + 1}
              </div>
              <div className="text-xs text-zinc-500">
                {CAT_EMOJI[r.category]} {r.category}
                {r.isBush && " · bush"}
              </div>
              <div className="text-xl font-semibold mt-1">{r.name}</div>
              <div className="flex items-end justify-between mt-3 gap-2">
                <div className="text-2xl font-mono text-emerald-500 leading-none">
                  {r.flowerPerHour.toFixed(4)}
                  <span className="text-xs text-zinc-500 ml-1">$FLOWER/jam</span>
                </div>
                <div
                  className={`shrink-0 ${
                    r.pctChange24h === null
                      ? "text-zinc-600"
                      : r.pctChange24h >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                  }`}
                >
                  <Sparkline values={r.sparkline} width={64} height={22} />
                  {r.pctChange24h !== null && (
                    <div className="text-[10px] text-right font-mono">
                      {r.pctChange24h >= 0 ? "+" : ""}
                      {r.pctChange24h.toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 space-y-0.5">
                <div>
                  {formatDuration(r.plantSeconds)} growth · {r.p2pPrice.toFixed(5)} $FLOWER/unit
                </div>
                <div>
                  Level ≥ {r.bumpkinLevel} · {r.dailyFlower.toFixed(3)} per 24h
                </div>
                {meta?.flowerToUsd && (
                  <div className="text-emerald-400/80">
                    ≈ ${(r.dailyFlower * meta.flowerToUsd).toFixed(3)} / hari / plot
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              category === c
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 border-transparent"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {c === "All" ? "Semua" : `${CAT_EMOJI[c]} ${c}`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={hideUnpriced}
              onChange={(e) => setHideUnpriced(e.target.checked)}
            />
            Sembunyikan item tanpa harga P2P
          </label>
          <label className="flex items-center gap-1.5">
            Sort:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300/50 bg-red-950/30 border-red-900/50 p-3 text-sm text-red-200 flex items-start gap-2">
          <IconWarning className="shrink-0 mt-0.5 text-red-500 size-4" />
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-zinc-500">Menghitung peluang yield…</div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800/80">
              <tr>
                <th className="text-left px-3 py-2.5">Item</th>
                <th className="text-right px-3 py-2.5">Growth</th>
                <th className="text-right px-3 py-2.5">Lvl</th>
                <th className="text-right px-3 py-2.5">Harga P2P</th>
                <th className="text-center px-3 py-2.5">Trend 24h</th>
                <th className="text-right px-3 py-2.5">$FLOWER/jam</th>
                <th className="text-right px-3 py-2.5">Buff Δ</th>
                <th className="text-right px-3 py-2.5">Stok</th>
                <th className="text-right px-3 py-2.5">/ 24h</th>
                <th className="text-right px-3 py-2.5">Net/jam</th>
                <th className="text-right px-3 py-2.5">Payback benih</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.name}
                  className="border-b border-zinc-200/60 dark:border-zinc-800/40 last:border-none hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {CAT_EMOJI[r.category]} {r.name}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {r.plantingSpot}
                      {r.isBush && " · bush"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {formatDuration(r.plantSeconds)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">{r.bumpkinLevel}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.hasP2P ? r.p2pPrice.toFixed(5) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div
                      className={`inline-flex flex-col items-center gap-0.5 ${
                        r.pctChange24h === null
                          ? "text-zinc-600"
                          : r.pctChange24h >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                      }`}
                    >
                      <Sparkline values={r.sparkline} width={60} height={16} />
                      <span className="text-[10px] font-mono">
                        {r.pctChange24h !== null
                          ? `${r.pctChange24h >= 0 ? "+" : ""}${r.pctChange24h.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-500">
                    {r.hasP2P ? r.flowerPerHour.toFixed(4) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] font-mono">
                    {(() => {
                      const base =
                        r.hasP2P && r.plantSeconds > 0
                          ? (r.p2pPrice * r.yieldPerPlant) / (r.plantSeconds / 3600)
                          : 0;
                      if (!base) return <span className="text-zinc-600">—</span>;
                      const delta = ((r.flowerPerHour - base) / base) * 100;
                      if (Math.abs(delta) < 0.05) return <span className="text-zinc-600">0%</span>;
                      const cls = delta > 0 ? "text-emerald-400" : "text-rose-400";
                      return (
                        <span className={cls} title={`base ${base.toFixed(4)} → ${r.flowerPerHour.toFixed(4)}`}>
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}%
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[10px]">
                    {(() => {
                      const seeds = balances[seedName(r)] ?? 0;
                      const harvest = balances[r.name] ?? 0;
                      if (!seeds && !harvest)
                        return <span className="text-zinc-600">—</span>;
                      return (
                        <span
                          className="inline-flex flex-col items-end gap-0"
                          title={`${seeds} ${seedName(r)} · ${harvest} ${r.name} ready to sell`}
                        >
                          {seeds > 0 && (
                            <span className="text-emerald-400/80">🌱 {seeds}</span>
                          )}
                          {harvest > 0 && (
                            <span className="text-amber-300/80">{CAT_EMOJI[r.category]} {harvest}</span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-zinc-400">
                    {r.hasP2P ? r.dailyFlower.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-zinc-400">
                    {r.hasP2P ? r.netFlowerPerHour.toFixed(4) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-zinc-400">
                    {r.paybackHours !== null && r.paybackHours < 1000
                      ? formatDuration(r.paybackHours * 3600)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-3">
          <span>
            <span className="inline-block size-1.5 rounded-full bg-emerald-500 mr-1.5" />
            harga live sfl.world · updated {formatAge(meta.fetchedAt)}
          </span>
          {meta.flowerToUsd && (
            <span>· 1 $FLOWER ≈ ${meta.flowerToUsd.toFixed(4)} USD</span>
          )}
          {meta.unpriced.length > 0 && (
            <span>· {meta.unpriced.length} item tidak ada harga P2P</span>
          )}
        </div>
      )}

      {/* Full inventory (searchable, categorized) — same component used on the
          dashboard. Renders only when farm balances are available. */}
      {Object.keys(balances).length > 0 && <InventoryPanel balances={balances} />}

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/80">
        <div className="font-medium text-amber-300 mb-1">Catatan perhitungan</div>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>Metrik utama: FLOWER / jam / plot = harga P2P × yield / waktu tumbuh.</li>
          <li>
            Fruit bush (Tomato, Blueberry, Banana) memberi beberapa harvest per tanam — metrik ini
            konservatif (hanya hitung harvest pertama).
          </li>
          <li>
            Net/jam mengasumsikan 1 $FLOWER ≈ 1000 coin untuk konversi benih. Untuk crop, biaya
            benih sangat kecil, jadi selisihnya minor.
          </li>
          <li>
            Buff collectible (Scarecrow / Kuebiko / Victoria Sisters / dll.) sudah diperhitungkan
            via auto-detect + picker manual. Chain conflict otomatis di-resolve ke tier terkuat.
          </li>
          <li>
            Belum termasuk bonus <em>wearable</em> + bumpkin <em>skill</em> (akan ditambah di
            iterasi berikutnya).
          </li>
        </ul>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function formatAge(ts: number): string {
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return "baru saja";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h lalu`;
}
