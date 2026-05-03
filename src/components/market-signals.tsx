"use client";

import { useEffect, useState } from "react";
import { IconSparkles, IconWarning } from "./icons";

interface Signal {
  item: string;
  price: number;
  ema: number;
  rsi: number;
  signal: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";
  confidence: number;
  samples: number;
}

export function MarketSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/market-signals");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load signals");
      setSignals(json.signals);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // Refresh every minute
    return () => clearInterval(t);
  }, []);

  if (loading && signals.length === 0) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-500 flex items-center gap-2">
        <IconWarning className="size-3" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {signals.map((s) => {
        const insufficient = s.samples < 15;
        return (
          <div
            key={s.item}
            className={`flex items-center justify-between p-3 rounded-xl border ${
              insufficient
                ? "bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/30 dark:border-zinc-800/30 opacity-60"
                : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200/50 dark:border-zinc-800/50"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-sm font-bold w-20 truncate" title={s.item}>
                {s.item}
              </div>
              <div className="text-xs text-zinc-500 font-mono">
                {s.price > 0 ? s.price.toFixed(4) : "—"}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getSignalClass(s.signal)}`}
                title={insufficient ? `Need ${15 - s.samples} more samples` : undefined}
              >
                {insufficient ? "…" : s.signal}
              </div>
              <div className="text-[10px] text-zinc-400 text-right tabular-nums">
                RSI {s.rsi.toFixed(0)} · {s.confidence}% · n={s.samples}
              </div>
            </div>
          </div>
        );
      })}
      {signals.length === 0 && (
        <div className="text-center py-4 text-xs text-zinc-500">
          <IconSparkles className="inline size-3 mr-1" />
          No market data yet. Waiting for first scan…
        </div>
      )}
    </div>
  );
}

function getSignalClass(signal: string) {
  switch (signal) {
    case "STRONG BUY": return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    case "BUY": return "bg-emerald-500/10 text-emerald-600/80 dark:text-emerald-400/80";
    case "STRONG SELL": return "bg-red-500/20 text-red-600 dark:text-red-400";
    case "SELL": return "bg-red-500/10 text-red-600/80 dark:text-red-400/80";
    default: return "bg-zinc-500/10 text-zinc-500";
  }
}
