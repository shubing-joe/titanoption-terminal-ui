import type { OptionQuoteTicket, QuoteTicketSide } from './optionQuoteTicket';

export type OrderPriceAnchor = 'patient' | 'fair' | 'aggressive' | 'bid' | 'mid' | 'ask' | 'manual';

export interface OptionOrderDraftConfig {
  side: QuoteTicketSide;
  anchor: OrderPriceAnchor;
  quantity: number;
  manualPremium?: number | null;
}

export interface OptionOrderDraft {
  side: QuoteTicketSide;
  anchor: OrderPriceAnchor;
  quantity: number;
  premium: number | null;
  notional: number | null;
  slippageFromMid: number | null;
  slippagePctFromMid: number | null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sideAwareLimitPremium(ticket: OptionQuoteTicket, side: QuoteTicketSide, anchor: OrderPriceAnchor): number | null {
  if (anchor === 'fair') return ticket.mid;
  if (side === 'buy') {
    if (anchor === 'patient') return round2((ticket.bid + ticket.mid) / 2);
    if (anchor === 'aggressive') return ticket.ask;
    return null;
  }
  if (anchor === 'patient') return round2((ticket.mid + ticket.ask) / 2);
  if (anchor === 'aggressive') return ticket.bid;
  return null;
}

export function defaultOrderDraftConfig(ticket: OptionQuoteTicket | null): OptionOrderDraftConfig {
  return {
    side: ticket?.side ?? 'buy',
    anchor: ticket?.side === 'sell' ? 'bid' : 'ask',
    quantity: ticket?.quantity ?? 1,
    manualPremium: null,
  };
}

export function orderDraftContractKey(ticket: OptionQuoteTicket | null): string {
  if (!ticket) return 'no-contract';
  return [
    ticket.contractTicker || 'missing-ticker',
    ticket.expiry,
    ticket.type,
    ticket.strike,
  ].join(':');
}

export function premiumForAnchor(
  ticket: OptionQuoteTicket | null,
  anchor: OrderPriceAnchor,
  manualPremium?: number | null,
  side?: QuoteTicketSide,
): number | null {
  if (!ticket) return null;
  if (anchor === 'manual') return finitePositive(manualPremium);
  if (anchor === 'patient' || anchor === 'fair' || anchor === 'aggressive') {
    return sideAwareLimitPremium(ticket, side ?? ticket.side, anchor);
  }
  if (anchor === 'bid') return ticket.bid;
  if (anchor === 'mid') return ticket.mid;
  return ticket.ask;
}

export function buildOptionOrderDraft(
  ticket: OptionQuoteTicket | null,
  config: OptionOrderDraftConfig,
): OptionOrderDraft {
  const quantity = Math.max(1, Math.floor(Number(config.quantity) || 1));
  const premium = premiumForAnchor(ticket, config.anchor, config.manualPremium, config.side);
  const notional = premium == null ? null : round2(premium * quantity * 100);
  const slippageFromMid = ticket && premium != null ? round2(premium - ticket.mid) : null;
  const slippagePctFromMid = ticket && premium != null && ticket.mid > 0
    ? round2((slippageFromMid! / ticket.mid) * 100)
    : null;

  return {
    side: config.side,
    anchor: config.anchor,
    quantity,
    premium,
    notional,
    slippageFromMid,
    slippagePctFromMid,
  };
}
