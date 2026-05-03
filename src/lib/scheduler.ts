/**
 * Background scheduler. Polls the SFL API on an interval, detects events,
 * and dispatches Telegram notifications (deduped via SQLite).
 *
 * The scheduler is started once per process from `server.ts` (custom server)
 * so it runs alongside Next.js on Railway without needing an external worker.
 */

import cron from "node-cron";
import { config, isConfigComplete } from "./config";
import { detectEvents, evaluateCustomRules } from "./farm-analyzer";
import { getSFLClient } from "./sfl-client";
import {
  insertPriceSnapshots,
  listRules,
  logNotification,
  markNotifiedOnce,
  prunePriceSnapshots,
  saveSnapshot,
  getPriceHistory,
} from "./db";
import { analyzeMarket, DEFAULT_KEY_ITEMS } from "./market-analyzer";
import { getPrices } from "./prices";
import { sendTelegramMessage, esc } from "./telegram";

const PRICE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // keep 14 days of history

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  // Price snapshots are captured regardless of farm/telegram config, so that
  // the yield page's sparkline still works during first-boot / misconfig.
  const priceExpr = "*/5 * * * *";
  console.log(`[scheduler] Price snapshot cron "${priceExpr}"`);
  void capturePriceSnapshot().catch((e) =>
    console.error("[scheduler] initial price snapshot failed", e),
  );
  cron.schedule(priceExpr, () => {
    void capturePriceSnapshot().catch((e) =>
      console.error("[scheduler] price snapshot failed", e),
    );
  });

  if (!isConfigComplete()) {
    console.warn(
      "[scheduler] Config incomplete; farm polling in DRY-RUN mode. " +
        "Set SFL_API_KEY, SFL_FARM_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID to enable polls.",
    );
    return;
  }

  const minutes = Math.max(1, Number(config.scheduler.pollIntervalMinutes) || 5);
  const expr = `*/${minutes} * * * *`;
  console.log(`[scheduler] Farm poll cron "${expr}" (every ${minutes} min)`);

  // Kick off an immediate run so the dashboard has fresh data on boot.
  void runOnce().catch((e) => console.error("[scheduler] initial run failed", e));

  cron.schedule(expr, () => {
    void runOnce().catch((e) => console.error("[scheduler] run failed", e));
  });
}

let pruneCounter = 0;
async function capturePriceSnapshot(): Promise<void> {
  const snap = await getPrices(true); // force refresh each tick
  const p2p = snap.prices.p2p ?? {};
  if (Object.keys(p2p).length === 0) return;
  insertPriceSnapshots(p2p, snap.fetchedAt);

  // Market Analysis for key items. DEFAULT_KEY_ITEMS contains the liquid
  // resources/produce that are always priced on sfl.world. Master can extend
  // the list via MARKET_SIGNAL_ITEMS env (comma-separated).
  const envItems = (process.env.MARKET_SIGNAL_ITEMS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const keyItems = envItems.length > 0 ? envItems : [...DEFAULT_KEY_ITEMS];

  for (const item of keyItems) {
    if (!p2p[item]) continue;

    // Analyze against last 24h of captured snapshots.
    const history = getPriceHistory(item, Date.now() - 24 * 60 * 60 * 1000);
    const analysis = analyzeMarket(item, history);

    // Only alert on STRONG signals with high confidence. Dedup per day +
    // direction so a flip-flopping RSI within one day doesn't spam us, but
    // a genuine reversal next day still fires.
    const isStrong =
      analysis.signal === "STRONG BUY" || analysis.signal === "STRONG SELL";
    if (!isStrong || analysis.confidence < 70) continue;

    const direction = analysis.signal === "STRONG BUY" ? "buy" : "sell";
    const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const key = `market-alert:${item}:${direction}:${dayBucket}`;
    if (!markNotifiedOnce(key)) continue;

    const emoji = direction === "buy" ? "🟢" : "🔴";
    const text =
      `<b>🚨 MARKET ALERT!</b>\n\n` +
      `Item: <b>${esc(item)}</b>\n` +
      `Signal: <b>${analysis.signal} ${emoji}</b>\n` +
      `Price: <code>${analysis.price.toFixed(5)}</code> FLOWER\n` +
      `RSI: <code>${analysis.rsi.toFixed(1)}</code>  EMA: <code>${analysis.ema.toFixed(5)}</code>\n\n` +
      `<i>Confidence ${analysis.confidence}% · ${analysis.samples} samples</i>`;
    await sendTelegramMessage(text);
  }

  // Prune old rows every ~12 ticks (~1h) so we don't do it on every poll.
  if (++pruneCounter % 12 === 0) {
    const removed = prunePriceSnapshots(PRICE_RETENTION_MS);
    if (removed > 0) console.log(`[scheduler] pruned ${removed} old price rows`);
  }
}

function inQuietHours(now: Date = new Date()): boolean {
  const start = config.scheduler.quietHoursStart;
  const end = config.scheduler.quietHoursEnd;
  if (!start || !end) return false;
  const [sh] = start.split(":").map(Number);
  const [eh] = end.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return false;
  const h = now.getHours();
  // Range that wraps midnight (e.g. 22 -> 6).
  if (sh <= eh) return h >= sh && h < eh;
  return h >= sh || h < eh;
}

export async function runOnce(): Promise<void> {
  const client = getSFLClient();
  const farm = await client.getFarmState();
  saveSnapshot(farm);

  const rules = listRules();
  const events = [
    ...detectEvents(farm),
    ...evaluateCustomRules(farm, rules),
  ];
  if (events.length === 0) return;

  if (inQuietHours()) {
    console.log(`[scheduler] ${events.length} event(s) detected but quiet hours active; skipping.`);
    return;
  }

  const enabledKinds = new Set(rules.filter((r) => r.enabled === 1).map((r) => r.kind));

  for (const ev of events) {
    // Custom rule events bypass kind-based gating since they came from a rule.
    if (!ev.ruleId && !enabledKinds.has(ev.kind)) continue;
    if (!markNotifiedOnce(ev.key)) continue; // already notified

    const text = `<b>🌻 SFL Optimizer</b>\n${esc(ev.message)}`;
    const result = await sendTelegramMessage(text);
    logNotification({
      ruleId: ev.ruleId ?? null,
      kind: ev.kind,
      message: ev.message,
      success: result.ok,
      error: result.error ?? null,
    });
    if (!result.ok) console.warn("[scheduler] telegram send failed:", result.error);
  }
}
