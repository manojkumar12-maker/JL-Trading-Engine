import type {
  Agent,
  AgentInput,
  AutoTradeResult,
  BacktestResult,
  BacktestRunSummary,
  DatasetMeta,
  ExecuterOrder,
  ExecuterPlaceResult,
  ExecuterPosition,
  ExecuterStatus,
  KlineResponse,
  LogEntry,
  MarketsResponse,
  Mover,
  NewsRefreshResult,
  NewsResponse,
  ProviderStatus,
  RugCheckResult,
  RugCheckSummary,
  ScanResult,
  Signal,
  SignalSizerResult,
  SignalsResponse,
  SizerResult,
  PortfolioResult,
} from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  providers: () => request<ProviderStatus[]>("/api/providers"),

  markets: (q = "", limit = 3000, refresh = false) =>
    request<MarketsResponse>(
      `/api/markets?q=${enc(q)}&limit=${limit}${refresh ? "&refresh=1" : ""}`
    ),

  klines: (symbol: string, interval: string, limit: number, refresh = false) =>
    request<KlineResponse>(
      `/api/klines?symbol=${enc(symbol)}&interval=${enc(interval)}&limit=${limit}${refresh ? "&refresh=1" : ""}`
    ),

  history: (symbol: string, interval: string, days: number) =>
    request<KlineResponse>(
      `/api/history?symbol=${enc(symbol)}&interval=${enc(interval)}&days=${days}`
    ),

  datasets: () => request<DatasetMeta[]>("/api/datasets"),

  dataset: (symbol: string, interval: string) =>
    request<KlineResponse>(
      `/api/dataset?symbol=${enc(symbol)}&interval=${enc(interval)}`
    ),

  agents: () => request<Agent[]>("/api/agents"),

  createAgent: (input: AgentInput) =>
    request<Agent>("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  deleteAgent: (id: string) =>
    request<{ ok: boolean }>(`/api/agents/${enc(id)}`, { method: "DELETE" }),

  runAgent: (id: string) =>
    request<{ ok: boolean; output: string }>(`/api/agents/${enc(id)}/run`, {
      method: "POST",
    }),

  logs: () => request<LogEntry[]>("/api/logs"),

  news: (limit = 120) => request<NewsResponse>(`/api/news?limit=${limit}`),

  refreshNews: () =>
    request<NewsRefreshResult>("/api/news/refresh", { method: "POST" }),

  signals: (limit = 100) =>
    request<SignalsResponse>(`/api/signals?limit=${limit}`),

  signal: (symbol: string, interval: string) =>
    request<Signal>(
      `/api/signal?symbol=${enc(symbol)}&interval=${enc(interval)}`
    ),

  movers: (limit = 15) =>
    request<{ movers: Mover[] }>(`/api/movers?limit=${limit}`),

  scan: (body: { interval?: string; limit?: number; minScore?: number; oi?: boolean } = {}) =>
    request<ScanResult>("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  runBacktest: (body: {
    symbol?: string;
    interval?: string;
    days?: number;
    minScore?: number;
    stopAtr?: number;
    tpAtr?: number;
  }) =>
    request<BacktestResult>("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  backtests: () => request<BacktestRunSummary[]>("/api/backtests"),

  rugCheck: (address: string, chain = "", refresh = false) =>
    request<RugCheckResult>(
      `/api/rugcheck?address=${enc(address)}&chain=${enc(chain)}${refresh ? "&refresh=1" : ""}`
    ),

  rugChecks: (limit = 20) =>
    request<RugCheckSummary[]>(`/api/rugchecks?limit=${limit}`),

  size: (body: {
    equity?: number;
    riskPct?: number;
    entry?: number;
    stop?: number;
    targets?: number[] | string[];
    side?: string;
    feePct?: number;
    maxLeverage?: number;
    confidence?: number;
    scaleByConfidence?: boolean;
  }) =>
    request<SizerResult>("/api/size", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  sizeSignal: (body: {
    symbol?: string;
    interval?: string;
    equity?: number;
    riskPct?: number;
    feePct?: number;
    maxLeverage?: number;
    scaleByConfidence?: boolean;
  }) =>
    request<SignalSizerResult>("/api/size/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  sizePortfolio: (body: {
    equity?: number;
    riskPct?: number;
    maxTotalRiskPct?: number;
    limit?: number;
    scaleByConfidence?: boolean;
    feePct?: number;
    maxLeverage?: number;
  }) =>
    request<PortfolioResult>("/api/size/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  executerStatus: () => request<ExecuterStatus>("/api/executer/status"),

  executerOrders: (limit = 50) =>
    request<ExecuterOrder[]>(`/api/executer/orders?limit=${limit}`),

  executerPositions: (status = "", limit = 100) =>
    request<ExecuterPosition[]>(
      `/api/executer/positions?status=${enc(status)}&limit=${limit}`
    ),

  placeOrder: (body: {
    symbol?: string;
    side?: string;
    quantity?: number;
    notional?: number;
    entry?: number;
    stop?: number;
    takeProfit?: number;
    mode?: string;
    confirm?: boolean;
  }) =>
    request<ExecuterPlaceResult>("/api/executer/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  executeFromSignal: (body: {
    symbol?: string;
    interval?: string;
    equity?: number;
    riskPct?: number;
    feePct?: number;
    maxLeverage?: number;
    mode?: string;
    confirm?: boolean;
  }) =>
    request<ExecuterPlaceResult & { signal: unknown; size: SizerResult }>(
      "/api/executer/from-signal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),

  closeExecPosition: (id: string, price?: number) =>
    request<ExecuterPosition>(`/api/executer/positions/${enc(id)}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price }),
    }),

  setKillSwitch: (enabled: boolean) =>
    request<{ killSwitch: boolean }>("/api/executer/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),

  autoTrade: (body: {
    equity?: number;
    riskPct?: number;
    interval?: string;
    limit?: number;
    mode?: string;
    confirm?: boolean;
  }) =>
    request<AutoTradeResult>("/api/executer/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
