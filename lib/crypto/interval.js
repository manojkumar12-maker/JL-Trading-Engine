export const INTERVALS = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
};

export function intervalMs(interval) {
  return INTERVALS[interval] || 0;
}

export const CANONICAL_INTERVALS = Object.keys(INTERVALS);

export function normalizeInterval(value) {
  const v = String(value || "").trim().toLowerCase();
  return INTERVALS[v] ? v : "1h";
}

export function normalizeCandle(c) {
  return {
    t: Number(c.t),
    o: Number(c.o),
    h: Number(c.h),
    l: Number(c.l),
    c: Number(c.c),
    v: Number(c.v || 0),
  };
}

export function sortCandles(candles) {
  return candles
    .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
    .sort((a, b) => a.t - b.t);
}
