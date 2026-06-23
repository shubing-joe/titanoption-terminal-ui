import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import QuantFlowRadar from './QuantFlowRadar';

const html = renderToStaticMarkup(
  <QuantFlowRadar
    currentStockPrice={100}
    activeSymbol="MRVL"
    tickerIV={52}
    asOfDate="2026-06-23"
    liveExpiries={[{ date: '2026-07-17', days: 24, label: '2026-07-17 · public mock' }]}
    liveChain={[
      { type: 'call', expiry: '2026-07-17', strike: 100, bid: 4, ask: 4.5, mark: 4.25, volume: 100, openInterest: 1200, iv: 52 },
      { type: 'put', expiry: '2026-07-17', strike: 100, bid: 3.8, ask: 4.2, mark: 4, volume: 90, openInterest: 900, iv: 55 },
    ]}
  />,
);

assert.match(html, /mock chain rows: 2/);
assert.match(html, /PUBLIC MOCK OPTION CHAIN/);
assert.match(html, /expiry count: 1/);
assert.match(html, /strike count: 1/);
assert.match(html, /total OI: 2,100/);
assert.doesNotMatch(html, /SYNTHETIC HISTORY/);
assert.doesNotMatch(html, /historical ΔOI\/Max Pain are generated/);
assert.doesNotMatch(html, /INSTITUTIONAL GRADE FEED/);

console.log('QuantFlowRadar provenance tests passed');
