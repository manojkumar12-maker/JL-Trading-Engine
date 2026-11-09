// Single source of truth for the calibrated "high win-rate" profile.
//
// Values come from a BTC/USDT 5m, ~30-day calibration that met:
//   win rate ~80%, profit factor > 1, positive expectancy, and
//   out-of-sample profit factor > 1.
//
// These are historical defaults, not a guarantee. Re-calibrate per symbol and
// timeframe (see README "Re-calibrating per symbol / timeframe") before relying
// on them, especially when the market regime changes.
export const HIGH_WR = {
  mode: "high_wr",

  // Trade geometry (ATR multiples)
  stopAtr: 2.2,
  tpAtr: 0.8,
  targetsAtr: [0.8, 1.5, 2.2],

  // Signal filters
  minScore: 35,
  minConfidence: 70,

  // Calibration targets
  targetWinRate: 0.75,
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
};
