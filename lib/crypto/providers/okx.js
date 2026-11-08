import { fetchJson } from "../http.js";
import { acquire, ProviderState } from "../limiter.js";
import { sortCandles } from "../interval.js";

const BASE = "https://www.okx.com";

const MAP = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "6h": "6H",
  "12h": "12H",
  "1d": "1D",
  "1w": "1W",
};

function parseRows(rows) {
  return (rows || []).map((r) => ({
    t: Number(r[0]),
    o: r[1],
    h: r[2],
    l: r[3],
    c: r[4],
    v: r[5],
  }));
}

export function createOkx() {
  const state = new ProviderState({
    id: "okx",
    name: "OKX",
    priority: 4,
    maxPerWindow: 60,
    windowMs: 60_000,
  });

  return {
    state,

    async listMarkets() {
      await acquire(state);
      const data = await fetchJson(`${BASE}/api/v5/public/instruments?instType=SPOT`);
      return (data.data || [])
        .filter((i) => i.state === "live" && i.baseCcy && i.quoteCcy)
        .map((i) => ({ base: i.baseCcy, quote: i.quoteCcy, raw: i.instId }));
    },

    async fetchKlines({ raw, interval, limit = 300 }) {
      const bar = MAP[interval];
      if (!bar) throw new Error(`OKX does not support interval ${interval}`);
      await acquire(state);

      const data = await fetchJson(
        `${BASE}/api/v5/market/candles?instId=${encodeURIComponent(raw)}&bar=${bar}&limit=${Math.min(limit, 300)}`
      );
      return sortCandles(parseRows(data.data));
    },

    async fetchHistory({ raw, interval, from, to }) {
      const bar = MAP[interval];
      if (!bar) throw new Error(`OKX does not support interval ${interval}`);

      const out = [];
      let after = to;

      for (let page = 0; page < 80; page++) {
        await acquire(state);
        const data = await fetchJson(
          `${BASE}/api/v5/market/history-candles?instId=${encodeURIComponent(raw)}&bar=${bar}&after=${after}&limit=100`
        );
        const rows = parseRows(data.data);
        if (!rows.length) break;

        let oldest = Infinity;
        for (const r of rows) {
          if (r.t >= from && r.t <= to) out.push(r);
          if (r.t < oldest) oldest = r.t;
        }

        if (oldest <= from || oldest === Infinity) break;
        after = oldest;
      }

      return sortCandles(out);
    },
  };
}
