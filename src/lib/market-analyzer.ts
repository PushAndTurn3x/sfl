/**
 * Market Analyzer logic for SFL items.
 * Calculates EMA, RSI, Bollinger Bands, and generates buy/sell signals.
 * 
 * Upgraded with 'technicalindicators' library for professional-grade analysis.
 */

import { EMA, RSI, BollingerBands, bullish, bearish } from 'technicalindicators';

/** Items actually priced on sfl.world P2P. */
export const DEFAULT_KEY_ITEMS = [
  "Apple",
  "Artichoke",
  "Banana",
  "Barley",
  "Beetroot",
  "Blueberry",
  "Broccoli",
  "Bumpkin Emblem",
  "Cabbage",
  "Carrot",
  "Cauliflower",
  "Celestine",
  "Chewed Bone",
  "Corn",
  "Crimstone",
  "Dewberry",
  "Duskberry",
  "Egg",
  "Eggplant",
  "Feather",
  "Frost Pebble",
  "Goblin Emblem",
  "Gold",
  "Grape",
  "Heart Leaf",
  "Honey",
  "Iron",
  "Kale",
  "Leather",
  "Lemon",
  "Lunara",
  "Merino Wool",
  "Milk",
  "Moonfur",
  "Nightshade Emblem",
  "Obsidian",
  "Olive",
  "Onion",
  "Orange",
  "Parsnip",
  "Pepper",
  "Potato",
  "Pumpkin",
  "Radish",
  "Rhubarb",
  "Ribbon",
  "Rice",
  "Ruffroot",
  "Salt",
  "Soybean",
  "Stone",
  "Sunflorian Emblem",
  "Sunflower",
  "Tomato",
  "Turnip",
  "Wheat",
  "Wild Grass",
  "Wood",
  "Wool",
  "Yam",
  "Zucchini",
] as const;

export const EMA_PERIOD = 12;
export const RSI_PERIOD = 14;
export const BB_PERIOD = 20;
export const BB_STD_DEV = 2;

/** Below this many samples, RSI/EMA results aren't statistically meaningful. */
export const MIN_SAMPLES_FOR_SIGNAL = RSI_PERIOD + 1;

export interface MarketSignal {
  item: string;
  price: number;
  ema: number;
  rsi: number;
  bb?: {
    upper: number;
    middle: number;
    lower: number;
  };
  patterns: string[];
  signal: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";
  /** 0–100. Reflects how strong the signal is AND how much data backs it. */
  confidence: number;
  /** Number of samples used. Useful for showing "based on 42 points". */
  samples: number;
}

/**
 * Signal confidence = how strong the reading is × how much data backs it.
 */
function computeConfidence(
  rsi: number,
  price: number,
  ema: number,
  samples: number,
  bb?: { upper: number; lower: number },
  patternsCount: number = 0
): number {
  const rsiStrength = Math.abs(rsi - 50) / 50; // 0..1
  const bullish_rsi = rsi < 50;
  const emaAgreement = bullish_rsi ? (price < ema ? 1 : 0) : price > ema ? 1 : 0;
  
  // Bollinger Band agreement: price near/outside bands
  let bbAgreement = 0;
  if (bb) {
    if (bullish_rsi && price <= bb.lower) bbAgreement = 1;
    else if (!bullish_rsi && price >= bb.upper) bbAgreement = 1;
  }

  const dataFactor = Math.min(1, samples / (2 * RSI_PERIOD));
  const patternFactor = Math.min(1, patternsCount * 0.5); // 2 patterns = max bonus

  // Weight: 40% RSI, 15% EMA, 15% BB, 15% Patterns, 15% Data
  const raw = rsiStrength * 0.4 + emaAgreement * 0.15 + bbAgreement * 0.15 + patternFactor * 0.15 + dataFactor * 0.15;
  return Math.round(Math.min(1, raw) * 100);
}

export function analyzeMarket(
  item: string,
  history: { price: number; open?: number; high?: number; low?: number; close?: number }[],
): MarketSignal {
  const prices = history.map((h) => h.price).filter((p) => p > 0);
  const currentPrice = prices[prices.length - 1] || 0;
  const samples = prices.length;

  // 1. Calculate Indicators using technicalindicators library
  const emaValues = EMA.calculate({ period: EMA_PERIOD, values: prices });
  const rsiValues = RSI.calculate({ period: RSI_PERIOD, values: prices });
  const bbValues = BollingerBands.calculate({ period: BB_PERIOD, values: prices, stdDev: BB_STD_DEV });

  const ema = emaValues[emaValues.length - 1] || 0;
  const rsi = rsiValues[rsiValues.length - 1] || 50;
  const bbRaw = bbValues[bbValues.length - 1];
  const bb = bbRaw ? { upper: bbRaw.upper, middle: bbRaw.middle, lower: bbRaw.lower } : undefined;

  // 2. Pattern Recognition (if OHLC data is available)
  const patterns: string[] = [];
  if (history.length >= 5 && history[0].open !== undefined) {
    const ohlc = {
      open: history.map(h => h.open || h.price),
      high: history.map(h => h.high || h.price),
      low: history.map(h => h.low || h.price),
      close: history.map(h => h.close || h.price),
    };

    if (bullish(ohlc)) patterns.push("Bullish Pattern");
    if (bearish(ohlc)) patterns.push("Bearish Pattern");
    
    // Specific patterns can be added here (e.g., AbandonedBaby, Doji, etc.)
  }

  // 3. Generate Signal
  // Below the minimum, we can't trust RSI. Stay NEUTRAL with 0 confidence.
  if (samples < MIN_SAMPLES_FOR_SIGNAL) {
    return { item, price: currentPrice, ema, rsi: 50, patterns: [], signal: "NEUTRAL", confidence: 0, samples };
  }

  let signal: MarketSignal["signal"] = "NEUTRAL";
  if (rsi < 20) signal = "STRONG BUY";
  else if (rsi < 35) signal = "BUY";
  else if (rsi > 80) signal = "STRONG SELL";
  else if (rsi > 65) signal = "SELL";

  // BB Confirmation
  if (bb) {
    if (signal === "BUY" && currentPrice > bb.lower * 1.05) signal = "NEUTRAL"; // Price not low enough relative to BB
    if (signal === "SELL" && currentPrice < bb.upper * 0.95) signal = "NEUTRAL"; // Price not high enough relative to BB
  }

  // EMA divergence check
  if (signal === "BUY" && currentPrice > ema) signal = "NEUTRAL";
  if (signal === "SELL" && currentPrice < ema) signal = "NEUTRAL";

  const confidence = computeConfidence(rsi, currentPrice, ema, samples, bb, patterns.length);

  return { item, price: currentPrice, ema, rsi, bb, patterns, signal, confidence, samples };
}
