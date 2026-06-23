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

console.log('optionOrderDraft helpers passed');
