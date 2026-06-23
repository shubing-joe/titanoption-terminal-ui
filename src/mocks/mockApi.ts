import type {
  Greeks,
  LiveExpiry,
  LiveMarketData,
  LiveOptionChainRow,
  OptionLeg,
  RustPositionAnalysisResponse,
  RustStrategySurfaceResponse,
  RustSurfacePlotTarget,
  TickerInfo,
} from '../types';
import { analyzeStrategy, calculatePositionValueAndPnL } from '../lib/optionsMath';

const AS_OF_DATE = '2026-06-23';
const QUOTE_TIMESTAMP = '2026-06-23T00:15:00.000Z';

const MOCK_TICKERS: Record<string, TickerInfo> = {
  MRVL: { symbol: 'MRVL', name: 'Marvell Technology · Mock Snapshot', price: 307.86, change: -2.29, changePercent: -0.737, iv: 74.5, high: 317.63, low: 298.28, volume: '49.2M', source: 'public_mock' },
  MU: { symbol: 'MU', name: 'Micron Technology · Mock Snapshot', price: 1211.38, change: 78.29, changePercent: 6.904, iv: 86.2, high: 1245.67, low: 1162.12, volume: '53.1M', source: 'public_mock' },
  SNDK: { symbol: 'SNDK', name: 'SanDisk · Mock Snapshot', price: 2273.73, change: 88.25, changePercent: 4.039, iv: 92.5, high: 2352.99, low: 2250.00, volume: '10.0M', source: 'public_mock' },
  AAPL: { symbol: 'AAPL', name: 'Apple · Mock Snapshot', price: 297.01, change: -1.15, changePercent: -0.386, iv: 28.4, high: 302.38, low: 294.40, volume: '44.9M', source: 'public_mock' },
  TSLA: { symbol: 'TSLA', name: 'Tesla · Mock Snapshot', price: 405.05, change: 4.52, changePercent: 1.129, iv: 61.8, high: 414.33, low: 393.20, volume: '47.8M', source: 'public_mock' },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA · Mock Snapshot', price: 208.65, change: -2.15, changePercent: -1.020, iv: 42.6, high: 213.92, low: 207.64, volume: '122.0M', source: 'public_mock' },
};

const EXPIRIES: LiveExpiry[] = [
  { date: '2026-07-17', days: 24, label: '2026-07-17 · public mock monthly' },
  { date: '2026-08-21', days: 59, label: '2026-08-21 · public mock monthly' },
  { date: '2026-10-16', days: 115, label: '2026-10-16 · public mock quarterly' },
  { date: '2027-01-15', days: 206, label: '2027-01-15 · public mock LEAPS' },
];

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function resolveTicker(symbol: string): TickerInfo {
  const normalized = symbol.toUpperCase();
  return MOCK_TICKERS[normalized] ?? {
    symbol: normalized,
    name: `${normalized} · Mock Snapshot`,
    price: 120,
    change: 0,
    changePercent: 0,
    iv: 45,
    high: 132,
    low: 108,
    volume: '0',
    source: 'public_mock',
  };
}

function makeRow(
  symbol: string,
  spot: number,
  baseIv: number,
  expiry: LiveExpiry,
  strike: number,
  type: 'call' | 'put',
): LiveOptionChainRow {
  const distance = Math.abs(strike - spot) / Math.max(spot, 1);
  const iv = round(baseIv + distance * 55 + expiry.days * 0.045 + (type === 'put' ? 2.8 : 0), 2);
  const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const timeValue = Math.max(0.35, spot * (iv / 100) * Math.sqrt(expiry.days / 365) * 0.08);
  const mark = round(intrinsic + timeValue);
  const spread = Math.max(0.08, mark * (0.035 + distance * 0.5));
  const bid = round(Math.max(0.01, mark - spread / 2));
  const ask = round(mark + spread / 2);
  const deltaBase = type === 'call'
    ? Math.max(0.04, Math.min(0.94, 0.5 + (spot - strike) / (spot * 0.18)))
    : -Math.max(0.04, Math.min(0.94, 0.5 + (strike - spot) / (spot * 0.18)));
  const oiBase = Math.max(80, Math.round(5600 * Math.exp(-distance * 7)));
  const volBase = Math.max(20, Math.round(oiBase * (0.14 + (type === 'call' ? 0.03 : 0))));
  const suffix = type === 'call' ? 'C' : 'P';
  return {
    contractTicker: `O:${symbol}${expiry.date.replaceAll('-', '').slice(2)}${suffix}${String(Math.round(strike * 1000)).padStart(8, '0')}`,
    type,
    expiry: expiry.date,
    strike,
    bid,
    ask,
    mark,
    volume: volBase,
    openInterest: oiBase,
    iv,
    delta: round(deltaBase, 3),
    gamma: round(Math.max(0.001, 0.012 * Math.exp(-distance * 6)), 4),
    theta: round(-Math.max(0.01, mark * 0.018), 3),
    vega: round(Math.max(0.01, spot * 0.0009 * Math.sqrt(expiry.days / 30) * Math.exp(-distance * 4)), 3),
    source: 'public_mock_options_snapshot',
    quoteTradable: true,
    quoteTimestamp: QUOTE_TIMESTAMP,
    wsPriority: distance < 0.05 ? 1 : 2,
  };
}

