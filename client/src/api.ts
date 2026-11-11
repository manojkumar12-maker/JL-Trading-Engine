import type { PerpBacktest, PerpStatus } from "./types";

const enc = encodeURIComponent;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `HTTP ${res.status}`
    );
  }
  return data as T;
}

export const api = {
  perpStatus: () => request<PerpStatus>("/api/perp/status"),

  perpBacktest: (dataset = "current") =>
    request<PerpBacktest>(`/api/perp/backtest?dataset=${enc(dataset)}`),

  perpRebalance: () =>
    request<PerpStatus & { opened: unknown[] }>("/api/perp/rebalance", {
      method: "POST",
    }),

  perpReset: () =>
    request<PerpStatus>("/api/perp/reset", { method: "POST" }),

  perpHistory: (limit = 100) =>
    request<{ positions: unknown[]; runs: unknown[] }>(
      `/api/perp/history?limit=${limit}`
    ),
};
