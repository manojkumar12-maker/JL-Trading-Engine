import { readFileSync } from "node:fs";

const HOUR_MS = 3_600_000;

export const PERP_MOMENTUM_CONFIG = {
  universe: { minVolume: 5e6, maxVolume: 1.5e8, maxSymbols: 80 },
  lookbackHours: 72,
  holdHours: 24,
  topN: 10,
  regimeDays: 20,
  targetVol: 0.25,
  drawdownStop: 0.25,
  drawdownPauseDays: 10,
  costPerSide: 0.0006,
  fundingPerDay: 0.0003,
  stress: { costPerSide: 0.0012, fundingPerDay: 0.0009 },
};

export const EXCLUDED_SYMBOLS = new Set([
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
  "ADAUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT",
  "TRXUSDT", "TONUSDT", "SUIUSDT", "USDCUSDT", "FDUSDUSDT", "TUSDUSDT",
  "BUSDUSDT", "DAIUSDT", "EURUSDT",
]);

export function selectUniverseSymbols(exchangeInfo, tickers, config = PERP_MOMENTUM_CONFIG) {
  const volumes = new Map(tickers.map((t) => [t.symbol, Number(t.quoteVolume)]));
  const { minVolume, maxVolume, maxSymbols } = config.universe;

  return (exchangeInfo.symbols || [])
    .filter(
      (s) =>
        s.contractType === "PERPETUAL" &&
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        !EXCLUDED_SYMBOLS.has(s.symbol) &&
        !/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset)
    )
    .map((s) => ({ symbol: s.symbol, volume: volumes.get(s.symbol) || 0 }))
    .filter((s) => s.volume >= minVolume && s.volume <= maxVolume)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, maxSymbols)
    .map((s) => s.symbol);
}

export function loadPanel(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const symbols = Object.keys(data).filter((s) => data[s].length > 200);
  const maps = new Map(
    symbols.map((s) => [s, new Map(data[s].map((k) => [k[0], k[4]]))])
  );

  let master = null;
  for (const symbol of symbols) {
    if (!master || data[symbol].length > master.length) master = data[symbol];
  }

  return { symbols, maps, times: master.map((k) => k[0]) };
}

function stats(returns) {
  const n = returns.length;
  if (!n) {
    return { periods: 0, totalReturn: 0, avg: 0, sharpe: 0, maxDrawdown: 0, winRate: 0, profitFactor: 0 };
  }
  const total = returns.reduce((eq, r) => eq * (1 + r), 1) - 1;
  const avg = returns.reduce((a, b) => a + b, 0) / n;
  const variance =
    returns.reduce((a, r) => a + (r - avg) ** 2, 0) / Math.max(1, n - 1);
  const sd = Math.sqrt(variance);
  const sharpe = sd > 0 ? (avg / sd) * Math.sqrt(365) : 0;

  let peak = 1;
  let equity = 1;
  let maxDrawdown = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }

  const wins = returns.filter((r) => r > 0).length;
  const grossProfit = returns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = -returns.filter((r) => r < 0).reduce((a, b) => a + b, 0);

  return {
    periods: n,
    totalReturn: +(total * 100).toFixed(2),
    avgDaily: +(avg * 100).toFixed(3),
    sharpe: +sharpe.toFixed(2),
    maxDrawdown: +(maxDrawdown * 100).toFixed(1),
    winRate: +((wins / n) * 100).toFixed(1),
    profitFactor: +(grossLoss > 0 ? grossProfit / grossLoss : 99).toFixed(2),
  };
}

function rawSeries(panel, config, costs = config) {
  const lookbackMs = config.lookbackHours * HOUR_MS;
  const holdMs = config.holdHours * HOUR_MS;
  const roundTrip = costs.costPerSide * 2 + costs.fundingPerDay * (config.holdHours / 24);
  const series = [];

  for (let i = 0; i < panel.times.length; i += 1) {
    if (i % config.holdHours !== 0) continue;
    const t = panel.times[i];
    if (t - lookbackMs < panel.times[0] || t + holdMs > panel.times.at(-1)) continue;

    const rows = [];
    for (const symbol of panel.symbols) {
      const prices = panel.maps.get(symbol);
      const past = prices.get(t - lookbackMs);
      const now = prices.get(t);
      const future = prices.get(t + holdMs);
      if (past > 0 && now > 0 && future > 0) {
        rows.push({
          symbol,
          pastReturn: now / past - 1,
          forwardReturn: future / now - 1,
        });
      }
    }

    if (rows.length < Math.max(30, config.topN * 2)) continue;

    rows.sort((a, b) => b.pastReturn - a.pastReturn);
    const top = rows.slice(0, config.topN);
    const selected = top.reduce((sum, r) => sum + r.forwardReturn, 0) / config.topN;
    const basket = rows.reduce((sum, r) => sum + r.forwardReturn, 0) / rows.length;

    series.push({
      t,
      rawReturn: selected - roundTrip,
      benchmarkReturn: basket - roundTrip,
    });
  }

  return series;
}

