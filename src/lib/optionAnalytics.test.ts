import assert from 'node:assert/strict';

import {
  buildRadarMetricConfig,
  buildExpiryPager,
  buildExpiryFamilies,
  filterChoicesByVisibleFamilies,
  deriveLiveIvStats,
  formatScaledNumber,
  summarizeThreeDBoundaries,
  summarizePayoffBoundaries,
  threeDComputeEngineMeta,
} from './optionAnalytics';

const expiries = [
  { date: '2026-06-18', days: 2, label: '2026.06.18 (2天)' },
  { date: '2026-07-17', days: 31, label: '2026.07.17 (31天)' },
  { date: '2026-09-17', days: 93, label: '2026.09.17 (93天)' },
  { date: '2026-12-17', days: 184, label: '2026.12.17 (184天)' },
];

const families = buildExpiryFamilies(expiries, { hiddenFamilies: ['quarterly'] });
assert.deepEqual(
  families.map((family) => `${family.id}:${family.count}:${family.visibleChoices.map((choice) => choice.days).join(',')}`),
  ['front:1:2', 'monthly:1:31', 'quarterly:1:', 'long_dated:1:184'],
);
assert.deepEqual(
  filterChoicesByVisibleFamilies(expiries, ['front', 'long_dated']).map((choice) => choice.days),
  [31, 93],
);
assert.deepEqual(
  filterChoicesByVisibleFamilies(expiries, ['front', 'monthly', 'quarterly', 'long_dated']).map((choice) => choice.days),
  [],
);

const denseExpiries = [
  { date: '2026-06-18', days: 2, label: '2026.06.18 (2天)' },
  { date: '2026-06-25', days: 9, label: '2026.06.25 (9天)' },
  { date: '2026-06-26', days: 10, label: '2026.06.26 (10天)' },
  { date: '2026-07-02', days: 16, label: '2026.07.02 (16天)' },
  { date: '2026-07-09', days: 23, label: '2026.07.09 (23天)' },
  { date: '2026-07-10', days: 24, label: '2026.07.10 (24天)' },
  { date: '2026-07-16', days: 30, label: '2026.07.16 (30天)' },
  { date: '2026-07-17', days: 31, label: '2026.07.17 (31天)' },
  { date: '2026-07-23', days: 37, label: '2026.07.23 (37天)' },
  { date: '2026-07-24', days: 38, label: '2026.07.24 (38天)' },
  { date: '2026-07-31', days: 45, label: '2026.07.31 (45天)' },
  { date: '2026-08-13', days: 58, label: '2026.08.13 (58天)' },
  { date: '2026-08-21', days: 66, label: '2026.08.21 (66天)' },
  { date: '2026-09-17', days: 93, label: '2026.09.17 (93天)' },
  { date: '2026-12-17', days: 184, label: '2026.12.17 (184天)' },
];

const frontPager = buildExpiryPager(denseExpiries, 2, 5);
assert.equal(frontPager.pageIndex, 0);
assert.equal(frontPager.pageCount, 3);
assert.deepEqual(frontPager.pageItems.map((choice) => choice.days), [2, 9, 10, 16, 23]);
assert.equal(frontPager.canPrev, false);
assert.equal(frontPager.canNext, true);

const longPager = buildExpiryPager(denseExpiries, 93, 5);
assert.equal(longPager.pageIndex, 2);
assert.deepEqual(longPager.pageItems.map((choice) => choice.days), [45, 58, 66, 93, 184]);

const clampedPager = buildExpiryPager(denseExpiries, 999, 5, 99);
assert.equal(clampedPager.pageIndex, 2);
assert.equal(clampedPager.selectedIndex, -1);
assert.deepEqual(clampedPager.pageItems.map((choice) => choice.days), [45, 58, 66, 93, 184]);

assert.equal(formatScaledNumber(987, 'auto'), '987');
assert.equal(formatScaledNumber(12_300, 'auto'), '1.23万');
assert.equal(formatScaledNumber(120, 'ten'), '12.0十');
assert.equal(formatScaledNumber(12_300, 'thousand'), '12.3千');
assert.equal(formatScaledNumber(-4_200_000, 'ten_thousand'), '-420.0万');

const summary = summarizePayoffBoundaries({
  breakevens: [322.91],
  maxProfit: Infinity,
  maxLoss: -1291,
  currentStockPrice: 308.88,
});
assert.equal(summary.breakevenLabels[0], 'B/E $322.91 (+4.54%)');
assert.equal(summary.maxProfitLabel, 'Max Profit ∞');
assert.equal(summary.maxLossLabel, 'Max Loss -$1,291');
assert.equal(summary.boundaryMarkers.some((marker) => marker.kind === 'breakeven' && marker.price === 322.91), true);

