"use client";

import { useEffect, useMemo, useState } from "react";
import type { FarmState } from "@/lib/types";
import { detectEvents, nextEventAt } from "@/lib/farm-analyzer";
import {
  IconClock,
  IconCoin,
  IconCow,
  IconFlower,
  IconGift,
  IconLeaf,
  IconPickaxe,
  IconRefresh,
  IconSparkles,
  IconWarning,
} from "@/components/icons";

interface FarmResponse extends FarmState {
  source?: string;
  error?: string;
}

const RESOURCE_TINTS: Record<string, string> = {
  Tree: "from-emerald-400/15 to-emerald-600/5 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  Stone: "from-zinc-400/15 to-zinc-600/5 text-zinc-700 dark:text-zinc-300 border-zinc-500/20",
  Iron: "from-slate-400/15 to-slate-700/5 text-slate-700 dark:text-slate-300 border-slate-500/20",
  Gold: "from-amber-400/15 to-amber-600/5 text-amber-700 dark:text-amber-300 border-amber-500/20",
  Crimstone: "from-rose-400/15 to-rose-600/5 text-rose-700 dark:text-rose-300 border-rose-500/20",
  Sunstone: "from-yellow-400/15 to-orange-500/5 text-orange-700 dark:text-orange-300 border-orange-500/20",
  Oil: "from-violet-400/15 to-violet-600/5 text-violet-700 dark:text-violet-300 border-violet-500/20",
  FruitPatch: "from-pink-400/15 to-pink-600/5 text-pink-700 dark:text-pink-300 border-pink-500/20",
};

