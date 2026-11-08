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

export interface TimeframeRead {
  interval: string;
  direction: string;
  score: number;
  rsi: number | null;
  macdHist: number;
  atr: number;
}

export interface SignalLayer {
  name: string;
  detail: string;
  kind: string;
}

export interface NewsSentiment {
  score: number;
  bullish: number;
  bearish: number;
  neutral: number;
  articles: number;
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
  higherInterval?: string | null;
  alignment?: string | null;
  biasScore?: number | null;
  timeframes?: TimeframeRead[];
  layers?: SignalLayer[];
  news?: NewsSentiment | null;
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

export interface BacktestTrade {
  symbol: string;
  direction: string;
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  takeProfit: number;
  exit: number;
  outcome: string;
  r: number;
  score: number;
  bars: number;
}

export interface BacktestSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number | null;
  expectancy: number;
  maxDrawdownR: number;
  bestR: number;
  worstR: number;
}

export interface BacktestResult {
  id?: string;
  createdAt?: number;
  symbol: string;
  interval: string;
  days: number;
  candles: number;
  params: { minScore: number; stopAtr: number; tpAtr: number };
  summary: BacktestSummary;
  byDirection: { direction: string; trades: number; wins: number; winRate: number }[];
  equity: { time: number; r: number }[];
  trades: BacktestTrade[];
}

export interface BacktestRunSummary {
  id: string;
  createdAt: number;
  symbol: string;
  interval: string;
  days: number;
  params: { minScore?: number; stopAtr?: number; tpAtr?: number };
  summary: BacktestSummary;
}

export interface RugCheckItem {
  id: string;
  label: string;
  severity: string;
  detail: string;
  points?: number;
}

export interface RugCheckResult {
  address: string;
  chain: string | null;
  kind: string;
  name: string | null;
  symbol: string | null;
  pairs: number;
  dex: {
    chainId: string;
    dexId: string;
    pairAddress: string;
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24h: number | null;
    pairCreatedAt: number | null;
  } | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceUsd: number | null;
  pairAgeHours: number | null;
  score: number;
  verdict: string;
  checks: RugCheckItem[];
  signals: RugCheckItem[];
  taxes: { buy: number | null; sell: number | null };
  holders: { count: number | null; top1Percent: number | null };
  lpLockedPercent: number | null;
  providers: {
    goplus: boolean;
    honeypot: boolean;
    rugcheck: boolean;
    dexscreener: boolean;
  };
  providerErrors: { provider: string; error: string }[];
  createdAt: number;
  cached?: boolean;
}

export interface RugCheckSummary {
  address: string;
  chain: string;
  createdAt: number;
  score: number;
  verdict: string;
}

export interface SizerTarget {
  price: number;
  rMultiple: number;
  profit: number;
}

export interface SizerResult {
  side: string;
  equity: number;
  riskPct: number;
  riskAmount: number;
  entry: number;
  stop: number;
  riskPerUnit: number;
  units: number;
  notional: number;
  leverage: number;
  marginAtMaxLeverage: number;
  priceRisk: number;
  feeEstimate: number;
  targets: SizerTarget[];
  confidence: number | null;
  warnings: string[];
}

export interface PortfolioAllocation extends SizerResult {
  symbol: string | null;
}

export interface PortfolioResult {
  equity: number;
  riskPct: number;
  maxTotalRiskPct: number;
  totalRiskAmount: number;
  totalNotional: number;
  scaled: boolean;
  allocations: PortfolioAllocation[];
  warnings: string[];
}

export interface SignalSizerResult {
  signal: {
    symbol: string;
    interval: string;
    direction: string;
    score: number;
    confidence: number;
    alignment: string | null;
    plan: { entry: number; stop: number; targets: number[] };
  };
  size: SizerResult;
}

export interface ExecuterStatus {
  liveEnabled: boolean;
  autoTradeEnabled: boolean;
  killSwitch: boolean;
  exchange: string;
  market: string;
  maxLeverage: number;
  binance: { testnet: boolean; base: string; futuresBase?: string; configured: boolean };
  limits: {
    maxOrderNotional: number;
    maxOpenPositions: number;
    maxTotalExposure: number;
    maxDailyLoss: number;
  };
  openPositions: number;
  openExposure: number;
  dailyPnl: number;
}

export interface ExecuterOrder {
  id: string;
  createdAt: number;
  mode: string;
  exchange: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number | null;
  price: number | null;
  notional: number | null;
  stop: number | null;
  takeProfit: number | null;
  status: string;
  source: string;
  filledPrice: number | null;
  filledAt: number | null;
  error: string | null;
}

export interface ExecuterPosition {
  id: string;
  orderId: string | null;
  symbol: string;
  side: string;
  quantity: number;
  entry: number;
  stop: number | null;
  takeProfit: number | null;
  status: string;
  mode: string;
  openedAt: number;
  closedAt: number | null;
  exitPrice: number | null;
  pnl: number | null;
}

export interface ExecuterPlaceResult {
  order: ExecuterOrder;
  position: ExecuterPosition;
}

export interface AutoTradeResult {
  scanned: number;
  candidates: number;
  placed: number;
  outcomes: { symbol: string; status: string; error?: string; quantity?: number }[];
}

export interface EquityState {
  balance: number;
  equity: number;
  realized: number;
  openNotional: number;
  marginUsed: number;
  deployFraction: number;
  deployable: number;
  reserve: number;
  maxConcurrent: number;
  perTradeMargin: number;
  perTradeNotionalCap: number;
  availableMargin: number;
  drawdownPct: number;
  throttled: boolean;
  paused: boolean;
  maxLeverage: number;
  policy: Record<string, string>;
}
