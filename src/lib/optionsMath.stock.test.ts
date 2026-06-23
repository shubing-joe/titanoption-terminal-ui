import assert from 'node:assert/strict';

import {
  analyzeStrategy,
  calculateLegPayoff,
  calculateLegValueAndPnL,
  calculatePositionPayoff,
  calculatePositionValueAndPnL,
} from './optionsMath.ts';
import type { PositionLeg, StockLeg } from '../types.ts';

const longStock: StockLeg = {
  id: 'stock-long',
  kind: 'stock',
  side: 'buy',
  entryPrice: 50,
  quantity: 100,
};

const shortStock: StockLeg = {
  id: 'stock-short',
  kind: 'stock',
  side: 'sell',
  entryPrice: 50,
  quantity: 100,
};

assert.equal(calculateLegPayoff(longStock, 55), 500, 'long 100 shares from 50 to 55 should make $500');
assert.equal(calculateLegPayoff(shortStock, 45), 500, 'short 100 shares from 50 to 45 should make $500');

assert.equal(calculateLegValueAndPnL(longStock, 55, 30, 4.5).pnl, 500);
assert.equal(calculateLegValueAndPnL(shortStock, 45, 30, 4.5).pnl, 500);

assert.equal(calculatePositionPayoff([longStock], 55), 500);
assert.equal(calculatePositionValueAndPnL([shortStock], 45, 30, 4.5).pnl, 500);

const coveredCall: PositionLeg[] = [
  longStock,
  {
    id: 'short-call',
    type: 'call',
    side: 'sell',
    strike: 55,
    expiryDays: 30,
    quantity: 1,
    iv: 30,
    premium: 2,
    isCustomPremium: false,
  },
];

const coveredCallAnalysis = analyzeStrategy(coveredCall, 52, 30, 4.5);

assert.equal(coveredCallAnalysis.netPremium, 4800, 'stock debit minus covered call credit should be net $4,800');
assert.ok(
  coveredCallAnalysis.breakevens.some((breakeven) => Math.abs(breakeven - 48) <= 0.05),
  'covered call breakeven should include stock entry minus call premium'
);
assert.equal(coveredCallAnalysis.currentPnL, calculatePositionValueAndPnL(coveredCall, 52, 30, 4.5).pnl);
