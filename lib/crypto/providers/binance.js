import { fetchJson } from "../http.js";
import { acquire, ProviderState } from "../limiter.js";
import { INTERVALS, sortCandles } from "../interval.js";

const BASE = "https://api.binance.com";

const MAP = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "12h": "12h",
  "1d": "1d",
  "3d": "3d",
  "1w": "1w",
};

export function createBinance() {
  const state = new ProviderState({
    id: "binance",
    name: "Binance",
    priority: 1,
    maxPerWindow: 60,
    windowMs: 60_000,
  });

  return {
    state,

    async listMarkets() {
      await acquire(state);
      const data = await fetchJson(`${BASE}/api/v3/exchangeInfo`);
      return (data.symbols || [])
        .filter((s) => s.status === "TRADING" && s.isSpotTradingAllowed !== false)
        .map((s) => ({ base: s.baseAsset, quote: s.quoteAsset, raw: s.symbol }));
    },

    async fetchKlines({ raw, interval, limit = 500 }) {
      const iv = MAP[interval];
      if (!iv) throw new Error(`Binance does not support interval ${interval}`);
      await acquire(state);
      const url = `${BASE}/api/v3/klines?symbol=${encodeURIComponent(raw)}&interval=${iv}&limit=${Math.min(limit, 1000)}`;
      const data = await fetchJson(url);
      return sortCandles(
        data.map((k) => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] }))
      );
    },

    async fetchHistory({ raw, interval, from, to }) {
      const iv = MAP[interval];
      if (!iv) throw new Error(`Binance does not support interval ${interval}`);
      const step = INTERVALS[interval];
      const out = [];
      let start = from;

      for (let page = 0; page < 40 && start < to; page++) {
        await acquire(state);
        const url =
          `${BASE}/api/v3/klines?symbol=${encodeURIComponent(raw)}&interval=${iv}` +
          `&startTime=${start}&endTime=${to}&limit=1000`;
        const data = await fetchJson(url);
        if (!data.length) break;

        for (const k of data) {
          out.push({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] });
        }

        const last = data[data.length - 1][0];
        if (last + step <= start) break;
        start = last + step;
      }

      return sortCandles(out);
    },
  };
}
