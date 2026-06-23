import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ThreeDChart from './ThreeDChart';
import type { OptionLeg, RustPositionAnalysisResponse } from '../types';

const legs: OptionLeg[] = [
  {
    id: 'long_call',
    type: 'call',
    side: 'buy',
    strike: 100,
    expiryDays: 30,
    quantity: 1,
    iv: 30,
    premium: 4,
    isCustomPremium: false,
  },
];

const rustAnalysis: RustPositionAnalysisResponse = {
  ok: true,
  engine: 'rust-option-core-cli',
  result: {
    engine: 'rust-option-core',
    net_premium: 400,
    current_pnl: 12,
    max_profit: Infinity,
    max_loss: -400,
    breakevens: [104],
    greeks: { delta: 0.5, gamma: 0.01, vega: 0.12, theta: -0.04 },
    scenarios: [],
  },
};

const html = renderToStaticMarkup(
  <ThreeDChart
    legs={legs}
    currentStockPrice={100}
    daysToExpiry={30}
    asOfDate="2026-06-22"
    r={4.5}
    rustAnalysis={rustAnalysis}
  />,
);

assert.match(html, /隐藏标注/);
assert.match(html, /Surface: UNAVAILABLE · Boundaries: Rust option-core/);
assert.match(html, /3D 边界标注/);

console.log('ThreeDChart render tests passed');
