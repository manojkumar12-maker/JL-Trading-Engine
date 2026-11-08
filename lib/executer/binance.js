import { createHmac } from "node:crypto";
import { fetchJson } from "../crypto/http.js";

const TESTNET = process.env.BINANCE_TESTNET !== "false";
const FUTURES_BASE = TESTNET
  ? "https://testnet.binancefuture.com"
  : "https://fapi.binance.com";

function credentials() {
  const apiKey = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !secret) {
    throw new Error(
      "Binance API keys not configured (BINANCE_API_KEY / BINANCE_API_SECRET)"
    );
  }
  return { apiKey, secret };
}

function sign(query, secret) {
  return createHmac("sha256", secret).update(query).digest("hex");
}

async function signedFutures(method, path, params = {}) {
  const { apiKey, secret } = credentials();
  const qs = new URLSearchParams({
    ...params,
    timestamp: String(Date.now()),
    recvWindow: "5000",
  }).toString();
  const signature = sign(qs, secret);
  const url = `${FUTURES_BASE}${path}?${qs}&signature=${signature}`;
  return fetchJson(url, {
    method,
    headers: { "X-MBX-APIKEY": apiKey },
    timeoutMs: 15_000,
  });
}

export function binanceSymbol(symbol) {
  return String(symbol || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function formatQty(value, decimals) {
  return value.toFixed(decimals).replace(/\.?0+$/, "") || "0";
}

let futuresFilters = null;

async function getFuturesFilters() {
  if (!futuresFilters) {
    const data = await fetchJson(`${FUTURES_BASE}/fapi/v1/exchangeInfo`, {
      timeoutMs: 15_000,
    });
    futuresFilters = new Map(
      (data.symbols || []).map((s) => [s.symbol, s.filters || []])
    );
  }
  return futuresFilters;
}

async function getFuturesStep(rawSymbol) {
  const filters = await getFuturesFilters();
  const list = filters.get(rawSymbol) || [];
  const filter = list.find((f) => f.filterType === "LOT_SIZE");
  const stepStr = filter?.stepSize || "0.001";
  const step = Number(stepStr);
  const decimals = stepStr.includes(".")
    ? stepStr.split(".")[1].replace(/0+$/, "").length
    : 0;
  return { step, decimals };
}

export async function setFuturesLeverage(symbol, leverage) {
  return signedFutures("POST", "/fapi/v1/leverage", {
    symbol: binanceSymbol(symbol),
    leverage: String(Math.max(1, Number(leverage) || 1)),
  });
}

export async function setFuturesMarginType(symbol, marginType = "ISOLATED") {
  try {
    return await signedFutures("POST", "/fapi/v1/marginType", {
      symbol: binanceSymbol(symbol),
      marginType,
    });
  } catch {
    return null;
  }
}

export async function placeFuturesMarketOrder({
  symbol,
  side,
  quantity,
  leverage,
  marginType = "ISOLATED",
}) {
  const raw = binanceSymbol(symbol);
  const { step, decimals } = await getFuturesStep(raw);
  const qty = Math.floor(quantity / step) * step;
  if (!(qty > 0)) {
    throw new Error(`quantity below Binance futures step size (${step})`);
  }

  if (leverage) await setFuturesLeverage(raw, leverage);
  await setFuturesMarginType(raw, marginType);

  const result = await signedFutures("POST", "/fapi/v1/order", {
    symbol: raw,
    side: side === "buy" ? "BUY" : "SELL",
    type: "MARKET",
    quantity: formatQty(qty, decimals),
    newOrderRespType: "RESULT",
  });

  return {
    ...result,
    executedQty: Number(result.executedQty) || qty,
    avgPrice: Number(result.avgPrice) || Number(result.price) || null,
  };
}

export async function closeFuturesPosition({ symbol, side, quantity }) {
  const raw = binanceSymbol(symbol);
  const { step, decimals } = await getFuturesStep(raw);
  const qty = Math.floor(quantity / step) * step;
  return signedFutures("POST", "/fapi/v1/order", {
    symbol: raw,
    side: side === "buy" ? "BUY" : "SELL",
    type: "MARKET",
    quantity: formatQty(qty, decimals),
    reduceOnly: "true",
    newOrderRespType: "RESULT",
  });
}

export async function futuresBalances() {
  return signedFutures("GET", "/fapi/v2/balance", {});
}

export async function futuresPositions() {
  return signedFutures("GET", "/fapi/v2/positionRisk", {});
}

export async function tickerPrice(symbol) {
  const data = await fetchJson(
    `${FUTURES_BASE}/fapi/v1/ticker/price?symbol=${encodeURIComponent(binanceSymbol(symbol))}`,
    { timeoutMs: 10_000 }
  );
  return Number(data.price);
}

export function binanceConfig() {
  return {
    testnet: TESTNET,
    futuresBase: FUTURES_BASE,
    configured: !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
  };
}
