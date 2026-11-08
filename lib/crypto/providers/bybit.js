import { fetchJson } from "../http.js";
import { acquire, ProviderState } from "../limiter.js";
import { sortCandles } from "../interval.js";

const BASE = "https://api.bybit.com";

const MAP = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
  "1w": "W",
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

export function createBybit() {
  const state = new ProviderState({
    id: "bybit",
    name: "Bybit",
    priority: 5,
    maxPerWindow: 60,
    windowMs: 60_000,
  });

  return {
    state,

    async listMarkets() {
      const out = [];
      let cursor = "";

      for (let page = 0; page < 10; page++) {
        await acquire(state);
        const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
        const data = await fetchJson(
          `${BASE}/v5/market/instruments-info?category=spot&limit=1000${suffix}`
        );
        const list = data.result?.list || [];

        for (const i of list) {
          if (i.baseCoin && i.quoteCoin) {
            out.push({ base: i.baseCoin, quote: i.quoteCoin, raw: i.symbol });
          }
        }

        cursor = data.result?.nextPageCursor;
        if (!cursor) break;
      }

      return out;
    },

    async fetchKlines({ raw, interval, limit = 500 }) {
      const iv = MAP[interval];
      if (!iv) throw new Error(`Bybit does not support interval ${interval}`);
      await acquire(state);

      const data = await fetchJson(
        `${BASE}/v5/market/kline?category=spot&symbol=${encodeURIComponent(raw)}&interval=${iv}&limit=${Math.min(limit, 1000)}`
      );
      return sortCandles(parseRows(data.result?.list));
    },

    async fetchHistory({ raw, interval, from, to }) {
      const iv = MAP[interval];
      if (!iv) throw new Error(`Bybit does not support interval ${interval}`);

      const out = [];
      let end = to;

      for (let page = 0; page < 60; page++) {
        await acquire(state);
        const data = await fetchJson(
          `${BASE}/v5/market/kline?category=spot&symbol=${encodeURIComponent(raw)}&interval=${iv}&start=${from}&end=${end}&limit=1000`
        );
        const rows = parseRows(data.result?.list);
        if (!rows.length) break;

        let oldest = Infinity;
        for (const r of rows) {
          if (r.t >= from && r.t <= to) out.push(r);
          if (r.t < oldest) oldest = r.t;
        }

        if (oldest <= from || oldest === Infinity) break;
        end = oldest - 1;
      }

      return sortCandles(out);
    },
  };
}
