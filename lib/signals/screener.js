import { saveSignals } from "../../db.js";
import { logger } from "../logger.js";
import { withConcurrency } from "./engine.js";
import { analyzeSymbolMTF } from "./mtf.js";
import { getMovers } from "./universe.js";
import { HIGH_WR } from "./defaults.js";

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
  "BNB/USDT",
  "ADA/USDT",
  "AVAX/USDT",
  "LINK/USDT",
  "DOT/USDT",
  "LTC/USDT",
  "BCH/USDT",
  "TRX/USDT",
  "NEAR/USDT",
  "APT/USDT",
  "ARB/USDT",
  "OP/USDT",
  "FIL/USDT",
  "UNI/USDT",
  "AAVE/USDT",
];

export async function scan({
  interval = "5m",
  limit = 8,
  minVolumeQuote = 1_000_000,
  minScore = HIGH_WR.minScore,
  minConfidence = HIGH_WR.minConfidence,
  oi = true,
} = {}) {
  const target = Math.max(1, Math.min(Number(limit) || 8, 12));
  const threshold = Math.max(0, Math.min(Number(minScore) || HIGH_WR.minScore, 100));
  const confThreshold = Math.max(
    0,
    Math.min(Number(minConfidence) || HIGH_WR.minConfidence, 95)
  );
  const minOpportunities = 2;
  const qualifies = (r) =>
    r.direction !== "neutral" &&
    Math.abs(r.score) >= threshold &&
    r.confidence >= confThreshold;

  const movers = await getMovers({ limit: target, minVolumeQuote, oi });
  const seen = new Set(movers.map((m) => m.symbol));

  const fallbacks = [];
  for (const symbol of LIQUID_FALLBACK) {
    if (!seen.has(symbol)) {
      seen.add(symbol);
      fallbacks.push({
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

  // Interleave movers with liquid fallbacks so symbols whose klines are not
  // available (common for new/illiquid movers) don't consume the whole budget.
  const candidates = [];
  const maxLen = Math.max(movers.length, fallbacks.length);
  for (let i = 0; i < maxLen; i++) {
    if (movers[i]) candidates.push(movers[i]);
    if (fallbacks[i]) candidates.push(fallbacks[i]);
  }

  const analyzed = [];
  const maxAnalyze = Math.max(
    1,
    Math.min(Number(process.env.SCREENER_MAX_ANALYZE) || 40, 60)
  );
  const attemptCap = Math.min(candidates.length, maxAnalyze);
  const countSetups = () => analyzed.filter(qualifies).length;
  let failed = 0;

  for (let i = 0; i < attemptCap; i += 3) {
    const batch = candidates.slice(i, Math.min(i + 3, attemptCap));
    const results = await withConcurrency(
      batch,
      (mover) => analyzeSymbolMTF(mover.symbol, interval),
      3
    );
    for (const result of results) {
      if (result) analyzed.push(result);
      else failed += 1;
    }
    if (countSetups() >= minOpportunities) break;
  }

  const usedFallback = analyzed.some(
    (a) => candidates.find((c) => c.symbol === a.symbol)?.source === "fallback"
  );

  const bySymbol = new Map(candidates.map((m) => [m.symbol, m]));

  const opportunities = analyzed
    .filter(qualifies)
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

  const diagnostics = analyzed.map((r) => ({
    symbol: r.symbol,
    direction: r.direction,
    score: r.score,
    confidence: r.confidence,
    alignment: r.alignment,
    reason: qualifies(r)
      ? "ok"
      : r.alignment !== "aligned"
        ? "htf_alignment"
        : Math.abs(r.score) < threshold
          ? "score_below_threshold"
          : r.confidence < confThreshold
            ? "confidence_below_floor"
            : "quality_filters",
  }));

  logger.info(
    "signal",
    "scan",
    `Scan ${interval}: ${opportunities.length} setups from ${analyzed.length} analyzed`,
    {
      interval,
      scanned: candidates.length,
      attempted: attemptCap,
      analyzed: analyzed.length,
      failed,
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
    mode: HIGH_WR.mode,
    minScore: threshold,
    minConfidence: confThreshold,
    scanned: candidates.length,
    attempted: attemptCap,
    analyzed: analyzed.length,
    failed,
    usedFallback,
    generatedAt: Date.now(),
    movers: candidates,
    opportunities,
    diagnostics,
  };
}
