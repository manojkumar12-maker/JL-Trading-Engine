import { writeFileSync } from "node:fs";
import { selectUniverseSymbols } from "../lib/perp/momentum.js";

const BASE = "https://fapi.binance.com";
const DAYS = Math.max(30, Math.min(Number(process.argv[2]) || 365, 730));
const OUT = process.argv[3] || `data/perp-klines-${DAYS}.json`;
const END = process.argv[4] ? Number(process.argv[4]) : Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 418) {
      await sleep(2500 * (i + 1));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error("rate limited");
}

const exchangeInfo = await get(`${BASE}/fapi/v1/exchangeInfo`);
const tickers = await get(`${BASE}/fapi/v1/ticker/24hr`);
const symbols = selectUniverseSymbols(exchangeInfo, tickers);
console.log("universe", symbols.length);

const need = DAYS * 24;
async function fetchOne(symbol) {
  let all = [];
  let endTime = END;
  while (all.length < need) {
    const data = await get(
      `${BASE}/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=1000&endTime=${endTime}`
    );
    if (!data.length) break;
    all = data.concat(all);
    endTime = data[0][0] - 1;
    if (data.length < 1000) break;
    await sleep(35);
  }
  return all
    .slice(-need)
    .map((k) => [k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]);
}

const out = {};
for (let i = 0; i < symbols.length; i += 4) {
  const batch = symbols.slice(i, i + 4);
  await Promise.all(
    batch.map(async (symbol) => {
      try {
        out[symbol] = await fetchOne(symbol);
      } catch (err) {
        console.log("ERR", symbol, err.message);
      }
    })
  );
  console.log("fetched", Math.min(i + 4, symbols.length), "/", symbols.length);
  await sleep(120);
}

writeFileSync(OUT, JSON.stringify(out));
console.log("saved", Object.keys(out).length, "symbols to", OUT);
