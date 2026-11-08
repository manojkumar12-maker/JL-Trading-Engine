import { randomUUID } from "node:crypto";
import {
  dailyRealizedPnl,
  getPositionById,
  getSetting,
  listOpenPositions,
  listOrders,
  listPositions,
  saveOrder,
  savePosition,
  setSetting,
  updateOrder,
  updatePosition,
} from "../../db.js";
import { getKlines } from "../crypto/index.js";
import { getTickerPrice } from "../crypto/price.js";
import { analyzeSymbolMTF } from "../signals/mtf.js";
import { scan } from "../signals/screener.js";
import { sizeTrade } from "../sizer/index.js";
import {
  accountBalances,
  binanceConfig,
  placeMarketOrder,
  tickerPrice,
} from "./binance.js";

const liveEnabled = () => process.env.ENABLE_LIVE_TRADING === "true";
const autoEnabled = () => process.env.ENABLE_AUTO_TRADE === "true";

export function riskLimits() {
  return {
    maxOrderNotional: Number(process.env.MAX_ORDER_NOTIONAL_USD || 1000),
    maxOpenPositions: Number(process.env.MAX_OPEN_POSITIONS || 5),
    maxTotalExposure: Number(process.env.MAX_TOTAL_EXPOSURE_USD || 5000),
    maxDailyLoss: Number(process.env.MAX_DAILY_LOSS_USD || 200),
  };
}

export function isKilled() {
  return getSetting("kill_switch", "0") === "1";
}

export function setKillSwitch(enabled) {
  setSetting("kill_switch", enabled ? "1" : "0");
  return isKilled();
}

async function marketPrice(symbol) {
  try {
    const ticker = await getTickerPrice(symbol);
    return { price: ticker.price, source: ticker.source };
  } catch {
    /* fall back to candles */
  }

  for (const interval of ["1m", "5m"]) {
    try {
      const k = await getKlines({ symbol, interval, limit: 3 });
      const last = k.candles[k.candles.length - 1];
      if (last) return { price: last.c, source: k.source };
    } catch {
      /* try next */
    }
  }

  try {
    return { price: await tickerPrice(symbol), source: "binance" };
  } catch {
    throw new Error(`Unable to get a market price for ${symbol}`);
  }
}

function riskCheck(notional) {
  const limits = riskLimits();
  if (notional > limits.maxOrderNotional) {
    throw new Error(
      `Order notional $${notional.toFixed(2)} exceeds max $${limits.maxOrderNotional}`
    );
  }

  const open = listOpenPositions();
  if (open.length >= limits.maxOpenPositions) {
    throw new Error(`Max open positions (${limits.maxOpenPositions}) reached`);
  }

  const exposure = open.reduce(
    (sum, p) => sum + Math.abs((p.entry || 0) * (p.quantity || 0)),
    0
  );
  if (exposure + notional > limits.maxTotalExposure) {
    throw new Error(
      `Total exposure limit ($${limits.maxTotalExposure}) would be exceeded`
    );
  }

  const daily = dailyRealizedPnl();
  if (daily <= -limits.maxDailyLoss) {
    throw new Error(
      `Daily loss limit ($${limits.maxDailyLoss}) reached (today: $${daily.toFixed(2)})`
    );
  }
}

function capNotional(notional, equity) {
  const limits = riskLimits();
  let value = Math.max(0, Number(notional) || 0);
  const warnings = [];

  const eq = Number(equity) || 0;
  if (eq > 0 && value > eq) {
    value = eq;
    warnings.push("capped to equity (spot has no leverage)");
  }
  if (value > limits.maxOrderNotional) {
    value = limits.maxOrderNotional;
    warnings.push(`capped to max order notional $${limits.maxOrderNotional}`);
  }

  return {
    notional: Math.round(value * 100) / 100,
    capped: Math.abs(value - Number(notional)) > 1e-9,
    warnings,
  };
}