function buildChain(ticker: TickerInfo, visibleStrikes = 12, limit = 240): LiveOptionChainRow[] {
  const symbol = ticker.symbol;
  const spot = ticker.price;
  const step = spot > 500 ? 20 : spot > 150 ? 5 : 2.5;
  const half = Math.max(3, Math.min(25, Math.round(visibleStrikes)));
  const rows: LiveOptionChainRow[] = [];
  for (const expiry of EXPIRIES) {
    for (let offset = -half; offset <= half; offset += 1) {
      const strike = round(Math.max(step, Math.round((spot + offset * step) / step) * step), 2);
      rows.push(makeRow(symbol, spot, ticker.iv, expiry, strike, 'call'));
      rows.push(makeRow(symbol, spot, ticker.iv, expiry, strike, 'put'));
    }
  }
  return rows.slice(0, Math.max(20, limit));
}

function buildVolSurface(chain: LiveOptionChainRow[]) {
  const byExpiry = new Map<string, LiveOptionChainRow[]>();
  for (const row of chain) {
    const rows = byExpiry.get(row.expiry) ?? [];
    rows.push(row);
    byExpiry.set(row.expiry, rows);
  }
  const termStructure = EXPIRIES.map((expiry) => {
    const rows = byExpiry.get(expiry.date) ?? [];
    const ivs = rows.map((row) => Number(row.iv)).filter(Number.isFinite);
    const atmIv = ivs.length ? ivs.reduce((sum, value) => sum + value, 0) / ivs.length : null;
    const callIv = rows.filter((row) => row.type === 'call').map((row) => Number(row.iv)).filter(Number.isFinite);
    const putIv = rows.filter((row) => row.type === 'put').map((row) => Number(row.iv)).filter(Number.isFinite);
    const call25dIv = callIv.length ? callIv[Math.floor(callIv.length / 2)] : null;
    const put25dIv = putIv.length ? putIv[Math.floor(putIv.length / 2)] : null;
    return {
      expiry: expiry.date,
      days: expiry.days,
      atmIv: atmIv == null ? null : round(atmIv, 2),
      fwdIv: atmIv == null ? null : round(atmIv + expiry.days * 0.015, 2),
      skew25d: call25dIv != null && put25dIv != null ? round(put25dIv - call25dIv, 2) : null,
      call25dIv,
      put25dIv,
      sampleSize: rows.length,
    };
  });
  const atmIv = termStructure.find((point) => point.atmIv != null)?.atmIv ?? 50;
  return {
    source: 'public_mock_surface',
    termStructure,
    atmIvHistory: [
      { date: '2026-06-19', terms: { '1W': round(atmIv - 4), '1M': round(atmIv - 2), '3M': round(atmIv + 1) } },
      { date: '2026-06-20', terms: { '1W': round(atmIv - 2), '1M': round(atmIv - 1), '3M': round(atmIv + 2) } },
      { date: '2026-06-23', terms: { '1W': round(atmIv), '1M': round(atmIv + 1), '3M': round(atmIv + 3) } },
    ],
    skewHistory: [
      { date: '2026-06-19', terms: { '25D': -2.8 } },
      { date: '2026-06-20', terms: { '25D': -2.4 } },
      { date: '2026-06-23', terms: { '25D': -3.1 } },
    ],
    realizedVolHistory: [
      { date: '2026-06-19', terms: { '25D': round(atmIv * 0.72) } },
      { date: '2026-06-20', terms: { '25D': round(atmIv * 0.76) } },
      { date: '2026-06-23', terms: { '25D': round(atmIv * 0.78) } },
    ],
    diagnostics: {
      public_mock: true,
      live_provider_disabled: true,
    },
  };
}

