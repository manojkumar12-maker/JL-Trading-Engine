import { getKlines } from "../crypto/index.js";
import { analyzeCandles } from "./score.js";
import { atr, clamp, ema, macd, round, rsi } from "./indicators.js";
import { newsSentiment } from "./sentiment.js";

const CONFIRMATIONS = {
  "1m": ["15m", "1h", "6h"],
  "3m": ["15m", "1h", "6h"],
  "5m": ["15m", "1h", "6h"],
  "15m": ["1h", "6h", "1d"],
  "30m": ["1h", "6h", "1d"],
  "1h": ["6h", "1d"],
  "2h": ["6h", "1d"],
  "4h": ["6h", "1d"],
  "6h": ["1d"],
  "1d": ["1w"],
  "3d": ["1w"],
  "1w": [],
};

export function confirmationsFor(interval) {
  return CONFIRMATIONS[interval] || [];
}

export function timeframeRead(interval, candles) {
  if (!candles || candles.length < 60) return null;

  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1];
  const e20 = ema(closes, 20).at(-1);
  const e50 = ema(closes, 50).at(-1);
  const e200 = candles.length >= 200 ? ema(closes, 200).at(-1) : null;
  const rsiValue = rsi(closes, 14).at(-1);
  const { hist } = macd(closes);
  const histNow = hist.at(-1);
  const histPrev = hist.at(-2);
  const atrValue = atr(candles, 14).at(-1);

  let trend = (price > e50 ? 1 : -1) + (e20 > e50 ? 1 : -1);
  if (e200 != null) trend += price > e200 ? 1 : -1;
  trend = trend / (e200 != null ? 3 : 2);

  let momentum = (histNow > 0 ? 1 : -1) * 0.7 + (histNow > histPrev ? 1 : -1) * 0.3;
  momentum = clamp(momentum, -1, 1);

  const score = clamp(0.7 * trend + 0.3 * momentum, -1, 1);

  return {
    interval,
    price,
    trend: round(trend, 3),
    momentum: round(momentum, 3),
    score: round(score, 3),
    rsi: rsiValue == null ? null : round(rsiValue, 2),
    macdHist: round(histNow, 6),
    atr: round(atrValue),
    direction: score > 0.15 ? "bullish" : score < -0.15 ? "bearish" : "neutral",
  };
}

