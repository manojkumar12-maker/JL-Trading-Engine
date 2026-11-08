import { fetchJson } from "../http.js";
import { acquire, ProviderState } from "../limiter.js";
import { sortCandles } from "../interval.js";

const BASE = "https://api.kraken.com/0/public";

const MAP = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "12h": 720,
  "1d": 1440,
  "1w": 10080,
};

function resultKey(data) {
  return Object.keys(data.result || {}).find((k) => k !== "last");
}

function parseRows(rows) {
  return (rows || []).map((r) => ({
    t: r[0] * 1000,
    o: r[1],
    h: r[2],
    l: r[3],
    c: r[4],
    v: r[6],
  }));
}

export function createKraken() {
  const state = new ProviderState({
    id: "kraken",
    name: "Kraken",
    priority: 3,
    maxPerWindow: 25,
    windowMs: 60_000,
  });

  return {
    state,

    async listMarkets() {
      await acquire(state);
      const data = await fetchJson(`${BASE}/AssetPairs`);
      return Object.entries(data.result || {})
        .map(([key, v]) => {
          const wsname = v.wsname || "";
          if (!wsname || wsname.includes(".")) return null;
          const [base, quote] = wsname.split("/");
          if (!base || !quote) return null;
          return { base, quote, raw: key };
        })
        .filter(Boolean);
    },

    async fetchKlines({ raw, interval, limit = 500 }) {
      const iv = MAP[interval];
      if (!iv) throw new Error(`Kraken does not support interval ${interval}`);
      await acquire(state);

      const data = await fetchJson(
        `${BASE}/OHLC?pair=${encodeURIComponent(raw)}&interval=${iv}`
      );
      const rows = data.result?.[resultKey(data)] || [];
      return sortCandles(parseRows(rows)).slice(-limit);
    },

    async fetchHistory({ raw, interval, from, to }) {
      const iv = MAP[interval];
      if (!iv) throw new Error(`Kraken does not support interval ${interval}`);

      const out = [];
      let since = Math.floor(from / 1000);

      for (let page = 0; page < 60 && since * 1000 < to; page++) {
        await acquire(state);
        const data = await fetchJson(
          `${BASE}/OHLC?pair=${encodeURIComponent(raw)}&interval=${iv}&since=${since}`
        );
        const rows = data.result?.[resultKey(data)] || [];
        if (!rows.length) break;

        for (const r of parseRows(rows)) {
          if (r.t >= from && r.t <= to) out.push(r);
        }

        const last = rows[rows.length - 1][0];
        if (last <= since) break;
        since = last;
      }

      return sortCandles(out);
    },
  };
}
