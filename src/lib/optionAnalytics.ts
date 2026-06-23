import { ExpiryChoice } from './expiryChoices';
import type { RustPositionAnalysisResponse, RustStrategySurfaceResponse } from '../types';

export type ExpiryFamilyId = 'front' | 'monthly' | 'quarterly' | 'long_dated';
export type ScaleMode = 'auto' | 'unit' | 'ten' | 'hundred' | 'thousand' | 'ten_thousand';
export type RadarMetricId = 'iv' | 'range' | 'rank' | 'zone' | 'price';

export interface ExpiryFamily {
  id: ExpiryFamilyId;
  label: string;
  description: string;
  count: number;
  choices: ExpiryChoice[];
  visibleChoices: ExpiryChoice[];
}

export interface ExpiryPager<T extends { days: number }> {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  selectedIndex: number;
  pageItems: T[];
  canPrev: boolean;
  canNext: boolean;
}

export interface PayoffBoundaryInput {
  breakevens: number[];
  maxProfit: number;
  maxLoss: number;
  currentStockPrice: number;
}

export interface PayoffBoundaryMarker {
  kind: 'breakeven' | 'spot';
  price: number;
  label: string;
}

export interface PayoffBoundarySummary {
  breakevenLabels: string[];
  maxProfitLabel: string;
  maxLossLabel: string;
  boundaryMarkers: PayoffBoundaryMarker[];
}

export interface ThreeDBoundaryInput {
  breakevens: number[];
  currentStockPrice: number;
  maxProfit: number;
  maxLoss: number;
  rustAnalysis?: RustPositionAnalysisResponse;
}

export interface ThreeDBoundaryAnnotation {
  kind: 'spot' | 'breakeven' | 'risk';
  label: string;
  price?: number;
  offsetPct?: number;
  engine: 'rust-option-core' | 'typescript-bs';
}

export interface ThreeDComputeEngineMeta {
  surfaceEngine: 'rust-option-core-surface' | 'unavailable';
  boundaryEngine: 'rust-option-core' | 'typescript-bs';
  label: string;
  isAuthoritativeSurface: boolean;
}

export interface RadarMetricConfig {
  id: RadarMetricId;
  label: string;
  shortLabel: string;
  visible: boolean;
}

export interface LiveIvStats {
  currentIv: number;
  minIv: number;
  maxIv: number;
  ivRank: number;
  zone: 'HIGH' | 'NEUTRAL' | 'LOW';
  source: 'live_chain' | 'fallback';
  rowCount: number;
}

const FAMILY_META: Record<ExpiryFamilyId, { label: string; description: string }> = {
  front: { label: '近周', description: '0-14D' },
  monthly: { label: '月内', description: '15-45D' },
  quarterly: { label: '季度', description: '46-120D' },
  long_dated: { label: '远期', description: '120D+' },
};

const RADAR_METRIC_META: Record<RadarMetricId, { label: string; shortLabel: string }> = {
  iv: { label: '当前 IV', shortLabel: 'IV' },
  range: { label: 'IV 区间', shortLabel: 'RANGE' },
  rank: { label: 'IV Rank', shortLabel: 'RANK' },
  zone: { label: '波动区', shortLabel: 'ZONE' },
  price: { label: '现价', shortLabel: 'PRICE' },
};

export function buildRadarMetricConfig(hiddenMetrics: RadarMetricId[] = []): RadarMetricConfig[] {
  const allIds = Object.keys(RADAR_METRIC_META) as RadarMetricId[];
  const hidden = new Set(hiddenMetrics);
  const effectiveHidden = allIds.every((id) => hidden.has(id)) ? new Set<RadarMetricId>() : hidden;
  return allIds.map((id) => ({
    id,
    label: RADAR_METRIC_META[id].label,
    shortLabel: RADAR_METRIC_META[id].shortLabel,
    visible: !effectiveHidden.has(id),
  }));
}

