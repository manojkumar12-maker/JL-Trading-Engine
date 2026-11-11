import { loadPanel, backtestPanel, currentTargets } from "../lib/perp/momentum.js";

const file = process.argv[2] || "data/perp-klines-365.json";
const panel = loadPanel(file);
const result = backtestPanel(panel);

console.log(
  JSON.stringify(
    {
      file,
      symbols: panel.symbols.length,
      periods: result.periods,
      raw: result.raw,
      benchmark: result.benchmark,
      overlay: result.overlay,
      stress: result.stress,
      averageExposure: result.averageExposure,
      targets: currentTargets(panel),
    },
    null,
    2
  )
);
