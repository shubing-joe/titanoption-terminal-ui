import assert from 'node:assert/strict';

import { mockChainRows } from '../fixtures/mockTerminalData';
import { buildQuoteTicket } from './quoteTicket';

const selected = mockChainRows.find(row => row.strike === 80 && row.type === 'call');
assert.ok(selected);

const ticket = buildQuoteTicket(
  selected,
  mockChainRows,
  'buy',
  '2026-06-23T14:30:03.000Z',
);

assert.equal(ticket.mid, 5.75);
assert.equal(ticket.spread, 0.3);
assert.equal(ticket.spreadPct, 5.22);
assert.equal(ticket.quoteAgeSeconds, 3);
assert.deepEqual(ticket.ladder, {
  patient: 5.6,
  fair: 5.75,
  aggressive: 5.9,
});
assert.equal(ticket.verdict, 'tradable');
assert.equal(ticket.warnings.length, 0);
assert.equal(ticket.liquidity[0].strike, 80);
assert.equal(ticket.liquidity[0].concentration >= 0.39, true);

const staleWide = buildQuoteTicket(
  mockChainRows.find(row => row.strike === 90) || mockChainRows[0],
  mockChainRows,
  'sell',
  '2026-06-23T14:30:03.000Z',
);

assert.equal(staleWide.verdict, 'watch_only');
assert.equal(staleWide.warnings.some(item => item.includes('stale')), true);
assert.equal(staleWide.warnings.some(item => item.includes('wide spread')), true);
assert.equal(staleWide.ladder.patient > staleWide.ladder.aggressive, true);

console.log('quoteTicket helpers passed');
