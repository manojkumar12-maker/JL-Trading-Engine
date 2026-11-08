import { saveSignals } from "../../db.js";
import { logger } from "../logger.js";
import { withConcurrency } from "./engine.js";
import { analyzeSymbolMTF } from "./mtf.js";
import { getMovers } from "./universe.js";

const LIQUID_FALLBACK = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "DOGE/USD",
  "ADA/USD",
  "AVAX/USD",
  "LINK/USD",
  "DOT/USD",
  "LTC/USD",
  "BCH/USD",
  "XLM/USD",
  "ATOM/USD",
  "NEAR/USD",
  "APT/USD",
  "ARB/USD",
  "OP/USD",
  "FIL/USD",
  "ETC/USD",
  "UNI/USD",
  "AAVE/USD",
];

export async function scan({
  interval = "5m",
  limit = 8,
  minVolumeQuote = 1_000_000,
  minScore = 25,
  oi = true,
} = {}) {
  const target = Math.max(1, Math.min(Number(limit) || 8, 12));
  const threshold = Math.max(0, Math.min(Number(minScore) || 25, 100));
  const minOpportunities = 3;

  const movers = await getMovers({ limit: target, minVolumeQuote, oi });
  const seen = new Set(movers.map((m) => m.symbol));

  const candidates = [...movers];
  for (const symbol of LIQUID_FALLBACK) {
    if (!seen.has(symbol)) {
      candidates.push({
        symbol,
        price: null,
        changePct: null,
        quoteVolume: null,
        oiChangePct: null,
        heat: 0,
        source: "fallback",
      });
    }
  }

  const analyzed = [];
  const attemptCap = Math.min(candidates.length, 20);
  const countSetups = () =>
    analyzed.filter((r) => r.direction !== "neutral" && Math.abs(r.score) >= threshold)
      .length;

  for (let i = 0; i < attemptCap; i += 3) {
    const batch = candidates.slice(i, Math.min(i + 3, attemptCap));
    const results = (
      await withConcurrency(batch, (mover) => analyzeSymbolMTF(mover.symbol, interval), 3)
    ).filter(Boolean);
    analyzed.push(...results);
    if (countSetups() >= minOpportunities) break;
  }

  const usedFallback = analyzed.some(
    (a) => candidates.find((c) => c.symbol === a.symbol)?.source === "fallback"
  );

  const bySymbol = new Map(candidates.map((m) => [m.symbol, m]));

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
  logger.info(
    "signal",
    "scan",
    `Scan ${interval}: ${opportunities.length} setups from ${analyzed.length} analyzed`,
    {
      interval,
      scanned: candidates.length,
      analyzed: analyzed.length,
      usedFallback,
      opportunities: opportunities.slice(0, 10).map((o) => ({
        symbol: o.symbol,
        direction: o.direction,
        score: o.score,
        confidence: o.confidence,
        alignment: o.alignment,
      })),
    }
  );

  return {
    interval,
    scanned: candidates.length,
    analyzed: analyzed.length,
    usedFallback,
    generatedAt: Date.now(),
    movers: candidates,
    opportunities,
  };
}