function applyOverlay(series, config, costSeries = series) {
  const returns = [];
  const stressReturns = [];
  const exposures = [];
  let equity = 1;
  let peak = 1;
  let pausedUntil = -1;

  for (let i = 0; i < series.length; i += 1) {
    let regime = false;
    if (i >= config.regimeDays) {
      let cumulative = 1;
      for (let j = i - config.regimeDays + 1; j <= i; j += 1) {
        cumulative *= 1 + series[j].benchmarkReturn;
      }
      regime = cumulative > 1;
    }

    let volScale = 1;
    if (i >= 30) {
      const window = series.slice(i - 30, i).map((x) => x.rawReturn);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const sd = Math.sqrt(
        window.reduce((a, r) => a + (r - mean) ** 2, 0) / (window.length - 1)
      );
      const annualVol = sd * Math.sqrt(365);
      volScale = annualVol > 0 ? Math.min(1, config.targetVol / annualVol) : 1;
    }

    const paused = i < pausedUntil;
    const exposure = regime && !paused ? volScale : 0;
    const ret = exposure * series[i].rawReturn;
    const stressRet = exposure * (costSeries[i]?.rawReturn ?? series[i].rawReturn);

    returns.push(ret);
    stressReturns.push(stressRet);
    exposures.push(exposure);

    equity *= 1 + ret;
    peak = Math.max(peak, equity);
    if ((peak - equity) / peak > config.drawdownStop && i >= pausedUntil) {
      pausedUntil = i + config.drawdownPauseDays;
    }
  }

  return { returns, stressReturns, exposures };
}

export function backtestPanel(panel, config = PERP_MOMENTUM_CONFIG) {
  const base = rawSeries(panel, config);
  const stress = rawSeries(panel, config, config.stress);
  const overlay = applyOverlay(base, config, stress);

  let basketPeak = 1;
  const benchmarkReturns = [];
  for (const row of base) {
    basketPeak *= 1 + row.benchmarkReturn;
    benchmarkReturns.push(row.benchmarkReturn);
  }

  return {
    config,
    periods: base.length,
    raw: stats(base.map((x) => x.rawReturn)),
    benchmark: stats(benchmarkReturns),
    overlay: stats(overlay.returns),
    stress: stats(overlay.stressReturns),
    averageExposure:
      overlay.exposures.length
        ? +(overlay.exposures.reduce((a, b) => a + b, 0) / overlay.exposures.length * 100).toFixed(1)
        : 0,
    series: base.map((row, i) => ({
      t: row.t,
      rawReturn: row.rawReturn,
      benchmarkReturn: row.benchmarkReturn,
      overlayReturn: overlay.returns[i],
      exposure: overlay.exposures[i],
    })),
  };
}

export function currentTargets(panel, config = PERP_MOMENTUM_CONFIG) {
  const result = backtestPanel(panel, config);
  const last = result.series.at(-1);
  if (!last) throw new Error("No complete periods to compute targets");

  const t = panel.times.filter((x) => x <= last.t).at(-1);
  const lookbackMs = config.lookbackHours * HOUR_MS;
  const rows = [];

  for (const symbol of panel.symbols) {
    const prices = panel.maps.get(symbol);
    const past = prices.get(t - lookbackMs);
    const now = prices.get(t);
    if (past > 0 && now > 0) {
      rows.push({ symbol, price: now, pastReturn: now / past - 1 });
    }
  }

  rows.sort((a, b) => b.pastReturn - a.pastReturn);
  const top = rows.slice(0, config.topN);
  const exposure = last.exposure;
  const weight = exposure / config.topN;

  return {
    asOf: t,
    asOfIso: new Date(t).toISOString(),
    regime: exposure > 0,
    exposure,
    targets: top.map((row) => ({
      symbol: row.symbol,
      price: row.price,
      pastReturn3d: +(row.pastReturn * 100).toFixed(2),
      weight,
    })),
    overlayReturnLast: last.overlayReturn,
  };
}
