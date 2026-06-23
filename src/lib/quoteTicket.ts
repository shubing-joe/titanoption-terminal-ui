import type { LiquidityStrike, OptionChainRow, QuoteTicket, TicketSide, TicketVerdict } from '../types';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function secondsBetween(nowIso: string, thenIso: string): number {
  const now = new Date(nowIso).getTime();
  const then = new Date(thenIso).getTime();
  if (!Number.isFinite(now) || !Number.isFinite(then)) return 9999;
  return Math.max(0, Math.round((now - then) / 1000));
}

function buildLiquidity(row: OptionChainRow, rows: OptionChainRow[]): LiquidityStrike[] {
  const sameExpiry = rows.filter(item => item.expiry === row.expiry && item.type === row.type);
  const total = sameExpiry.reduce((sum, item) => sum + item.volume + item.openInterest, 0) || 1;
  return sameExpiry
    .map(item => ({
      strike: item.strike,
      volume: item.volume,
      openInterest: item.openInterest,
      concentration: round2((item.volume + item.openInterest) / total),
    }))
    .sort((left, right) => (right.volume + right.openInterest) - (left.volume + left.openInterest))
    .slice(0, 5);
}

function buildLadder(row: OptionChainRow, side: TicketSide, mid: number) {
  if (side === 'buy') {
    return {
      patient: round2(row.bid),
      fair: round2(mid),
      aggressive: round2(row.ask),
    };
  }
  return {
    patient: round2(row.ask),
    fair: round2(mid),
    aggressive: round2(row.bid),
  };
}

export function buildQuoteTicket(
  row: OptionChainRow,
  rows: OptionChainRow[],
  side: TicketSide,
  nowIso: string,
): QuoteTicket {
  const mid = round2((row.bid + row.ask) / 2);
  const spread = round2(row.ask - row.bid);
  const spreadPct = mid > 0 ? round2((spread / mid) * 100) : 999;
  const quoteAgeSeconds = secondsBetween(nowIso, row.quoteTimestamp);
  const warnings: string[] = [];

  if (!row.quoteTradable) warnings.push('quote is marked non-tradable');
  if (quoteAgeSeconds > 30) warnings.push(`stale quote: ${quoteAgeSeconds}s old`);
  if (spreadPct > 20) warnings.push(`wide spread: ${spreadPct}%`);

  let verdict: TicketVerdict = 'tradable';
  if (!row.quoteTradable) {
    verdict = 'blocked';
  } else if (warnings.length > 0) {
    verdict = 'watch_only';
  }

  return {
    side,
    row,
    mid,
    spread,
    spreadPct,
    quoteAgeSeconds,
    ladder: buildLadder(row, side, mid),
    liquidity: buildLiquidity(row, rows),
    verdict,
    warnings,
  };
}