function liveMarketPayload(symbol: string, url: URL): LiveMarketData {
  const ticker = resolveTicker(symbol);
  const visibleStrikes = Number(url.searchParams.get('visibleStrikes') || 12);
  const limit = Number(url.searchParams.get('limit') || 240);
  const chain = buildChain(ticker, visibleStrikes, limit);
  const volSurface = buildVolSurface(chain);
  const qualitySummary = {
    input_count: chain.length,
    accepted_count: chain.length,
    rejected_count: 0,
    rejection_reasons: {},
  };
  const optionMarketSnapshot = {
    asOfDate: AS_OF_DATE,
    symbol: ticker.symbol,
    underlying: {
      symbol: ticker.symbol,
      price: ticker.price,
      change: ticker.change,
      changePercent: ticker.changePercent,
      iv: ticker.iv,
      source: 'public_mock',
    },
    expiries: EXPIRIES,
    normalizedChain: chain.map((row) => ({
      contractTicker: row.contractTicker || '',
      symbol: ticker.symbol,
      type: row.type,
      expiry: row.expiry,
      strike: row.strike,
      bid: row.bid,
      ask: row.ask,
      mark: row.mark,
      mid: round((row.bid + row.ask) / 2),
      volume: row.volume,
      openInterest: row.openInterest,
      iv: row.iv ?? null,
      delta: row.delta ?? null,
      gamma: row.gamma ?? null,
      theta: row.theta ?? null,
      vega: row.vega ?? null,
      quoteTimestamp: row.quoteTimestamp,
      source: row.source,
    })),
    qualitySummary,
    volSurface,
    diagnostics: {
      public_mock: true,
      order_submission: false,
    },
  };
  return {
    ok: true,
    provider: 'public_mock',
    asOfDate: AS_OF_DATE,
    ticker,
    chain,
    expiries: EXPIRIES,
    volSummary: {
      atmIv: volSurface.termStructure[0]?.atmIv ?? ticker.iv,
      realizedVol: round(ticker.iv * 0.78),
      rowCount: chain.length,
      source: 'public_mock_surface',
    },
    volSurface,
    qualitySummary,
    optionMarketSnapshot,
    cacheTelemetry: {
      fetchedAt: QUOTE_TIMESTAMP,
      events: [{ layer: 'public_mock', label: 'browser fixture', hit: true, ttlSeconds: 0 }],
      hitCount: 1,
      missCount: 0,
    },
    optionWsPlan: {
      enabled: false,
      provider: 'public_mock',
      budgetPerMinute: 0,
      selectedCount: 0,
      candidateCount: 0,
      fallbackRestCount: 0,
      mode: 'disabled_public_mock',
      subscriptions: [],
    },
    wsQuoteTelemetry: {
      enabled: false,
      subscribedCount: 0,
      freshQuoteCount: 0,
      staleQuoteCount: 0,
      ignoredQuoteCount: 0,
      mergedCount: 0,
      maxAgeSeconds: 0,
    },
    wsWorkerTelemetry: null,
    apiBudgetGovernor: {
      planLabel: 'public mock only',
      budgetMode: url.searchParams.get('budgetMode') || 'focused',
      action: 'no_external_requests',
      restBudgetPerMinute: 0,
      optionWsBudgetPerMinute: 0,
      fullMarketSnapshotCost: 0,
      estimatedRestRequests: 0,
      actualHttpMisses: 0,
      httpCacheHitRatio: 1,
      wsSelectedCount: 0,
      wsFallbackRestCount: 0,
      riskLevel: 'normal',
      recommendation: 'Public sandbox uses browser fixtures only.',
      requestProfile: {
        visibleStrikes,
        expiryWindowDays: Number(url.searchParams.get('expiryWindowDays') || 90),
        chainLimit: limit,
      },
    },
    refreshPolicy: {
      selectedLegRefreshSeconds: 9999,
      regularRefreshSeconds: 9999,
      selectedContractRefreshMode: 'public_mock_static',
      executableQuotePolicy: 'not_for_trading',
      staleDataVerdict: 'watch_only',
    },
  };
}

