import { addLog, getAgent, touchAgent } from "../db.js";
import { getHistory, getKlines, getMarkets } from "./crypto/index.js";
import { refreshNews } from "./news/index.js";
import { scan } from "./signals/screener.js";

function formatTime(ms) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

const automationActions = {
  async "fetch-klines"(agent) {
    if (!agent.symbol) throw new Error("agent.symbol is required");
    const result = await getKlines({
      symbol: agent.symbol,
      interval: agent.interval || "1h",
      limit: Number(agent.limit) || 200,
      refresh: true,
    });

    const last = result.candles[result.candles.length - 1];
    return (
      `Fetched ${result.candles.length} ${result.interval} candles for ${result.symbol} ` +
      `from ${result.source}` +
      (last ? ` · last close ${last.c}` : "") +
      "."
    );
  },

  async "fetch-history"(agent) {
    if (!agent.symbol) throw new Error("agent.symbol is required");
    const days = Number(agent.days) || 30;
    const result = await getHistory({ symbol: agent.symbol, interval: agent.interval || "1h", days });
    return (
      `Synced ${result.count} ${result.interval} candles for ${result.symbol} ` +
      `over ${days} days from ${result.source} ` +
      `(${formatTime(result.from)} → ${formatTime(result.to)}).`
    );
  },

  async "refresh-markets"() {
    const result = await getMarkets({ refresh: true });
    return `Refreshed market list: ${result.count} symbols across providers.`;
  },

  async "fetch-news"() {
    const result = await refreshNews({});
    return `News refresh: ${result.inserted} new of ${result.fetched} fetched (${result.total} total).`;
  },

  async "scan-signals"() {
    const result = await scan({ interval: "5m", limit: 12, minScore: 25 });
    return `Signal scan (5m MTF): ${result.opportunities.length} opportunities from ${result.scanned} moving symbols.`;
  },
};

export const ACTIONS = Object.keys(automationActions);

export async function runAgent(id, trigger = "manual") {
  const agent = getAgent(id);
  if (!agent) throw new Error("Agent not found");

  const started = Date.now();
  try {
    const action = automationActions[agent.action];
    if (!action) throw new Error(`Unknown automation action: ${agent.action}`);
    const output = await action(agent);

    touchAgent(agent.id, new Date().toISOString());
    addLog({
      agentId: agent.id,
      agentName: agent.name,
      trigger,
      status: "success",
      output,
      ms: Date.now() - started,
    });
    return output;
  } catch (err) {
    touchAgent(agent.id, new Date().toISOString());
    addLog({
      agentId: agent.id,
      agentName: agent.name,
      trigger,
      status: "error",
      output: err.message,
      ms: Date.now() - started,
    });
    throw err;
  }
}
