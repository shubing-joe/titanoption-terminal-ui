import assert from 'node:assert/strict';

import { resolveAutoLegPremium } from './livePremium';

const liveChain = [
  {
    type: 'call' as const,
    expiry: '2026-06-18',
    strike: 310,
    bid: 12.4,
    ask: 12.9,
    mark: 12.65,
    volume: 100,
    openInterest: 200,
    iv: 146.7,
  },
  {
    type: 'put' as const,
    expiry: '2026-06-18',
    strike: 300,
    bid: 5.1,
    ask: 5.5,
    mark: 5.3,
    volume: 100,
    openInterest: 200,
    iv: 122.1,
  },
];

assert.deepEqual(
  resolveAutoLegPremium(
    {
      id: 'leg-live-buy-call',
      type: 'call',
      side: 'buy',
      strike: 310,
      expiryDays: 2,
      quantity: 1,
      iv: 146.7,
      premium: 99,
      isCustomPremium: false,
    },
    {
      liveChain,
      asOfDate: '2026-06-16',
      stockPrice: 308.88,
      riskFreeRate: 4.5,
    },
  ),
  { premium: 12.9, source: 'live_chain' },
);

assert.deepEqual(
  resolveAutoLegPremium(
    {
      id: 'leg-live-sell-put',
      type: 'put',
      side: 'sell',
      strike: 300,
      expiryDays: 2,
      quantity: 1,
      iv: 122.1,
      premium: 99,
      isCustomPremium: false,
    },
    {
      liveChain,
      asOfDate: '2026-06-16',
      stockPrice: 308.88,
      riskFreeRate: 4.5,
    },
  ),
  { premium: 5.1, source: 'live_chain' },
);

const fallback = resolveAutoLegPremium(
  {
    id: 'leg-model',
    type: 'call',
    side: 'buy',
    strike: 400,
    expiryDays: 2,
    quantity: 1,
    iv: 60,
    premium: 99,
    isCustomPremium: false,
  },
  {
    liveChain,
    asOfDate: '2026-06-16',
    stockPrice: 308.88,
    riskFreeRate: 4.5,
  },
);
assert.equal(fallback.source, 'model');
assert.equal(fallback.premium >= 0.01, true);

assert.deepEqual(
  resolveAutoLegPremium(
    {
      id: 'leg-locked',
      type: 'call',
      side: 'buy',
      strike: 310,
      expiryDays: 2,
      quantity: 1,
      iv: 146.7,
      premium: 13.33,
      isCustomPremium: true,
    },
    {
      liveChain,
      asOfDate: '2026-06-16',
      stockPrice: 308.88,
      riskFreeRate: 4.5,
    },
  ),
  { premium: 13.33, source: 'locked' },
);

console.log('livePremium helpers passed');
