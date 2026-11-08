import { listSignals } from "../../db.js";
import { analyzeSymbolMTF } from "../signals/mtf.js";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round = (v, d = 2) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function sizeTrade(options = {}) {
  const equity = toNum(options.equity);
  const entry = toNum(options.entry);
  const stop = toNum(options.stop);
  const feePct = Math.max(0, toNum(options.feePct) ?? 0);
  const maxLeverage = Math.max(1, toNum(options.maxLeverage) ?? 10);
  const targets = (options.targets || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!(equity > 0)) throw new Error("equity must be greater than 0");
  if (!(entry > 0)) throw new Error("entry must be greater than 0");
  if (!(stop > 0)) throw new Error("stop must be greater than 0");
  if (entry === stop) throw new Error("entry and stop must differ");

  const warnings = [];
  let side = options.side;
  if (side !== "long" && side !== "short") {
    side = stop < entry ? "long" : "short";
  }
  const dir = side === "long" ? 1 : -1;
  if (dir === 1 && !(stop < entry)) warnings.push("Long stop is not below entry");
  if (dir === -1 && !(stop > entry)) warnings.push("Short stop is not above entry");

  let riskPct = Math.max(0, toNum(options.riskPct) ?? 1);
  let confidence = null;
  if (options.scaleByConfidence && options.confidence != null) {
    confidence = clamp(Number(options.confidence), 0, 100);
    if (Number.isFinite(confidence)) riskPct *= confidence / 100;
  }

  let riskAmount =
    options.riskAmount != null
      ? toNum(options.riskAmount)
      : (equity * riskPct) / 100;
  if (!(riskAmount > 0)) throw new Error("risk amount must be greater than 0");

  const riskPerUnit = Math.abs(entry - stop);
  const feePerUnit = 2 * entry * (feePct / 100);
  const totalPerUnit = riskPerUnit + feePerUnit;

  let units = riskAmount / totalPerUnit;
  let notional = units * entry;
  let leverage = notional / equity;

  if (leverage > maxLeverage) {
    warnings.push(
      `Leverage ${leverage.toFixed(2)}x exceeds max ${maxLeverage}x — position capped`
    );
    notional = equity * maxLeverage;
    units = notional / entry;
    riskAmount = units * totalPerUnit;
    leverage = maxLeverage;
  }

  const priceRisk = units * riskPerUnit;
  const feeEstimate = units * feePerUnit;

  const targetRows = targets.map((price) => {
    const rMultiple = ((price - entry) * dir) / riskPerUnit;
    const profit = (price - entry) * dir * units;
    return {
      price: round(price, 8),
      rMultiple: round(rMultiple, 2),
      profit: round(profit, 2),
    };
  });

  return {
    side,
    equity: round(equity, 2),
    riskPct: round(riskPct, 3),
    riskAmount: round(riskAmount, 2),
    entry: round(entry, 8),
    stop: round(stop, 8),
    riskPerUnit: round(riskPerUnit, 8),
    units: round(units, 6),
    notional: round(notional, 2),
    leverage: round(leverage, 2),
    marginAtMaxLeverage: round(notional / maxLeverage, 2),
    priceRisk: round(priceRisk, 2),
    feeEstimate: round(feeEstimate, 2),
    targets: targetRows,
    confidence,
    warnings,
  };
}

export function sizePortfolio({
  equity,
  riskPct = 1,
  maxTotalRiskPct = 5,
  scaleByConfidence = true,
  trades = [],
  feePct = 0.1,
  maxLeverage = 10,
} = {}) {
  const e = toNum(equity);
  if (!(e > 0)) throw new Error("equity must be greater than 0");
  if (!trades.length) throw new Error("no trades to size");

  const perRiskPct = Math.max(0, toNum(riskPct) ?? 1);
  const cap = (e * Math.max(0, toNum(maxTotalRiskPct) ?? 5)) / 100;

  const raw = trades.map((t) => {
    const conf =
      scaleByConfidence && t.confidence != null
        ? clamp(Number(t.confidence), 0, 100) / 100
        : 1;
    return { t, riskAmount: ((e * perRiskPct) / 100) * conf };
  });

  const total = raw.reduce((s, r) => s + r.riskAmount, 0);
  const factor = total > cap && total > 0 ? cap / total : 1;

  const allocations = raw.map((r) => {
    const sized = sizeTrade({
      equity: e,
      entry: r.t.entry,
      stop: r.t.stop,
      targets: r.t.targets,
      side: r.t.side,
      riskAmount: r.riskAmount * factor,
      feePct: r.t.feePct ?? feePct,
      maxLeverage: r.t.maxLeverage ?? maxLeverage,
    });
    return { ...sized, symbol: r.t.symbol ?? null };
  });

  return {
    equity: round(e, 2),
    riskPct: perRiskPct,
    maxTotalRiskPct: toNum(maxTotalRiskPct) ?? 5,
    totalRiskAmount: round(allocations.reduce((s, a) => s + a.riskAmount, 0), 2),
    totalNotional: round(allocations.reduce((s, a) => s + a.notional, 0), 2),
    scaled: factor < 1,
    allocations,
    warnings:
      factor < 1
        ? [`Scaled down to keep total risk ≤ ${maxTotalRiskPct}% of equity`]
        : [],
  };
}

export async function sizeFromSignal({
  symbol,
  interval = "5m",
  equity,
  riskPct,
  feePct,
  maxLeverage,
  scaleByConfidence = true,
} = {}) {
  if (!symbol) throw new Error("symbol is required");
  const signal = await analyzeSymbolMTF(symbol, interval);
  if (!signal) throw new Error("could not analyze symbol");
  if (!signal.plan) {
    throw new Error(`No active trade plan for ${signal.symbol} (${signal.direction})`);
  }

  const size = sizeTrade({
    equity,
    riskPct,
    entry: signal.plan.entry,
    stop: signal.plan.stop,
    targets: signal.plan.targets,
    side: signal.direction,
    confidence: signal.confidence,
    scaleByConfidence,
    feePct,
    maxLeverage,
  });

  return {
    signal: {
      symbol: signal.symbol,
      interval: signal.interval,
      direction: signal.direction,
      score: signal.score,
      confidence: signal.confidence,
      alignment: signal.alignment,
      plan: signal.plan,
    },
    size,
  };
}

export function sizeFromStoredSignals({
  equity,
  riskPct,
  maxTotalRiskPct,
  limit = 5,
  scaleByConfidence = true,
  feePct = 0.1,
  maxLeverage = 10,
} = {}) {
  const signals = listSignals({ limit }).filter(
    (s) => s.plan && s.plan.entry != null && s.direction !== "neutral"
  );
  if (!signals.length) {
    throw new Error("no stored signals with trade plans — run a scan first");
  }

  const trades = signals.map((s) => ({
    symbol: s.symbol,
    entry: s.plan.entry,
    stop: s.plan.stop,
    targets: s.plan.targets,
    side: s.direction,
    confidence: s.confidence,
  }));

  return sizePortfolio({
    equity,
    riskPct,
    maxTotalRiskPct,
    scaleByConfidence,
    trades,
    feePct,
    maxLeverage,
  });
}
