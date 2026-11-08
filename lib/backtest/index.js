import { getHistory } from "../crypto/index.js";
import { INTERVALS } from "../crypto/interval.js";
import { analyzeCandles } from "../signals/score.js";
import { confirmationsFor, timeframeRead } from "../signals/mtf.js";
import { clamp, round } from "../signals/indicators.js";

function evaluateSignal(entryCandles, reads) {
  const base = analyzeCandles(entryCandles, null);
  if (!base) return null;

  const weights = reads.map((_, i) => i + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const bias = reads.reduce((sum, read, i) => sum + (weights[i] / weightSum) * read.score, 0);

  const baseSign = Math.sign(base.score);
  const biasSign = Math.sign(bias);
  const strong = Math.abs(bias) > 0.08;
  const active = Math.abs(base.score) >= 8;
  const aligned = strong && active && baseSign === biasSign;
  const against = strong && active && baseSign !== biasSign;

  let score = Math.round(base.score * 0.5 + bias * 100 * 0.5);
  if (against) score = Math.round(base.score * 0.3 + bias * 100 * 0.4);
  if (!aligned) score = Math.round(score * 0.5);
  score = clamp(score, -100, 100);

  let direction = score >= 25 ? "long" : score <= -25 ? "short" : "neutral";
  if (!aligned) direction = "neutral";

  return {
    direction,
    score,
    atr: base.indicators.atr || base.price * 0.01,
    base,
  };
}

export async function runBacktest({
  symbol = "BTC/USD",
  interval = "5m",
  days = 7,
  minScore = 25,
  stopAtr = 1.5,
  tpAtr = 1.5,
} = {}) {
  if (!INTERVALS[interval]) throw new Error(`Unsupported interval: ${interval}`);

  const span = Math.max(1, Math.min(Number(days) || 7, 90));
  const threshold = Math.max(0, Math.min(Number(minScore) || 25, 100));
  const stopMult = Math.max(0.1, Number(stopAtr) || 1.5);
  const tpMult = Math.max(0.1, Number(tpAtr) || 1.5);

  const entryHistory = await getHistory({ symbol, interval, days: span });
  const entryCandles = entryHistory.candles;
  if (entryCandles.length < 120) throw new Error("Not enough entry candles for a backtest");

  const confirmations = confirmationsFor(interval);
  const confSeries = {};
  for (const tf of confirmations) {
    const need =
      tf === "6h" ? Math.max(span, 20) : tf === "1h" ? Math.max(span, 5) : span;
    try {
      const hist = await getHistory({ symbol: entryHistory.symbol, interval: tf, days: need });
      confSeries[tf] = hist.candles;
    } catch {
      confSeries[tf] = [];
    }
  }

  const pointers = {};
  for (const tf of confirmations) pointers[tf] = -1;

  const trades = [];
  const startIndex = 60;

  for (let i = startIndex; i < entryCandles.length - 1; i++) {
    const current = entryCandles[i];
    const reads = [];

    let ready = true;
    for (const tf of confirmations) {
      const series = confSeries[tf];
      if (!series || series.length < 60) {
        ready = false;
        break;
      }
      const tfMs = INTERVALS[tf];
      let p = pointers[tf];
      while (p + 1 < series.length && series[p + 1].t + tfMs <= current.t) p++;
      pointers[tf] = p;
      if (p < 59) {
        ready = false;
        break;
      }
      const slice = series.slice(Math.max(0, p - 199), p + 1);
      const read = timeframeRead(tf, slice);
      if (!read) {
        ready = false;
        break;
      }
      reads.push(read);
    }

    if (!ready) continue;

    const entryWindow = entryCandles.slice(Math.max(0, i - 299), i + 1);
    const signal = evaluateSignal(entryWindow, reads);
    if (!signal || signal.direction === "neutral" || Math.abs(signal.score) < threshold) {
      continue;
    }

    const next = entryCandles[i + 1];
    const entryPrice = next.o;
    const dir = signal.direction === "long" ? 1 : -1;
    const stop = entryPrice - dir * stopMult * signal.atr;
    const takeProfit = entryPrice + dir * tpMult * signal.atr;
    const risk = Math.abs(entryPrice - stop) || entryPrice * 0.0001;

    let outcome = null;
    let exitPrice = null;
    let exitIndex = null;

    for (let j = i + 1; j < entryCandles.length; j++) {
      const candle = entryCandles[j];
      const hitStop = dir === 1 ? candle.l <= stop : candle.h >= stop;
      const hitTp = dir === 1 ? candle.h >= takeProfit : candle.l <= takeProfit;

      if (hitStop) {
        outcome = "loss";
        exitPrice = stop;
        exitIndex = j;
        break;
      }
      if (hitTp) {
        outcome = "win";
        exitPrice = takeProfit;
        exitIndex = j;
        break;
      }
    }

    if (outcome == null) break;

    const r = (dir === 1 ? exitPrice - entryPrice : entryPrice - exitPrice) / risk;

    trades.push({
      symbol: entryHistory.symbol,
      direction: signal.direction,
      entryTime: next.t,
      exitTime: entryCandles[exitIndex].t,
      entry: round(entryPrice),
      stop: round(stop),
      takeProfit: round(takeProfit),
      exit: round(exitPrice),
      outcome,
      r: round(r, 3),
      score: signal.score,
      bars: exitIndex - i,
    });

    i = exitIndex;
  }

  return summarize({
    symbol: entryHistory.symbol,
    interval,
    days: span,
    params: { minScore: threshold, stopAtr: stopMult, tpAtr: tpMult },
    trades,
    candles: entryCandles.length,
  });
}

function summarize({ symbol, interval, days, params, trades, candles }) {
  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const totalR = trades.reduce((s, t) => s + t.r, 0);
  const grossWin = wins.reduce((s, t) => s + t.r, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.r, 0));

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const curve = [];
  for (const trade of trades) {
    equity += trade.r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    curve.push({ time: trade.exitTime, r: round(equity, 3) });
  }

  const byDirection = ["long", "short"].map((direction) => {
    const list = trades.filter((t) => t.direction === direction);
    const w = list.filter((t) => t.outcome === "win").length;
    return {
      direction,
      trades: list.length,
      wins: w,
      winRate: list.length ? round(w / list.length, 3) : 0,
    };
  });

  return {
    symbol,
    interval,
    days,
    candles,
    params,
    summary: {
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? round(wins.length / trades.length, 3) : 0,
      avgR: trades.length ? round(totalR / trades.length, 3) : 0,
      totalR: round(totalR, 3),
      profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 3) : grossWin > 0 ? null : 0,
      expectancy: trades.length ? round(totalR / trades.length, 3) : 0,
      maxDrawdownR: round(maxDrawdown, 3),
      bestR: trades.length ? round(Math.max(...trades.map((t) => t.r)), 3) : 0,
      worstR: trades.length ? round(Math.min(...trades.map((t) => t.r)), 3) : 0,
    },
    byDirection,
    equity: curve,
    trades: trades.slice(-500),
  };
}
