import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import VolatilityOddsPanel from './VolatilityOddsPanel';

const html = renderToStaticMarkup(
  <VolatilityOddsPanel
    currentStockPrice={100}
    daysToExpiry={30}
    r={4.5}
    activeSymbol="MRVL"
    tickerIV={48}
    liveTicker={{
      symbol: 'MRVL',
      name: 'MRVL · Public Mock',
      price: 100,
      change: 1,
      changePercent: 1,
      iv: 48,
      high: 103,
      low: 97,
      volume: '1.2M',
      source: 'public_mock',
    }}
    liveVolSummary={{
      atmIv: 52,
      realizedVol: 44,
      rowCount: 120,
      source: 'public_mock_options_snapshot',
    }}
    liveExpiries={[{ date: '2026-07-17', days: 24, label: '2026-07-17 · public mock' }]}
    asOfDate="2026-06-23"
    onImportStrategy={() => undefined}
  />,
);

assert.match(html, /ENGINE: TYPESCRIPT BLACK-SCHOLES SANDBOX/);
assert.match(html, /not Rust option-core/);
assert.match(html, /MOCK VOL INPUT/);

console.log('VolatilityOddsPanel provenance tests passed');