function finiteIvValues(rows: Array<{ iv?: number | null }>): number[] {
  return rows
    .map((row) => Number(row.iv))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

function zoneForRank(ivRank: number): LiveIvStats['zone'] {
  if (ivRank >= 60) return 'HIGH';
  if (ivRank < 30) return 'LOW';
  return 'NEUTRAL';
}

export function deriveLiveIvStats(rows: Array<{ iv?: number | null }>, fallbackIv: number): LiveIvStats {
  const ivs = finiteIvValues(rows);
  if (ivs.length === 0) {
    const currentIv = Number((Number.isFinite(fallbackIv) && fallbackIv > 0 ? fallbackIv : 30).toFixed(1));
    const minIv = Number((currentIv * 0.7).toFixed(1));
    const maxIv = Number((currentIv * 1.3).toFixed(1));
    return {
      currentIv,
      minIv,
      maxIv,
      ivRank: 50,
      zone: 'NEUTRAL',
      source: 'fallback',
      rowCount: 0,
    };
  }

  const middle = Math.floor(ivs.length / 2);
  const currentIv = ivs.length % 2 === 0
    ? (ivs[middle - 1] + ivs[middle]) / 2
    : ivs[middle];
  const minIv = ivs[0];
  const maxIv = ivs[ivs.length - 1];
  const rawRank = maxIv > minIv ? ((currentIv - minIv) / (maxIv - minIv)) * 100 : 50;
  const ivRank = Math.max(0, Math.min(100, Math.round(rawRank)));

  return {
    currentIv: Number(currentIv.toFixed(1)),
    minIv: Number(minIv.toFixed(1)),
    maxIv: Number(maxIv.toFixed(1)),
    ivRank,
    zone: zoneForRank(ivRank),
    source: 'live_chain',
    rowCount: ivs.length,
  };
}

function familyForDays(days: number): ExpiryFamilyId {
  if (days <= 14) return 'front';
  if (days <= 45) return 'monthly';
  if (days <= 120) return 'quarterly';
  return 'long_dated';
}

export function buildExpiryFamilies(
  choices: ExpiryChoice[],
  options: { hiddenFamilies?: ExpiryFamilyId[] } = {},
): ExpiryFamily[] {
  const hidden = new Set(options.hiddenFamilies || []);
  const grouped: Record<ExpiryFamilyId, ExpiryChoice[]> = {
    front: [],
    monthly: [],
    quarterly: [],
    long_dated: [],
  };

  for (const choice of choices.filter((item) => !item.isCustom)) {
    grouped[familyForDays(choice.days)].push(choice);
  }

  return (Object.keys(grouped) as ExpiryFamilyId[]).map((id) => {
    const choicesForFamily = grouped[id].sort((a, b) => a.days - b.days || a.date.localeCompare(b.date));
    return {
      id,
      label: FAMILY_META[id].label,
      description: FAMILY_META[id].description,
      count: choicesForFamily.length,
      choices: choicesForFamily,
      visibleChoices: hidden.has(id) ? [] : choicesForFamily,
    };
  });
}

export function filterChoicesByVisibleFamilies(
  choices: ExpiryChoice[],
  hiddenFamilies: ExpiryFamilyId[] = [],
): ExpiryChoice[] {
  return buildExpiryFamilies(choices, { hiddenFamilies })
    .flatMap((family) => family.visibleChoices)
    .sort((a, b) => a.days - b.days || a.date.localeCompare(b.date));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildExpiryPager<T extends { days: number }>(
  choices: T[],
  selectedDays: number,
  pageSize = 6,
  requestedPageIndex?: number,
): ExpiryPager<T> {
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const totalCount = choices.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const selectedIndex = choices.findIndex((choice) => choice.days === selectedDays);
  const selectedPageIndex = selectedIndex >= 0 ? Math.floor(selectedIndex / normalizedPageSize) : 0;
  const rawPageIndex = requestedPageIndex ?? selectedPageIndex;
  const pageIndex = clamp(rawPageIndex, 0, pageCount - 1);
  const start = pageIndex * normalizedPageSize;

  return {
    pageIndex,
    pageCount,
    pageSize: normalizedPageSize,
    totalCount,
    selectedIndex,
    pageItems: choices.slice(start, start + normalizedPageSize),
    canPrev: pageIndex > 0,
    canNext: pageIndex < pageCount - 1,
  };
}

const SCALE_FACTORS: Record<Exclude<ScaleMode, 'auto'>, { divisor: number; suffix: string; decimals: number }> = {
  unit: { divisor: 1, suffix: '', decimals: 0 },
  ten: { divisor: 10, suffix: '十', decimals: 1 },
  hundred: { divisor: 100, suffix: '百', decimals: 1 },
  thousand: { divisor: 1_000, suffix: '千', decimals: 1 },
  ten_thousand: { divisor: 10_000, suffix: '万', decimals: 1 },
};

export function resolveScaleMode(value: number, mode: ScaleMode): Exclude<ScaleMode, 'auto'> {
  if (mode !== 'auto') return mode;
  const absValue = Math.abs(value);
  if (absValue >= 10_000) return 'ten_thousand';
  if (absValue >= 1_000) return 'thousand';
  return 'unit';
}

export function formatScaledNumber(value: number, mode: ScaleMode = 'auto'): string {
  if (!Number.isFinite(value)) return 'N/A';
  const resolvedMode = resolveScaleMode(value, mode);
  const scale = SCALE_FACTORS[resolvedMode];
  const scaled = value / scale.divisor;
  if (resolvedMode === 'unit') {
    return Math.round(scaled).toLocaleString('en-US');
  }
  if (mode === 'auto' && resolvedMode === 'ten_thousand') {
    return `${scaled.toFixed(2)}${scale.suffix}`;
  }
  return `${scaled.toFixed(scale.decimals)}${scale.suffix}`;
}

function formatCurrencyValue(value: number): string {
  if (value === Infinity) return '∞';
  if (value === -Infinity) return '-∞';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`;
}

export function summarizePayoffBoundaries(input: PayoffBoundaryInput): PayoffBoundarySummary {
  const breakevens = input.breakevens
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const breakevenLabels = breakevens.map((price) => {
    const pct = input.currentStockPrice > 0 ? ((price / input.currentStockPrice) - 1) * 100 : 0;
    const prefix = pct >= 0 ? '+' : '';
    return `B/E $${price.toFixed(2)} (${prefix}${pct.toFixed(2)}%)`;
  });

  return {
    breakevenLabels,
    maxProfitLabel: input.maxProfit === Infinity ? 'Max Profit ∞' : `Max Profit ${formatCurrencyValue(input.maxProfit)}`,
    maxLossLabel: input.maxLoss === -Infinity ? 'Max Loss -∞' : `Max Loss ${formatCurrencyValue(input.maxLoss)}`,
    boundaryMarkers: [
      ...breakevens.map((price): PayoffBoundaryMarker => ({
        kind: 'breakeven',
        price,
        label: `B/E $${price.toFixed(2)}`,
      })),
      {
        kind: 'spot',
        price: input.currentStockPrice,
        label: `Spot $${input.currentStockPrice.toFixed(2)}`,
      },
    ],
  };
}

export function summarizeThreeDBoundaries(input: ThreeDBoundaryInput): ThreeDBoundaryAnnotation[] {
  const currentStockPrice = Number.isFinite(input.currentStockPrice) && input.currentStockPrice > 0
    ? input.currentStockPrice
    : 1;
  const rustResult = input.rustAnalysis?.ok ? input.rustAnalysis.result : undefined;
  const engine: ThreeDBoundaryAnnotation['engine'] = rustResult ? 'rust-option-core' : 'typescript-bs';
  const maxProfit = rustResult ? Number(rustResult.max_profit) : input.maxProfit;
  const maxLoss = rustResult ? Number(rustResult.max_loss) : input.maxLoss;
  const breakevens = (rustResult?.breakevens || input.breakevens)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return [
    {
      kind: 'spot',
      label: `Spot $${currentStockPrice.toFixed(2)}`,
      price: Number(currentStockPrice.toFixed(2)),
      offsetPct: 0,
      engine,
    },
    ...breakevens.map((price): ThreeDBoundaryAnnotation => ({
      kind: 'breakeven',
      label: `B/E $${price.toFixed(2)}`,
      price: Number(price.toFixed(2)),
      offsetPct: Number((((price / currentStockPrice) - 1) * 100).toFixed(2)),
      engine,
    })),
    {
      kind: 'risk',
      label: maxProfit === Infinity ? 'Max Profit ∞' : `Max Profit ${formatCurrencyValue(maxProfit)}`,
      engine,
    },
    {
      kind: 'risk',
      label: maxLoss === -Infinity ? 'Max Loss -∞' : `Max Loss ${formatCurrencyValue(maxLoss)}`,
      engine,
    },
  ];
}

export function threeDComputeEngineMeta(
  rustAnalysis?: RustPositionAnalysisResponse,
  rustSurface?: RustStrategySurfaceResponse,
): ThreeDComputeEngineMeta {
  const boundaryEngine = rustAnalysis?.ok && rustAnalysis.result ? 'rust-option-core' : 'typescript-bs';
  const hasRustSurface = rustSurface?.ok === true && rustSurface.result?.surface?.engine === 'rust-option-core-surface';
  return {
    surfaceEngine: hasRustSurface ? 'rust-option-core-surface' : 'unavailable',
    boundaryEngine,
    label: `Surface: ${hasRustSurface ? 'Rust option-core' : 'UNAVAILABLE'} · Boundaries: ${boundaryEngine === 'rust-option-core' ? 'Rust option-core' : 'TS BS fallback'}`,
    isAuthoritativeSurface: hasRustSurface,
  };
}
