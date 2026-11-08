export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface KlineResponse {
  symbol: string;
  interval: string;
  source: string;
  candles: Candle[];
  updatedAt: number;
  cached?: boolean;
  stale?: boolean;
  count?: number;
  from?: number;
  to?: number;
}

export interface ProviderStatus {
  id: string;
  name: string;
  priority: number;
  available: boolean;
  cooldownUntil: number | null;
  usedInWindow: number;
  limitPerWindow: number;
  windowMs: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
  lastOkAt: number | null;
}

export interface MarketSymbol {
  symbol: string;
  base: string;
  quote: string;
  providers: Record<string, string>;
}

export interface MarketsResponse {
  updatedAt: number;
  total: number;
  count: number;
  symbols: MarketSymbol[];
}

export interface DatasetMeta {
  symbol: string;
  interval: string;
  source: string | null;
  count: number;
  updatedAt: number;
}

export interface Agent {
  id: string;
  name: string;
  action: string;
  symbol: string;
  interval: string;
  limit: number;
  days: number;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export interface AgentInput {
  name: string;
  action: string;
  symbol?: string;
  interval?: string;
  limit?: number | string;
  days?: number | string;
  intervalMinutes?: number | string;
}

export interface LogEntry {
  time: string;
  agentId: string | null;
  agentName: string | null;
  trigger: string;
  status: string;
  output: string;
  ms: number;
}
