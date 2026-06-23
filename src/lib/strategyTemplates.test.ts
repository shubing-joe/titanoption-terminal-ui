import assert from 'node:assert/strict';

import { getStrategyTemplates } from './strategyTemplates.ts';

const templates = getStrategyTemplates(283.42, 38);
const expectedIds = [
  'single_call',
  'bull_call_spread',
  'bear_put_spread',
  'iron_condor',
  'long_straddle',
  'long_put_crash',
  'covered_call_overlay',
  'protective_collar'
];

assert.deepEqual(
  templates.map((template) => template.id),
  expectedIds,
  'strategy templates should stay limited to professional, explainable presets'
);

for (const template of templates) {
  assert.ok(template.legs.length > 0, `${template.id} must include option legs`);

  for (const leg of template.legs) {
    assert.notEqual(leg.kind, 'stock', `${template.id}/${leg.id} preset should only include option legs`);
    assert.ok('strike' in leg, `${template.id}/${leg.id} should include an option strike`);
    assert.equal(leg.strike % 10, 0, `${template.id}/${leg.id} strike should use the current-price step`);
    assert.ok(leg.strike >= 10, `${template.id}/${leg.id} strike should be protected by safeStrike`);
    assert.ok(leg.premium > 0, `${template.id}/${leg.id} premium should be positive`);
    assert.ok(leg.premium <= 283.42 * 0.08, `${template.id}/${leg.id} premium should stay realistic`);
  }
}