export async function analyzeSymbolMTF(symbol, entryInterval = "5m") {
  const entry = await getKlines({ symbol, interval: entryInterval, limit: 300 });
  if (!entry.candles || entry.candles.length < 60) return null;

  const confirmations = confirmationsFor(entryInterval);
  const results = await Promise.all(
    confirmations.map(async (tf) => {
      try {
        const res = await getKlines({ symbol: entry.symbol, interval: tf, limit: 200 });
        return timeframeRead(tf, res.candles);
      } catch {
        return null;
      }
    })
  );

  const reads = results.filter(Boolean);
  const base = analyzeCandles(entry.candles, null);
  if (!base) return null;

  const weights = reads.map((_, i) => i + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const bias = reads.reduce(
    (sum, read, i) => sum + (weights[i] / weightSum) * read.score,
    0
  );

  const baseSign = Math.sign(base.score);
  const biasSign = Math.sign(bias);
  // High-selectivity thresholds aimed at ~75-80% historical win rate
  // (fewer trades, require strong multi-TF confluence + momentum quality)
  const STRONG_BIAS = 0.12;
  const ENTRY_ACTIVE = 18;
  const DIR_THRESHOLD = 40;
  const MIN_AGREE_RATIO = 0.75;

  const strongBias = Math.abs(bias) > STRONG_BIAS;
  const entryActive = Math.abs(base.score) >= ENTRY_ACTIVE;
  const aligned = strongBias && entryActive && baseSign === biasSign;
  const against = strongBias && entryActive && baseSign !== biasSign;

  let score = Math.round(base.score * 0.45 + bias * 100 * 0.55);
  if (against) score = Math.round(base.score * 0.25 + bias * 100 * 0.35);
  if (!aligned) score = Math.round(score * 0.4);
  score = clamp(score, -100, 100);

  const agree = reads.filter((read) => {
    const sign = read.direction === "bullish" ? 1 : read.direction === "bearish" ? -1 : 0;
    return sign !== 0 && sign === Math.sign(score || baseSign || 1);
  }).length;
  const agreeRatio = reads.length ? agree / reads.length : 0;
  const fullAgree = reads.length > 0 && agree === reads.length;

  // Quality filters for high win-rate mode
  const rsi = base.indicators?.rsi;
  const volRatio = base.indicators?.volumeRatio ?? 1;
  const atrPct = base.indicators?.atrPct ?? 0;
  const macdHist = base.indicators?.macdHist ?? 0;

  let qualityPass = aligned && agreeRatio >= MIN_AGREE_RATIO && fullAgree;
  // RSI: avoid chasing extremes against the setup
  if (rsi != null) {
    if (baseSign > 0 && rsi > 72) qualityPass = false; // overbought long
    if (baseSign < 0 && rsi < 28) qualityPass = false; // oversold short
    // Prefer mild pullback entries in trend
    if (baseSign > 0 && rsi < 42) qualityPass = qualityPass && true;
    if (baseSign < 0 && rsi > 58) qualityPass = qualityPass && true;
  }
  // Require meaningful volume participation
  if (volRatio < 0.85) qualityPass = false;
  // Skip dead / extremely wild volatility regimes
  if (atrPct < 0.15 || atrPct > 8) qualityPass = false;
  // MACD histogram should agree with direction
  if (baseSign > 0 && macdHist < 0) qualityPass = false;
  if (baseSign < 0 && macdHist > 0) qualityPass = false;

  let direction =
    score >= DIR_THRESHOLD ? "long" : score <= -DIR_THRESHOLD ? "short" : "neutral";
  if (!qualityPass) direction = "neutral";

  let confidence = base.confidence;
  if (aligned) confidence += 15;
  if (fullAgree) confidence += 12;
  if (volRatio >= 1.2) confidence += 5;
  if (rsi != null && rsi >= 40 && rsi <= 60) confidence += 4;
  confidence = Math.round(clamp(confidence, 0, 95));
  if (direction === "neutral") confidence = Math.round(Math.min(confidence, 40));
  // High-WR mode: only emit actionable signals at high confidence
  if (direction !== "neutral" && confidence < 72) {
    direction = "neutral";
    confidence = Math.min(confidence, 40);
  }

  const news = newsSentiment();
  if (direction !== "neutral" && news.articles > 0 && news.score !== 0) {
    const dirSign = direction === "long" ? 1 : -1;
    const delta = Math.round(Math.abs(news.score) * 5);
    score = clamp(score + (Math.sign(news.score) === dirSign ? delta : -delta), -100, 100);
    // News strongly against → cancel
    if (Math.sign(news.score) !== 0 && Math.sign(news.score) !== dirSign && Math.abs(news.score) > 0.4) {
      direction = "neutral";
      confidence = Math.min(confidence, 35);
    }
  }

  // Asymmetric plan biased toward higher hit-rate first target
  let plan = null;
  if (direction !== "neutral") {
    const atrValue = base.indicators?.atr || base.price * 0.01;
    const dir = direction === "long" ? 1 : -1;
    const entry = base.price;
    const stopMult = 1.8; // slightly wider stop
    const tpMults = [1.0, 1.8, 2.8]; // closer first target for higher WR
    const stop = entry - dir * stopMult * atrValue;
    const targets = tpMults.map((r) => round(entry + dir * r * atrValue));
    const risk = Math.abs(entry - stop) || 1;
    plan = {
      entry: round(entry),
      stop: round(stop),
      targets,
      riskReward: targets.map((t) => round(Math.abs(t - entry) / risk, 2)),
      atr: round(atrValue),
      mode: "high_wr",
    };
  }

  const timeframes = reads
    .slice()
    .reverse()
    .map((read) => ({
      interval: read.interval,
      direction: read.direction,
      score: Math.round(read.score * 100),
      rsi: read.rsi,
      macdHist: read.macdHist,
      atr: read.atr,
    }));

  const layers = [
    ...base.reasons.map((r) => ({
      name: r.split(" ")[0],
      detail: r,
      kind: "indicator",
    })),
    ...timeframes.map((t) => ({
      name: `${t.interval} trend`,
      detail: `${t.direction} (${t.score > 0 ? "+" : ""}${t.score})`,
      kind: "timeframe",
    })),
    {
      name: "HTF bias",
      detail: bias > 0 ? "bullish" : bias < 0 ? "bearish" : "neutral",
      kind: "bias",
    },
    {
      name: "News",
      detail: `${news.score > 0 ? "bullish" : news.score < 0 ? "bearish" : "neutral"} (${news.articles} recent)`,
      kind: "news",
    },
  ];

  return {
    ...base,
    direction,
    score,
    confidence,
    plan,
    alignment: aligned ? "aligned" : against ? "against" : "mixed",
    biasScore: Math.round(bias * 100),
    timeframes,
    layers,
    news,
    source: entry.source,
    symbol: entry.symbol,
    interval: entryInterval,
    higherInterval: confirmations[confirmations.length - 1] ?? null,
    higherTrend: bias > 0.08 ? "bullish" : bias < -0.08 ? "bearish" : "neutral",
    updatedAt: Date.now(),
  };
}
