/**
 * Market Analyzer logic for SFL items.
 * Calculates EMA, RSI, and generates buy/sell signals.
 *
 * Notes on tuning:
 *   - EMA-12 & RSI-14 are industry-standard short-term indicators. With a
 *     5-minute polling cadence, 12 samples ≈ 1 hour of price context, which
 *     is appropriate for game-economy volatility (prices move on hourly news
 *     events like rotations, season swaps, etc.).
 *   - Minimum data points for a meaningful reading = RSI_PERIOD + 1. Below
 *     that we fall back to NEUTRAL with confidence=0.
 */

/** Items actually priced on sfl.world P2P. "SFL" is a currency, not a tradable
 *  item, so it must not appear here. Resources + animal produce are the most
 *  liquid and predictable — ideal for TA. */
export const DEFAULT_KEY_ITEMS = [
  "Wood",
  "Stone",
  "Iron",
  "Gold",
  "Crimstone",
  "Egg",
  "Feather",
  "Leather",
  "Wool",
  "Merino Wool",
  "Honey",
  "Milk",
] as const;

export const EMA_PERIOD = 12;
export const RSI_PERIOD = 14;
/** Below this many samples, RSI/EMA results aren't statistically meaningful. */
export const MIN_SAMPLES_FOR_SIGNAL = RSI_PERIOD + 1;

export interface MarketSignal {
  item: string;
  price: number;
  ema: number;
  rsi: number;
  signal: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";
  /** 0–100. Reflects how strong the signal is AND how much data backs it. */
  confidence: number;
  /** Number of samples used. Useful for showing "based on 42 points". */
  samples: number;
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateRSI(prices: number[], period: number = RSI_PERIOD): number {
  if (prices.length <= period) return 50; // Not enough data

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Signal confidence = how strong the reading is × how much data backs it.
 *
 *   rsiStrength:  |RSI - 50| / 50   → 0 at neutral (50), 1 at extremes (0/100)
 *   emaAgreement: +1 if EMA direction confirms RSI signal, 0 if contradicts
 *   dataFactor:   min(1, samples / 2×RSI_PERIOD)   saturates at 28 samples
 *
 * All weighted to cap at 100.
 */
function computeConfidence(
  rsi: number,
  price: number,
  ema: number,
  samples: number,
): number {
  const rsiStrength = Math.abs(rsi - 50) / 50; // 0..1
  // EMA agreement: overbought (RSI>50) should have price above EMA; oversold below.
  const bullish = rsi < 50;
  const emaAgreement = bullish ? (price < ema ? 1 : 0) : price > ema ? 1 : 0;
  const dataFactor = Math.min(1, samples / (2 * RSI_PERIOD));
  // Weight: 60% RSI strength, 20% EMA confirmation, 20% data sufficiency.
  const raw = rsiStrength * 0.6 + emaAgreement * 0.2 + dataFactor * 0.2;
  return Math.round(Math.min(1, raw) * 100);
}

export function analyzeMarket(
  item: string,
  history: { price: number }[],
): MarketSignal {
  const prices = history.map((h) => h.price).filter((p) => p > 0);
  const currentPrice = prices[prices.length - 1] || 0;
  const samples = prices.length;

  const ema = calculateEMA(prices, EMA_PERIOD);
  const rsi = calculateRSI(prices, RSI_PERIOD);

  // Below the minimum, we can't trust RSI. Stay NEUTRAL with 0 confidence.
  if (samples < MIN_SAMPLES_FOR_SIGNAL) {
    return { item, price: currentPrice, ema, rsi: 50, signal: "NEUTRAL", confidence: 0, samples };
  }

  let signal: MarketSignal["signal"] = "NEUTRAL";
  if (rsi < 20) signal = "STRONG BUY";
  else if (rsi < 35) signal = "BUY";
  else if (rsi > 80) signal = "STRONG SELL";
  else if (rsi > 65) signal = "SELL";

  // EMA divergence check: mild signals flipped to NEUTRAL when price already
  // moved past the moving average (mean-reversion likely done). We only
  // downgrade non-STRONG signals — if RSI is extreme, trust it over EMA.
  if (signal === "BUY" && currentPrice > ema) signal = "NEUTRAL";
  if (signal === "SELL" && currentPrice < ema) signal = "NEUTRAL";

  const confidence = computeConfidence(rsi, currentPrice, ema, samples);

  return { item, price: currentPrice, ema, rsi, signal, confidence, samples };
}
