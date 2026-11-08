export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function round(value, digits = 6) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!values.length) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, hist };
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  const pctB = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i];
    const variance = slice.reduce((sum, v) => sum + (v - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    pctB[i] = sd === 0 ? 0.5 : (values[i] - lower[i]) / (upper[i] - lower[i]);
  }

  return { mid, upper, lower, pctB };
}

export function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;

  const trs = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prevClose = candles[i - 1].c;
    return Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
  });

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let prev = sum / period;
  out[period] = prev;

  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }

  return out;
}
