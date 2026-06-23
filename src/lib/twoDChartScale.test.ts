import assert from 'node:assert/strict';

import type { OptionLeg } from '../types';
import { buildTwoDChartScale } from './twoDChartScale';

const longCall: OptionLeg[] = [
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

const scale = buildTwoDChartScale({
  legs: longCall,
  currentStockPrice: 100,
  daysToExpiry: 30,
  r: 4.5,
  xZoomPercent: 60,
  samples: 200,
  includeIndividualLegs: true,
  visibleDecayDays: [30, 15, 5, 0.001],
});

const allVisibleValues = scale.sampleData.flatMap((point) => [
  point.expiryPnL,
  point.currentPnL,
  ...point.timelinePnLs,
  ...point.legPnLs,
]);
const visibleMin = Math.min(...allVisibleValues);
const visibleMax = Math.max(...allVisibleValues);

assert.equal(scale.xMin, 40);
assert.equal(scale.xMax, 160);
assert.ok(visibleMax > 5000, 'wide long-call range should include far-right upside');
assert.ok(scale.yUpper > visibleMax, 'Y upper bound must include the full visible payoff curve');
assert.ok(scale.yLower < visibleMin, 'Y lower bound must include the full visible payoff curve');

const bullCallSpread: OptionLeg[] = [
  {
    id: 'long_75_call',
    type: 'call',
    side: 'buy',
    strike: 75,
    expiryDays: 578,
    quantity: 1,
    iv: 80,
    premium: 7,
    isCustomPremium: false,
  },
  {
    id: 'short_105_call',
    type: 'call',
    side: 'sell',
    strike: 105,
    expiryDays: 578,
    quantity: 1,
    iv: 80,
    premium: 0.8,
    isCustomPremium: false,
  },
];

const spreadScale = buildTwoDChartScale({
  legs: bullCallSpread,
  currentStockPrice: 80.65,
  daysToExpiry: 578,
  r: 4.5,
  xZoomPercent: 30,
  samples: 200,
  includeIndividualLegs: true,
  visibleDecayDays: [578, 289, 87, 0.001],
});

const postCapSamples = spreadScale.sampleData.filter((point) => point.S > 105);
const expiryPnLsAfterCap = postCapSamples.map((point) => point.expiryPnL);
const maxPostCap = Math.max(...expiryPnLsAfterCap);
const minPostCap = Math.min(...expiryPnLsAfterCap);

assert.ok(spreadScale.xMax > 108, 'default x-domain must include room after the short strike cap');
assert.ok(postCapSamples.length >= 3, 'chart must visibly sample the bull-spread plateau after the upper strike');
assert.ok(Math.abs(maxPostCap - minPostCap) < 1e-6, 'bull-spread expiry payoff must be flat after upper strike');
assert.ok(Math.abs(maxPostCap - 2380) < 1e-6, 'bull-spread capped profit should match width minus debit');

console.log('twoDChartScale tests passed');
