import type { TickerInfo } from '../types';

export const WATCHLIST_STORAGE_KEY = 'titanoption_watchlist_v1';

function normalizeSymbol(symbol: unknown): string {
  return String(symbol || '').trim().toUpperCase();
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mergeWatchlistTickers(base: TickerInfo[], saved: unknown): TickerInfo[] {
  const bySymbol = new Map<string, TickerInfo>();
  for (const ticker of base) {
    const symbol = normalizeSymbol(ticker.symbol);
    if (symbol) bySymbol.set(symbol, { ...ticker, symbol });
  }
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (!item || typeof item !== 'object') continue;
      const ticker = item as Partial<TickerInfo>;
      const symbol = normalizeSymbol(ticker.symbol);
      if (!symbol) continue;
      const fallback = bySymbol.get(symbol);
      const price = finiteNumber(ticker.price, fallback?.price ?? 100);
      bySymbol.set(symbol, {
        symbol,
        name: ticker.name || fallback?.name || `自定义标的资产 (${symbol} Asset) · saved`,
        price,
        change: finiteNumber(ticker.change, fallback?.change ?? 0),
        changePercent: finiteNumber(ticker.changePercent, fallback?.changePercent ?? 0),
        iv: finiteNumber(ticker.iv, fallback?.iv ?? 35),
        high: finiteNumber(ticker.high, fallback?.high ?? Number((price * 1.05).toFixed(2))),
        low: finiteNumber(ticker.low, fallback?.low ?? Number((price * 0.95).toFixed(2))),
        volume: String(ticker.volume || fallback?.volume || '0'),
        source: ticker.source || fallback?.source || 'saved_watchlist',
      });
    }
  }
  return Array.from(bySymbol.values());
}

export function loadStoredWatchlist(storage: Pick<Storage, 'getItem'>, base: TickerInfo[]): TickerInfo[] {
  try {
    const raw = storage.getItem(WATCHLIST_STORAGE_KEY);
    return mergeWatchlistTickers(base, raw ? JSON.parse(raw) : []);
  } catch {
    return base;
  }
}

export function saveStoredWatchlist(storage: Pick<Storage, 'setItem'>, tickers: TickerInfo[]): void {
  const payload = tickers
    .map((ticker) => ({
      symbol: normalizeSymbol(ticker.symbol),
      name: ticker.name,
      price: ticker.price,
      change: ticker.change,
      changePercent: ticker.changePercent,
      iv: ticker.iv,
      high: ticker.high,
      low: ticker.low,
      volume: ticker.volume,
      source: ticker.source,
    }))
    .filter((ticker) => ticker.symbol);
  storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(payload));
}

export function saveMergedStoredWatchlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  incoming: TickerInfo[],
): void {
  let existing: unknown = [];
  try {
    const raw = storage.getItem(WATCHLIST_STORAGE_KEY);
    existing = raw ? JSON.parse(raw) : [];
  } catch {
    existing = [];
  }
  saveStoredWatchlist(storage, mergeWatchlistTickers(mergeWatchlistTickers([], existing), incoming));
}