export default function DashboardPage() {
  const [farm, setFarm] = useState<FarmResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  async function load(refresh = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/farm${refresh ? "?refresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load farm");
      setFarm(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const events = useMemo(() => (farm ? detectEvents(farm, now) : []), [farm, now]);
  const upcoming = useMemo(() => (farm ? nextEventAt(farm, now) : null), [farm, now]);

  const resourceGroups = useMemo(() => {
    if (!farm) return [];
    const map = new Map<string, { type: string; ready: number; total: number; nextAt: number | null }>();
    for (const r of farm.resources) {
      const g = map.get(r.type) ?? { type: r.type, ready: 0, total: 0, nextAt: null };
      g.total += 1;
      if (r.readyAt && r.readyAt <= now) g.ready += 1;
      if (r.readyAt && r.readyAt > now && (g.nextAt === null || r.readyAt < g.nextAt)) {
        g.nextAt = r.readyAt;
      }
      map.set(r.type, g);
    }
    return Array.from(map.values()).sort((a, b) => a.type.localeCompare(b.type));
  }, [farm, now]);

  const cropGroups = useMemo(() => {
    if (!farm) return [];
    const map = new Map<string, { name: string; ready: number; growing: number; nextAt: number | null }>();
    for (const p of farm.crops) {
      if (!p.crop) continue;
      const g = map.get(p.crop) ?? { name: p.crop, ready: 0, growing: 0, nextAt: null };
      if (p.readyAt && p.readyAt <= now) g.ready += 1;
      else {
        g.growing += 1;
        if (p.readyAt && (g.nextAt === null || p.readyAt < g.nextAt)) g.nextAt = p.readyAt;
      }
      map.set(p.crop, g);
    }
    return Array.from(map.values()).sort((a, b) => b.ready - a.ready || a.name.localeCompare(b.name));
  }, [farm, now]);

  return (
    <div className="space-y-6">
      <Header
        farm={farm}
        loading={loading}
        onRefresh={() => load(true)}
        events={events.length}
      />

      {error && (
        <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-4 text-sm text-red-800 dark:text-red-200 flex items-start gap-3">
          <IconWarning className="shrink-0 mt-0.5 text-red-500" />
          <div>
            <div className="font-semibold">Could not reach Sunflower Land API</div>
            <div className="opacity-80">{error}</div>
          </div>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<IconCoin />}
          label="Coins"
          value={fmt(farm?.coins)}
          accent="amber"
        />
        <StatCard
          icon={<IconFlower />}
          label="$FLOWER"
          value={fmt(farm?.flower || farm?.sfl)}
          accent="rose"
        />
        <StatCard
          icon={<IconLeaf />}
          label="Crops"
          value={String(farm?.crops.length ?? 0)}
          subtitle={
            farm
              ? `${farm.crops.filter((p) => p.readyAt && p.readyAt <= now).length} ready`
              : undefined
          }
          accent="emerald"
        />
        <StatCard
          icon={<IconClock />}
          label="Next event"
          value={upcoming ? formatDuration(upcoming - now) : "—"}
          subtitle={upcoming ? new Date(upcoming).toLocaleTimeString() : undefined}
          accent="indigo"
        />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ready Now (spans 2 cols) */}
        <Card title="Ready now" subtitle={`${events.length} event${events.length === 1 ? "" : "s"}`} className="lg:col-span-2">
          {events.length === 0 ? (
            <EmptyState
              icon={<IconLeaf className="text-emerald-500" />}
              text="Nothing ready right now. Sit tight 🌱"
            />
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li
                  key={e.key}
                  className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-200/60 dark:border-amber-800/40 px-4 py-3"
                >
                  <div className="size-8 rounded-lg bg-amber-500/15 grid place-items-center text-amber-600 dark:text-amber-400 shrink-0">
                    <IconSparkles />
                  </div>
                  <div className="flex-1 text-sm font-medium">{e.message}</div>
                  <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40">
                    {e.kind.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Daily Reward */}
        <Card title="Daily reward" subtitle={farm?.dailyReward ? `🔥 ${farm.dailyReward.streaks}-day streak` : undefined}>
          {!farm?.dailyReward ? (
            <EmptyState text="No data" />
          ) : farm.dailyReward.collectedToday ? (
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-emerald-500/15 grid place-items-center text-emerald-600 dark:text-emerald-400">
                <IconGift />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Collected today</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Next in {formatDuration(farm.dailyReward.nextAvailableAt - now)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-gradient-to-br from-emerald-500/15 to-amber-300/10 border border-emerald-500/30 p-4 flex items-center gap-3">
              <div className="size-12 rounded-xl bg-emerald-500/20 grid place-items-center text-emerald-700 dark:text-emerald-300">
                <IconGift />
              </div>
              <div>
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Available now!
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Open in-game to claim
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Crops + Animals + Buffs row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Crops" subtitle={`${farm?.crops.length ?? 0} plots`}>
          {cropGroups.length === 0 ? (
            <EmptyState text="No crops" />
          ) : (
            <ul className="space-y-2">
              {cropGroups.map((g) => (
                <li key={g.name} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-zinc-500">
                      {g.ready > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {g.ready} ready
                        </span>
                      )}
                      {g.ready > 0 && g.growing > 0 && " · "}
                      {g.growing > 0 && <span>{g.growing} growing</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
                    {g.ready > 0 && (
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${(g.ready / (g.ready + g.growing)) * 100}%` }}
                      />
                    )}
                    {g.growing > 0 && (
                      <div
                        className="bg-amber-400/70"
                        style={{ width: `${(g.growing / (g.ready + g.growing)) * 100}%` }}
                      />
                    )}
                  </div>
                  {g.nextAt && g.growing > 0 && (
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      next ready in {formatDuration(g.nextAt - now)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Animals" subtitle={`${farm?.animals.length ?? 0} total`}>
          {!farm || farm.animals.length === 0 ? (
            <EmptyState icon={<IconCow />} text="No animals" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {Object.entries(
                farm.animals.reduce<Record<string, number>>((acc, a) => {
                  acc[a.type] = (acc[a.type] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([type, count]) => (
                <li key={type} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{type === "Chicken" ? "🐔" : type === "Cow" ? "🐄" : type === "Sheep" ? "🐑" : "🐾"}</span>
                    <span>{type}</span>
                  </div>
                  <span className="text-zinc-500 font-mono text-xs">×{count}</span>
                </li>
              ))}
              {farm.animals.some((a) => a.readyAt && a.readyAt <= now) && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  ✅ Some animals ready to feed
                </div>
              )}
            </ul>
          )}
        </Card>

        <Card title="Active buffs" subtitle={farm ? `${farm.buffs.filter((b) => b.active).length} active` : undefined}>
          {!farm || farm.buffs.length === 0 ? (
            <EmptyState icon={<IconSparkles />} text="No timed buffs" />
          ) : (
            <ul className="space-y-2 text-sm">
              {farm.buffs.map((b) => (
                <li key={b.name + b.startedAt}>
                  <div className="flex justify-between">
                    <span className={`font-medium ${b.active ? "" : "text-zinc-400 line-through"}`}>
                      {b.active ? "✨" : "⏳"} {b.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {b.expiresAt && b.active ? formatDuration(b.expiresAt - now) : "expired"}
                    </span>
                  </div>
                  {b.expiresAt && b.active && (
                    <div className="mt-1 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, ((b.expiresAt - now) / (b.expiresAt - b.startedAt)) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Resource nodes */}
      {resourceGroups.length > 0 && (
        <Card
          title="Resource nodes"
          subtitle={`${resourceGroups.reduce((s, g) => s + g.total, 0)} total · ${resourceGroups.reduce((s, g) => s + g.ready, 0)} ready`}
          icon={<IconPickaxe />}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {resourceGroups.map((g) => {
              const tint = RESOURCE_TINTS[g.type] ?? "from-zinc-400/15 to-zinc-600/5 text-zinc-700 dark:text-zinc-300 border-zinc-500/20";
              return (
                <div
                  key={g.type}
                  className={`rounded-xl border bg-gradient-to-br ${tint} px-3 py-2.5`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{g.type}</span>
                    <span className="text-xs opacity-70 font-mono">{g.total}</span>
                  </div>
                  <div className="text-xs opacity-80 mt-1">
                    {g.ready > 0
                      ? `✅ ${g.ready} ready`
                      : g.nextAt
                        ? `next in ${formatDuration(g.nextAt - now)}`
                        : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Top balances */}
      <Card title="Top balances" subtitle={farm ? `${Object.keys(farm.balances).length} items` : undefined}>
        {!farm ? null : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
            {Object.entries(farm.balances)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 24)
              .map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 bg-zinc-50/50 dark:bg-zinc-900/40"
                >
                  <span className="truncate text-xs" title={k}>
                    {k}
                  </span>
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    {fmt(v)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Card>

      {farm?.fetchedAt && (
        <div className="text-xs text-zinc-500 text-center pt-2">
          Last update: {new Date(farm.fetchedAt).toLocaleString()}
          {farm.source ? ` · source: ${farm.source}` : ""}
        </div>
      )}
    </div>
  );
}

// ---------- presentational helpers ----------

function Header({
  farm,
  loading,
  onRefresh,
  events,
}: {
  farm: FarmResponse | null;
  loading: boolean;
  onRefresh: () => void;
  events: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          Farm <span className="font-mono text-zinc-700 dark:text-zinc-300">{farm?.farmId ?? "—"}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
          Welcome back, farmer 👋
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {events > 0
            ? `${events} thing${events === 1 ? "" : "s"} need your attention`
            : "Everything's growing nicely."}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <IconRefresh className={loading ? "animate-spin" : undefined} />
        {loading ? "Refreshing" : "Refresh"}
      </button>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  accent = "zinc",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  accent?: "amber" | "rose" | "emerald" | "indigo" | "zinc";
}) {
  const accents: Record<string, string> = {
    amber: "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
    rose: "from-rose-500/15 to-rose-500/0 text-rose-600 dark:text-rose-400",
    emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
    indigo: "from-indigo-500/15 to-indigo-500/0 text-indigo-600 dark:text-indigo-400",
    zinc: "from-zinc-500/15 to-zinc-500/0 text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${accents[accent].split(" ").slice(0, 2).join(" ")} pointer-events-none`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-1.5">{value}</div>
          {subtitle && <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>}
        </div>
        <div className={`size-9 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 grid place-items-center ${accents[accent].split(" ").slice(2).join(" ")}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 ${className}`}
    >
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-zinc-400">{icon}</span>}
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        {subtitle && <span className="text-xs text-zinc-500">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center text-sm text-zinc-500">
      {icon && <div className="mb-2 opacity-60">{icon}</div>}
      <div>{text}</div>
    </div>
  );
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(Math.round(n * 100) / 100);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
