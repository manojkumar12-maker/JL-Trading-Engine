import { atr, bollinger, clamp, ema, macd, round, rsi, sma } from "./indicators.js";

const WEIGHTS = {
  "EMA trend": 0.25,
  "EMA alignment": 0.1,
  MACD: 0.2,
  RSI: 0.15,
  Bollinger: 0.1,
  Volume: 0.1,
  Momentum: 0.1,
};

export function analyzeCandles(candles, higherCandles = null) {
  if (!candles || candles.length < 60) return null;

  const closes = candles.map((c) => c.c);
  const volumes = candles.map((c) => c.v);
  const last = candles[candles.length - 1];
  const price = last.c;

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = candles.length >= 200 ? ema(closes, 200) : null;

  const rsiSeries = rsi(closes, 14);
  const rsiValue = rsiSeries[rsiSeries.length - 1];

  const { hist } = macd(closes);
  const histNow = hist[hist.length - 1];
  const histPrev = hist[hist.length - 2];

  const bb = bollinger(closes, 20, 2);
  const pctB = bb.pctB[bb.pctB.length - 1];

  const atrSeries = atr(candles, 14);
  const atrNow = atrSeries[atrSeries.length - 1];

  const avgVol = sma(volumes, 20)[volumes.length - 1];
  const volRatio = avgVol ? last.v / avgVol : 1;

  const momentumIndex = Math.max(0, closes.length - 21);
  const momentum =
    closes[momentumIndex] > 0 ? (price - closes[momentumIndex]) / closes[momentumIndex] : 0;

  const e20 = ema20[ema20.length - 1];
  const e50 = ema50[ema50.length - 1];
  const e200 = ema200 ? ema200[ema200.length - 1] : null;

  const components = [];

  let trend = 0;
  trend += price > e50 ? 0.5 : -0.5;
  trend += e20 > e50 ? 0.3 : -0.3;
  if (e200 != null) trend += price > e200 ? 0.2 : -0.2;
  components.push({ name: "EMA trend", value: clamp(trend, -1, 1), weight: WEIGHTS["EMA trend"] });

  let alignment = 0;
  alignment += e20 > e50 ? 0.5 : -0.5;
  if (e200 != null) alignment += e50 > e200 ? 0.5 : -0.5;
  components.push({
    name: "EMA alignment",
    value: clamp(alignment, -1, 1),
    weight: WEIGHTS["EMA alignment"],
  });

  let macdScore = 0;
  macdScore += histNow > 0 ? 0.6 : -0.6;
  macdScore += histNow > histPrev ? 0.4 : -0.4;
  components.push({ name: "MACD", value: clamp(macdScore, -1, 1), weight: WEIGHTS.MACD });

  let rsiScore = 0;
  if (rsiValue != null) {
    if (rsiValue < 30) rsiScore = 0.7;
    else if (rsiValue > 70) rsiScore = -0.7;
    else rsiScore = (rsiValue - 50) / 50;
  }
  components.push({ name: "RSI", value: clamp(rsiScore, -1, 1), weight: WEIGHTS.RSI });

  const bbScore = pctB == null ? 0 : clamp((pctB - 0.5) * 1.6, -1, 1);
  components.push({ name: "Bollinger", value: bbScore, weight: WEIGHTS.Bollinger });

  const candleDir = last.c >= last.o ? 1 : -1;
  let volumeScore = 0;
  if (volRatio > 1.2) volumeScore = candleDir * clamp((volRatio - 1) / 1.5, 0, 1);
  else if (volRatio < 0.6) volumeScore = -candleDir * 0.2;
  components.push({ name: "Volume", value: clamp(volumeScore, -1, 1), weight: WEIGHTS.Volume });

  components.push({
    name: "Momentum",
    value: clamp(momentum / 0.08, -1, 1),
    weight: WEIGHTS.Momentum,
  });

  const rawScore = components.reduce((sum, c) => sum + c.weight * c.value, 0);

  const contributions = components
    .map((c) => ({ name: c.name, contribution: c.weight * c.value * 100 }))
    .filter((c) => Math.abs(c.contribution) > 0.01)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const reasons = contributions
    .slice(0, 4)
    .map((c) => `${c.name} ${c.contribution > 0 ? "+" : ""}${c.contribution.toFixed(1)}`);

  let score = Math.round(rawScore * 100);

  let higherTrend = null;
  if (higherCandles && higherCandles.length >= 60) {
    const hCloses = higherCandles.map((c) => c.c);
    const hEma50 = ema(hCloses, 50);
    const hLast = hCloses[hCloses.length - 1];
    higherTrend = hLast > hEma50[hEma50.length - 1] ? "bullish" : "bearish";

    if (score > 0) {
      score = Math.round(higherTrend === "bullish" ? score * 1.1 : score * 0.75);
    } else if (score < 0) {
      score = Math.round(higherTrend === "bearish" ? score * 1.1 : score * 0.75);
    }
  }

  score = clamp(score, -100, 100);

  let direction = "neutral";
  if (score >= 25) direction = "long";
  else if (score <= -25) direction = "short";

  const scoreSign = Math.sign(score) || 1;
  const active = components.filter((c) => Math.abs(c.value) > 0.05);
  const agree = active.filter((c) => Math.sign(c.value) === scoreSign).length;
  const agreement = active.length ? agree / active.length : 0;

  let confidence = Math.round(
    Math.min(95, 40 + Math.abs(score) * 0.5 + agreement * 15)
  );
  if (direction === "neutral") confidence = Math.round(confidence * 0.6);

  const atrValue = atrNow || price * 0.01;
  const dir = direction === "short" ? -1 : 1;
  const entry = price;
  const stop = entry - dir * 1.5 * atrValue;
  const targets = [1.5, 3, 4.5].map((r) => round(entry + dir * r * atrValue));
  const risk = Math.abs(entry - stop);

  return {
    price: round(price),
    score,
    direction,
    confidence,
    higherTrend,
    reasons,
    indicators: {
      rsi: rsiValue == null ? null : round(rsiValue, 2),
      macdHist: round(histNow, 6),
      ema20: round(e20),
      ema50: round(e50),
      ema200: e200 == null ? null : round(e200),
      bollingerPctB: pctB == null ? null : round(pctB, 3),
      volumeRatio: round(volRatio, 2),
      atr: round(atrValue),
      atrPct: round((atrValue / price) * 100, 2),
      momentum20Pct: round(momentum * 100, 2),
    },
    plan:
      direction === "neutral"
        ? null
        : {
            entry: round(entry),
            stop: round(stop),
            targets,
            riskReward: targets.map((t) => round(Math.abs(t - entry) / risk, 2)),
            atr: round(atrValue),
          },
  };
}

export function higherTimeframe(interval) {
  const map = {
    "1m": "15m",
    "3m": "1h",
    "5m": "1h",
    "15m": "6h",
    "30m": "6h",
    "1h": "6h",
    "2h": "1d",
    "4h": "1d",
    "6h": "1d",
    "12h": "1d",
    "1d": "1w",
    "3d": "1w",
    "1w": null,
  };
  return map[interval] ?? null;
}
