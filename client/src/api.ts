import type {
  Agent,
  AgentInput,
  DatasetMeta,
  KlineResponse,
  LogEntry,
  MarketsResponse,
  ProviderStatus,
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
};
