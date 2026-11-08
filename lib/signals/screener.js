import { saveSignals } from "../../db.js";
import { analyzeSymbol, withConcurrency } from "./engine.js";
import { getMovers } from "./universe.js";

const LIQUID_FALLBACK = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "DOGE/USDT",
  "ADA/USDT",
  "AVAX/USDT",
  "LINK/USDT",
  "DOT/USDT",
  "LTC/USDT",
  "TON/USDT",
];

export async function scan({
  interval = "1h",
  limit = 15,
  minVolumeQuote = 1_000_000,
  minScore = 25,
  oi = true,
} = {}) {
  const target = Math.max(1, Math.min(Number(limit) || 15, 50));

  let movers = await getMovers({ limit: target, minVolumeQuote, oi });
  const seen = new Set(movers.map((m) => m.symbol));

  let analyzed = (
    await withConcurrency(movers, (mover) => analyzeSymbol(mover.symbol, interval), 3)
  ).filter(Boolean);

  const needsFallback = analyzed.length < Math.min(target, 6);
  if (needsFallback) {
    const fallbackMovers = LIQUID_FALLBACK.filter((s) => !seen.has(s)).map((symbol) => ({
      symbol,
      price: null,
      changePct: null,
      quoteVolume: null,
      oiChangePct: null,
      heat: 0,
      source: "fallback",
    }));
    const fallbackResults = (
      await withConcurrency(fallbackMovers, (m) => analyzeSymbol(m.symbol, interval), 3)
    ).filter(Boolean);

    movers = movers.concat(fallbackMovers);
    analyzed = analyzed.concat(fallbackResults);
  }

  const bySymbol = new Map(movers.map((m) => [m.symbol, m]));
  const threshold = Math.max(0, Math.min(Number(minScore) || 25, 100));

  const opportunities = analyzed
    .filter((r) => r.direction !== "neutral" && Math.abs(r.score) >= threshold)
    .map((r) => {
      const mover = bySymbol.get(r.symbol) || {};
      return {
        ...r,
        changePct: mover.changePct ?? null,
        quoteVolume: mover.quoteVolume ?? null,
        oiChangePct: mover.oiChangePct ?? null,
        heat: mover.heat ?? 0,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.score) * b.confidence - Math.abs(a.score) * a.confidence
    );

  saveSignals(opportunities);

  return {
    interval,
    scanned: movers.length,
    analyzed: analyzed.length,
    usedFallback: needsFallback,
    generatedAt: Date.now(),
    movers,
    opportunities,
  };
}
