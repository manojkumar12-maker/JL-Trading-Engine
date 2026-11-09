// Single source of truth for the default trading profile used across the
// signal engine, backtester, screener, calibrator, agents, and executer.
//
// Design notes:
// - A balanced ~1:1 R:R is used instead of a tiny take-profit. A 0.8 ATR TP
//   against a 2.2 ATR SL needs >73% wins just to break even before fees, which
//   is not robust.
// - The backtester now charges per-side fees and slippage by default, so
//   results are net of costs rather than optimistic.
// - These are starting defaults, NOT a validated edge. Re-calibrate per
//   symbol/timeframe and only promote configs with out-of-sample PF > 1 and
//   positive expectancy. See README "Re-calibrating per symbol / timeframe".
export const HIGH_WR = {
  mode: "high_wr",

  // Trade geometry (ATR multiples). Balanced ~1:1 R:R is more robust than a
  // tiny take-profit, which needs an unrealistic win rate just to break even.
  stopAtr: 1.5,
  tpAtr: 1.5,
  targetsAtr: [1.5, 2.5, 3.5],

  // Signal filters
  minScore: 35,
  minConfidence: 70,

  // Trading costs used by the backtester (per side)
  feePct: 0.05,
  slippageBps: 2,

  // Calibration targets. With ~1:1 R:R the break-even win rate is ~50% + fees,
  // so a realistic profitable target is ~55%+, not 75-80%.
  targetWinRate: 0.55,
  targetProfitFactor: 1.2,
  minTrades: 12,

  // Confluence / quality gates
  strongBias: 0.12,
  entryActive: 18,
  minAgreeRatio: 0.75,
  minVolumeRatio: 0.85,
  atrPctMin: 0.15,
  atrPctMax: 8,
  rsiOverbought: 72,
  rsiOversold: 28,
};

export const HIGH_WR_PARAMS = {
  stopAtr: HIGH_WR.stopAtr,
  tpAtr: HIGH_WR.tpAtr,
  targetsAtr: HIGH_WR.targetsAtr,
  minScore: HIGH_WR.minScore,
  minConfidence: HIGH_WR.minConfidence,
  feePct: HIGH_WR.feePct,
  slippageBps: HIGH_WR.slippageBps,
};
