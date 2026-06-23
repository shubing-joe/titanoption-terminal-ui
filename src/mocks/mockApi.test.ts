import assert from 'node:assert/strict';
import { handlePublicMockRequest } from './mockApi';

const liveResponse = await handlePublicMockRequest(
  new Request('http://localhost/api/market/live/MRVL?budgetMode=focused&visibleStrikes=6&limit=80&expiryWindowDays=90'),
);
assert.ok(liveResponse, 'live market mock response should exist');
assert.equal(liveResponse?.status, 200);
const livePayload = await liveResponse!.json();
assert.equal(livePayload.ok, true);
assert.equal(livePayload.provider, 'public_mock');
assert.equal(livePayload.ticker.symbol, 'MRVL');
assert.ok(livePayload.chain.length > 0);
assert.equal(livePayload.volSummary.source, 'public_mock_surface');

const analyzeResponse = await handlePublicMockRequest(new Request('http://localhost/api/option-core/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    current_spot: 263,
    target_days: 28,
    rate_pct: 4.5,
    scenario_spots: [240, 263, 290],
    legs: [{
      id: 'leg_1',
      type: 'call',
      side: 'buy',
      strike: 265,
      expiryDays: 28,
      quantity: 1,
      iv: 61,
      premium: 12.5,
      isCustomPremium: false,
    }],
  }),
}));
assert.ok(analyzeResponse, 'option-core analyze mock response should exist');
assert.equal(analyzeResponse?.status, 200);
const analyzePayload = await analyzeResponse!.json();
assert.equal(analyzePayload.ok, true);
assert.equal(analyzePayload.engine, 'public-mock-option-core');
assert.ok(Array.isArray(analyzePayload.result.scenarios));
assert.equal(analyzePayload.result.scenarios.length, 3);

const passthrough = await handlePublicMockRequest(new Request('http://localhost/not-an-api'));
assert.equal(passthrough, null);

console.log('public mock API passed');