export function executerStatus() {
  const limits = riskLimits();
  const open = listOpenPositions();
  const exposure = open.reduce(
    (sum, p) => sum + Math.abs((p.entry || 0) * (p.quantity || 0)),
    0
  );

  return {
    liveEnabled: liveEnabled(),
    autoTradeEnabled: autoEnabled(),
    killSwitch: isKilled(),
    exchange: "binance",
    binance: binanceConfig(),
    limits,
    openPositions: open.length,
    openExposure: Math.round(exposure * 100) / 100,
    dailyPnl: Math.round(dailyRealizedPnl() * 100) / 100,
  };
}

export async function placeOrder(input = {}) {
  if (isKilled()) throw new Error("Kill switch is ON — trading disabled");

  const mode = input.mode === "live" ? "live" : "paper";
  if (mode === "live") {
    if (!liveEnabled()) {
      throw new Error("Live trading is disabled (set ENABLE_LIVE_TRADING=true)");
    }
    if (!input.confirm) throw new Error("Live orders require confirm: true");
  }

  const symbol = String(input.symbol || "").trim();
  if (!symbol) throw new Error("symbol is required");

  const side = input.side === "sell" || input.side === "short" ? "sell" : "buy";
  const positionSide = side === "buy" ? "long" : "short";

  let price = Number(input.entry) || 0;
  let quantity = Number(input.quantity) || 0;
  let notional = Number(input.notional) || 0;

  if (!(price > 0)) {
    price = (await marketPrice(symbol)).price;
  }
  if (!(quantity > 0) && notional > 0) quantity = notional / price;
  if (!(quantity > 0)) throw new Error("provide quantity or notional");
  if (!(notional > 0)) notional = quantity * price;

  riskCheck(notional);

  const order = {
    id: randomUUID(),
    createdAt: Date.now(),
    mode,
    exchange: mode === "live" ? "binance" : "paper",
    symbol,
    side,
    type: "MARKET",
    quantity,
    price,
    notional,
    stop: Number(input.stop) || null,
    takeProfit: Number(input.takeProfit) || null,
    status: "new",
    source: input.source || "manual",
  };
  saveOrder(order);

  try {
    let fillPrice = price;
    let raw = null;

    if (mode === "live") {
      raw = await placeMarketOrder({ symbol, side, quantity });
      fillPrice = raw.avgPrice || price;
      if (raw.executedQty) quantity = raw.executedQty;
      updateOrder(order.id, {
        status: "filled",
        filledPrice: fillPrice,
        filledAt: Date.now(),
        raw,
      });
    } else {
      fillPrice = (await marketPrice(symbol)).price;
      updateOrder(order.id, {
        status: "filled",
        filledPrice: fillPrice,
        filledAt: Date.now(),
      });
    }

    const position = {
      id: randomUUID(),
      orderId: order.id,
      symbol,
      side: positionSide,
      quantity,
      entry: fillPrice,
      stop: order.stop,
      takeProfit: order.takeProfit,
      status: "open",
      mode,
      openedAt: Date.now(),
    };
    savePosition(position);

    return {
      order: { ...order, status: "filled", filledPrice: fillPrice },
      position,
      raw,
    };
  } catch (err) {
    updateOrder(order.id, { status: "rejected", error: err.message });
    throw err;
  }
}

export async function closePosition(id, priceOverride) {
  const position = getPositionById(id);
  if (!position) throw new Error("position not found");
  if (position.status !== "open") throw new Error("position already closed");

  const price =
    Number(priceOverride) || (await marketPrice(position.symbol)).price;
  const dir = position.side === "long" ? 1 : -1;
  const pnl = (price - position.entry) * position.quantity * dir;

  updatePosition(id, {
    status: "closed",
    closedAt: Date.now(),
    exitPrice: price,
    pnl,
  });

  return {
    ...position,
    status: "closed",
    exitPrice: price,
    pnl: Math.round(pnl * 100) / 100,
  };
}

