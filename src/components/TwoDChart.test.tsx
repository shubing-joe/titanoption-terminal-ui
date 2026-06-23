import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import TwoDChart from './TwoDChart';
import type { OptionLeg } from '../types';

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

const html = renderToStaticMarkup(
  <TwoDChart
    legs={legs}
    currentStockPrice={100}
    daysToExpiry={30}
    r={4.5}
  />,
);

assert.match(html, /id="two-d-panel"/);
assert.match(html, /data-chart-area="2d-payoff"/);
assert.match(html, /min-h-0/);

console.log('TwoDChart render tests passed');
