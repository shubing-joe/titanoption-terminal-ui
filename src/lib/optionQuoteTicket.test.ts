import assert from 'node:assert/strict';

import type { LiveOptionChainRow, OptionType } from '../types';
import { buildOptionQuoteTicket } from './optionQuoteTicket';

function row(
  type: OptionType,
  strike: number,
  bid: number,
  ask: number,
  volume: number,
  openInterest: number,
): LiveOptionChainRow {
  return {
    contractTicker: `O:SOXL260626${type === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`,
    type,
    expiry: '2026-06-26',
    strike,
    bid,
    ask,
    mark: Number(((bid + ask) / 2).toFixed(3)),
    volume,
    openInterest,
    iv: 210,
    quoteTimestamp: 1782159299925625600,
    source: 'public_mock_options_snapshot',
    quoteTradable: true,
  };
}

const chain = [
  row('call', 297.5, 26.3, 29.05, 319, 210),
  row('put', 297.5, 24.05, 26.6, 148, 1),
  row('call', 300, 25.35, 27, 2118, 1922),
  row('put', 300, 25.05, 28, 608, 105),
  row('call', 302.5, 23.85, 26.9, 161, 109),
  row('put', 302.5, 26.25, 29.5, 37, 0),
  row('call', 305, 22.1, 25.4, 338, 277),
  row('put', 305, 27.6, 30.6, 47, 3),
];

const ticket = buildOptionQuoteTicket({
  chain,
  selected: chain[2],
  side: 'buy',
  quantity: 1,
  selectedLegRefreshSeconds: 1,
  nowMs: 1782159300925,
});

assert.equal(ticket.contractTicker, 'O:SOXL260626C00300000');
assert.equal(ticket.side, 'buy');
assert.equal(ticket.bid, 25.35);
assert.equal(ticket.ask, 27);
assert.equal(ticket.mid, 26.18);
assert.equal(ticket.spread, 1.65);
assert.equal(ticket.spreadPct, 6.3);
assert.equal(ticket.limitLadder.patient, 25.77);
assert.equal(ticket.limitLadder.fair, 26.18);
assert.equal(ticket.limitLadder.aggressive, 27);
assert.equal(ticket.freshness.status, 'live');
assert.equal(ticket.verdict, 'executable');
assert.equal(ticket.distribution.totalVolume, 3776);
assert.equal(ticket.distribution.totalOpenInterest, 2627);
assert.deepEqual(
  ticket.distribution.strikes.slice(0, 2).map((item) => ({
    strike: item.strike,
    volumeSharePct: item.volumeSharePct,
    openInterestSharePct: item.openInterestSharePct,
    dominantSide: item.dominantSide,
  })),
  [
    { strike: 300, volumeSharePct: 72.19, openInterestSharePct: 77.16, dominantSide: 'call' },
    { strike: 297.5, volumeSharePct: 12.37, openInterestSharePct: 8.03, dominantSide: 'call' },
  ],
);

const sellTicket = buildOptionQuoteTicket({
  chain,
  selected: chain[2],
  side: 'sell',
  quantity: 2,
  selectedLegRefreshSeconds: 1,
  nowMs: 1782159300925,
});

assert.equal(sellTicket.limitLadder.patient, 26.59);
assert.equal(sellTicket.limitLadder.fair, 26.18);
assert.equal(sellTicket.limitLadder.aggressive, 25.35);
assert.equal(sellTicket.notionalAtAggressive, 5070);

const wideSpreadTicket = buildOptionQuoteTicket({
  chain,
  selected: chain[3],
  side: 'buy',
  quantity: 1,
  selectedLegRefreshSeconds: 1,
  nowMs: 1782159300925,
});

assert.equal(wideSpreadTicket?.spreadPct, 11.12);
assert.equal(wideSpreadTicket?.verdict, 'watch_only');
assert.equal(wideSpreadTicket?.warnings.includes('价差偏宽，优先使用 fair/patient 限价'), true);

console.log('optionQuoteTicket helpers passed');
