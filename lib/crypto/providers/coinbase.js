import { fetchJson } from "../http.js";
import { acquire, ProviderState } from "../limiter.js";
import { sortCandles } from "../interval.js";

const BASE = "https://api.exchange.coinbase.com";

const MAP = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
};

export function createCoinbase() {
  const state = new ProviderState({
    id: "coinbase",
    name: "Coinbase",
    priority: 2,
    maxPerWindow: 90,
    windowMs: 60_000,
  });

  return {
    state,

    async listMarkets() {
      await acquire(state);
      const data = await fetchJson(`${BASE}/products`);
      return (data || [])
        .filter((p) => p.status === "online" && !p.trading_disabled && p.base_currency && p.quote_currency)
        .map((p) => ({ base: p.base_currency, quote: p.quote_currency, raw: p.id }));
    },

    async fetchKlines({ raw, interval, limit = 300 }) {
      const gran = MAP[interval];
      if (!gran) throw new Error(`Coinbase does not support interval ${interval}`);

      const count = Math.min(limit, 300);
      const end = Date.now();
      const start = end - count * gran * 1000;
      await acquire(state);

      const url =
        `${BASE}/products/${encodeURIComponent(raw)}/candles` +
        `?granularity=${gran}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
      const data = await fetchJson(url);

      const candles = (data || []).map((c) => ({
        t: c[0] * 1000,
        o: c[3],
        h: c[2],
        l: c[1],
        c: c[4],
        v: c[5],
      }));

      return sortCandles(candles).slice(-count);
    },

    async fetchHistory({ raw, interval, from, to }) {
      const gran = MAP[interval];
      if (!gran) throw new Error(`Coinbase does not support interval ${interval}`);

      const stepMs = gran * 1000;
      const windowMs = 300 * stepMs;
      const out = [];
      let cursor = from;

      for (let page = 0; page < 80 && cursor < to; page++) {
        const end = Math.min(cursor + windowMs, to);
        await acquire(state);

        const url =
          `${BASE}/products/${encodeURIComponent(raw)}/candles` +
          `?granularity=${gran}&start=${new Date(cursor).toISOString()}&end=${new Date(end).toISOString()}`;
        const data = await fetchJson(url);

        for (const c of data || []) {
          out.push({ t: c[0] * 1000, o: c[3], h: c[2], l: c[1], c: c[4], v: c[5] });
        }

        cursor = end;
      }

      return sortCandles(out);
    },
  };
}