const threeDBounds = summarizeThreeDBoundaries({
  breakevens: [295, 322.91],
  currentStockPrice: 308.88,
  maxProfit: 1810,
  maxLoss: -1291,
});
assert.deepEqual(
  threeDBounds.map(item => `${item.kind}:${item.label}:${item.price ?? 'n/a'}:${item.offsetPct ?? 'n/a'}`),
  [
    'spot:Spot $308.88:308.88:0',
    'breakeven:B/E $295.00:295:-4.49',
    'breakeven:B/E $322.91:322.91:4.54',
    'risk:Max Profit $1,810:n/a:n/a',
    'risk:Max Loss -$1,291:n/a:n/a',
  ],
);

const rustThreeDBounds = summarizeThreeDBoundaries({
  breakevens: [295],
  currentStockPrice: 308.88,
  maxProfit: 100,
  maxLoss: -100,
  rustAnalysis: {
    ok: true,
    engine: 'rust-option-core-cli',
    result: {
      engine: 'rust-option-core',
      net_premium: 250,
      current_pnl: 12,
      max_profit: 750,
      max_loss: -250,
      breakevens: [314.5],
      greeks: { delta: 1, gamma: 0, vega: 0, theta: 0 },
      scenarios: [],
    },
  },
});
assert.deepEqual(
  rustThreeDBounds.map(item => `${item.kind}:${item.label}:${item.price ?? 'n/a'}:${item.engine}`),
  [
    'spot:Spot $308.88:308.88:rust-option-core',
    'breakeven:B/E $314.50:314.5:rust-option-core',
    'risk:Max Profit $750:n/a:rust-option-core',
    'risk:Max Loss -$250:n/a:rust-option-core',
  ],
);

const rustAnalysisForEngine = {
  ok: true,
  engine: 'rust-option-core-cli',
  result: {
    engine: 'rust-option-core',
    net_premium: 250,
    current_pnl: 12,
    max_profit: 750,
    max_loss: -250,
    breakevens: [314.5],
    greeks: { delta: 1, gamma: 0, vega: 0, theta: 0 },
    scenarios: [],
  },
};
const threeDEngineMeta = threeDComputeEngineMeta(rustAnalysisForEngine, {
  ok: true,
  engine: 'rust-option-core-cli',
  result: {
    engine: 'rust-option-core',
    surface: {
      engine: 'rust-option-core-surface',
      plot_target: 'pnl',
      y_dimension: 'days',
      price_min: 90,
      price_max: 110,
      y_min: 0.01,
      y_max: 30,
      x_steps: 2,
      y_steps: 2,
      z_min: -250,
      z_max: 750,
      points: [],
    },
  },
});
assert.deepEqual(threeDEngineMeta, {
  surfaceEngine: 'rust-option-core-surface',
  boundaryEngine: 'rust-option-core',
  label: 'Surface: Rust option-core · Boundaries: Rust option-core',
  isAuthoritativeSurface: true,
});

assert.deepEqual(threeDComputeEngineMeta(rustAnalysisForEngine), {
  surfaceEngine: 'unavailable',
  boundaryEngine: 'rust-option-core',
  label: 'Surface: UNAVAILABLE · Boundaries: Rust option-core',
  isAuthoritativeSurface: false,
});

const radarMetrics = buildRadarMetricConfig(['range', 'price']);
assert.deepEqual(
  radarMetrics.map((metric) => `${metric.id}:${metric.visible ? 'on' : 'off'}`),
  ['iv:on', 'range:off', 'rank:on', 'zone:on', 'price:off'],
);

const allHiddenRadarMetrics = buildRadarMetricConfig(['iv', 'range', 'rank', 'zone', 'price']);
assert.equal(
  allHiddenRadarMetrics.every((metric) => metric.visible),
  true,
  'radar metric config should keep the card informative when every metric is hidden',
);

const liveIvStats = deriveLiveIvStats(
  [
    { iv: 120 },
    { iv: 180 },
    { iv: 240 },
    { iv: null },
  ],
  150,
);
assert.deepEqual(liveIvStats, {
  currentIv: 180,
  minIv: 120,
  maxIv: 240,
  ivRank: 50,
  zone: 'NEUTRAL',
  source: 'live_chain',
  rowCount: 3,
});

assert.deepEqual(deriveLiveIvStats([], 24.6), {
  currentIv: 24.6,
  minIv: 17.2,
  maxIv: 32,
  ivRank: 50,
  zone: 'NEUTRAL',
  source: 'fallback',
  rowCount: 0,
});

console.log('optionAnalytics helpers passed');
