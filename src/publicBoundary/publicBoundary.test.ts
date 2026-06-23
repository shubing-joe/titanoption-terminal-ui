import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../lib/workspaceLayout.ts', import.meta.url), 'utf8');

const forbiddenPublicTokens = [
  'StrategyComposerPanel',
  'CanonicalDailyQueuePanel',
  'strategyComposer',
  "'composer'",
  "'dailyQueue'",
  '策略讨论台',
  'DAILY QUEUE',
  'AI CONSULTANT ADVISOR',
  '/api/playbook/',
  '/api/strategy-advisor',
  'ValidationReportPanel',
  'STRICT VALIDATION GATE',
  '/api/market/validation/replay',
];

for (const token of forbiddenPublicTokens) {
  assert.equal(appSource.includes(token), false, `App.tsx must not expose private token ${token}`);
  assert.equal(workspaceSource.includes(token), false, `workspaceLayout.ts must not expose private token ${token}`);
}

assert.equal(existsSync(new URL('../components/StrategyComposerPanel.tsx', import.meta.url)), false);
assert.equal(existsSync(new URL('../components/CanonicalDailyQueuePanel.tsx', import.meta.url)), false);
assert.equal(existsSync(new URL('../lib/strategyComposer.ts', import.meta.url)), false);

console.log('public boundary private module exclusions passed');
