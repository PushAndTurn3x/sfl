"use client";

import { useEffect, useState } from "react";

interface Rule {
  id: number;
  kind: string;
  target: string | null;
  threshold: number | null;
  enabled: number;
  createdAt: number;
}

const KIND_LABELS: Record<string, string> = {
  harvest_ready: "Crop ready",
  animal_ready: "Animal ready",
  resource_ready: "Resource node ready",
  daily_reward: "Daily reward",
  buff_expired: "Buff expired",
  balance_threshold: "Balance threshold",
};

export default function SettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form state.
  const [target, setTarget] = useState("Wood");
  const [threshold, setThreshold] = useState<number>(1000);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/rules");
    const json = await res.json();
    setRules(json.rules ?? []);
    setLoading(false);
  }

  async function toggle(id: number, enabled: boolean) {
    await fetch("/api/rules", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    await load();
  }

  async function deleteRule(id: number) {
    await fetch(`/api/rules?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "balance_threshold",
          target,
          threshold,
          enabled: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json.error ?? "Failed"));
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const builtIns = rules.filter((r) => r.kind !== "balance_threshold");
  const customs = rules.filter((r) => r.kind === "balance_threshold");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <h2 className="font-medium">Built-in notification rules</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Toggle which event kinds trigger Telegram notifications.
        </p>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {builtIns.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{KIND_LABELS[r.kind] ?? r.kind}</div>
                  <div className="text-xs text-zinc-500">{r.kind}</div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.enabled === 1}
                    onChange={(e) => toggle(r.id, e.target.checked)}
                  />
                  <span className="text-sm">{r.enabled === 1 ? "Enabled" : "Disabled"}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <h2 className="font-medium">Custom balance-threshold rules</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Get a Telegram alert when a specific resource reaches a target amount. Fires at most once
          per 24h per rule.
        </p>

        <form onSubmit={addRule} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Resource</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Wood"
              className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Threshold (≥)</span>
            <input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !target}
            className="px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add rule"}
          </button>
        </form>

        {formError && <div className="text-sm text-red-600">{formError}</div>}

        {customs.length === 0 ? (
          <p className="text-sm text-zinc-500">No custom rules yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {customs.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div className="text-sm">
                  <span className="font-medium">{r.target}</span>{" "}
                  <span className="text-zinc-500">≥ {r.threshold}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={r.enabled === 1}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                    />
                    <span>{r.enabled === 1 ? "On" : "Off"}</span>
                  </label>
                  <button
                    onClick={() => deleteRule(r.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
        <h2 className="font-medium">Environment</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Credentials and polling interval are configured via environment variables.
        </p>
        <ul className="text-xs font-mono space-y-1 text-zinc-700 dark:text-zinc-300">
          <li>SFL_API_BASE_URL, SFL_API_KEY, SFL_FARM_ID</li>
          <li>TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID</li>
          <li>POLL_INTERVAL_MINUTES, QUIET_HOURS_START, QUIET_HOURS_END</li>
          <li>DATABASE_PATH</li>
        </ul>
      </section>
    </div>
  );
}
