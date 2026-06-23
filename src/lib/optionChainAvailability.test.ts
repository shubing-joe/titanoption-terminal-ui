import assert from 'node:assert/strict';

import { resolveOptionChainAvailability } from './optionChainAvailability';

assert.deepEqual(resolveOptionChainAvailability(239, 41), {
  canRenderRows: true,
  isMissingSelectedExpiry: false,
  label: '公开 mock 期权链 41 rows',
});

assert.deepEqual(resolveOptionChainAvailability(239, 0), {
  canRenderRows: false,
  isMissingSelectedExpiry: true,
  label: '当前到期日无公开 mock 链行',
});

assert.deepEqual(resolveOptionChainAvailability(0, 0), {
  canRenderRows: false,
  isMissingSelectedExpiry: false,
  label: '等待公开 mock 期权链',
});

console.log('optionChainAvailability helpers passed');