function responseJson(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.clone().json();
  } catch {
    return {};
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionLegsFromBody(body: Record<string, unknown>): OptionLeg[] {
  return Array.isArray(body.legs) ? body.legs as OptionLeg[] : [];
}

function mockGreeks(legs: OptionLeg[], currentSpot: number, targetDays: number, ratePct: number): Greeks {
  if (legs.length === 0) return { delta: 0, gamma: 0, vega: 0, theta: 0 };
  return calculatePositionValueAndPnL(legs, currentSpot, targetDays, ratePct).Greeks;
}

async function optionCoreAnalyze(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const legs = optionLegsFromBody(body);
  const currentSpot = finiteNumber(body.current_spot, 100);
  const targetDays = finiteNumber(body.target_days, 30);
  const ratePct = finiteNumber(body.rate_pct, 4.5);
  const analysis = analyzeStrategy(legs, currentSpot, targetDays, ratePct);
  const scenarioSpots = Array.isArray(body.scenario_spots)
    ? body.scenario_spots.map((value) => finiteNumber(value, currentSpot))
    : [currentSpot * 0.9, currentSpot, currentSpot * 1.1];
  const scenarios = scenarioSpots.map((spot) => ({
    spot: round(spot),
    pnl: round(calculatePositionValueAndPnL(legs, spot, targetDays, ratePct).pnl, 4),
  }));
  const payload: RustPositionAnalysisResponse = {
    ok: true,
    engine: 'public-mock-option-core',
    result: {
      engine: 'public-mock-option-core',
      net_premium: round(analysis.netPremium, 4),
      current_pnl: round(analysis.currentPnL, 4),
      max_profit: Number.isFinite(analysis.maxProfit) ? round(analysis.maxProfit, 4) : 'Infinity',
      max_loss: Number.isFinite(analysis.maxLoss) ? round(analysis.maxLoss, 4) : '-Infinity',
      breakevens: analysis.breakevens,
      quality_score: 50,
      risk_flags: ['PUBLIC_MOCK_ONLY', 'NOT_FOR_TRADING'],
      greeks: mockGreeks(legs, currentSpot, targetDays, ratePct),
      scenarios,
    },
  };
  return responseJson(payload);
}

async function optionCoreSurface(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const legs = optionLegsFromBody(body);
  const currentSpot = finiteNumber(body.current_spot, 100);
  const ratePct = finiteNumber(body.rate_pct, 4.5);
  const priceMin = finiteNumber(body.price_min, currentSpot * 0.75);
  const priceMax = finiteNumber(body.price_max, currentSpot * 1.25);
  const yMin = finiteNumber(body.y_min, 1);
  const yMax = finiteNumber(body.y_max, 90);
  const xSteps = Math.max(2, Math.min(32, Math.round(finiteNumber(body.x_steps, 12))));
  const ySteps = Math.max(2, Math.min(32, Math.round(finiteNumber(body.y_steps, 12))));
  const yDimension = body.y_dimension === 'iv' ? 'iv' : 'days';
  const requestedPlotTarget = String(body.plot_target);
  const plotTarget: RustSurfacePlotTarget = ['pnl', 'delta', 'gamma', 'vega', 'theta'].includes(requestedPlotTarget)
    ? requestedPlotTarget as RustSurfacePlotTarget
    : 'pnl';
  const points = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let xi = 0; xi <= xSteps; xi += 1) {
    const spot = priceMin + ((priceMax - priceMin) * xi) / xSteps;
    for (let yi = 0; yi <= ySteps; yi += 1) {
      const y = yMin + ((yMax - yMin) * yi) / ySteps;
      const days = yDimension === 'days' ? Math.max(0.5, y) : finiteNumber(body.target_days, 30);
      const valueState = calculatePositionValueAndPnL(legs, spot, days, ratePct);
      const greekValue = plotTarget === 'delta'
        ? valueState.Greeks.delta
        : plotTarget === 'gamma'
          ? valueState.Greeks.gamma
          : plotTarget === 'vega'
            ? valueState.Greeks.vega
            : plotTarget === 'theta'
              ? valueState.Greeks.theta
              : valueState.pnl;
      const value = round(greekValue, 4);
      zMin = Math.min(zMin, value);
      zMax = Math.max(zMax, value);
      points.push({ spot: round(spot, 4), y: round(y, 4), value });
    }
  }
  const payload: RustStrategySurfaceResponse = {
    ok: true,
    engine: 'public-mock-option-core',
    result: {
      engine: 'public-mock-option-core',
      surface: {
        engine: 'rust-option-core-surface',
        plot_target: plotTarget,
        y_dimension: yDimension,
        price_min: priceMin,
        price_max: priceMax,
        y_min: yMin,
        y_max: yMax,
        x_steps: xSteps,
        y_steps: ySteps,
        z_min: Number.isFinite(zMin) ? zMin : 0,
        z_max: Number.isFinite(zMax) ? zMax : 0,
        points,
      },
    },
  };
  return responseJson(payload);
}

function watchlistSummary(url: URL) {
  const symbols = (url.searchParams.get('symbols') || 'MRVL,MU,SNDK')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  return responseJson({
    ok: true,
    provider: 'public_mock',
    tickers: symbols.map(resolveTicker),
    refreshPolicy: {
      watchlistIdleRefreshSeconds: 9999,
    },
  });
}

export async function handlePublicMockRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const liveMatch = url.pathname.match(/^\/api\/market\/live\/([^/]+)$/);
  if (liveMatch) {
    return responseJson(liveMarketPayload(decodeURIComponent(liveMatch[1]), url));
  }
  if (url.pathname === '/api/market/watchlist-summary') return watchlistSummary(url);
  if (url.pathname === '/api/option-core/analyze') return optionCoreAnalyze(request);
  if (url.pathname === '/api/option-core/surface') return optionCoreSurface(request);
  return responseJson({
    ok: false,
    error: `Public mock API does not expose ${url.pathname}`,
  }, { status: 404 });
}

export function installPublicMockApi(): void {
  if (typeof window === 'undefined') return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input, init);
    const mockResponse = await handlePublicMockRequest(request);
    if (mockResponse) return mockResponse;
    return originalFetch(input, init);
  };
}
