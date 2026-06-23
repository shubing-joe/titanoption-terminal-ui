import assert from 'node:assert/strict';

import { terminalHeaderStatus } from './terminalHeader';
import { buildLiveRequestParams } from './liveRequest';

const labels = terminalHeaderStatus({
  liveRequestParams: buildLiveRequestParams(16),
  liveMarketData: {
    ok: true,
    volSummary: { rowCount: 239, atmIv: 120, realizedVol: 80 },
  },
});

const visibleText = Object.values(labels).join(' ');

assert.equal(visibleText.includes('REST'), false);
assert.equal(visibleText.includes('WS'), false);
assert.equal(visibleText.includes('Cache'), false);
assert.equal(visibleText.includes('Budget'), false);
assert.equal(visibleText.includes('200 RMB'), false);
assert.equal(visibleText.includes('期权链 239 rows'), true);
assert.equal(visibleText.includes('链深度 BALANCED'), true);
assert.equal(visibleText.includes('PUBLIC MOCK · 239 contracts'), true);

const failedLabels = terminalHeaderStatus({
  liveRequestParams: buildLiveRequestParams(25, false, 'deep'),
  liveMarketData: {
    ok: false,
    error: 'HTTP Error 502: Bad Gateway',
  },
});

assert.equal(failedLabels.marketLabel, 'mock 行情失败');
assert.equal(failedLabels.coverageLabel.includes('Provider 502'), true);
assert.equal(failedLabels.modeLabel, '链深度 DEEP · 1095D');

const activeLabels = terminalHeaderStatus({
  liveRequestParams: buildLiveRequestParams(25, false, 'active'),
  liveMarketData: {
    ok: true,
    volSummary: { rowCount: 118, atmIv: 80, realizedVol: 45 },
    refreshPolicy: { selectedLegRefreshSeconds: 1 },
  },
});

assert.equal(activeLabels.modeLabel, '链深度 ACTIVE · 60D · 选中腿 1s');

console.log('terminalHeader helpers passed');
