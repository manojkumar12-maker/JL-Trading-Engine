import { fetchJson } from "./http.js";
import { acquire, ProviderState } from "./limiter.js";
import { getMarkets } from "./index.js";

const states = {
  binance: new ProviderState({ id: "price-binance", name: "Binance price", maxPerWindow: 60, windowMs: 60_000 }),
  coinbase: new ProviderState({ id: "price-coinbase", name: "Coinbase price", maxPerWindow: 60, windowMs: 60_000 }),
  kraken: new ProviderState({ id: "price-kraken", name: "Kraken price", maxPerWindow: 30, windowMs: 60_000 }),
  okx: new ProviderState({ id: "price-okx", name: "OKX price", maxPerWindow: 60, windowMs: 60_000 }),
  bybit: new ProviderState({ id: "price-bybit", name: "Bybit price", maxPerWindow: 60, windowMs: 60_000 }),
};

const ORDER = ["binance", "coinbase", "kraken", "okx", "bybit"];

function resolveSymbol(input, markets) {
  const raw = String(input || "").trim().toUpperCase();
  const direct = markets.list.find((m) => m.symbol === raw);
  if (direct) return direct.symbol;
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  const match = markets.list.find((m) => m.symbol.replace(/[^A-Z0-9]/g, "") === compact);
  return match ? match.symbol : raw;
}

async function fetchPrice(id, raw) {
  const state = states[id];

  if (id === "binance") {
    await acquire(state);
    const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(raw)}`, { timeoutMs: 8000 });
    return Number(data.price);
  }

  if (id === "coinbase") {
    await acquire(state);
    const data = await fetchJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(raw)}/ticker`, { timeoutMs: 8000 });
    return Number(data.price);
  }

  if (id === "kraken") {
    await acquire(state);
    const data = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(raw)}`, { timeoutMs: 8000 });
    const key = Object.keys(data.result || {}).find((k) => k !== "last");
    const row = key ? data.result[key] : null;
    return row ? Number(row.c?.[0]) : null;
  }

  if (id === "okx") {
    await acquire(state);
    const data = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(raw)}`, { timeoutMs: 8000 });
    return Number(data.data?.[0]?.last);
  }

  if (id === "bybit") {
    await acquire(state);
    const data = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(raw)}`, { timeoutMs: 8000 });
    return Number(data.result?.list?.[0]?.lastPrice);
  }

  return null;
}

export async function getTickerPrice(symbol) {
  const markets = await getMarkets();
  const resolved = resolveSymbol(symbol, markets);
  const entry = markets.list.find((m) => m.symbol === resolved);
  if (!entry) throw new Error(`Unknown symbol ${symbol}`);

  let lastError = null;
  for (const id of ORDER) {
    const raw = entry.providers[id];
    if (!raw) continue;
    try {
      const price = await fetchPrice(id, raw);
      if (price > 0) return { symbol: entry.symbol, price, source: id };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`No ticker price for ${entry.symbol}: ${lastError?.message || "unavailable"}`);
}
