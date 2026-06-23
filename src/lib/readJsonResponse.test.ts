import assert from 'node:assert/strict';

import { readJsonResponse } from './readJsonResponse';

assert.deepEqual(
  await readJsonResponse(new Response('{"ok":true,"value":1}'), 'live market'),
  { ok: true, value: 1 },
);

await assert.rejects(
  () => readJsonResponse(new Response(''), 'live market'),
  /live market returned empty response/,
);

await assert.rejects(
  () => readJsonResponse(new Response('<!doctype html>'), 'watchlist'),
  /watchlist returned non-JSON response/,
);

console.log('readJsonResponse helpers passed');