export async function refreshPaperPositions() {
  const open = listOpenPositions().filter((p) => p.mode === "paper");
  const closed = [];

  for (const position of open) {
    try {
      const { price } = await marketPrice(position.symbol);
      const dir = position.side === "long" ? 1 : -1;

      let exit = null;
      if (
        position.stop != null &&
        (dir === 1 ? price <= position.stop : price >= position.stop)
      ) {
        exit = { price: position.stop, reason: "stop" };
      } else if (
        position.takeProfit != null &&
        (dir === 1 ? price >= position.takeProfit : price <= position.takeProfit)
      ) {
        exit = { price: position.takeProfit, reason: "takeProfit" };
      }

      if (exit) {
        const pnl = (exit.price - position.entry) * position.quantity * dir;
        updatePosition(position.id, {
          status: "closed",
          closedAt: Date.now(),
          exitPrice: exit.price,
          pnl,
        });
        closed.push({
          id: position.id,
          symbol: position.symbol,
          exit: exit.price,
          reason: exit.reason,
          pnl: Math.round(pnl * 100) / 100,
        });
      }
    } catch {
      /* skip symbols with no price */
    }
  }

  return closed;
}

export async function executeFromSignal({
  symbol,
  interval = "5m",
  equity,
  riskPct = 1,
  feePct = 0.1,
  maxLeverage = 10,
  mode = "paper",
  confirm = false,
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
    scaleByConfidence: true,
    feePct,
    maxLeverage,
  });

  const orderCaps = capNotional(size.notional, equity);

  const result = await placeOrder({
    symbol: signal.symbol,
    side: signal.direction === "long" ? "buy" : "sell",
    notional: orderCaps.notional,
    entry: size.entry,
    stop: size.stop,
    takeProfit: signal.plan.targets[0],
    mode,
    confirm,
    source: "signal",
  });

  return {
    signal: {
      symbol: signal.symbol,
      direction: signal.direction,
      score: signal.score,
      confidence: signal.confidence,
      alignment: signal.alignment,
    },
    size,
    orderCaps,
    order: result.order,
    position: result.position,
  };
}

export async function autoTrade({
  equity = 10000,
  riskPct = 1,
  interval = "5m",
  limit = 3,
  mode = "paper",
  confirm = false,
} = {}) {
  if (!autoEnabled()) {
    throw new Error("Auto-trade is disabled (set ENABLE_AUTO_TRADE=true)");
  }
  if (isKilled()) throw new Error("Kill switch is ON — auto-trade disabled");

  const result = await scan({ interval, limit: 10, minScore: 25 });
  const opportunities = result.opportunities
    .filter((o) => o.alignment === "aligned" && o.plan)
    .slice(0, Math.max(1, Math.min(Number(limit) || 3, 10)));

  const outcomes = [];

  for (const opportunity of opportunities) {
    try {
      const size = sizeTrade({
        equity,
        riskPct,
        entry: opportunity.plan.entry,
        stop: opportunity.plan.stop,
        targets: opportunity.plan.targets,
        side: opportunity.direction,
        confidence: opportunity.confidence,
        scaleByConfidence: true,
      });

      const orderCaps = capNotional(size.notional, equity);

      const placed = await placeOrder({
        symbol: opportunity.symbol,
        side: opportunity.direction === "long" ? "buy" : "sell",
        notional: orderCaps.notional,
        entry: size.entry,
        stop: size.stop,
        takeProfit: opportunity.plan.targets[0],
        mode,
        confirm,
        source: "auto",
      });

      outcomes.push({
        symbol: opportunity.symbol,
        status: "placed",
        quantity: placed.position.quantity,
        capped: orderCaps.capped,
        warnings: orderCaps.warnings,
      });
    } catch (err) {
      outcomes.push({
        symbol: opportunity.symbol,
        status: "skipped",
        error: err.message,
      });
    }
  }

  return {
    scanned: result.scanned,
    candidates: opportunities.length,
    placed: outcomes.filter((o) => o.status === "placed").length,
    outcomes,
  };
}

export function getOrders(limit = 50) {
  return listOrders(limit);
}

export function getPositions({ status = "", limit = 100 } = {}) {
  return listPositions({ status, limit });
}

export async function liveBalances() {
  if (!liveEnabled()) {
    throw new Error("Live trading is disabled (set ENABLE_LIVE_TRADING=true)");
  }
  return accountBalances();
}
