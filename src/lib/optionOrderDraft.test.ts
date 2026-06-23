import assert from 'node:assert/strict';

import type { OptionQuoteTicket } from './optionQuoteTicket';
import { buildOptionOrderDraft, defaultOrderDraftConfig, orderDraftContractKey } from './optionOrderDraft';

const ticket: OptionQuoteTicket = {
  contractTicker: 'O:MRVL260626C00300000',
  type: 'call',
  expiry: '2026-06-26',
  strike: 300,
  side: 'buy',
  quantity: 1,
  bid: 4.95,
  ask: 5.4,
  mid: 5.18,
  mark: 5.18,
  greeks: {
    delta: 0.52,
    gamma: 0.021,
    theta: -0.19,
    vega: 0.34,
    iv: 210,
  },
  spread: 0.45,
  spreadPct: 8.69,
  limitLadder: {
    patient: 5.29,
    fair: 5.18,
    aggressive: 5.4,
  },
  notionalAtAggressive: 540,
  freshness: {
    status: 'live',
    ageSeconds: 1,
  },
  verdict: 'watch_only',
  warnings: [],
  distribution: {
    totalVolume: 10_000,
    totalOpenInterest: 8_000,
    strikes: [],
  },
};

assert.deepEqual(defaultOrderDraftConfig(ticket), {
  side: 'buy',
  anchor: 'ask',
  quantity: 1,
  manualPremium: null,
});

assert.equal(
  orderDraftContractKey({ ...ticket, bid: 5.1, ask: 5.55, mid: 5.33 }),
  orderDraftContractKey(ticket),
);
assert.notEqual(
  orderDraftContractKey({ ...ticket, contractTicker: 'O:MRVL260626C00310000', strike: 310 }),
  orderDraftContractKey(ticket),
);

const askDraft = buildOptionOrderDraft(ticket, {
  side: 'buy',
  anchor: 'ask',
  quantity: 3,
  manualPremium: null,
});

assert.equal(askDraft.premium, 5.4);
assert.equal(askDraft.notional, 1620);
assert.equal(askDraft.slippageFromMid, 0.22);
assert.equal(askDraft.slippagePctFromMid, 4.25);

const manualDraft = buildOptionOrderDraft(ticket, {
  side: 'sell',
  anchor: 'manual',
  quantity: 2,
  manualPremium: 5.05,
});

assert.equal(manualDraft.side, 'sell');
assert.equal(manualDraft.premium, 5.05);
assert.equal(manualDraft.notional, 1010);
assert.equal(manualDraft.slippageFromMid, -0.13);
assert.equal(manualDraft.slippagePctFromMid, -2.51);

const sellSelectedTicket: OptionQuoteTicket = {
  ...ticket,
  side: 'sell',
  bid: 4.92,
  ask: 5.36,
  mid: 5.14,
  mark: 5.14,
  limitLadder: {
    patient: 5.25,
    fair: 5.14,
    aggressive: 4.92,
  },
};

const buyAggressiveFromSellTicket = buildOptionOrderDraft(sellSelectedTicket, {
  side: 'buy',
  anchor: 'aggressive',
  quantity: 1,
  manualPremium: null,
});

assert.equal(buyAggressiveFromSellTicket.premium, 5.36);
assert.equal(buyAggressiveFromSellTicket.notional, 536);
assert.equal(buyAggressiveFromSellTicket.slippageFromMid, 0.22);

const buyPatientFromSellTicket = buildOptionOrderDraft(sellSelectedTicket, {
  side: 'buy',
  anchor: 'patient',
  quantity: 1,
  manualPremium: null,
});

assert.equal(buyPatientFromSellTicket.premium, 5.03);
assert.equal(buyPatientFromSellTicket.slippageFromMid, -0.11);

const sellPatientFromSellTicket = buildOptionOrderDraft(sellSelectedTicket, {
  side: 'sell',
  anchor: 'patient',
  quantity: 1,
  manualPremium: null,
});

assert.equal(sellPatientFromSellTicket.premium, 5.25);
assert.equal(sellPatientFromSellTicket.slippageFromMid, 0.11);

console.log('optionOrderDraft helpers passed');
