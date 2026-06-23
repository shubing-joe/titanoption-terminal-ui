import assert from 'node:assert/strict';

import { buildExpiryChoices, resolveDaysAfterLiveRefresh, selectedExpiryValue } from './expiryChoices';

const liveExpiries = [
  { date: '2026-06-18', days: 2, label: '2026.06.18 (2天)' },
  { date: '2026-06-26', days: 10, label: '2026.06.26 (10天)' },
];

const choices = buildExpiryChoices(liveExpiries, 2);
assert.deepEqual(
  choices.slice(0, 4).map((choice) => `${choice.date}:${choice.days}:${choice.label}`),
  [
    '2026-06-18:2:2026.06.18 (2天)',
    '2026-06-25:9:2026.06.25 (9天)',
    '2026-06-26:10:2026.06.26 (10天)',
    '2026-07-02:16:2026.07.02 (16天)',
  ],
);
assert.equal(selectedExpiryValue(choices, 2), '2026-06-18');
assert.ok(choices.some((choice) => choice.date === '2026-09-17' && choice.days === 93));
assert.ok(choices.some((choice) => choice.date === '2026-12-17' && choice.days === 184));
assert.ok(!choices.some((choice) => choice.date === '2026-06-12'));

const customChoices = buildExpiryChoices(liveExpiries, 7);
assert.equal(customChoices.at(-1)?.date, 'custom');
assert.equal(customChoices.at(-1)?.label, '自定义 (7天)');
assert.equal(selectedExpiryValue(customChoices, 7), 'custom');

const fallbackChoices = buildExpiryChoices(undefined, 7);
assert.equal(fallbackChoices[0].date, '2026-06-12');
assert.equal(fallbackChoices[1].date, '2026-06-18');

assert.equal(resolveDaysAfterLiveRefresh(liveExpiries, 28), 2);
assert.equal(resolveDaysAfterLiveRefresh(liveExpiries, 184), 184);
assert.equal(resolveDaysAfterLiveRefresh(liveExpiries, 9), 9);
assert.equal(resolveDaysAfterLiveRefresh(undefined, 28), 28);

console.log('expiryChoices helpers passed');
