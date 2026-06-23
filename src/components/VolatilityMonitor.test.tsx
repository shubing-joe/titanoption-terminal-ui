import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import VolatilityMonitor from './VolatilityMonitor';
import type { LiveVolSurface } from '../types';

const backendSurface: LiveVolSurface = {
  source: 'backend_calculated',
  termStructure: [
    { expiry: '2026-07-17', days: 24, atmIv: 52, fwdIv: 54, skew25d: -2.1, sampleSize: 60 },
  ],
  atmIvHistory: [
    { date: '2026-06-23', terms: { '1d': 52, '1w': 52, '1m': 52, '3m': 54, '6m': 56 } },
  ],
  skewHistory: [
    { date: '2026-06-23', terms: { '1d': -2.1, '1w': -2.1, '1m': -2.1, '3m': -1.8, '6m': -1.4 } },
  ],
  realizedVolHistory: [
    { date: '2026-06-23', terms: { '1d': 44, '1w': 45, '1m': 46, '3m': 47, '6m': 48 } },
  ],
  diagnostics: { acceptedOptionRows: 120 },
};

const backendHtml = renderToStaticMarkup(
  <VolatilityMonitor
    currentStockPrice={100}
    daysToExpiry={30}
    r={4.5}
    activeSymbol="MRVL"
    tickerIV={48}
    liveVolSummary={{ atmIv: 52, realizedVol: 44, rowCount: 120, source: 'public_mock_options_snapshot' }}
    liveVolSurface={backendSurface}
    liveExpiries={[{ date: '2026-07-17', days: 24, label: '2026-07-17 · LIVE' }]}
    asOfDate="2026-06-23"
  />,
);

assert.match(backendHtml, /SOURCE: BACKEND VOL SURFACE/);
assert.match(backendHtml, /backend_calculated/);

const fallbackHtml = renderToStaticMarkup(
  <VolatilityMonitor
    currentStockPrice={100}
    daysToExpiry={30}
    r={4.5}
    activeSymbol="MRVL"
    tickerIV={48}
    asOfDate="2026-06-23"
  />,
);

assert.match(fallbackHtml, /SOURCE: FRONTEND FALLBACK MODEL/);
assert.match(fallbackHtml, /not live history/);

console.log('VolatilityMonitor provenance tests passed');
