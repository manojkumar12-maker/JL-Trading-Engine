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

export interface NewsArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: number;
  fetchedAt: number;
}

export interface NewsSourceStatus {
  id: string;
  name: string;
  available: boolean;
  cooldownUntil: number | null;
  usedInWindow: number;
  limitPerWindow: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
}

export interface NewsResponse {
  total: number;
  count: number;
  articles: NewsArticle[];
  sources: NewsSourceStatus[];
}

export interface NewsRefreshResult {
  fetched: number;
  inserted: number;
  total: number;
  errors: { source: string; error: string }[];
}

export interface SignalPlan {
  entry: number;
  stop: number;
  targets: number[];
  riskReward?: number[];
  atr?: number;
}

export interface SignalIndicators {
  rsi: number | null;
  macdHist: number;
  ema20: number;
  ema50: number;
  ema200: number | null;
  bollingerPctB: number | null;
  volumeRatio: number;
  atr: number;
  atrPct: number;
  momentum20Pct: number;
}

export interface Signal {
  symbol: string;
  interval: string;
  updatedAt: number;
  price: number;
  score: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  higherTrend?: string | null;
  reasons: string[];
  indicators: SignalIndicators;
  plan: SignalPlan | null;
  source?: string;
  changePct?: number | null;
  quoteVolume?: number | null;
  oiChangePct?: number | null;
  heat?: number;
}

export interface SignalsResponse {
  generatedAt: number;
  count: number;
  signals: Signal[];
}

export interface Mover {
  symbol: string;
  price: number;
  changePct: number;
  quoteVolume: number;
  oiChangePct: number | null;
  heat: number;
  source: string;
}

export interface ScanResult {
  interval: string;
  scanned: number;
  generatedAt: number;
  movers: Mover[];
  opportunities: Signal[];
}
