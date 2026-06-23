import type { LiveOptionChainRow, OptionLeg } from '../types';
import { calculateBSPrice } from './optionsMath';

export type AutoPremiumSource = 'live_chain' | 'model' | 'locked';

export interface AutoPremiumInput {
  liveChain: LiveOptionChainRow[];
  asOfDate?: string;
  stockPrice: number;
  riskFreeRate: number;
}

export interface AutoPremiumResult {
  premium: number;
  source: AutoPremiumSource;
}

function expiryDateFromDays(asOfDate: string | undefined, days: number): string | null {
  if (!asOfDate || !Number.isFinite(days)) return null;
  const date = new Date(`${asOfDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.round(days)));
  return date.toISOString().slice(0, 10);
}

function roundPremium(value: number): number {
  return Number(Math.max(0.01, value).toFixed(2));
}

function findLiveRow(leg: OptionLeg, liveChain: LiveOptionChainRow[], expiryDate: string | null): LiveOptionChainRow | undefined {
  if (!expiryDate) return undefined;
  return liveChain.find(row => (
    row.type === leg.type
    && row.expiry === expiryDate
    && Number(row.strike) === Number(leg.strike)
  ));
}

export function resolveAutoLegPremium(leg: OptionLeg, input: AutoPremiumInput): AutoPremiumResult {
  if (leg.isCustomPremium) {
    return { premium: leg.premium, source: 'locked' };
  }

  const expiryDate = expiryDateFromDays(input.asOfDate, leg.expiryDays);
  const liveRow = findLiveRow(leg, input.liveChain, expiryDate);
  if (liveRow) {
    const livePremium = leg.side === 'buy' ? Number(liveRow.ask) : Number(liveRow.bid);
    if (Number.isFinite(livePremium) && livePremium > 0) {
      return { premium: roundPremium(livePremium), source: 'live_chain' };
    }
    const mark = Number(liveRow.mark);
    if (Number.isFinite(mark) && mark > 0) {
      return { premium: roundPremium(mark), source: 'live_chain' };
    }
  }

  const modelPremium = calculateBSPrice(
    input.stockPrice,
    leg.strike,
    leg.expiryDays,
    leg.iv,
    input.riskFreeRate,
    leg.type,
  );
  return { premium: roundPremium(modelPremium), source: 'model' };
}
