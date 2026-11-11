# Perp Momentum Engine

Validated low-cap perpetuals momentum strategy with a paper-trading engine and
React dashboard.

## Strategy

- Universe: top 80 Binance USDT-M perpetuals by 24h volume in the `$5M–$150M`
  band, excluding majors, stablecoins, and leveraged tokens.
- Entry: rank by 72h return and long the top 10, rebalanced daily.
- Risk overlay: trade only while the equal-weight universe is above its 20-day
  return; scale exposure to a 25% annualized volatility target; pause 10 days
  after a 25% drawdown.
- Costs: 0.06% per side plus 0.03%/day funding. Stress test: 2x fees, 3x
  funding.

## Backtest evidence (net of costs)

| Dataset | Overlay return | Sharpe | Max DD | 2x-cost return |
|---|---|---|---|---|
| Primary universe, current year | +39.7% | 2.05 | 7.0% | +27.7% |
| Primary universe, prior year | +17.4% | 0.76 | 23.1% | +9.5% |
| Unseen alt universe, current year | +64.4% | 2.11 | 6.7% | +52.2% |
| Unseen alt universe, prior year (short sample) | −1.6% | −0.12 | 10.7% | −3.5% |

The equal-weight benchmark lost 15.5% and 47.0% in the two primary years, so
this is timing + cross-sectional momentum, not beta. Three of four independent
tests are positive after 2x costs. Survivorship bias and the funding
approximation remain. Paper-trade first.

## Quick start

```bash
npm run setup
npm run build
npm start
# open http://localhost:3001
```

## Refresh data

```bash
node scripts/perp-fetch.mjs 365 data/perp-klines-365.json
```

## API

- `GET /api/health`
- `GET /api/perp/status`
- `GET /api/perp/backtest?dataset=current|prior|alt|alt-prior`
- `POST /api/perp/rebalance`
- `POST /api/perp/reset`
- `GET /api/perp/history`

## Configuration

```env
PORT=3001
PERP_EQUITY_USD=10000
# PERP_DATA_FILE=data/perp-klines-365.json
```

## Project layout

```
server.js          Fastify API + static dashboard
db.js              SQLite (paper state, positions, events)
lib/perp/          Strategy, paper portfolio, storage
scripts/           Data fetch + backtest CLI
client/            React + Vite + Tailwind dashboard
```

Paper only. No live order execution is enabled.
