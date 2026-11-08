import { createHmac } from "node:crypto";
import { fetchJson } from "../crypto/http.js";

const TESTNET = process.env.BINANCE_TESTNET !== "false";
const BASE = TESTNET ? "https://testnet.binance.vision" : "https://api.binance.com";

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

async function signed(method, path, params = {}) {
  const { apiKey, secret } = credentials();
  const qs = new URLSearchParams({
    ...params,
    timestamp: String(Date.now()),
    recvWindow: "5000",
  }).toString();
  const signature = sign(qs, secret);
  const url = `${BASE}${path}?${qs}&signature=${signature}`;
  return fetchJson(url, {
    method,
    headers: { "X-MBX-APIKEY": apiKey },
    timeoutMs: 15_000,
  });
}

async function publicGet(path) {
  return fetchJson(`${BASE}${path}`, { timeoutMs: 12_000 });
}

export function binanceSymbol(symbol) {
  return String(symbol || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

const stepCache = new Map();

async function getStep(rawSymbol) {
  if (stepCache.has(rawSymbol)) return stepCache.get(rawSymbol);
  const data = await publicGet(
    `/api/v3/exchangeInfo?symbol=${encodeURIComponent(rawSymbol)}`
  );
  const filter = data.symbols?.[0]?.filters?.find((f) => f.filterType === "LOT_SIZE");
  const stepStr = filter?.stepSize || "0.000001";
  const step = Number(stepStr);
  const decimals = stepStr.includes(".")
    ? stepStr.split(".")[1].replace(/0+$/, "").length
    : 0;
  const info = { step, decimals };
  stepCache.set(rawSymbol, info);
  return info;
}

function formatQty(value, decimals) {
  return value.toFixed(decimals).replace(/\.?0+$/, "") || "0";
}

export async function placeMarketOrder({ symbol, side, quantity }) {
  const raw = binanceSymbol(symbol);
  const { step, decimals } = await getStep(raw);
  const qty = Math.floor(quantity / step) * step;
  if (!(qty > 0)) throw new Error(`quantity below Binance step size (${step})`);

  const result = await signed("POST", "/api/v3/order", {
    symbol: raw,
    side: side === "buy" ? "BUY" : "SELL",
    type: "MARKET",
    quantity: formatQty(qty, decimals),
    newOrderRespType: "FULL",
  });

  return {
    ...result,
    executedQty: Number(result.executedQty) || qty,
    avgPrice: Number(result.fills?.[0]?.price) || Number(result.price) || null,
  };
}

export async function accountBalances() {
  return signed("GET", "/api/v3/account", {});
}

export async function tickerPrice(symbol) {
  const data = await publicGet(
    `/api/v3/ticker/price?symbol=${encodeURIComponent(binanceSymbol(symbol))}`
  );
  return Number(data.price);
}

export function binanceConfig() {
  return {
    testnet: TESTNET,
    base: BASE,
    configured: !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
  };
}
