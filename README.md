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

## Default trading profile

Signals are selective (confluence + quality filters). The defaults live in
`lib/signals/defaults.js` (`HIGH_WR`) and are shared by the signal engine,
backtester, screener, calibrator, agents, and executer:

| Setting | Default |
|---------|---------|
| Stop loss | **1.5 × ATR** |
| First take profit | **1.5 × ATR** (~1:1 R:R) |
| Additional targets | 2.5 × ATR, 3.5 × ATR |
| Actionable score | **≥ 35** |
| Confidence floor | **≥ 70** |
| Backtest fee | **0.05% per side** |
| Backtest slippage | **2 bps per side** |

Quality filters:

| Filter | Behavior |
|--------|----------|
| HTF alignment | All confirmation timeframes must agree |
| RSI | Blocks overbought longs / oversold shorts |
| Volume | Requires volume ratio ≥ 0.85 |
| MACD | Histogram must agree with direction |
| Volatility | Skips dead or extreme ATR% regimes |

Plans are tagged `mode: "high_wr"` and include the `params` used.

### Why not a 0.8 ATR take-profit?

An 80% win rate is easy to manufacture with a tiny target, but it is not
profitable. With TP 0.8 ATR and SL 2.2 ATR:

```
break-even win rate = SL / (SL + TP) = 2.2 / (2.2 + 0.8) ≈ 73.3%
```

That is before fees and slippage, which on scalped 5m trades can consume a large
share of a 0.8 ATR move. A balanced ~1:1 R:R needs only ~50% + costs, so modest
win rates can still be profitable.

**Important:** no win rate is guaranteed. The backtester now charges per-side
fees and slippage; results are net of costs. On recent samples, the current
signal edge is weak after costs on several majors (PF < 1). Treat these as
starting parameters, not a validated money-making system, and paper-trade first.

### Re-calibrating per symbol / timeframe

Re-run calibration whenever you change symbol, timeframe, or market regime, then
promote only configs that keep **out-of-sample profit factor > 1** and
**positive expectancy**:

```bash
curl -X POST http://localhost:3001/api/calibrate \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USDT","interval":"5m","days":30,"targetWinRate":0.55,"targetProfitFactor":1.2,"minTrades":12}'
```

The calibration grid includes the current default geometry
(`stopAtr 1.5`, `tpAtr 1.5`, `minScore 35`, `minConfidence 70`) and charges the
same fees/slippage. If the recommended params change, update `HIGH_WR` in
`lib/signals/defaults.js` so the whole engine follows.

### Backtest (uses the current defaults)

```bash
curl -X POST http://localhost:3001/api/backtest \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USDT","interval":"5m","days":30}'
```

Override `minScore`, `minConfidence`, `stopAtr`, `tpAtr`, `feePct`, or
`slippageBps` in the body to test a different profile. Use `feePct: 0,
slippageBps: 0` only to reproduce the old cost-free figures.

## Autopilot (paper only)

On startup the engine runs a background autopilot that, every 5 minutes aligned
to the candle close:

1. Scans high-moving coins (top movers + liquid fallbacks).
2. Runs the multi-timeframe high-selectivity signal.
3. Opens **paper** positions within the equity/risk limits.
4. The existing 10s loop closes positions on stop/take-profit and records P&L.

It never places live orders. Configuration:

```env
ENABLE_AUTO_PAPER=true          # allow paper auto-trading
AUTOPILOT_ENABLED=true          # start the background loop
AUTOPILOT_INTERVAL_MINUTES=5    # cadence, aligned to candle close
AUTOPILOT_SIGNAL_INTERVAL=5m    # signal timeframe
AUTOPILOT_MAX_TRADES=3          # max new positions per run
EXECUTER_RISK_PCT=1             # risk per trade (% of equity)
```

Live auto-trading still requires all of `ENABLE_LIVE_TRADING=true`,
`ENABLE_AUTO_TRADE=true`, and `confirm: true` on the request. Check status at
`GET /api/autopilot/status`; stop new entries any time with the kill switch
(`POST /api/executer/kill` with `{"enabled":true}`).

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
