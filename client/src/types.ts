export interface PerpTarget {
  symbol: string;
  price: number;
  pastReturn3d: number;
  weight: number;
}

export interface PerpPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry: number;
  price: number;
  weight: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PerpTargets {
  asOf: number;
  asOfIso: string;
  regime: boolean;
  exposure: number;
  targets: PerpTarget[];
  overlayReturnLast: number;
}

export interface PerpStatus {
  equity: number;
  realizedEquity: number;
  unrealized: number;
  exposure: number;
  lastRebalanceAt: number | null;
  positions: PerpPosition[];
  targets: PerpTargets | null;
  staleHours: number | null;
  dataFile: string;
  startEquity: number;
  config: {
    lookbackHours: number;
    holdHours: number;
    topN: number;
    regimeDays: number;
    targetVol: number;
    drawdownStop: number;
    costPerSide: number;
    fundingPerDay: number;
  };
}

export interface PerpMetrics {
  periods: number;
  totalReturn: number;
  avgDaily: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
}

export interface PerpBacktest {
  dataset: string;
  symbols: number;
  periods: number;
  raw: PerpMetrics;
  benchmark: PerpMetrics;
  overlay: PerpMetrics;
  stress: PerpMetrics;
  averageExposure: number;
}
