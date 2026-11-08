import {
  computeSignals,
  loadHistory,
  simulateSignals,
  tradeMetrics,
} from "../backtest/index.js";
import { logger } from "../logger.js";

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const pfValue = (pf) => (pf == null ? 5 : pf);

export async function calibrate({
  symbol = "XRP/USD",
  interval = "5m",
  days = 5,
  stopAtr = [1.0, 1.5, 2.0],
  tpAtr = [0.5, 1.0, 1.5, 2.0, 3.0],
  minScore = [20, 30, 40],
  minConfidence = [0, 70, 85],
  targetWinRate = 0.7,
  targetProfitFactor = 1.3,
  minTrades = 20,
  split = 0.7,
} = {}) {
  const data = await loadHistory({ symbol, interval, days });
  const entryCandles = data.entryCandles;
  const signals = computeSignals(entryCandles, data.confSeries, data.confirmations);
  if (!signals.length) throw new Error("No MTF-aligned signals found for calibration");

  const splitPct = clampNum(split, 0.5, 0.9, 0.7);
  const splitIndex = Math.floor(entryCandles.length * splitPct);
  const splitTime = entryCandles[splitIndex].t;

  const stopGrid = stopAtr.map((v) => clampNum(v, 0.1, 10, 1.5));
  const tpGrid = tpAtr.map((v) => clampNum(v, 0.1, 20, 1.5));
  const scoreGrid = minScore.map((v) => clampNum(v, 0, 100, 25));
  const confGrid = minConfidence.map((v) => clampNum(v, 0, 95, 0));

  const results = [];

  for (const stop of stopGrid) {
    for (const tp of tpGrid) {
      for (const ms of scoreGrid) {
        for (const mc of confGrid) {
          const trades = simulateSignals(signals, entryCandles, {
            stopAtr: stop,
            tpAtr: tp,
            minScore: ms,
            minConfidence: mc,
          });
          if (trades.length < minTrades) continue;

          const isTrades = trades.filter((t) => t.entryTime < splitTime);
          const osTrades = trades.filter((t) => t.entryTime >= splitTime);

          const all = tradeMetrics(trades);
          const inSample = tradeMetrics(isTrades);
          const outOfSample = tradeMetrics(osTrades);

          const meetsTarget =
            all.winRate >= targetWinRate &&
            pfValue(all.profitFactor) >= targetProfitFactor &&
            all.expectancy > 0;

          results.push({
            params: {
              stopAtr: stop,
              tpAtr: tp,
              minScore: ms,
              minConfidence: mc,
            },
            all,
            inSample,
            outOfSample,
            meetsTarget,
          });
        }
      }
    }
  }

  const rank = (r) =>
    pfValue(r.outOfSample.profitFactor) * 2 +
    r.outOfSample.winRate * 3 +
    pfValue(r.all.profitFactor);

  results.sort((a, b) => rank(b) - rank(a));

  const recommended = results
    .filter(
      (r) =>
        r.meetsTarget &&
        r.outOfSample.trades >= 5 &&
        pfValue(r.outOfSample.profitFactor) >= 1.0
    )
    .slice(0, 10);

  logger.info(
    "backtest",
    "calibrate",
    `Calibration ${data.entryHistory.symbol} ${interval}: ${results.length} configs, ${recommended.length} recommended`,
    {
      symbol: data.entryHistory.symbol,
      interval,
      days: data.days,
      candles: entryCandles.length,
      signals: signals.length,
      gridSize: stopGrid.length * tpGrid.length * scoreGrid.length * confGrid.length,
      evaluated: results.length,
      recommended: recommended.length,
      target: { winRate: targetWinRate, profitFactor: targetProfitFactor },
    }
  );

  return {
    symbol: data.entryHistory.symbol,
    interval,
    days: data.days,
    candles: entryCandles.length,
    signals: signals.length,
    splitTime,
    splitPct,
    target: {
      winRate: targetWinRate,
      profitFactor: targetProfitFactor,
      minTrades,
    },
    gridSize: stopGrid.length * tpGrid.length * scoreGrid.length * confGrid.length,
    evaluated: results.length,
    feasible: recommended.length > 0,
    recommended,
    top: results.slice(0, 20),
    note:
      "Win-rate targets are easy to hit by shrinking TP vs SL. Only trust configs that also keep out-of-sample profit factor > 1 and positive expectancy.",
  };
}
