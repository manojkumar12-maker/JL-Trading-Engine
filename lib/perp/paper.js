import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERP_MOMENTUM_CONFIG,
  backtestPanel,
  currentTargets,
  loadPanel,
} from "./momentum.js";
import {
  closePerpPosition,
  getPerpState,
  listOpenPerpPositions,
  listPerpPositions,
  listPerpRuns,
  openPerpPosition,
  recordPerpRun,
  resetPerpStore,
  setPerpState,
} from "./store.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_FILE = process.env.PERP_DATA_FILE || join(ROOT, "data", "perp-klines-365.json");
const START_EQUITY = Number(process.env.PERP_EQUITY_USD || 10000);

let cachedPanel = null;
let cachedAt = 0;

function getPanel() {
  if (!cachedPanel || Date.now() - cachedAt > 5 * 60_000) {
    cachedPanel = loadPanel(DATA_FILE);
    cachedAt = Date.now();
  }
  return cachedPanel;
}

function initialState() {
  return {
    equity: START_EQUITY,
    peak: START_EQUITY,
    lastRebalanceAt: null,
    exposure: 0,
    pausedUntil: null,
  };
}

export function perpState() {
  return getPerpState("paper", initialState());
}

function lastPrice(map) {
  let bestT = -Infinity;
  let price = null;
  for (const [t, c] of map) {
    if (t > bestT) {
      bestT = t;
      price = c;
    }
  }
  return price;
}

export function perpStatus() {
  const state = perpState();
  const panel = getPanel();
  const open = listOpenPerpPositions();

  let unrealized = 0;
  const positions = open.map((position) => {
    const price = lastPrice(panel.maps.get(position.symbol)) || position.entry;
    const pnl = (price - position.entry) * position.quantity;
    unrealized += pnl;
    return {
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      quantity: position.quantity,
      entry: position.entry,
      price,
      weight: position.weight,
      unrealizedPnl: +pnl.toFixed(2),
      openedAt: position.opened_at,
    };
  });

  let targets = null;
  let staleHours = null;
  try {
    targets = currentTargets(panel, PERP_MOMENTUM_CONFIG);
    staleHours = +((Date.now() - targets.asOf) / 3_600_000).toFixed(1);
  } catch {
    targets = null;
  }

  return {
    equity: +(state.equity + unrealized).toFixed(2),
    realizedEquity: +Number(state.equity).toFixed(2),
    unrealized: +unrealized.toFixed(2),
    exposure: state.exposure,
    lastRebalanceAt: state.lastRebalanceAt,
    positions,
    targets,
    staleHours,
    dataFile: DATA_FILE,
    startEquity: START_EQUITY,
    config: PERP_MOMENTUM_CONFIG,
  };
}

export function rebalancePerp() {
  const panel = getPanel();
  const targets = currentTargets(panel, PERP_MOMENTUM_CONFIG);
  let state = perpState();
  let equity = Number(state.equity) || START_EQUITY;

  const open = listOpenPerpPositions();
  for (const position of open) {
    const price = lastPrice(panel.maps.get(position.symbol)) || position.entry;
    const exitNotional = price * position.quantity;
    const exitFee = exitNotional * PERP_MOMENTUM_CONFIG.costPerSide;
    const pnl = (price - position.entry) * position.quantity - exitFee;
    equity += pnl;
    closePerpPosition(position.id, {
      exitPrice: price,
      pnl,
      fee: exitFee,
      reason: "rebalance",
    });
  }

  const opened = [];
  if (targets.exposure > 0 && targets.targets.length) {
    const perName = (equity * targets.exposure) / targets.targets.length;
    for (const target of targets.targets) {
      if (!(target.price > 0) || !(perName > 0)) continue;
      const notional = perName;
      const fee = notional * PERP_MOMENTUM_CONFIG.costPerSide;
      equity -= fee;
      const quantity = notional / target.price;
      const id = openPerpPosition({
        symbol: target.symbol,
        side: "long",
        quantity,
        entry: target.price,
        weight: target.weight,
        fee,
        reason: "rebalance",
      });
      opened.push({ id, symbol: target.symbol, quantity, entry: target.price, notional });
    }
  }

  state = {
    ...state,
    equity,
    peak: Math.max(Number(state.peak) || START_EQUITY, equity),
    lastRebalanceAt: targets.asOf,
    exposure: targets.exposure,
  };
  setPerpState("paper", state);

  recordPerpRun({
    equity,
    exposure: targets.exposure,
    positions: opened.length,
    targets: targets.targets,
    notes: targets.regime ? "rebalance" : "cash (regime off)",
  });

  return { ...perpStatus(), opened };
}

export function resetPerpPaper() {
  resetPerpStore();
  setPerpState("paper", initialState());
  return perpStatus();
}

export function perpHistory(limit = 100) {
  return {
    positions: listPerpPositions(limit),
    runs: listPerpRuns(20),
  };
}

export function perpBacktest(dataset = "current") {
  const files = {
    current: join(ROOT, "data", "perp-klines-365.json"),
    prior: join(ROOT, "data", "perp-klines-prev365.json"),
    alt: join(ROOT, "data", "perp-klines-alt.json"),
    "alt-prior": join(ROOT, "data", "perp-klines-alt-prev.json"),
  };
  const file = files[dataset];
  if (!file) throw new Error(`Unknown dataset "${dataset}"`);
  const panel = loadPanel(file);
  const result = backtestPanel(panel, PERP_MOMENTUM_CONFIG);
  return {
    dataset,
    symbols: panel.symbols.length,
    periods: result.periods,
    raw: result.raw,
    benchmark: result.benchmark,
    overlay: result.overlay,
    stress: result.stress,
    averageExposure: result.averageExposure,
  };
}
