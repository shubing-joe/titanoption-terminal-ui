import assert from 'node:assert/strict';

import type { OptionQuoteTicket } from './optionQuoteTicket';
import { buildDepthBookLevels } from './depthBook';

const ticket: OptionQuoteTicket = {
  contractTicker: 'O:SOXL260629C00029000',
  type: 'call',
  expiry: '2026-06-29',
  strike: 29,
  side: 'buy',
  quantity: 1,
  bid: 15.54,
  ask: 15.56,
  mid: 15.55,
  mark: 15.55,
  greeks: {
    delta: 0.7885,
    gamma: 0.018,
    theta: -1.0954,
    vega: 0.0924,
    iv: 185,
  },
  spread: 0.02,
  spreadPct: 0.13,
  limitLadder: {
    patient: 15.55,
    fair: 15.55,
    aggressive: 15.56,
  },
  notionalAtAggressive: 1556,
  freshness: {
    status: 'live',
    ageSeconds: 1,
  },
  verdict: 'executable',
  warnings: [],
  distribution: {
    totalVolume: 82_000,
    totalOpenInterest: 96_000,
    strikes: [
      {
        strike: 29,
        callVolume: 8_300,
        putVolume: 1_700,
        totalVolume: 10_000,
        callOpenInterest: 68_000,
        putOpenInterest: 32_000,
        totalOpenInterest: 100_000,
        volumeSharePct: 68,
        openInterestSharePct: 52,
        dominantSide: 'call',
      },
    ],
  },
};

const penny = buildDepthBookLevels(ticket, 0.01);
const nickel = buildDepthBookLevels(ticket, 0.05);

assert.deepEqual(
  penny.filter((level) => level.side === 'ask').map((level) => level.price),
  [15.6, 15.59, 15.58, 15.57, 15.56],
);
assert.deepEqual(
  penny.filter((level) => level.side === 'bid').map((level) => level.price),
  [15.54, 15.53, 15.52, 15.51, 15.5],
);

assert.deepEqual(
  nickel.filter((level) => level.side === 'ask').map((level) => level.price),
  [15.8, 15.75, 15.7, 15.65, 15.6],
);
assert.deepEqual(
  nickel.filter((level) => level.side === 'bid').map((level) => level.price),
  [15.5, 15.45, 15.4, 15.35, 15.3],
);

assert.ok(
  nickel.filter((level) => level.side === 'bid')[0].size > penny.filter((level) => level.side === 'bid')[0].size,
  'larger tick buckets should aggregate more displayed depth',
);
assert.equal(penny.every((level) => level.pct > 0 && level.pct <= 100), true);
assert.equal(nickel.every((level) => level.pct > 0 && level.pct <= 100), true);

console.log('depthBook helpers passed');
