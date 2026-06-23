import type { LiveOptionChainRow, OptionType } from '../types';

export type QuoteTicketSide = 'buy' | 'sell';
export type QuoteFreshnessStatus = 'live' | 'stale' | 'missing';
export type QuoteTicketVerdict = 'executable' | 'watch_only' | 'forbidden';

export interface OptionQuoteTicketInput {
  chain: LiveOptionChainRow[];
  selected?: LiveOptionChainRow | null;
  side: QuoteTicketSide;
  quantity: number;
  selectedLegRefreshSeconds?: number | null;
  nowMs?: number;
}

export interface OptionStrikeDistribution {
  strike: number;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
  callOpenInterest: number;
  putOpenInterest: number;
  totalOpenInterest: number;
  volumeSharePct: number;
  openInterestSharePct: number;
  dominantSide: OptionType | 'balanced';
}

export interface OptionQuoteTicket {
  contractTicker: string;
  type: OptionType;
  expiry: string;
  strike: number;
  side: QuoteTicketSide;
  quantity: number;
  bid: number;
  ask: number;
  mid: number;
  mark: number;
  spread: number;
  spreadPct: number;
  limitLadder: {
    patient: number;
    fair: number;
    aggressive: number;
  };
  notionalAtAggressive: number;
  freshness: {
    status: QuoteFreshnessStatus;
    ageSeconds: number | null;
    quoteTimestamp?: string | number | null;
  };
  verdict: QuoteTicketVerdict;
  warnings: string[];
  distribution: {
    totalVolume: number;
    totalOpenInterest: number;
    strikes: OptionStrikeDistribution[];
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function parseQuoteTimestampMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^[0-9]+$/.test(String(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (numeric > 1e17) return numeric / 1_000_000;
    if (numeric > 1e14) return numeric / 1_000;
    return numeric;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFreshness(
  selected: LiveOptionChainRow,
  selectedLegRefreshSeconds: number | null | undefined,
  nowMs: number,
) {
  const timestampMs = parseQuoteTimestampMs(selected.quoteTimestamp);
  const maxAgeSeconds = Math.max(1, Number(selectedLegRefreshSeconds || 1)) * 2.5;
  if (timestampMs == null) {
    return {
      status: 'missing' as QuoteFreshnessStatus,
      ageSeconds: null,
      quoteTimestamp: selected.quoteTimestamp,
    };
  }
  const ageSeconds = Math.max(0, (nowMs - timestampMs) / 1000);
  return {
    status: ageSeconds <= maxAgeSeconds ? 'live' as QuoteFreshnessStatus : 'stale' as QuoteFreshnessStatus,
    ageSeconds: round2(ageSeconds),
    quoteTimestamp: selected.quoteTimestamp,
  };
}

function buildLimitLadder(side: QuoteTicketSide, bid: number, ask: number, mid: number) {
  if (side === 'buy') {
    return {
      patient: round2((bid + mid) / 2),
      fair: round2(mid),
      aggressive: round2(ask),
    };
  }
  return {
    patient: round2((mid + ask) / 2),
    fair: round2(mid),
    aggressive: round2(bid),
  };
}

function buildDistribution(chain: LiveOptionChainRow[], expiry: string): OptionQuoteTicket['distribution'] {
  const byStrike = new Map<number, OptionStrikeDistribution>();
  for (const row of chain) {
    if (row.expiry !== expiry) continue;
    const strike = finiteNumber(row.strike);
    if (strike <= 0) continue;
    const existing = byStrike.get(strike) ?? {
      strike,
      callVolume: 0,
      putVolume: 0,
      totalVolume: 0,
      callOpenInterest: 0,
      putOpenInterest: 0,
      totalOpenInterest: 0,
      volumeSharePct: 0,
      openInterestSharePct: 0,
      dominantSide: 'balanced' as const,
    };
    const volume = Math.max(0, finiteNumber(row.volume));
    const oi = Math.max(0, finiteNumber(row.openInterest));
    if (row.type === 'call') {
      existing.callVolume += volume;
      existing.callOpenInterest += oi;
    } else {
      existing.putVolume += volume;
      existing.putOpenInterest += oi;
    }
    existing.totalVolume += volume;
    existing.totalOpenInterest += oi;
    byStrike.set(strike, existing);
  }

  const strikes = Array.from(byStrike.values());
  const totalVolume = strikes.reduce((sum, item) => sum + item.totalVolume, 0);
  const totalOpenInterest = strikes.reduce((sum, item) => sum + item.totalOpenInterest, 0);
  const enriched = strikes.map((item) => {
    const dominantSide: OptionStrikeDistribution['dominantSide'] = item.callVolume === item.putVolume
      ? 'balanced'
      : item.callVolume > item.putVolume ? 'call' : 'put';
    return {
      ...item,
      dominantSide,
      volumeSharePct: totalVolume > 0 ? round2((item.totalVolume / totalVolume) * 100) : 0,
      openInterestSharePct: totalOpenInterest > 0 ? round2((item.totalOpenInterest / totalOpenInterest) * 100) : 0,
    };
  }).sort((a, b) => (
    b.totalVolume - a.totalVolume
    || b.totalOpenInterest - a.totalOpenInterest
    || Math.abs(a.strike - finiteNumber(expiry)) - Math.abs(b.strike - finiteNumber(expiry))
  ));

  return {
    totalVolume,
    totalOpenInterest,
    strikes: enriched,
  };
}

export function buildOptionQuoteTicket(input: OptionQuoteTicketInput): OptionQuoteTicket | null {
  const selected = input.selected;
  if (!selected) return null;
  const bid = round2(finiteNumber(selected.bid));
  const ask = round2(finiteNumber(selected.ask));
  const mark = round2(finiteNumber(selected.mark, (bid + ask) / 2));
  const mid = round2((bid + ask) / 2);
  const spread = round2(Math.max(0, ask - bid));
  const spreadPct = mid > 0 ? round2((spread / mid) * 100) : 0;
  const quantity = Math.max(1, Math.floor(finiteNumber(input.quantity, 1)));
  const freshness = buildFreshness(selected, input.selectedLegRefreshSeconds, input.nowMs ?? Date.now());
  const quoteTradable = selected.quoteTradable !== false && bid > 0 && ask > 0 && ask >= bid;
  const warnings: string[] = [];
  if (!quoteTradable) warnings.push('报价未通过可交易门禁');
  if (freshness.status !== 'live') warnings.push('报价不够新鲜，只能观察');
  if (spreadPct >= 10) warnings.push('价差偏宽，优先使用 fair/patient 限价');
  const verdict: QuoteTicketVerdict = !quoteTradable
    ? 'forbidden'
    : freshness.status === 'live' && spreadPct <= 8 ? 'executable' : 'watch_only';
  const limitLadder = buildLimitLadder(input.side, bid, ask, mid);

  return {
    contractTicker: selected.contractTicker || '',
    type: selected.type,
    expiry: selected.expiry,
    strike: finiteNumber(selected.strike),
    side: input.side,
    quantity,
    bid,
    ask,
    mid,
    mark,
    spread,
    spreadPct,
    limitLadder,
    notionalAtAggressive: round4(limitLadder.aggressive * quantity * 100),
    freshness,
    verdict,
    warnings,
    distribution: buildDistribution(input.chain, selected.expiry),
  };
}
