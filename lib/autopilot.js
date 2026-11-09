import { autoTrade, executerStatus } from "./executer/index.js";
import { getEquityState } from "./equity/index.js";
import { logger } from "./logger.js";

// Align runs to candle close so signals are evaluated on completed bars.
const CLOSE_BUFFER_MS = 5_000;

let timer = null;
let running = false;
let lastRunAt = null;
let lastResult = null;
let lastError = null;
let runCount = 0;

function enabled() {
  return process.env.AUTOPILOT_ENABLED !== "false";
}

function cadenceMinutes() {
  const minutes = Number(process.env.AUTOPILOT_INTERVAL_MINUTES) || 5;
  return Math.max(1, Math.min(minutes, 60));
}

function cadenceMs() {
  return cadenceMinutes() * 60_000;
}

function signalInterval() {
  const raw = String(process.env.AUTOPILOT_SIGNAL_INTERVAL || "");
  if (raw) return raw;
  return `${cadenceMinutes()}m`;
}

function maxTrades() {
  const n = Number(process.env.AUTOPILOT_MAX_TRADES || 3);
  return Math.max(1, Math.min(Number.isFinite(n) ? n : 3, 10));
}

async function tick(trigger) {
  if (running) return;
  running = true;
  try {
    const status = executerStatus();
    if (status.killSwitch) {
      lastError = { at: Date.now(), message: "kill switch on" };
      return;
    }

    const equityState = getEquityState();
    if (equityState.paused) {
      lastError = { at: Date.now(), message: "equity engine paused (drawdown stop)" };
      return;
    }

    const result = await autoTrade({
      equity: equityState.equity,
      riskPct: Number(process.env.EXECUTER_RISK_PCT || 1),
      interval: signalInterval(),
      limit: maxTrades(),
      mode: "paper",
    });

    runCount += 1;
    lastRunAt = Date.now();
    lastResult = { ...result, trigger, at: lastRunAt };
    lastError = null;

    logger.info(
      "trade",
      "autopilot",
      `Autopilot ${trigger}: scanned ${result.scanned}, placed ${result.placed}/${result.candidates} (paper)`,
      {
        trigger,
        scanned: result.scanned,
        candidates: result.candidates,
        placed: result.placed,
        equity: equityState.equity,
        outcomes: result.outcomes,
      }
    );
  } catch (err) {
    lastError = { at: Date.now(), message: err.message };
    logger.error("trade", "autopilot_error", err.message, { trigger });
  } finally {
    running = false;
  }
}

function scheduleNext() {
  const period = cadenceMs();
  const now = Date.now();
  const next = Math.ceil(now / period) * period + CLOSE_BUFFER_MS;
  const delay = Math.max(1_000, next - now);
  timer = setTimeout(() => {
    tick("candle_close").finally(scheduleNext);
  }, delay);
}

export function startAutopilot() {
  if (!enabled()) {
    logger.info("system", "autopilot_disabled", "Autopilot disabled (AUTOPILOT_ENABLED=false)");
    return;
  }
  logger.info(
    "system",
    "autopilot_start",
    `Autopilot started: paper auto-trade every ${cadenceMinutes()}m aligned to candle close`,
    { signalInterval: signalInterval(), maxTrades: maxTrades() }
  );
  // Run once shortly after boot, then on each 5m candle close.
  setTimeout(() => tick("startup"), 10_000);
  scheduleNext();
}

export function stopAutopilot() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function autopilotStatus() {
  return {
    enabled: enabled(),
    running,
    signalInterval: signalInterval(),
    cadenceMinutes: cadenceMinutes(),
    maxTrades: maxTrades(),
    runCount,
    lastRunAt,
    lastResult,
    lastError,
  };
}
