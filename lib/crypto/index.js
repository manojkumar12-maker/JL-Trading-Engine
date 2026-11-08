import {
  getCandles,
  getMarketsMeta,
  saveMarkets,
  upsertCandles,
} from "../../db.js";
import { INTERVALS, sortCandles } from "./interval.js";
import { logger } from "../logger.js";
import { createBinance } from "./providers/binance.js";
import { createCoinbase } from "./providers/coinbase.js";
import { createKraken } from "./providers/kraken.js";
import { createOkx } from "./providers/okx.js";
import { createBybit } from "./providers/bybit.js";

const providers = [
  createBinance(),
  createCoinbase(),
  createKraken(),
  createOkx(),
  createBybit(),
];

const byId = Object.fromEntries(providers.map((p) => [p.state.id, p]));

const MARKETS_TTL = 10 * 60_000;
const ASSET_ALIASES = { XBT: "BTC", XDG: "DOGE", XET: "ETH" };

let marketsInFlight = null;
const klineCache = new Map();
const klineInFlight = new Map();

function canonicalAsset(asset) {
  const upper = String(asset || "").toUpperCase();
  return ASSET_ALIASES[upper] || upper;
}

function canonicalSymbol(base, quote) {
  return `${canonicalAsset(base)}/${canonicalAsset(quote)}`;
}

function providerScore(provider) {
  const s = provider.state;
  const available = s.available() ? 100 : -100;
  return available + s.successCount - s.errorCount * 2 - s.priority;
}

export function providerStatus() {
  return providers.map((p) => p.state.status());
}

