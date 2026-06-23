import assert from 'node:assert/strict';

import { buildOptionChainSide } from './optionChainRows';

const mockCall = {
  type: 'call' as const,
  expiry: '2026-06-18',
  strike: 310,
  bid: 12.4,
  ask: 12.9,
  mark: 12.65,
  volume: 100,
  openInterest: 200,
  iv: 146.7,
  delta: 0.41,
  gamma: 0.02,
  vega: 0.11,
  theta: -0.33,
};

assert.deepEqual(
  buildOptionChainSide({
    type: 'call',
    liveRow: mockCall,
    currentStockPrice: 308.88,
    strike: 310,
    daysToExpiry: 2,
    riskFreeRate: 4.5,
    strikeIV: 120,
    bidAskSpreadPct: 1.5,
    fallbackVolume: 999,
  }),
  {
    source: 'MOCK',
    priceSource: 'MOCK_QUOTE',
    greeksSource: 'MOCK_GREEKS',
    engineLabel: 'MOCK',
    sourceDetail: '价格来自公开 mock 链行，希腊值来自上游兼容字段。',
    hasLiveContext: true,
    isTradable: true,
    theor: 12.65,
    bid: 12.4,
    ask: 12.9,
    delta: 0.41,
    gamma: 0.02,
    vega: 0.11,
    theta: -0.33,
    intrinsic: 0,
    extrinsic: 12.65,
    itmProb: 46.72,
    volume: 100,
    openInterest: 200,
  },
);

const modelPut = buildOptionChainSide({
  type: 'put',
  currentStockPrice: 308.88,
  strike: 300,
  daysToExpiry: 2,
  riskFreeRate: 4.5,
  strikeIV: 80,
  bidAskSpreadPct: 1.5,
  fallbackVolume: 777,
});

assert.equal(modelPut.source, 'MODEL');
assert.equal(modelPut.engineLabel, 'NO MOCK');
assert.equal(modelPut.hasLiveContext, false);
assert.equal(modelPut.isTradable, false);
assert.equal(modelPut.volume, 777);
assert.equal(modelPut.openInterest, 0);
assert.equal(modelPut.bid > 0, true);
assert.equal(modelPut.ask > modelPut.bid, true);
assert.equal(modelPut.intrinsic, 0);
assert.equal(modelPut.extrinsic >= 0, true);

const mockQuoteOnlyCall = buildOptionChainSide({
  type: 'call',
  liveRow: {
    type: 'call',
    expiry: '2026-06-18',
    strike: 230,
    bid: 77.75,
    ask: 80.12,
    mark: 78.94,
    volume: 520,
    openInterest: 1000,
    iv: 160.9,
  },
  currentStockPrice: 308.88,
  strike: 230,
  daysToExpiry: 2,
  riskFreeRate: 4.5,
  strikeIV: 160.9,
  bidAskSpreadPct: 1.5,
  fallbackVolume: 999,
});

assert.equal(mockQuoteOnlyCall.source, 'MOCK');
assert.equal(mockQuoteOnlyCall.priceSource, 'MOCK_QUOTE');
assert.equal(mockQuoteOnlyCall.greeksSource, 'MODEL_BS');
assert.equal(mockQuoteOnlyCall.engineLabel, 'MOCK+BS');
assert.equal(mockQuoteOnlyCall.sourceDetail.includes('价格来自公开 mock 链行'), true);
assert.equal(mockQuoteOnlyCall.sourceDetail.includes('希腊值'), true);
assert.equal(mockQuoteOnlyCall.sourceDetail.includes('补算'), true);

const analysisOnlyCall = buildOptionChainSide({
  type: 'call',
  liveRow: {
    type: 'call',
    expiry: '2028-01-21',
    strike: 80,
    bid: 0,
    ask: 0,
    mark: 12.5,
    volume: 0,
    openInterest: 300,
    iv: 72,
    quoteTradable: false,
  },
  currentStockPrice: 76.71,
  strike: 80,
  daysToExpiry: 578,
  riskFreeRate: 4.5,
  strikeIV: 72,
  bidAskSpreadPct: 1.5,
  fallbackVolume: 999,
});

assert.equal(analysisOnlyCall.source, 'MOCK');
assert.equal(analysisOnlyCall.hasLiveContext, true);
assert.equal(analysisOnlyCall.isTradable, false);
assert.equal(analysisOnlyCall.theor, 12.5);
assert.equal(analysisOnlyCall.openInterest, 300);
assert.equal(analysisOnlyCall.volume, 0);
assert.equal(analysisOnlyCall.sourceDetail.includes('不可直接交易'), true);

console.log('optionChainRows helpers passed');
