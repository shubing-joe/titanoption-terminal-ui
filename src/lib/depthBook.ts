import type { OptionQuoteTicket } from './optionQuoteTicket';

export type DepthBookTickSize = 0.01 | 0.05 | 0.1 | 0.5;

export const DEPTH_BOOK_TICK_SIZES: DepthBookTickSize[] = [0.01, 0.05, 0.1, 0.5];

export interface DepthBookLevel {
  side: 'ask' | 'bid';
  label: string;
  price: number;
  size: number;
  pct: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function roundDownToTick(value: number, tickSize: DepthBookTickSize): number {
  return round2(Math.floor((value + 1e-9) / tickSize) * tickSize);
}

function roundUpToTick(value: number, tickSize: DepthBookTickSize): number {
  return round2(Math.ceil((value - 1e-9) / tickSize) * tickSize);
}

function derivedDepthBase(ticket: OptionQuoteTicket): number {
  const selectedStrike = ticket.distribution.strikes.find((item) => item.strike === ticket.strike);
  const selectedOi = selectedStrike?.totalOpenInterest ?? 0;
  const selectedVolume = selectedStrike?.totalVolume ?? 0;
  const liquidity = Math.max(
    selectedOi,
    selectedVolume,
    ticket.distribution.totalOpenInterest / 20,
    ticket.distribution.totalVolume / 20,
    100,
  );
  return Math.max(1, Math.round(liquidity / 15));
}

export function buildDepthBookLevels(
  ticket: OptionQuoteTicket | null,
  tickSize: DepthBookTickSize,
): DepthBookLevel[] {
  if (!ticket) return [];
  const askTop = roundUpToTick(ticket.ask, tickSize);
  const bidTop = roundDownToTick(ticket.bid, tickSize);
  const baseSize = derivedDepthBase(ticket);
  const bucketScale = Math.max(1, tickSize / 0.01);
  const sideBias = ticket.distribution.strikes.find((item) => item.strike === ticket.strike);
  const callShare = sideBias && sideBias.totalOpenInterest > 0
    ? sideBias.callOpenInterest / sideBias.totalOpenInterest
    : 0.5;
  const bidBias = 0.85 + callShare * 0.3;
  const askBias = 1.15 - callShare * 0.3;
  const weights = [1, 0.95, 0.88, 0.78, 0.66];

  const asks = weights.map((weight, index) => {
    const price = round2(askTop + tickSize * (4 - index));
    const size = Math.max(1, Math.round(baseSize * bucketScale * weight * askBias));
    return {
      side: 'ask' as const,
      label: `ASK ${5 - index}`,
      price,
      size,
      pct: 1,
    };
  });
  const bids = weights.map((weight, index) => {
    const price = Math.max(0, round2(bidTop - tickSize * index));
    const size = Math.max(1, Math.round(baseSize * bucketScale * weight * bidBias));
    return {
      side: 'bid' as const,
      label: `BID ${index + 1}`,
      price,
      size,
      pct: 1,
    };
  });
  const levels = [...asks, ...bids];
  const maxSize = Math.max(1, ...levels.map((level) => level.size));
  return levels.map((level) => ({
    ...level,
    pct: Math.max(4, Math.round((level.size / maxSize) * 100)),
  }));
}
