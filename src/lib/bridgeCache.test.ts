import assert from 'node:assert/strict';
import { createBridgeRequestCoordinator, stableJsonKey } from './bridgeCache';

async function testCoalescesIdenticalInFlightRequests() {
  const coordinator = createBridgeRequestCoordinator({ now: () => 1_000 });
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { ok: true, value: calls };
  };

  const [first, second] = await Promise.all([
    coordinator.run('same-key', loader, { ttlMs: 1000 }),
    coordinator.run('same-key', loader, { ttlMs: 1000 }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, { ok: true, value: 1 });
  assert.deepEqual(second, { ok: true, value: 1 });
}

async function testReturnsFreshCachedValueWithinTtl() {
  let now = 1_000;
  const coordinator = createBridgeRequestCoordinator({ now: () => now });
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { ok: true, value: calls };
  };

  const first = await coordinator.run('ttl-key', loader, { ttlMs: 500 });
  now = 1_300;
  const second = await coordinator.run('ttl-key', loader, { ttlMs: 500 });

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
}

async function testServesStaleValueWhenLoaderFailsWithinStaleWindow() {
  let now = 1_000;
  const coordinator = createBridgeRequestCoordinator({ now: () => now });
  await coordinator.run('stale-key', async () => ({ ok: true, value: 'cached' }), { ttlMs: 100 });
  now = 1_200;

  const result = await coordinator.run(
    'stale-key',
    async () => {
      throw new Error('provider timeout');
    },
    { ttlMs: 100, staleIfErrorMs: 1_000 },
  );

  assert.deepEqual(result, {
    ok: true,
    value: 'cached',
    stale: true,
    staleReason: 'provider timeout',
  });
}

async function testExpiresStaleValueOutsideStaleWindow() {
  let now = 1_000;
  const coordinator = createBridgeRequestCoordinator({ now: () => now });
  await coordinator.run('expired-key', async () => ({ ok: true }), { ttlMs: 100 });
  now = 2_500;

  await assert.rejects(
    coordinator.run(
      'expired-key',
      async () => {
        throw new Error('provider timeout');
      },
      { ttlMs: 100, staleIfErrorMs: 1_000 },
    ),
    /provider timeout/,
  );
}

function testStableJsonKeySortsNestedObjectsWithoutDroppingNestedFields() {
  const first = stableJsonKey({
    mode: 'rust_position_analysis',
    legs: [
      { strike: 100, side: 'buy', type: 'call' },
      { type: 'call', side: 'sell', strike: 110 },
    ],
  });
  const second = stableJsonKey({
    legs: [
      { type: 'call', side: 'buy', strike: 100 },
      { strike: 110, side: 'sell', type: 'call' },
    ],
    mode: 'rust_position_analysis',
  });
  const different = stableJsonKey({
    legs: [
      { type: 'call', side: 'buy', strike: 101 },
      { strike: 110, side: 'sell', type: 'call' },
    ],
    mode: 'rust_position_analysis',
  });

  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.match(first, /"strike":100/);
}

await testCoalescesIdenticalInFlightRequests();
await testReturnsFreshCachedValueWithinTtl();
await testServesStaleValueWhenLoaderFailsWithinStaleWindow();
await testExpiresStaleValueOutsideStaleWindow();
testStableJsonKeySortsNestedObjectsWithoutDroppingNestedFields();

console.log('bridge request coordinator passed');
