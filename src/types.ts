/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OptionType = 'call' | 'put';
export type PositionSide = 'buy' | 'sell';

export interface ExpiryPreset {
  date: string;
  days: number;
  label: string;
}

export const BASE_DATE_STR = '2026-06-11';

export const EXPIRY_PRESETS: ExpiryPreset[] = [
  { date: '2026-06-12', days: 1, label: '2026.06.12 (周五常规)' },
  { date: '2026-06-18', days: 7, label: '2026.06.18 (末日周四)' },
  { date: '2026-06-25', days: 14, label: '2026.06.25 (两周交割)' },
  { date: '2026-07-02', days: 21, label: '2026.07-02 (三周行权)' },
  { date: '2026-07-09', days: 28, label: '2026.07.09 (月度合约)' },
  { date: '2026-07-16', days: 35, label: '2026.07.16 (五周远期)' },
  { date: '2026-07-23', days: 42, label: '2026.07.23 (双月常规)' },
  { date: '2026-08-13', days: 63, label: '2026.08.13 (跨季行权)' },
  { date: '2026-09-17', days: 98, label: '2026.09.17 (季度交割)' },
  { date: '2026-12-17', days: 189, label: '2026.12.17 (远期半年)' },
];

export interface OptionLeg {
  id: string;
  kind?: 'option';
  type: OptionType;
  side: PositionSide;
  strike: number;
  expiryDays: number;
  quantity: number;
  iv: number; // in percentage, e.g. 30
  premium: number; // price per option (unit price, i.e., $1.5)
  isCustomPremium: boolean;
}

export interface StockLeg {
  id: string;
  kind: 'stock';
  side: PositionSide;
  entryPrice: number;
  quantity: number;
}

export type PositionLeg = OptionLeg | StockLeg;

