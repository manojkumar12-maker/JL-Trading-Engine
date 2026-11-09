# JL Trading Engine

Crypto signal + paper/live trading engine with multi-timeframe confluence, backtesting, calibration, and React dashboard.

## Requirements

- **Node.js ≥ 22.5**
- Internet access (exchange APIs + news)

## Quick start

```bash
# 1. Install dependencies
npm run setup
# or:
# npm install && npm --prefix client install

# 2. Config (optional)
cp .env.example .env
# Edit .env — keep ENABLE_LIVE_TRADING=false until you are ready

# 3. Run API + dashboard together
npm run dev:all
```

- API: http://localhost:3001  
- Dashboard (Vite): http://localhost:5173 (proxied to API)

### Separate terminals

```bash
npm run dev      # API on :3001
npm run client   # UI on :5173
```

### Production-style

```bash
npm run build
npm start        # serves API + built client static files
```

## High win-rate mode (≈70–80% historical target)

Signals were tightened for **selectivity over frequency**. The calibrated
defaults live in `lib/signals/defaults.js` (`HIGH_WR`) and are shared by the
signal engine, backtester, screener, calibrator, agents, and executer:

| Setting | Default |
|---------|---------|
| Stop loss | **2.2 × ATR** (wider) |
| First take profit | **0.8 × ATR** (closer, higher hit rate) |
| Additional targets | 1.5 × ATR, 2.2 × ATR |
| Actionable score | **≥ 35** |
| Confidence floor | **≥ 70** |

Quality filters:

| Filter | Behavior |
|--------|----------|
| HTF alignment | All confirmation timeframes must agree |
| RSI | Blocks overbought longs / oversold shorts |
| Volume | Requires volume ratio ≥ 0.85 |
| MACD | Histogram must agree with direction |
| Volatility | Skips dead or extreme ATR% regimes |

Plans are tagged `mode: "high_wr"` and include the `params` used.

**Important:** 70–80% win rate is a **historical calibration target**, not a guarantee. Expect fewer trades. Always paper-trade first. Out-of-sample and live results will differ.

### Re-calibrating per symbol / timeframe

Defaults were calibrated on BTC/USDT 5m over a mostly bearish sample, so they
can be long/short skewed. Re-run calibration whenever you change symbol,
timeframe, or market regime, then promote only configs that keep **out-of-sample
profit factor > 1** and **positive expectancy**:

```bash
curl -X POST http://localhost:3001/api/calibrate \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USDT","interval":"5m","days":30,"targetWinRate":0.75,"targetProfitFactor":1.2,"minTrades":12}'
```

Default grids include the current calibrated point
(`stopAtr 2.2`, `tpAtr 0.8`, `minScore 35`, `minConfidence 70`). If the
recommended params change, update `HIGH_WR` in `lib/signals/defaults.js` so the
whole engine follows.

### Backtest (uses the calibrated defaults)

```bash
curl -X POST http://localhost:3001/api/backtest \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USDT","interval":"5m","days":30}'
```

Override any of `minScore`, `minConfidence`, `stopAtr`, `tpAtr` in the body if
you are testing a different calibration.

## Safety defaults

- `ENABLE_LIVE_TRADING=false`
- `ENABLE_AUTO_TRADE=false`
- `BINANCE_TESTNET=true`
- Paper trading is the default execution path

## Docker / Fly.io

```bash
docker build -t jl-trading-engine .
docker run --rm -p 3001:3001 --env-file .env jl-trading-engine
```

`fly.toml` is included for Fly.io deployment.

## Project layout

```
server.js          Fastify REST API
ws.js              WebSocket live feed
db.js              SQLite storage
lib/crypto/        Multi-exchange klines
lib/signals/       MTF scoring + screener (high-WR filters)
lib/backtest/      Historical simulation
lib/calibration/   Parameter search for target win rate
lib/executer/      Paper + Binance futures execution
lib/sizer/         Position sizing
client/            React + Vite + Tailwind dashboard
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `node:sqlite` errors | Use Node ≥ 22.5 |
| Empty markets / klines | Check network; try `refresh=1` on `/api/markets` |
| No signals | Expected with high-WR filters — lower `minScore` temporarily or scan more symbols |
| Client blank | Run `npm --prefix client install` and `npm run client` |
| Live orders fail | Confirm keys, `BINANCE_TESTNET`, and `ENABLE_LIVE_TRADING=true` only when intentional |
