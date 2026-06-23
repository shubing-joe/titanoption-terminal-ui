import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import OptionQuoteWorkbench from './OptionQuoteWorkbench';
import type { LiveOptionChainRow, OptionType } from '../types';
import { buildOptionQuoteTicket } from '../lib/optionQuoteTicket';

function row(
  type: OptionType,
  strike: number,
  bid: number,
  ask: number,
  volume: number,
  openInterest: number,
): LiveOptionChainRow {
  return {
    contractTicker: `O:MRVL260626${type === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`,
    type,
    expiry: '2026-06-26',
    strike,
    bid,
    ask,
    mark: Number(((bid + ask) / 2).toFixed(3)),
    volume,
    openInterest,
    iv: 210,
    delta: type === 'call' ? 0.52 : -0.48,
    gamma: 0.021,
    theta: -0.19,
    vega: 0.34,
    quoteTimestamp: 1782159299925625600,
    source: 'public_mock_options_snapshot',
    quoteTradable: true,
  };
}

const chain = [
  row('call', 300, 4.95, 5.4, 1_310, 922),
  row('put', 300, 4.05, 4.6, 290, 360),
  row('call', 310, 3.7, 4.2, 1_290, 810),
  row('put', 310, 4.65, 5.3, 120, 180),
  row('call', 330, 2.2, 2.6, 970, 620),
  row('put', 330, 5.8, 6.4, 240, 330),
];

const ticket = buildOptionQuoteTicket({
  chain,
  selected: chain[0],
  side: 'sell',
  quantity: 1,
  selectedLegRefreshSeconds: 1,
  nowMs: 1782159300925,
});

const html = renderToStaticMarkup(
  <OptionQuoteWorkbench
    quoteTicket={ticket}
    activeSymbol="MRVL"
    scaleMode="unit"
  />,
);

assert.match(html, /MRVL 2026-06-26 300C/);
assert.match(html, /五档深度报价 \(5-Level Depth\)/);
assert.match(html, /Option Premium Price/);
assert.match(html, /选择定价锚点/);
assert.match(html, /Prepared Notional/);
assert.match(html, /BBO/);
assert.match(html, /REAL BBO DERIVED/);
assert.match(html, /Options Greeks/);
assert.match(html, /Option Chips Heatmap/);
assert.match(html, /Watch Only · No Broker Submit/);
assert.match(html, /cursor-not-allowed/);
assert.match(html, /\$4\.95/);
assert.match(html, /\$5\.18/);
assert.match(html, /\$5\.40/);
assert.match(html, /210\.0%/);
assert.match(html, /0\.5200/);
assert.match(html, /不生成模拟盘口/);
assert.doesNotMatch(html, /STRICT VALIDATION GATE/);
assert.doesNotMatch(html, /broker-final/i);
assert.doesNotMatch(html, /Math\.sin/);
assert.doesNotMatch(html, /Math\.cos/);

console.log('OptionQuoteWorkbench render tests passed');