export interface Strategy {
  id: string;
  name: string;
  legs: OptionLeg[];
  isDefault?: boolean;
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface SimulationParams {
  stockPrice: number;
  daysToExpiry: number;
  volatility: number; // global IV adjustment multiplier, e.g. 1.0 for original, or offset
  riskFreeRate: number; // in percentage, e.g. 4.5
}

export interface TickerInfo {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  iv: number; // implied volatility of near term options
  high: number;
  low: number;
  volume: string;
  source?: string;
}

export interface LiveOptionChainRow {
  contractTicker?: string;
  type: OptionType;
  expiry: string;
  strike: number;
  bid: number;
  ask: number;
  mark: number;
  volume: number;
  openInterest: number;
  iv?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  source?: string;
  quoteTradable?: boolean;
  quoteTimestamp?: string | number | null;
  wsPriority?: number | null;
}

export interface QuoteQualitySummary {
  input_count: number;
  accepted_count: number;
  rejected_count: number;
  rejection_reasons: Record<string, number>;
}

export interface LiveExpiry {
  date: string;
  days: number;
  label: string;
}

export interface LiveVolSummary {
  atmIv?: number | null;
  realizedVol?: number | null;
  rowCount?: number;
  source?: string;
}

export interface LiveVolHistoryPoint {
  date: string;
  terms: Record<string, number | null>;
}

export interface LiveVolTermStructurePoint {
  expiry: string;
  days: number;
  atmIv?: number | null;
  fwdIv?: number | null;
  skew25d?: number | null;
  call25dIv?: number | null;
  put25dIv?: number | null;
  sampleSize?: number;
}

export interface LiveVolSurface {
  source?: string;
  termStructure?: LiveVolTermStructurePoint[];
  atmIvHistory?: LiveVolHistoryPoint[];
  skewHistory?: LiveVolHistoryPoint[];
  realizedVolHistory?: LiveVolHistoryPoint[];
  diagnostics?: Record<string, number | string | boolean | null>;
}

export interface CacheTelemetryEvent {
  layer: string;
  label: string;
  hit: boolean;
  ttlSeconds?: number;
  cacheKeyHash?: string;
}

export interface CacheTelemetry {
  fetchedAt?: string;
  events: CacheTelemetryEvent[];
  hitCount?: number;
  missCount?: number;
}

export interface OptionWsSubscription {
  channel: string;
  symbol: string;
  contractTicker: string;
  type: OptionType;
  expiry: string;
  days: number;
  strike: number;
  reason: string;
  priority: number;
}

export interface OptionWsPlan {
  enabled: boolean;
  provider?: string;
  budgetPerMinute: number;
  selectedCount: number;
  candidateCount?: number;
  fallbackRestCount: number;
  mode?: string;
  subscriptions: OptionWsSubscription[];
}

export interface WsQuoteTelemetry {
  enabled: boolean;
  subscribedCount: number;
  freshQuoteCount: number;
  staleQuoteCount: number;
  ignoredQuoteCount: number;
  mergedCount: number;
  maxAgeSeconds: number;
}

export interface WsWorkerTelemetry {
  enabled: boolean;
  provider: string;
  plannedCount: number;
  subscribedCount: number;
  receivedCount: number;
  acceptedCount: number;
  ignoredCount: number;
  lastRefreshAt: string;
}

export interface ApiBudgetGovernor {
  planLabel: string;
  budgetMode?: string;
  action: string;
  restBudgetPerMinute: number;
  optionWsBudgetPerMinute: number;
  fullMarketSnapshotCost: number;
  estimatedRestRequests: number;
  actualHttpMisses: number;
  httpCacheHitRatio: number;
  wsSelectedCount: number;
  wsFallbackRestCount: number;
  riskLevel: 'normal' | 'elevated' | 'critical';
  recommendation: string;
  requestProfile?: {
    visibleStrikes: number;
    expiryWindowDays: number;
    chainLimit: number;
  };
}

export interface OptionMarketUnderlying {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  iv: number | null;
  source?: string;
}

export interface OptionMarketSnapshotRow {
  contractTicker: string;
  symbol: string;
  type: OptionType;
  expiry: string;
  strike: number | null;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  mid: number | null;
  volume: number;
  openInterest: number;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  quoteTimestamp?: string | number | null;
  source?: string;
}

export interface OptionMarketSnapshot {
  asOfDate?: string | null;
  symbol: string;
  underlying: OptionMarketUnderlying;
  expiries: LiveExpiry[];
  normalizedChain: OptionMarketSnapshotRow[];
  qualitySummary: QuoteQualitySummary;
  volSurface: LiveVolSurface;
  diagnostics: Record<string, number | string | boolean | null | undefined>;
}

export interface LiveMarketData {
  ok: boolean;
  provider?: string;
  asOfDate?: string;
  ticker?: TickerInfo;
  chain?: LiveOptionChainRow[];
  expiries?: LiveExpiry[];
  volSummary?: LiveVolSummary;
  volSurface?: LiveVolSurface;
  qualitySummary?: QuoteQualitySummary;
  optionMarketSnapshot?: OptionMarketSnapshot;
  cacheTelemetry?: CacheTelemetry;
  optionWsPlan?: OptionWsPlan;
  wsQuoteTelemetry?: WsQuoteTelemetry;
  wsWorkerTelemetry?: WsWorkerTelemetry | null;
  apiBudgetGovernor?: ApiBudgetGovernor;
  refreshPolicy?: {
    selectedLegRefreshSeconds?: number;
    regularRefreshSeconds?: number;
    selectedContractRefreshMode?: string;
    executableQuotePolicy?: string;
    staleDataVerdict?: string;
    [key: string]: unknown;
  };
  error?: string;
}

export interface ValidationReplayResult {
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  pricing_checks: number;
  max_abs_diff: number;
  avg_abs_diff: number;
  warnings: string[];
}

export interface RustPositionAnalysisResult {
  engine: string;
  net_premium: number;
  current_pnl: number;
  max_profit: number | string;
  max_loss: number | string;
  breakevens: number[];
  quality_score?: number;
  risk_flags?: string[];
  greeks: Greeks;
  scenarios: Array<{ spot: number; pnl: number }>;
}

export interface RustPositionAnalysisResponse {
  ok: boolean;
  engine?: string;
  result?: RustPositionAnalysisResult;
  error?: string;
}

export type RustSurfacePlotTarget = 'pnl' | 'delta' | 'gamma' | 'vega' | 'theta';
export type RustSurfaceYDimension = 'days' | 'iv';

export interface RustStrategySurfacePoint {
  spot: number;
  y: number;
  value: number;
}

export interface RustStrategySurface {
  engine: string;
  plot_target: RustSurfacePlotTarget;
  y_dimension: RustSurfaceYDimension;
  price_min: number;
  price_max: number;
  y_min: number;
  y_max: number;
  x_steps: number;
  y_steps: number;
  z_min: number;
  z_max: number;
  points: RustStrategySurfacePoint[];
}

export interface RustStrategySurfaceResponse {
  ok: boolean;
  engine?: string;
  result?: {
    engine: string;
    surface: RustStrategySurface;
  };
  error?: string;
}

export interface TradeLog {
  id: string;
  symbol: string;
  timestamp: string;
  strategyName: string;
  action: string; // e.g. "BUY 2 AAPL 190 CALL", "IRON CONDOR SETUP"
  legs: string[];
  totalPremium: number; // credit or debit
  status: 'PENDING' | 'EXECUTED' | 'FAILED';
  margin: number;
}

export interface ActivePosition {
  id: string;
  symbol: string;
  strategyName: string;
  legs: PositionLeg[];
  entryStockPrice: number;
  currentStockPrice: number;
  entryTotalVal: number; // entry expense (negative is net credit, positive is net debit)
  currentTotalVal: number;
  openTime: string;
}
