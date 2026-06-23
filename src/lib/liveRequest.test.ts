import assert from 'node:assert/strict';

import {
  buildLiveMarketUrl,
  buildLiveRequestParams,
  budgetModeLabel,
  budgetGovernorLabel,
  cacheTelemetryLabel,
  liveCoverageLabel,
  PUBLIC_MOCK_BUDGET,
  optionWsPlanLabel,
  resolveExpiryWindowDays,
  selectedLiveRefreshIntervalMs,
  wsWorkerTelemetryLabel,
  wsQuoteTelemetryLabel,
} from './liveRequest';

const balancedParams = buildLiveRequestParams(16);
assert.deepEqual(balancedParams, {
  budgetMode: 'balanced',
  visibleStrikes: 16,
  limit: 240,
  expiryWindowDays: 90,
  simulateWs: false,
});

assert.equal(buildLiveRequestParams(99).visibleStrikes, 25);
assert.equal(buildLiveRequestParams(-1).visibleStrikes, 3);
assert.equal(buildLiveRequestParams(16, true).simulateWs, true);
assert.deepEqual(buildLiveRequestParams(16, false, 'focused'), {
  budgetMode: 'focused',
  visibleStrikes: 12,
  limit: 160,
  expiryWindowDays: 45,
  simulateWs: false,
});
assert.deepEqual(buildLiveRequestParams(25, false, 'active'), {
  budgetMode: 'active',
  visibleStrikes: 8,
  limit: 120,
  expiryWindowDays: 60,
  simulateWs: false,
});
assert.deepEqual(buildLiveRequestParams(16, false, 'deep'), {
  budgetMode: 'deep',
  visibleStrikes: 25,
  limit: 240,
  expiryWindowDays: 1095,
  simulateWs: false,
});
assert.equal(resolveExpiryWindowDays(2), 90);
assert.equal(resolveExpiryWindowDays(93), 120);
assert.equal(resolveExpiryWindowDays(184), 210);
assert.equal(resolveExpiryWindowDays(430), 450);
assert.equal(resolveExpiryWindowDays(900), 900);
assert.equal(resolveExpiryWindowDays(1300), 1095);
assert.equal(budgetModeLabel(balancedParams), '预算档 BALANCED · ±16 · 90D · max 240 rows');
assert.equal(selectedLiveRefreshIntervalMs('active', 1), 1000);
assert.equal(selectedLiveRefreshIntervalMs('active', 0), 1000);
assert.equal(selectedLiveRefreshIntervalMs('balanced', 1), 5000);
assert.equal(selectedLiveRefreshIntervalMs('deep', 1), 30000);

assert.equal(
  buildLiveMarketUrl('MRVL', balancedParams),
  '/api/market/live/MRVL?budgetMode=balanced&visibleStrikes=16&limit=240&expiryWindowDays=90&simulateWs=false',
);
assert.equal(
  buildLiveMarketUrl('MRVL', { ...balancedParams, simulateWs: true }),
  '/api/market/live/MRVL?budgetMode=balanced&visibleStrikes=16&limit=240&expiryWindowDays=90&simulateWs=true',
);
assert.equal(
  buildLiveMarketUrl('DRAM', buildLiveRequestParams(25, false, 'active')),
  '/api/market/live/DRAM?budgetMode=active&visibleStrikes=8&limit=120&expiryWindowDays=60&simulateWs=false',
);

const defaultLeapsParams = buildLiveRequestParams(25, false, 'deep');
assert.equal(
  buildLiveMarketUrl('DRAM', defaultLeapsParams),
  '/api/market/live/DRAM?budgetMode=deep&visibleStrikes=25&limit=240&expiryWindowDays=1095&simulateWs=false',
);

assert.equal(PUBLIC_MOCK_BUDGET.restPerMinute, 0);
assert.equal(PUBLIC_MOCK_BUDGET.optionWebSocketPerMinute, 0);
assert.equal(liveCoverageLabel(balancedParams, 239), 'MOCK ±16 · 239 rows · REST 0/min');
assert.equal(cacheTelemetryLabel(undefined), 'Cache pending');
assert.equal(
  cacheTelemetryLabel({
    fetchedAt: '2026-06-12T15:00:00+00:00',
    events: [
      { layer: 'memory', label: 'underlying_snapshot', hit: false, ttlSeconds: 5 },
      { layer: 'http', label: 'underlying_snapshot', hit: false, ttlSeconds: 15 },
      { layer: 'http', label: 'option_chain', hit: true, ttlSeconds: 15 },
    ],
    hitCount: 1,
    missCount: 2,
  }),
  'Cache H1/M1 · 15s',
);
assert.equal(optionWsPlanLabel(undefined), 'WS pending');
assert.equal(
  optionWsPlanLabel({
    enabled: true,
    budgetPerMinute: 50,
    selectedCount: 12,
    fallbackRestCount: 3,
    mode: 'active ATM window',
    subscriptions: [],
  }),
  'WS 12/50 · REST fallback 3',
);
assert.equal(wsQuoteTelemetryLabel(undefined), 'WS quotes pending');
assert.equal(
  wsQuoteTelemetryLabel({
    enabled: true,
    subscribedCount: 50,
    freshQuoteCount: 12,
    staleQuoteCount: 2,
    ignoredQuoteCount: 1,
    mergedCount: 10,
    maxAgeSeconds: 5,
  }),
  'WS quotes 10/50 merged · stale 2',
);
assert.equal(wsWorkerTelemetryLabel(undefined), 'WS worker pending');
assert.equal(
  wsWorkerTelemetryLabel({
    enabled: true,
    provider: 'injectable_option_ws',
    plannedCount: 50,
    subscribedCount: 50,
    receivedCount: 42,
    acceptedCount: 40,
    ignoredCount: 2,
    lastRefreshAt: '2026-06-16T15:00:02+00:00',
  }),
  'WS worker 40/50 accepted · ignored 2',
);
assert.equal(budgetGovernorLabel(undefined), 'Budget pending');
assert.equal(
  budgetGovernorLabel({
    planLabel: '200 RMB 拼车档',
    action: 'strike-range-change',
    restBudgetPerMinute: 500,
    optionWsBudgetPerMinute: 50,
    fullMarketSnapshotCost: 400,
    estimatedRestRequests: 2,
    actualHttpMisses: 1,
    httpCacheHitRatio: 0.5,
    wsSelectedCount: 50,
    wsFallbackRestCount: 189,
    riskLevel: 'normal',
    recommendation: 'use-cache-and-ws',
  }),
  'Budget REST 2/500 · WS 50/50 · cache 50%',
);

console.log('liveRequest helpers passed');
