import type { Greeks, LiveOptionChainRow } from '../types';
import { calculateBSGreeks, calculateBSPrice, cdfNormal } from './optionsMath';

export interface OptionChainSideInput {
  type: 'call' | 'put';
  liveRow?: LiveOptionChainRow;
  currentStockPrice: number;
  strike: number;
  daysToExpiry: number;
  riskFreeRate: number;
  strikeIV: number;
  bidAskSpreadPct: number;
  fallbackVolume: number;
}

export interface OptionChainSideMetrics extends Greeks {
  source: 'MOCK' | 'MODEL';
  priceSource: 'MOCK_QUOTE' | 'MODEL_BS';
  greeksSource: 'MOCK_GREEKS' | 'MODEL_BS';
  engineLabel: 'MOCK' | 'MOCK+BS' | 'NO MOCK';
  sourceDetail: string;
  hasLiveContext: boolean;
  isTradable: boolean;
  theor: number;
  bid: number;
  ask: number;
  intrinsic: number;
  extrinsic: number;
  itmProb: number;
  volume: number;
  openInterest: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function liveMid(row?: LiveOptionChainRow): number | null {
  const bid = finitePositive(row?.bid);
  const ask = finitePositive(row?.ask);
  return bid != null && ask != null ? (bid + ask) / 2 : null;
}

function isTradableLiveRow(row?: LiveOptionChainRow): boolean {
  if (!row || row.quoteTradable === false) return false;
  return finitePositive(row.bid) != null && finitePositive(row.ask) != null;
}

function resolveGreeks(input: OptionChainSideInput): Greeks {
  const fallback = calculateBSGreeks(
    input.currentStockPrice,
    input.strike,
    input.daysToExpiry,
    input.strikeIV,
    input.riskFreeRate,
    input.type,
  );
  const row = input.liveRow;
  return {
    delta: row?.delta ?? fallback.delta,
    gamma: row?.gamma ?? fallback.gamma,
    vega: row?.vega ?? fallback.vega,
    theta: row?.theta ?? fallback.theta,
  };
}

function hasLiveGreeks(row?: LiveOptionChainRow): boolean {
  if (!row) return false;
  return [row.delta, row.gamma, row.vega, row.theta].every((value) => Number.isFinite(Number(value)));
}

function resolveSourceDetail(
  source: OptionChainSideMetrics['source'],
  priceSource: OptionChainSideMetrics['priceSource'],
  greeksSource: OptionChainSideMetrics['greeksSource'],
  isTradable: boolean,
): string {
  if (source === 'MODEL') {
    return '价格和希腊值均由本地 Black-Scholes 模型估算；未命中当前公开 mock 链行。';
  }
  if (!isTradable) {
    return '上游链行可用于分析，但 bid/ask 未通过可交易报价门禁；不可直接交易。';
  }
  if (priceSource === 'MOCK_QUOTE' && greeksSource === 'MOCK_GREEKS') {
    return '价格来自公开 mock 链行，希腊值来自上游兼容字段。';
  }
  return '价格来自公开 mock 链行，希腊值由本地 Black-Scholes 模型补算；请用验证面板复核。';
}

function itmProbability(input: OptionChainSideInput): number {
  if (input.daysToExpiry <= 0.01) {
    const isItm = input.type === 'call'
      ? input.currentStockPrice >= input.strike
      : input.currentStockPrice < input.strike;
    return isItm ? 100 : 0;
  }
  const t = input.daysToExpiry / 365.0;
  const sigma = input.strikeIV / 100.0;
  const rate = input.riskFreeRate / 100.0;
  if (sigma <= 0) {
    return input.type === 'call'
      ? input.currentStockPrice >= input.strike ? 100 : 0
      : input.currentStockPrice < input.strike ? 100 : 0;
  }
  const d1 = (
    Math.log(input.currentStockPrice / input.strike)
    + (rate + (sigma * sigma) / 2.0) * t
  ) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  const prob = input.type === 'call' ? cdfNormal(d2) * 100 : (1 - cdfNormal(d2)) * 100;
  return Number(prob.toFixed(2));
}

export function buildOptionChainSide(input: OptionChainSideInput): OptionChainSideMetrics {
  const modelPrice = calculateBSPrice(
    input.currentStockPrice,
    input.strike,
    input.daysToExpiry,
    input.strikeIV,
    input.riskFreeRate,
    input.type,
  );
  const mark = finitePositive(input.liveRow?.mark);
  const mid = liveMid(input.liveRow);
  const theor = Math.max(0.01, mark ?? mid ?? modelPrice);
  const isTradable = isTradableLiveRow(input.liveRow);
  const canDisplayBidAsk = !input.liveRow || isTradable;
  const bid = canDisplayBidAsk ? Math.max(0.01, round2(input.liveRow?.bid ?? theor * (1 - input.bidAskSpreadPct / 100))) : 0;
  const ask = canDisplayBidAsk ? round2(input.liveRow?.ask ?? theor * (1 + input.bidAskSpreadPct / 100)) : 0;
  const intrinsic = input.type === 'call'
    ? Math.max(0, input.currentStockPrice - input.strike)
    : Math.max(0, input.strike - input.currentStockPrice);
  const greeks = resolveGreeks(input);
  const source = input.liveRow ? 'MOCK' : 'MODEL';
  const priceSource = input.liveRow ? 'MOCK_QUOTE' : 'MODEL_BS';
  const greeksSource = hasLiveGreeks(input.liveRow) ? 'MOCK_GREEKS' : 'MODEL_BS';
  const engineLabel = source === 'MODEL' ? 'NO MOCK' : greeksSource === 'MOCK_GREEKS' ? 'MOCK' : 'MOCK+BS';

  return {
    source,
    priceSource,
    greeksSource,
    engineLabel,
    sourceDetail: resolveSourceDetail(source, priceSource, greeksSource, isTradable),
    hasLiveContext: source === 'MOCK',
    isTradable,
    theor: round2(theor),
    bid,
    ask,
    delta: greeks.delta,
    gamma: greeks.gamma,
    vega: greeks.vega,
    theta: greeks.theta,
    intrinsic,
    extrinsic: round2(Math.max(0, theor - intrinsic)),
    itmProb: itmProbability(input),
    volume: input.liveRow?.volume ?? input.fallbackVolume,
    openInterest: input.liveRow?.openInterest ?? 0,
  };
}
