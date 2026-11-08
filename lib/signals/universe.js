import { getMarkets } from "../crypto/index.js";
import { fetchJson } from "../crypto/http.js";
import { acquire, ProviderState } from "../crypto/limiter.js";

const binanceState = new ProviderState({
  id: "ticker-binance",
  name: "Binance ticker",
  maxPerWindow: 20,
  windowMs: 60_000,
});
const bybitState = new ProviderState({
  id: "ticker-bybit",
  name: "Bybit ticker",
  maxPerWindow: 20,
  windowMs: 60_000,
});
const okxState = new ProviderState({
  id: "ticker-okx",
  name: "OKX ticker",
  maxPerWindow: 20,
  windowMs: 60_000,
});
const oiState = new ProviderState({
  id: "bybit-oi",
  name: "Bybit OI",
  maxPerWindow: 20,
  windowMs: 60_000,
});

const QUOTES = new Set(["USDT", "USDC", "USD"]);
const MIN_QUOTE_VOLUME = 1_000_000;

function buildMaps(markets) {
  const maps = { binance: {}, bybit: {}, okx: {} };
  for (const market of markets.list) {
    for (const [providerId, raw] of Object.entries(market.providers || {})) {
      if (maps[providerId]) maps[providerId][raw] = market.symbol;
    }
  }
  return maps;
}

async function binanceTickers(maps) {
  await acquire(binanceState);
  const data = await fetchJson("https://api.binance.com/api/v3/ticker/24hr", {
    timeoutMs: 15_000,
  });
  const out = [];
  for (const t of data || []) {
    const symbol = maps.binance[t.symbol];
    if (!symbol) continue;
    out.push({
      symbol,
      price: Number(t.lastPrice),
      changePct: Number(t.priceChangePercent),
      quoteVolume: Number(t.quoteVolume),
      source: "binance",
    });
  }
  return out;
}

async function bybitTickers(maps) {
  await acquire(bybitState);
  const data = await fetchJson(
    "https://api.bybit.com/v5/market/tickers?category=spot",
    { timeoutMs: 15_000 }
  );
  const out = [];
  for (const t of data.result?.list || []) {
    const symbol = maps.bybit[t.symbol];
    if (!symbol) continue;
    out.push({
      symbol,
      price: Number(t.lastPrice),
      changePct: Number(t.price24hPcnt) * 100,
      quoteVolume: Number(t.turnover24h),
      source: "bybit",
    });
  }
  return out;
}

async function okxTickers(maps) {
  await acquire(okxState);
  const data = await fetchJson(
    "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
    { timeoutMs: 15_000 }
  );
  const out = [];
  for (const t of data.data || []) {
    const symbol = maps.okx[t.instId];
    if (!symbol) continue;
    const last = Number(t.last);
    const open = Number(t.open24h);
    out.push({
      symbol,
      price: last,
      changePct: open ? ((last - open) / open) * 100 : 0,
      quoteVolume: Number(t.volCcy24h),
      source: "okx",
    });
  }
  return out;
}

async function openInterestChange(symbol) {
  const raw = symbol.replace(/[^A-Za-z0-9]/g, "");
  try {
    await acquire(oiState);
    const data = await fetchJson(
      `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${raw}&intervalTime=1h&limit=2`,
      { timeoutMs: 8000 }
    );
    const list = data.result?.list || [];
    if (list.length < 2) return null;
    const recent = Number(list[0].openInterest);
    const prev = Number(list[1].openInterest);
    if (!prev) return null;
    return ((recent - prev) / prev) * 100;
  } catch {
    return null;
  }
}

async function withConcurrency(items, worker, concurrency = 3) {
  const results = new Array(items.length);
  let index = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index++;
        results[current] = await worker(items[current], current);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

export async function getMovers({
  limit = 15,
  minVolumeQuote = MIN_QUOTE_VOLUME,
  oi = true,
} = {}) {
  const count = Math.max(1, Math.min(Number(limit) || 15, 50));
  const markets = await getMarkets();
  const maps = buildMaps(markets);

  const results = await Promise.allSettled([
    binanceTickers(maps),
    bybitTickers(maps),
    okxTickers(maps),
  ]);

  const errors = [];
  const records = [];

  results.forEach((result, i) => {
    const label = ["binance", "bybit", "okx"][i];
    if (result.status === "fulfilled") records.push(...result.value);
    else errors.push({ source: label, error: result.reason?.message || "failed" });
  });

  const bySymbol = new Map();
  for (const rec of records) {
    const quote = rec.symbol.split("/")[1];
    if (!QUOTES.has(quote)) continue;
    if (!(rec.price > 0) || !(rec.quoteVolume >= minVolumeQuote)) continue;
    const existing = bySymbol.get(rec.symbol);
    if (!existing || rec.quoteVolume > existing.quoteVolume) {
      bySymbol.set(rec.symbol, rec);
    }
  }

  let movers = [...bySymbol.values()].map((rec) => ({
    ...rec,
    heat: Math.abs(rec.changePct) + Math.log10(rec.quoteVolume + 1) * 2,
    oiChangePct: null,
  }));

  movers.sort((a, b) => b.heat - a.heat);

  const pool = movers.slice(0, Math.min(movers.length, count * 2, 20));

  if (oi) {
    await withConcurrency(
      pool,
      async (mover) => {
        const change = await openInterestChange(mover.symbol);
        if (change != null) {
          mover.oiChangePct = change;
          mover.heat += Math.min(5, Math.abs(change)) * 0.8;
        }
      },
      3
    );
    pool.sort((a, b) => b.heat - a.heat);
  }

  movers = pool.slice(0, count);

  return movers.map((m) => ({
    symbol: m.symbol,
    price: m.price,
    changePct: Math.round(m.changePct * 100) / 100,
    quoteVolume: m.quoteVolume,
    oiChangePct: m.oiChangePct == null ? null : Math.round(m.oiChangePct * 100) / 100,
    heat: Math.round(m.heat * 100) / 100,
    source: m.source,
  }));
}
