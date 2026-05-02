"use client";

import { useEffect, useMemo, useState } from "react";
import { IconTrendingUp, IconWarning } from "@/components/icons";
import { Sparkline } from "@/components/sparkline";

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
}

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/yield");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load yields");
        if (cancelled) return;
        setRows(json.rows);
        setMeta({
          fetchedAt: json.fetchedAt,
          flowerToUsd: json.flowerToUsd,
          unpriced: json.unpriced,
        });
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
  }, []);

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
            Belum termasuk bonus scarecrow / wearable / skill. Real yield Master bisa lebih tinggi.
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
