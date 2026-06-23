import assert from 'node:assert/strict';

import {
  formatAxisDate,
  formatShortAxisDate,
  resolveScenarioDaysDomain,
} from './chartScales.ts';

assert.deepEqual(
  resolveScenarioDaysDomain({ portfolioDaysToExpiry: 2, legExpiryDays: [2] }),
  { min: 0.01, max: 2 },
  'short-dated option surfaces must not be forced to 30 days',
);

assert.deepEqual(
  resolveScenarioDaysDomain({ portfolioDaysToExpiry: 2, legExpiryDays: [2, 45] }),
  { min: 0.01, max: 45 },
  'multi-expiry books should include the longest active leg',
);

assert.deepEqual(
  resolveScenarioDaysDomain({ portfolioDaysToExpiry: 2, legExpiryDays: [28], includeLegExpiries: false }),
  { min: 0.01, max: 2 },
  'single-expiry books should follow the selected expiry instead of stale leg days',
);

assert.equal(formatShortAxisDate(7, '2026-06-11'), '06.18');
assert.equal(formatAxisDate(7, '2026-06-11'), '2026.06.18');

console.log('chartScales helpers passed');
