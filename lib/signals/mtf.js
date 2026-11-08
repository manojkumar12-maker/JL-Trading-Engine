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
  const strongBias = Math.abs(bias) > 0.08;
  const entryActive = Math.abs(base.score) >= 8;
  const aligned = strongBias && entryActive && baseSign === biasSign;
  const against = strongBias && entryActive && baseSign !== biasSign;

  let score = Math.round(base.score * 0.5 + bias * 100 * 0.5);
  if (against) score = Math.round(base.score * 0.3 + bias * 100 * 0.4);
  if (!aligned) score = Math.round(score * 0.5);
  score = clamp(score, -100, 100);

  let direction = score >= 25 ? "long" : score <= -25 ? "short" : "neutral";
  if (!aligned) direction = "neutral";

  const agree = reads.filter((read) => {
    const sign = read.direction === "bullish" ? 1 : read.direction === "bearish" ? -1 : 0;
    return sign !== 0 && sign === Math.sign(score);
  }).length;

  let confidence = base.confidence;
  if (aligned) confidence += 12;
  if (reads.length && agree === reads.length) confidence += 8;
  confidence = Math.round(clamp(confidence, 0, 95));
  if (direction === "neutral") confidence = Math.round(Math.min(confidence, 45));

  const news = newsSentiment();
  if (direction !== "neutral" && news.articles > 0 && news.score !== 0) {
    const dirSign = direction === "long" ? 1 : -1;
    const delta = Math.round(Math.abs(news.score) * 5);
    score = clamp(score + (Math.sign(news.score) === dirSign ? delta : -delta), -100, 100);
  }

  let plan = direction === "neutral" ? null : base.plan;
  if (direction !== "neutral" && !plan) {
    const atrValue = base.indicators?.atr || base.price * 0.01;
    const dir = direction === "long" ? 1 : -1;
    const entry = base.price;
    const stop = entry - dir * 1.5 * atrValue;
    const targets = [1.5, 3, 4.5].map((r) => round(entry + dir * r * atrValue));
    const risk = Math.abs(entry - stop) || 1;
    plan = {
      entry: round(entry),
      stop: round(stop),
      targets,
      riskReward: targets.map((t) => round(Math.abs(t - entry) / risk, 2)),
      atr: round(atrValue),
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
