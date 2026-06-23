import assert from 'node:assert/strict';

import {
  loadStoredWatchlist,
  mergeWatchlistTickers,
  saveMergedStoredWatchlist,
  saveStoredWatchlist,
  WATCHLIST_STORAGE_KEY,
} from './watchlistStorage';
import type { TickerInfo } from '../types';

const base: TickerInfo[] = [
  { symbol: 'MRVL', name: 'Marvell', price: 263, change: 1, changePercent: 0.5, iv: 61, high: 300, low: 245, volume: '12M' },
];

const merged = mergeWatchlistTickers(base, [
  { symbol: 'dram', name: '自定义标的资产 (DRAM Asset) · awaiting live', price: 76.71, iv: 72, high: 80, low: 70 },
]);

assert.equal(merged.some((ticker) => ticker.symbol === 'MRVL'), true);
const dram = merged.find((ticker) => ticker.symbol === 'DRAM');
assert.equal(dram?.price, 76.71);
assert.equal(dram?.source, 'saved_watchlist');

const storage = new Map<string, string>();
saveStoredWatchlist(
  {
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  },
  merged,
);
assert.equal(storage.has(WATCHLIST_STORAGE_KEY), true);

const reloaded = loadStoredWatchlist(
  {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
  },
  base,
);
assert.equal(reloaded.some((ticker) => ticker.symbol === 'DRAM'), true);

saveMergedStoredWatchlist(
  {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  },
  [
    { symbol: 'MRVL', name: 'Marvell Live', price: 300, change: 0, changePercent: 0, iv: 60, high: 310, low: 290, volume: '1M' },
  ],
);

const preserved = loadStoredWatchlist(
  {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
  },
  base,
);
assert.equal(preserved.some((ticker) => ticker.symbol === 'DRAM'), true);
assert.equal(preserved.find((ticker) => ticker.symbol === 'MRVL')?.price, 300);

console.log('watchlistStorage helpers passed');