export async function getMarkets({ refresh = false } = {}) {
  if (!refresh) {
    const stored = getMarketsMeta();
    if (stored && Date.now() - stored.updatedAt < MARKETS_TTL) return stored;
  }
  if (marketsInFlight) return marketsInFlight;

  marketsInFlight = (async () => {
    const results = await Promise.allSettled(providers.map((p) => p.listMarkets()));
    const map = new Map();

    results.forEach((result, index) => {
      const provider = providers[index];
      if (result.status !== "fulfilled") {
        provider.state.errorCount++;
        provider.state.lastError = result.reason?.message || "listMarkets failed";
        logger.warn(
          "provider",
          "list_markets_failed",
          `${provider.state.name}: ${provider.state.lastError}`,
          { provider: provider.state.id }
        );
        return;
      }

      provider.state.successCount++;
      provider.state.lastOkAt = Date.now();

      for (const market of result.value) {
        const symbol = canonicalSymbol(market.base, market.quote);
        let entry = map.get(symbol);
        if (!entry) {
          entry = {
            symbol,
            base: canonicalAsset(market.base),
            quote: canonicalAsset(market.quote),
            providers: {},
          };
          map.set(symbol, entry);
        }
        entry.providers[provider.state.id] = market.raw;
      }
    });

    const list = [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    const updatedAt = Date.now();
    saveMarkets(list, updatedAt);
    return { updatedAt, count: list.length, list };
  })().finally(() => {
    marketsInFlight = null;
  });

  return marketsInFlight;
}

function resolveSymbol(input, markets) {
  const raw = String(input || "").trim().toUpperCase();
  if (!raw) return "";
  const direct = markets.list.find((m) => m.symbol === raw);
  if (direct) return direct.symbol;

  const compact = raw.replace(/[^A-Z0-9]/g, "");
  const match = markets.list.find((m) => m.symbol.replace(/[^A-Z0-9]/g, "") === compact);
  return match ? match.symbol : raw;
}

function orderedProviders(entry) {
  return Object.keys(entry.providers)
    .map((id) => byId[id])
    .filter(Boolean)
    .sort((a, b) => providerScore(b) - providerScore(a));
}

function cacheTtl(interval) {
  const ms = INTERVALS[interval] || 60_000;
  return Math.max(30_000, Math.min(ms / 2, 5 * 60_000));
}

async function resolveEntry(symbol) {
  const markets = await getMarkets();
  const resolved = resolveSymbol(symbol, markets);
  const entry = markets.list.find((m) => m.symbol === resolved);
  if (!entry) {
    throw new Error(`Unknown symbol "${symbol}". Search /api/markets?q=... for available symbols.`);
  }
  return entry;
}

export async function getKlines({ symbol, interval = "1h", limit = 200, refresh = false }) {
  if (!INTERVALS[interval]) throw new Error(`Unsupported interval: ${interval}`);
  const count = Math.max(1, Math.min(Number(limit) || 200, 5000));

  const entry = await resolveEntry(symbol);
  const key = `${entry.symbol}:${interval}`;
  const cached = klineCache.get(key);

  if (!refresh && cached && cached.candles.length >= count && Date.now() - cached.updatedAt < cacheTtl(interval)) {
    return { ...cached, candles: cached.candles.slice(-count), cached: true };
  }

  if (klineInFlight.has(key)) return klineInFlight.get(key);

  const task = (async () => {
    const candidates = orderedProviders(entry);
    let lastError = null;

    for (const provider of candidates) {
      if (!provider.state.available()) continue;

      try {
        const candles = await provider.fetchKlines({
          raw: entry.providers[provider.state.id],
          interval,
          limit: count,
        });
        if (!candles.length) throw new Error("empty response");

        provider.state.successCount++;
        provider.state.lastOkAt = Date.now();

        const trimmed = candles.slice(-count);
        const record = {
          symbol: entry.symbol,
          interval,
          source: provider.state.id,
          candles: trimmed,
          updatedAt: Date.now(),
          cached: false,
        };

        klineCache.set(key, record);
        upsertCandles(entry.symbol, interval, candles, provider.state.id);
        return record;
      } catch (err) {
        provider.state.errorCount++;
        provider.state.lastError = err.message;
        if (err.status === 429 || err.status === 418) {
          provider.state.cooldown((err.retryAfter || 60) * 1000);
        }
        logger.warn(
          "provider",
          "klines_failed",
          `${provider.state.name} ${entry.symbol} ${interval}: ${err.message}`,
          { provider: provider.state.id, symbol: entry.symbol, interval }
        );
        lastError = err;
      }
    }

    const stored = getCandles(entry.symbol, interval, count);
    if (stored.length) {
      return {
        symbol: entry.symbol,
        interval,
        source: "cache",
        candles: stored,
        updatedAt: Date.now(),
        cached: true,
        stale: true,
      };
    }

    throw new Error(`All providers failed for ${entry.symbol}: ${lastError?.message || "unknown error"}`);
  })().finally(() => {
    klineInFlight.delete(key);
  });

  klineInFlight.set(key, task);
  return task;
}

export async function getHistory({ symbol, interval = "1h", days = 30 }) {
  if (!INTERVALS[interval]) throw new Error(`Unsupported interval: ${interval}`);
  const span = Math.max(1, Math.min(Number(days) || 30, 3650));
  const to = Date.now();
  const from = to - span * 86_400_000;

  const entry = await resolveEntry(symbol);
  const candidates = orderedProviders(entry);
  let lastError = null;

  for (const provider of candidates) {
    if (!provider.state.available()) continue;

    try {
      const candles = await provider.fetchHistory({
        raw: entry.providers[provider.state.id],
        interval,
        from,
        to,
      });
      if (!candles.length) throw new Error("empty response");

      provider.state.successCount++;
      provider.state.lastOkAt = Date.now();

      const sorted = sortCandles(candles);
      upsertCandles(entry.symbol, interval, sorted, provider.state.id);

      return {
        symbol: entry.symbol,
        interval,
        source: provider.state.id,
        from,
        to,
        count: sorted.length,
        candles: sorted,
        updatedAt: Date.now(),
        cached: false,
      };
    } catch (err) {
      provider.state.errorCount++;
      provider.state.lastError = err.message;
      if (err.status === 429 || err.status === 418) {
        provider.state.cooldown((err.retryAfter || 60) * 1000);
      }
      logger.warn(
        "provider",
        "history_failed",
        `${provider.state.name} ${entry.symbol} ${interval}: ${err.message}`,
        { provider: provider.state.id, symbol: entry.symbol, interval }
      );
      lastError = err;
    }
  }

  const stored = getCandles(entry.symbol, interval, 5000).filter((c) => c.t >= from);
  if (stored.length) {
    return {
      symbol: entry.symbol,
      interval,
      source: "cache",
      from,
      to,
      count: stored.length,
      candles: stored,
      updatedAt: Date.now(),
      cached: true,
      stale: true,
    };
  }

  throw new Error(`All providers failed for ${entry.symbol} history: ${lastError?.message || "unknown error"}`);
}

export function getStoredCandles(symbol, interval, limit = 500) {
  return getCandles(symbol, interval, limit);
}

export function searchMarkets(markets, query, limit = 1000) {
  const q = String(query || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!q) return markets.list.slice(0, limit);
  return markets.list
    .filter((m) => m.symbol.replace(/[^A-Z0-9]/g, "").includes(q))
    .slice(0, limit);
}
