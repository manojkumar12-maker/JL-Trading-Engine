import {
  getSetting,
  listOpenPositions,
  listPositions,
  setSetting,
} from "../../db.js";

const round = (v, d = 2) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

function envNumber(key, fallback) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DEFAULT_BALANCE = envNumber("ACCOUNT_BALANCE_USD", 50);
const DEPLOY_FRACTION = envNumber("EQUITY_DEPLOY_FRACTION", 0.25);
const MAX_CONCURRENT = Math.max(1, Math.floor(envNumber("EQUITY_MAX_CONCURRENT", 2)));
const DRAWDOWN_THROTTLE = envNumber("EQUITY_DRAWDOWN_THROTTLE", 0.25);
const DRAWDOWN_STOP = envNumber("EQUITY_DRAWDOWN_STOP", 0.5);
const MAX_LEVERAGE = envNumber("MAX_LEVERAGE", 10);

export function getBalance() {
  const raw = getSetting("balance_usd", null);
  const n = raw == null ? DEFAULT_BALANCE : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BALANCE;
}

export function getBalanceSetAt() {
  const raw = getSetting("balance_set_at", null);
  return raw ? Number(raw) : 0;
}

export function getEquityState() {
  const balance = getBalance();
  const since = getBalanceSetAt();

  const closed = listPositions({ status: "closed", limit: 1000 });
  const realized = closed
    .filter((p) => p.closedAt && p.closedAt >= since)
    .reduce((sum, p) => sum + Number(p.pnl || 0), 0);

  const open = listOpenPositions();
  const openNotional = open.reduce(
    (sum, p) => sum + Math.abs((p.entry || 0) * (p.quantity || 0)),
    0
  );
  const marginUsed = MAX_LEVERAGE > 0 ? openNotional / MAX_LEVERAGE : openNotional;

  const equity = Math.max(0, balance + realized);
  const drawdown = balance > 0 ? Math.max(0, (balance - equity) / balance) : 0;
  const throttled = drawdown >= DRAWDOWN_THROTTLE;
  const paused = drawdown >= DRAWDOWN_STOP;

  const deployFraction = throttled ? DEPLOY_FRACTION / 2 : DEPLOY_FRACTION;
  const deployable = equity * deployFraction;
  const reserve = equity * (1 - deployFraction);
  const perTradeMargin = deployable / MAX_CONCURRENT;

  return {
    balance: round(balance),
    equity: round(equity),
    realized: round(realized),
    openNotional: round(openNotional),
    marginUsed: round(marginUsed),
    deployFraction: round(deployFraction, 4),
    deployable: round(deployable),
    reserve: round(reserve),
    maxConcurrent: MAX_CONCURRENT,
    perTradeMargin: round(perTradeMargin),
    perTradeNotionalCap: round(perTradeMargin * MAX_LEVERAGE),
    availableMargin: round(Math.max(0, deployable - marginUsed)),
    drawdownPct: round(drawdown * 100, 2),
    throttled,
    paused,
    maxLeverage: MAX_LEVERAGE,
    policy: {
      deploy: "25% of equity (½ of ½)",
      reserve: "75% reserve",
      split: "equal across up to 2 concurrent trades",
      drawdownThrottle: `${round(DRAWDOWN_THROTTLE * 100, 0)}%`,
      drawdownStop: `${round(DRAWDOWN_STOP * 100, 0)}%`,
    },
  };
}

export function setBalance(balance) {
  const n = Number(balance);
  if (!(n > 0)) throw new Error("balance must be greater than 0");
  setSetting("balance_usd", n);
  setSetting("balance_set_at", Date.now());
  return getEquityState();
}
