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

## High win-rate mode (≈75–80% historical target)

Signals were tightened for **selectivity over frequency**:

| Filter | Behavior |
|--------|----------|
| HTF alignment | All confirmation timeframes must agree |
| Score threshold | Default actionable ≥ 40 (was 25) |
| Confidence floor | ≥ 72 required to emit long/short |
| RSI | Blocks overbought longs / oversold shorts |
| Volume | Requires volume ratio ≥ 0.85 |
| MACD | Histogram must agree with direction |
| Volatility | Skips dead or extreme ATR% regimes |
| Plan | Wider stop (1.8 ATR), closer first TP (1.0 ATR) for higher hit rate |

**Important:** 75–80% win rate is a **historical calibration target**, not a guarantee. Expect fewer trades. Always paper-trade first. Out-of-sample and live results will differ.

### Calibrate for your symbol

```bash
# Via API
curl -X POST http://localhost:3001/api/calibrate \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USDT","interval":"5m","days":14,"targetWinRate":0.75}'
```

Default calibration grids favor high win-rate parameter sets (`targetWinRate: 0.75`).

### Backtest with high-WR defaults

```bash
curl -X POST http://localhost:3001/api/backtest \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USDT","interval":"5m","days":14,"minScore":40,"stopAtr":1.8,"tpAtr":1.0}'
```

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
