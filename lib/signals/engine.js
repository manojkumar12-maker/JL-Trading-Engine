import { getKlines } from "../crypto/index.js";
import { analyzeCandles, higherTimeframe } from "./score.js";

export async function analyzeSymbol(symbol, interval = "1h") {
  const main = await getKlines({ symbol, interval, limit: 300 });
  if (!main.candles || main.candles.length < 60) return null;

  const htf = higherTimeframe(interval);
  let higher = null;
  if (htf) {
    try {
      higher = await getKlines({ symbol: main.symbol, interval: htf, limit: 200 });
    } catch {
      higher = null;
    }
  }

  const analysis = analyzeCandles(main.candles, higher?.candles || null);
  if (!analysis) return null;

  return {
    ...analysis,
    symbol: main.symbol,
    interval,
    source: main.source,
    higherInterval: htf,
    higherTrend: analysis.higherTrend,
    updatedAt: Date.now(),
  };
}

export async function withConcurrency(items, worker, concurrency = 3) {
  const results = new Array(items.length);
  let index = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index++;
        try {
          results[current] = await worker(items[current], current);
        } catch {
          results[current] = null;
        }
      }
    }
  );
  await Promise.all(runners);
  return results;
}
