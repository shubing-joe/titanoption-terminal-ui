/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LiveMarketData, LiveOptionChainRow, OptionLeg, RustPositionAnalysisResponse, TickerInfo, ValidationReplayResult } from './types';
import { cdfNormal, calculateBSPrice, analyzeStrategy } from './lib/optionsMath';
import { resolveAutoLegPremium } from './lib/livePremium';
import { getStrategyTemplates } from './lib/strategyTemplates';
import LegRow from './components/LegRow';
import TwoDChart from './components/TwoDChart';
import ThreeDChart from './components/ThreeDChart';
import AccountLedger from './components/AccountLedger';
import StrategyReport from './components/StrategyReport';
import VolatilityOddsPanel from './components/VolatilityOddsPanel';
import OptionsChainPanel from './components/OptionsChainPanel';
import VolatilityMonitor from './components/VolatilityMonitor';
import QuantFlowRadar from './components/QuantFlowRadar';
import ValidationReportPanel from './components/ValidationReportPanel';
import { resolveDaysAfterLiveRefresh } from './lib/expiryChoices';
import {
  buildLiveMarketUrl,
  buildLiveRequestParams,
  LiveBudgetMode,
  LiveRequestParams,
  resolveExpiryWindowDays,
  selectedLiveRefreshIntervalMs,
} from './lib/liveRequest';
import { resolveValidationChain } from './lib/validationReport';
import { terminalHeaderStatus } from './lib/terminalHeader';
import { loadStoredWatchlist, saveMergedStoredWatchlist, saveStoredWatchlist } from './lib/watchlistStorage';
import { readJsonResponse } from './lib/readJsonResponse';
import {
  DEFAULT_WORKSPACE_PANEL_HEIGHTS,
  DEFAULT_WORKSPACE_PANEL_VISIBILITY,
  DEFAULT_WORKSPACE_PANEL_WIDTHS,
  HEIGHT_CLASS_BY_PANEL_HEIGHT,
  WorkspacePanelHeight,
  nextWorkspacePanelHeight,
  workspacePanelHeightLabel,
  workspacePanelHeightShortLabel,
} from './lib/workspaceLayout';


import {
  Terminal, HelpCircle, Sparkles, Plus, AlertCircle,
  HelpCircle as InfoIcon, Scale, Layers,
  ShoppingCart, BarChart2, Zap, Settings, RefreshCw, Layers3, Crosshair,
  Activity, Compass, Maximize2, Minimize2, ChevronsUpDown, GripVertical, Columns, ArrowLeft, ArrowRight
} from 'lucide-react';

const TICKERS: TickerInfo[] = [
  { symbol: 'MRVL', name: 'Marvell Technology · Mock Snapshot', price: 307.86, change: -2.29, changePercent: -0.737, iv: 74.5, high: 317.63, low: 298.28, volume: '49.2M' },
  { symbol: 'MU', name: 'Micron Technology · Mock Snapshot', price: 1211.38, change: 78.29, changePercent: 6.904, iv: 86.2, high: 1245.67, low: 1162.12, volume: '53.1M' },
  { symbol: 'SNDK', name: 'SanDisk · Mock Snapshot', price: 2273.73, change: 88.25, changePercent: 4.039, iv: 92.5, high: 2352.99, low: 2250.00, volume: '10.0M' },
  { symbol: 'AAPL', name: '苹果公司 (Apple Inc.) · Mock Snapshot', price: 297.01, change: -1.15, changePercent: -0.386, iv: 28.4, high: 302.38, low: 294.40, volume: '44.9M' },
  { symbol: 'TSLA', name: '特斯拉 (Tesla Inc.) · Mock Snapshot', price: 405.05, change: 4.52, changePercent: 1.129, iv: 61.8, high: 414.33, low: 393.20, volume: '47.8M' },
  { symbol: 'NVDA', name: '英伟达 (NVIDIA Corp.) · Mock Snapshot', price: 208.65, change: -2.15, changePercent: -1.020, iv: 42.6, high: 213.92, low: 207.64, volume: '122.0M' },
  { symbol: 'PLTR', name: '帕兰提尔 (Palantir Technologies)', price: 135.56, change: 5.42, changePercent: 4.16, iv: 52, high: 138.20, low: 131.50, volume: '62.8M' },
  { symbol: 'BTC_USD', name: '比特币 (Bitcoin)', price: 68500, change: 1120, changePercent: 1.66, iv: 58, high: 69100, low: 67200, volume: '28.1B' },
  { symbol: 'MSFT', name: '微软 (Microsoft Corp.)', price: 420.55, change: 2.15, changePercent: 0.51, iv: 21, high: 425.00, low: 418.20, volume: '22.4M' },
  { symbol: 'AMD', name: '超威半导体 (Advanced Micro Devices)', price: 165.80, change: -3.40, changePercent: -2.01, iv: 36, high: 172.00, low: 162.50, volume: '33.1M' },
  { symbol: 'COIN', name: '网币科技 (Coinbase Global)', price: 232.10, change: -8.50, changePercent: -3.53, iv: 62, high: 245.00, low: 228.40, volume: '11.2M' },
  { symbol: 'AMZN', name: '亚马逊 (Amazon.com Inc.)', price: 181.20, change: 2.40, changePercent: 1.34, iv: 25, high: 183.50, low: 178.10, volume: '27.4M' },
  { symbol: 'GOOG', name: '谷歌 (Alphabet Inc.)', price: 173.80, change: 1.10, changePercent: 0.64, iv: 23, high: 175.40, low: 171.80, volume: '20.5M' },
  { symbol: 'MSTR', name: '微策投资 (MicroStrategy Inc.)', price: 1520.00, change: 75.20, changePercent: 5.21, iv: 72, high: 1545.00, low: 1430.00, volume: '2.1M' }
];

const DEFAULT_WATCHLIST_SYMBOLS = new Set(['MRVL', 'MU', 'SNDK']);
const DEFAULT_WATCHLIST_IDLE_REFRESH_SECONDS = 300;
const DEFAULT_CHAIN_VISIBLE_STRIKES = 25;
const DEFAULT_LIVE_BUDGET_MODE: LiveBudgetMode = 'deep';

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeLiveTicker = (ticker: TickerInfo | undefined, symbol: string, fallback: TickerInfo): TickerInfo => {
  const cleanSymbol = (ticker?.symbol || symbol || fallback.symbol).toUpperCase();
  const price = toFiniteNumber(ticker?.price, fallback.price);
  return {
    ...fallback,
    ...ticker,
    symbol: cleanSymbol,
    name: ticker?.name || `${cleanSymbol} · Mock Snapshot`,
    price,
    change: toFiniteNumber(ticker?.change, fallback.change),
    changePercent: toFiniteNumber(ticker?.changePercent, fallback.changePercent),
    iv: toFiniteNumber(ticker?.iv, fallback.iv),
    high: toFiniteNumber(ticker?.high, Math.max(price, fallback.high)),
    low: toFiniteNumber(ticker?.low, Math.min(price, fallback.low)),
    volume: String(ticker?.volume || fallback.volume || '0'),
    source: ticker?.source || fallback.source || 'public_mock',
  };
};

const normalizeLiveChain = (rows: LiveOptionChainRow[] | undefined): LiveOptionChainRow[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => (row.type === 'call' || row.type === 'put') && Number.isFinite(Number(row.strike)) && row.expiry)
    .map(row => ({
      ...row,
      type: row.type,
      expiry: row.expiry,
      strike: toFiniteNumber(row.strike, 0),
      bid: toFiniteNumber(row.bid, 0),
      ask: toFiniteNumber(row.ask, 0),
      mark: toFiniteNumber(row.mark, 0),
      volume: Math.max(0, Math.floor(toFiniteNumber(row.volume, 0))),
      openInterest: Math.max(0, Math.floor(toFiniteNumber(row.openInterest, 0))),
      iv: row.iv == null ? null : toFiniteNumber(row.iv, 0),
      delta: row.delta == null ? null : toFiniteNumber(row.delta, 0),
      gamma: row.gamma == null ? null : toFiniteNumber(row.gamma, 0),
      theta: row.theta == null ? null : toFiniteNumber(row.theta, 0),
      vega: row.vega == null ? null : toFiniteNumber(row.vega, 0),
    }));
};

const liveLegFromChain = (
  chain: LiveOptionChainRow[],
  price: number,
  fallbackIV: number,
  daysToExpiry: number,
): OptionLeg => {
  const calls = chain.filter(row => row.type === 'call' && row.ask > 0);
  const nearestCall = calls.reduce<LiveOptionChainRow | null>((best, row) => {
    if (!best) return row;
    return Math.abs(row.strike - price) < Math.abs(best.strike - price) ? row : best;
  }, null);

  const strike = nearestCall?.strike || Math.round(price);
  const premium = nearestCall?.ask || nearestCall?.mark || Number((price * 0.04).toFixed(2));
  return {
    id: `leg_${Date.now()}_live_call_${strike}`,
    type: 'call',
    side: 'buy',
    strike,
    expiryDays: daysToExpiry,
    quantity: 1,
    iv: toFiniteNumber(nearestCall?.iv, fallbackIV),
    premium: Number(Math.max(0.01, premium).toFixed(2)),
    isCustomPremium: false,
  };
};

const syncExpiryToSingleTermLegs = (currentLegs: OptionLeg[], daysToExpiry: number): OptionLeg[] => {
  if (currentLegs.length === 0) return currentLegs;
  const uniqueExpiryDays = new Set(currentLegs.map(leg => leg.expiryDays));
  if (uniqueExpiryDays.size > 1) return currentLegs;
  return currentLegs.map(leg => ({ ...leg, expiryDays: daysToExpiry }));
};

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('MRVL');
  const [tickers, setTickers] = useState<TickerInfo[]>(() => (
    typeof window === 'undefined' ? TICKERS : loadStoredWatchlist(window.localStorage, TICKERS)
  ));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const [globalParams, setGlobalParams] = useState({
    stockPrice: 307.86, // overrides standard ticker price if changed via sliders
    daysToExpiry: 28,
    r: 4.5,
  });

  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [strategyName, setStrategyName] = useState<string>('买入看涨期权 (Long Call)');
  const [activeTab, setActiveTab] = useState<'workspace' | '2d' | '3d' | 'odds' | 'volatility' | 'quant' | 'compare' | 'trading'>('workspace');

  // Custom Interactive Board / Workspace states
  const [panelOrder, setPanelOrder] = useState<string[]>([
    '2d',
    '3d',
    'odds',
    'volatility',
    'quant',
    'compare',
    'trading'
  ]);

  const [panelWidths, setPanelWidths] = useState<Record<string, 'half' | 'full'>>({
    ...DEFAULT_WORKSPACE_PANEL_WIDTHS,
  });

  const [panelHeights, setPanelHeights] = useState<Record<string, WorkspacePanelHeight>>({
    ...DEFAULT_WORKSPACE_PANEL_HEIGHTS,
  });

  const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);

  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>({
    ...DEFAULT_WORKSPACE_PANEL_VISIBILITY,
  });

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [liveMarketData, setLiveMarketData] = useState<LiveMarketData | null>(null);
  const [isLiveLoading, setIsLiveLoading] = useState<boolean>(false);
  const [liveRequestParams, setLiveRequestParams] = useState<LiveRequestParams>(() => buildLiveRequestParams(DEFAULT_CHAIN_VISIBLE_STRIKES, false, DEFAULT_LIVE_BUDGET_MODE));
  const [liveRefreshReason, setLiveRefreshReason] = useState<string>('initial');
  const [isWsSimulationEnabled, setIsWsSimulationEnabled] = useState<boolean>(false);
  const [validationReplay, setValidationReplay] = useState<ValidationReplayResult | undefined>(undefined);
  const [validationReplayError, setValidationReplayError] = useState<string | undefined>(undefined);
  const [isValidationReplayLoading, setIsValidationReplayLoading] = useState<boolean>(false);
  const [rustPositionAnalysis, setRustPositionAnalysis] = useState<RustPositionAnalysisResponse | undefined>(undefined);
  const [isRustAnalysisLoading, setIsRustAnalysisLoading] = useState<boolean>(false);
  const [watchlistIdleRefreshSeconds, setWatchlistIdleRefreshSeconds] = useState<number>(DEFAULT_WATCHLIST_IDLE_REFRESH_SECONDS);
  const [watchlistLastUpdatedAt, setWatchlistLastUpdatedAt] = useState<number | null>(null);

  const activeTicker = tickers.find(t => t.symbol === selectedSymbol) || tickers[0];
  const liveChainRows = liveMarketData?.ok ? liveMarketData.chain || [] : [];
  const validationChainRows = resolveValidationChain(liveMarketData);
  const liveAsOfDate = liveMarketData?.ok ? liveMarketData.asOfDate : undefined;

  const filteredTickers = tickers.filter(t =>
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Whenever user clicks / scales active ticker, reload ticker parameters
  const handleTickerSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    const target = tickers.find(t => t.symbol === symbol) || tickers[0];

    setGlobalParams({
      stockPrice: target.price,
      daysToExpiry: 28,
      r: 4.5
    });

    // Populate standard call leg centering current spot price
    const SRounded = Math.round(target.price);
    const initialLeg: OptionLeg = {
      id: `leg_${Date.now()}_0`,
      type: 'call',
      side: 'buy',
      strike: SRounded,
      expiryDays: 28,
      quantity: 1,
      iv: target.iv,
      premium: Number((target.price * 0.04).toFixed(2)),
      isCustomPremium: false
    };
    setLegs([initialLeg]);
    setStrategyName('买入看涨期权 (Long Call)');
  };

  // Create a brand new ticker from arbitrary user query string on the fly!
  const handleCreateCustomTicker = (symbolStr: string) => {
    const uppercased = symbolStr.toUpperCase().trim();
    if (!uppercased) return;

    // Check if it already exists
    const existing = tickers.find(t => t.symbol === uppercased);
    if (existing) {
      handleTickerSelect(existing.symbol);
      setIsDropdownOpen(false);
      setSearchQuery('');
      return;
    }

    const seedPrice = activeTicker?.price || 100;
    const seedIV = activeTicker?.iv || 35;
    const newTicker: TickerInfo = {
      symbol: uppercased,
      name: `自定义标的资产 (${uppercased} Asset) · awaiting live`,
      price: seedPrice,
      change: 0,
      changePercent: 0,
      iv: seedIV,
      high: Number((seedPrice * 1.05).toFixed(2)),
      low: Number((seedPrice * 0.95).toFixed(2)),
      volume: '0',
      source: 'pending_live_lookup',
    };

    const nextTickers = [...tickers, newTicker];
    setTickers(nextTickers);
    saveStoredWatchlist(window.localStorage, nextTickers);
    setSelectedSymbol(uppercased);

    setGlobalParams({
      stockPrice: seedPrice,
      daysToExpiry: 28,
      r: 4.5
    });

    const SRounded = Math.round(seedPrice);
    const initialLeg: OptionLeg = {
      id: `leg_${Date.now()}_0`,
      type: 'call',
      side: 'buy',
      strike: SRounded,
      expiryDays: 28,
      quantity: 1,
      iv: seedIV,
      premium: Number((seedPrice * 0.04).toFixed(2)),
      isCustomPremium: false
    };
    setLegs([initialLeg]);
    setStrategyName('买入看涨期权 (Long Call)');
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const loadLiveMarketData = async (
    symbol: string,
    params: LiveRequestParams = liveRequestParams,
    reason = 'manual',
  ) => {
    setLiveRefreshReason(reason);
    setLiveRequestParams(params);
    setIsLiveLoading(true);
    try {
      const response = await fetch(buildLiveMarketUrl(symbol, params));
      const payload = await readJsonResponse(response, 'live market data');
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'live market data failed');
      }
      const rawPayload = payload as LiveMarketData;
      const normalizedChain = normalizeLiveChain(rawPayload.chain);
      const fallbackTicker = tickers.find(ticker => ticker.symbol === symbol) || TICKERS.find(ticker => ticker.symbol === symbol) || tickers[0] || TICKERS[0];
      const normalizedTicker = normalizeLiveTicker(rawPayload.ticker, symbol, fallbackTicker);
      const normalizedQualitySummary = rawPayload.qualitySummary || {
        input_count: normalizedChain.length,
        accepted_count: normalizedChain.length,
        rejected_count: 0,
        rejection_reasons: {},
      };
      const livePayload: LiveMarketData = {
        ...rawPayload,
        asOfDate: rawPayload.asOfDate,
        ticker: normalizedTicker,
        chain: normalizedChain,
        expiries: Array.isArray(rawPayload.expiries) ? rawPayload.expiries : [],
        volSummary: rawPayload.volSummary,
        volSurface: rawPayload.volSurface,
        qualitySummary: normalizedQualitySummary,
        optionMarketSnapshot: rawPayload.optionMarketSnapshot,
        cacheTelemetry: rawPayload.cacheTelemetry,
        optionWsPlan: rawPayload.optionWsPlan,
        wsQuoteTelemetry: rawPayload.wsQuoteTelemetry,
        wsWorkerTelemetry: rawPayload.wsWorkerTelemetry,
        apiBudgetGovernor: rawPayload.apiBudgetGovernor,
        refreshPolicy: rawPayload.refreshPolicy,
      };
      setLiveMarketData(livePayload);
      if (livePayload.ticker) {
        setTickers(prev => {
          const exists = prev.some(ticker => ticker.symbol === livePayload.ticker?.symbol);
          const next = exists
            ? prev.map(ticker => ticker.symbol === livePayload.ticker?.symbol ? { ...ticker, ...livePayload.ticker } : ticker)
            : [livePayload.ticker as TickerInfo, ...prev];
          saveMergedStoredWatchlist(window.localStorage, next);
          return next;
        });
        setGlobalParams(prev => {
          const nextDays = resolveDaysAfterLiveRefresh(livePayload.expiries, prev.daysToExpiry);
          return {
            ...prev,
            stockPrice: Number(livePayload.ticker?.price || prev.stockPrice),
            daysToExpiry: nextDays,
          };
        });
        setLegs(prev => {
          const currentLegDays = prev.length > 0 ? prev[0].expiryDays : globalParams.daysToExpiry;
          const nextDays = resolveDaysAfterLiveRefresh(livePayload.expiries, currentLegDays);
          const shouldResetLeg = prev.length === 0 || DEFAULT_WATCHLIST_SYMBOLS.has(symbol.toUpperCase());
          return shouldResetLeg
            ? [liveLegFromChain(normalizedChain, livePayload.ticker?.price || globalParams.stockPrice, livePayload.ticker?.iv || activeTicker.iv, nextDays)]
            : syncExpiryToSingleTermLegs(prev, nextDays);
        });
      }
    } catch (error) {
      setLiveMarketData({ ok: false, error: (error as Error).message });
    } finally {
      setIsLiveLoading(false);
    }
  };

  const toggleWsSimulation = () => {
    const nextEnabled = !isWsSimulationEnabled;
    setIsWsSimulationEnabled(nextEnabled);
    loadLiveMarketData(selectedSymbol, { ...liveRequestParams, simulateWs: nextEnabled }, nextEnabled ? 'ws-sim-on' : 'ws-sim-off');
  };

  const loadWatchlistSummary = async () => {
    const symbols = tickers.map(ticker => ticker.symbol).filter(Boolean);
    if (symbols.length === 0) return;
    try {
      const response = await fetch(`/api/market/watchlist-summary?symbols=${encodeURIComponent(symbols.join(','))}`);
      const payload = await readJsonResponse(response, 'watchlist summary');
      if (!response.ok || payload.ok === false || !Array.isArray(payload.tickers)) {
        throw new Error(payload.error || 'watchlist summary failed');
      }
      const incomingTickers: TickerInfo[] = payload.tickers
        .map((ticker: TickerInfo) => {
          const fallback = tickers.find(existing => existing.symbol === ticker.symbol) || TICKERS.find(existing => existing.symbol === ticker.symbol) || ticker;
          return normalizeLiveTicker(ticker, ticker.symbol, fallback);
        });
      setTickers(prev => {
        const bySymbol = new Map<string, TickerInfo>(incomingTickers.map((ticker) => [ticker.symbol, ticker]));
        const next = prev.map(ticker => {
          const incoming = bySymbol.get(ticker.symbol);
          return incoming ? { ...ticker, ...incoming } : ticker;
        });
        saveMergedStoredWatchlist(window.localStorage, next);
        return next;
      });
      const nextRefreshSeconds = Number(payload.refreshPolicy?.watchlistIdleRefreshSeconds);
      if (Number.isFinite(nextRefreshSeconds) && nextRefreshSeconds > 0) {
        setWatchlistIdleRefreshSeconds(nextRefreshSeconds);
      }
      setWatchlistLastUpdatedAt(Date.now());
    } catch (error) {
      console.warn('watchlist summary refresh failed', error);
    }
  };

  const loadValidationReplay = async () => {
    setIsValidationReplayLoading(true);
    try {
      const response = await fetch('/api/market/validation/replay');
      const payload = await readJsonResponse(response, 'validation replay');
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'validation replay failed');
      }
      setValidationReplay(payload.result as ValidationReplayResult);
      setValidationReplayError(undefined);
    } catch (error) {
      setValidationReplay(undefined);
      setValidationReplayError((error as Error).message);
    } finally {
      setIsValidationReplayLoading(false);
    }
  };

  const loadRustPositionAnalysis = async () => {
    if (legs.length === 0) {
      setRustPositionAnalysis(undefined);
      return;
    }
    setIsRustAnalysisLoading(true);
    try {
      const scenarioSpots = [
        Number((globalParams.stockPrice * 0.9).toFixed(2)),
        Number(globalParams.stockPrice.toFixed(2)),
        Number((globalParams.stockPrice * 1.1).toFixed(2)),
      ];
      const response = await fetch('/api/option-core/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_spot: globalParams.stockPrice,
          target_days: globalParams.daysToExpiry,
          rate_pct: globalParams.r,
          scenario_spots: scenarioSpots,
          legs,
        }),
      });
      const payload = await readJsonResponse(response, 'option-core analysis');
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'rust option-core analysis failed');
      }
      setRustPositionAnalysis(payload as RustPositionAnalysisResponse);
    } catch (error) {
      setRustPositionAnalysis({ ok: false, error: (error as Error).message });
    } finally {
      setIsRustAnalysisLoading(false);
    }
  };

  const headerStatus = terminalHeaderStatus({
    liveMarketData,
    isLiveLoading,
    liveRequestParams,
  });

  // Run on first boot to load default MRVL legs
  useEffect(() => {
    handleTickerSelect('MRVL');
  }, []);

  useEffect(() => {
    loadValidationReplay();
  }, []);

  useEffect(() => {
    loadRustPositionAnalysis();
  }, [legs, globalParams.stockPrice, globalParams.daysToExpiry, globalParams.r]);

  useEffect(() => {
    const nextParams = buildLiveRequestParams(DEFAULT_CHAIN_VISIBLE_STRIKES, isWsSimulationEnabled, liveRequestParams.budgetMode || DEFAULT_LIVE_BUDGET_MODE);
    loadLiveMarketData(selectedSymbol, nextParams, 'symbol-change');
  }, [selectedSymbol]);

  const handleChainVisibleStrikesChange = (visibleStrikes: number) => {
    const nextParams = buildLiveRequestParams(visibleStrikes, isWsSimulationEnabled, liveRequestParams.budgetMode);
    setLiveRequestParams(nextParams);
    setLiveRefreshReason('strike-range-change');
  };

  const handleBudgetModeChange = (budgetMode: LiveBudgetMode) => {
    const nextParams = buildLiveRequestParams(DEFAULT_CHAIN_VISIBLE_STRIKES, isWsSimulationEnabled, budgetMode);
    loadLiveMarketData(selectedSymbol, nextParams, `budget-${budgetMode}`);
  };

  useEffect(() => {
    if (liveRefreshReason !== 'strike-range-change') return;
    const timerId = window.setTimeout(() => {
      loadLiveMarketData(selectedSymbol, liveRequestParams, 'strike-range-change');
    }, 700);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRequestParams.visibleStrikes, liveRequestParams.simulateWs, liveRequestParams.budgetMode, liveRefreshReason, selectedSymbol]);

  useEffect(() => {
    if (!liveMarketData?.ok) return;
    const intervalMs = selectedLiveRefreshIntervalMs(
      liveRequestParams.budgetMode,
      liveMarketData.refreshPolicy?.selectedLegRefreshSeconds,
    );
    const timerId = window.setInterval(() => {
      loadLiveMarketData(selectedSymbol, liveRequestParams, `selected-${liveRequestParams.budgetMode}-refresh`);
    }, intervalMs);
    return () => window.clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    liveMarketData?.ok,
    liveMarketData?.refreshPolicy?.selectedLegRefreshSeconds,
    liveRequestParams.budgetMode,
    liveRequestParams.visibleStrikes,
    liveRequestParams.limit,
    liveRequestParams.expiryWindowDays,
    liveRequestParams.simulateWs,
    selectedSymbol,
  ]);

  useEffect(() => {
    loadWatchlistSummary();
    const intervalMs = Math.max(60, watchlistIdleRefreshSeconds) * 1000;
    const timerId = window.setInterval(() => {
      loadWatchlistSummary();
    }, intervalMs);
    return () => window.clearInterval(timerId);
  }, [watchlistIdleRefreshSeconds, tickers.map(ticker => ticker.symbol).join('|')]);

  // Sync: Option price automatically recomputes if underlying Stock price, expiration Days, IV or Rate changes
  useEffect(() => {
    if (legs.length === 0) return;
    let didChangesOccur = false;

    const computedLegs = legs.map((leg) => {
      if (!leg.isCustomPremium) {
        const premiumResult = resolveAutoLegPremium(leg, {
          liveChain: liveChainRows,
          asOfDate: liveAsOfDate,
          stockPrice: globalParams.stockPrice,
          riskFreeRate: globalParams.r,
        });
        const roundedPremium = premiumResult.premium;

        if (leg.premium !== roundedPremium) {
          didChangesOccur = true;
          return {
            ...leg,
            premium: roundedPremium
          };
        }
      }
      return leg;
    });

    if (didChangesOccur) {
      setLegs(computedLegs);
    }

  }, [globalParams.stockPrice, globalParams.r, legs, liveChainRows, liveAsOfDate]);

  // Load Strategy templates
  const handleLoadTemplate = (templateName: string, templateLegs: OptionLeg[]) => {
    // Fill option premium theoretical value instantly
    const preparedLegs = templateLegs.map(leg => {
      const price = calculateBSPrice(
        globalParams.stockPrice,
        leg.strike,
        globalParams.daysToExpiry,
        leg.iv,
        globalParams.r,
        leg.type
      );
      return {
        ...leg,
        expiryDays: globalParams.daysToExpiry,
        premium: Number(Math.max(0.01, price).toFixed(2)),
        isCustomPremium: false
      };
    });

    setLegs(preparedLegs);
    setStrategyName(templateName);
  };

  const handleUpdateLeg = (updatedLeg: OptionLeg) => {
    if (updatedLeg.expiryDays !== globalParams.daysToExpiry) {
      setGlobalParams(prev => ({ ...prev, daysToExpiry: updatedLeg.expiryDays }));
      const nextParams = {
        ...liveRequestParams,
        expiryWindowDays: resolveExpiryWindowDays(updatedLeg.expiryDays),
        simulateWs: isWsSimulationEnabled,
      };
      loadLiveMarketData(selectedSymbol, nextParams, 'expiry-change');
    }
    setLegs(legs.map(l => l.id === updatedLeg.id ? updatedLeg : l));
    setStrategyName('自定义期权策略组合 (Custom Position)');
  };

  const handleExpiryChange = (days: number) => {
    setGlobalParams(prev => ({ ...prev, daysToExpiry: days }));
    setLegs(prev => syncExpiryToSingleTermLegs(prev, days));
    const nextParams = {
      ...liveRequestParams,
      expiryWindowDays: resolveExpiryWindowDays(days),
      simulateWs: isWsSimulationEnabled,
    };
    loadLiveMarketData(selectedSymbol, nextParams, 'expiry-change');
  };

  const handleDeleteLeg = (id: string) => {
    const nextLegs = legs.filter(l => l.id !== id);
    setLegs(nextLegs);
    setStrategyName('自定义期权策略组合 (Custom Position)');
  };

  const handleAddLeg = () => {
    const defaultStrike = Math.round(globalParams.stockPrice);
    const newLeg: OptionLeg = {
      id: `leg_${Date.now()}_${legs.length}`,
      type: 'call',
      side: 'buy',
      strike: defaultStrike,
      expiryDays: globalParams.daysToExpiry,
      quantity: 1,
      iv: activeTicker.iv,
      premium: Number((globalParams.stockPrice * 0.04).toFixed(2)),
      isCustomPremium: false
    };

    setLegs([...legs, newLeg]);
    setStrategyName('自定义期权策略组合 (Custom Position)');
  };

  // AI Import suggested strategies handler
  const handleImportAISuggestion = (aiLegs: OptionLeg[], aiStrategyName: string) => {
    setLegs(aiLegs);
    setStrategyName(aiStrategyName);
    setActiveTab('2d'); // jump to visualizer first so they instantly see it!
  };

  // Get active templates based on selected prices
  const templates = getStrategyTemplates(globalParams.stockPrice, activeTicker.iv);

  // Helper to shift a panel position manually (great for mobile/tablet clicks!)
  const shiftPanel = (id: string, dir: 'left' | 'right') => {
    const idx = panelOrder.indexOf(id);
    if (idx === -1) return;
    const nextOrder = [...panelOrder];
    if (dir === 'left' && idx > 0) {
      const temp = nextOrder[idx];
      nextOrder[idx] = nextOrder[idx - 1];
      nextOrder[idx - 1] = temp;
    } else if (dir === 'right' && idx < panelOrder.length - 1) {
      const temp = nextOrder[idx];
      nextOrder[idx] = nextOrder[idx + 1];
      nextOrder[idx + 1] = temp;
    }
    setPanelOrder(nextOrder);
  };

  const togglePanelWidth = (id: string) => {
    setPanelWidths(prev => ({
      ...prev,
      [id]: prev[id] === 'full' ? 'half' : 'full'
    }));
  };

  const togglePanelHeight = (id: string) => {
    setPanelHeights(prev => {
      const next = nextWorkspacePanelHeight(prev[id]);
      return { ...prev, [id]: next };
    });
  };

  const togglePanelVisibility = (id: string) => {
    setPanelVisibility(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const resetWorkspaceLayout = () => {
    setPanelOrder([
      '2d',
      '3d',
      'odds',
      'volatility',
      'quant',
      'compare',
      'trading'
    ]);
    setPanelWidths({ ...DEFAULT_WORKSPACE_PANEL_WIDTHS });
    setPanelHeights({ ...DEFAULT_WORKSPACE_PANEL_HEIGHTS });
    setPanelVisibility({ ...DEFAULT_WORKSPACE_PANEL_VISIBILITY });
    setMaximizedPanelId(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const fromIdx = panelOrder.indexOf(draggedId);
    const toIdx = panelOrder.indexOf(targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const nextOrder = [...panelOrder];
      nextOrder.splice(fromIdx, 1);
      nextOrder.splice(toIdx, 0, draggedId);
      setPanelOrder(nextOrder);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const panelMetadata: Record<string, { title: string; colorText: string; icon: React.ReactNode; originalIndex: number }> = {
    '2d': {
      title: '2D 策略盈亏曲线 (2D PNL CHART)',
      colorText: 'text-[#00e5ff]',
      icon: <BarChart2 className="w-4 h-4 text-[#00e5ff]" />,
      originalIndex: 1,
    },
    '3d': {
      title: '3D 波动率风险地形 (3D RISK EXPOSURE)',
      colorText: 'text-[#ff9f1c]',
      icon: <Layers className="w-4 h-4 text-[#ff9f1c]" />,
      originalIndex: 2,
    },
    'odds': {
      title: '波动率勝率期望 (VOL ODDS ANALYSIS)',
      colorText: 'text-[#00ff33]',
      icon: <Crosshair className="w-4 h-4 text-[#00ff33]" />,
      originalIndex: 3,
    },
    'volatility': {
      title: '波动率偏斜与动态偏离 (VOL DISPERSION)',
      colorText: 'text-[#a855f7]',
      icon: <Activity className="w-4 h-4 text-[#a855f7]" />,
      originalIndex: 4,
    },
    'quant': {
      title: '量化期权异动雷达 (QUANT OPTION RADAR)',
      colorText: 'text-[#00ffcc]',
      icon: <Compass className="w-4 h-4 text-[#00ffcc]" />,
      originalIndex: 5,
    },
    'compare': {
      title: '多腿策略业绩回测 (STRATEGY METRICS BREAKDOWN)',
      colorText: 'text-[#ff00ff]',
      icon: <Scale className="w-4 h-4 text-[#ff00ff]" />,
      originalIndex: 8,
    },
    'trading': {
      title: '仿真行情对账单 (SIMULATED ACCOUNT LEDGER)',
      colorText: 'text-[#ffd700]',
      icon: <ShoppingCart className="w-4 h-4 text-[#ffd700]" />,
      originalIndex: 9,
    },
  };

  const renderPanelContent = (id: string, isMaximized = false) => {
    const hClass = isMaximized
      ? 'h-[640px]'
      : (HEIGHT_CLASS_BY_PANEL_HEIGHT[panelHeights[id] || 'medium'] || HEIGHT_CLASS_BY_PANEL_HEIGHT.medium);

    switch(id) {
      case '2d':
        return (
          <div className={`${hClass} w-full`}>
            <TwoDChart
              legs={legs}
              currentStockPrice={globalParams.stockPrice}
              daysToExpiry={globalParams.daysToExpiry}
              r={globalParams.r}
            />
          </div>
        );
      case '3d':
        return (
          <div className={`${hClass} w-full`}>
            <ThreeDChart
              legs={legs}
              currentStockPrice={globalParams.stockPrice}
              daysToExpiry={globalParams.daysToExpiry}
              asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
              r={globalParams.r}
              rustAnalysis={rustPositionAnalysis}
            />
          </div>
        );
      case 'odds':
        return (
          <div className={`${hClass} w-full overflow-y-auto`}>
            <VolatilityOddsPanel
              currentStockPrice={globalParams.stockPrice}
              daysToExpiry={globalParams.daysToExpiry}
              r={globalParams.r}
              activeSymbol={selectedSymbol}
              tickerIV={activeTicker.iv}
              liveTicker={liveMarketData?.ok ? liveMarketData.ticker : undefined}
              liveVolSummary={liveMarketData?.ok ? liveMarketData.volSummary : undefined}
              liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
              asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
              onImportStrategy={handleImportAISuggestion}
            />
          </div>
        );
      case 'volatility':
        return (
          <div className={`${hClass} w-full overflow-y-auto`}>
            <VolatilityMonitor
              currentStockPrice={globalParams.stockPrice}
              daysToExpiry={globalParams.daysToExpiry}
              r={globalParams.r}
              activeSymbol={selectedSymbol}
              tickerIV={activeTicker.iv}
              liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
              liveVolSummary={liveMarketData?.ok ? liveMarketData.volSummary : undefined}
              liveVolSurface={liveMarketData?.ok ? liveMarketData.volSurface : undefined}
              asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
            />
          </div>
        );
      case 'quant':
        return (
          <div className={`${hClass} w-full overflow-y-auto`}>
            <QuantFlowRadar
              currentStockPrice={globalParams.stockPrice}
              activeSymbol={selectedSymbol}
              tickerIV={activeTicker.iv}
              asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
              liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
              liveChain={liveMarketData?.ok ? liveMarketData.chain || [] : []}
            />
          </div>
        );
      case 'compare':
        return (
          <div className={`${hClass} w-full overflow-y-auto`}>
            <StrategyReport
              legs={legs}
              currentStockPrice={globalParams.stockPrice}
              daysToExpiry={globalParams.daysToExpiry}
              r={globalParams.r}
              strategyName={strategyName}
              activeSymbol={selectedSymbol}
              rustAnalysis={rustPositionAnalysis}
            />
          </div>
        );
      case 'trading':
        return (
          <div className={`${hClass} w-full overflow-y-auto`}>
            <AccountLedger
              activeLegs={legs}
              activeSymbol={selectedSymbol}
              tickerPrice={globalParams.stockPrice}
              r={globalParams.r}
              strategyName={strategyName}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d10] text-[#f8fafc] font-sans antialiased overflow-x-hidden flex flex-col">

      {/* PROFESSIONAL WALL-STREET TERMINAL HEADER */}
      <header className="border-b border-gray-800 bg-[#121215] px-4 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">

        {/* Terminal branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-xl shadow-lg shadow-emerald-500/20">
            <Layers3 className="w-5.5 h-5.5 text-black" />
          </div>
          <div>
            <h1 className="text-gray-100 font-extrabold tracking-tight text-base font-sans select-none flex items-center gap-2">
              TITANOPTION TERMINAL
              <span className="text-[10px] text-emerald-400 bg-emerald-400/10 font-bold px-2 py-0.5 rounded tracking-widest border border-emerald-400/20">
                PRO QUANT v3.1
              </span>
            </h1>
            <p className="text-[10px] text-gray-400 font-semibold font-mono mt-0.5">
              量化期权分析终端 汇聚 3D 敞口预测、沙盒对照与自动化虚拟执行柜台
            </p>
          </div>
        </div>

        {/* Global Stock Selection Navigation with Search Dropdown Autocomplete */}
        <div className="flex items-center gap-2 relative">
          <span className="text-[11px] text-gray-500 font-mono tracking-wider whitespace-nowrap">标的检索 Target:</span>

          <div className="relative w-56">
            <div className="flex items-center bg-[#141417] p-2 rounded border border-gray-800 text-xs text-gray-200 font-mono focus-within:border-emerald-500/80 transition shadow-inner">
              <input
                type="text"
                value={searchQuery}
                placeholder={selectedSymbol ? `<${selectedSymbol}> 键入代码检索...` : "输入标的代码..."}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                className="bg-transparent text-gray-100 outline-none w-full font-black uppercase placeholder-gray-650 tracking-wider"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    // Quick confirm exact symbol match or match first in search-filtered
                    const targetSymbol = searchQuery.toUpperCase().trim();
                    const exactMatch = filteredTickers.find(t => t.symbol.toUpperCase() === targetSymbol);
                    if (exactMatch) {
                      handleTickerSelect(exactMatch.symbol);
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                    } else if (filteredTickers.length > 0) {
                      handleTickerSelect(filteredTickers[0].symbol);
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                    } else {
                      handleCreateCustomTicker(searchQuery);
                    }
                  }
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-gray-500 hover:text-gray-300 font-bold ml-1 text-sm font-sans"
                  title="Clear input"
                >
                  ×
                </button>
              )}
            </div>

            {/* Float Dropdown overlay list */}
            {isDropdownOpen && (
              <div
                className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-[#0d0d10] border border-gray-800 shadow-2xl z-50 rounded-none scrollbar-thin divide-y divide-gray-900"
                style={{ minWidth: '240px' }}
              >
                {/* Search suggestion metadata */}
                <div className="px-3 py-1.5 text-[9px] font-bold text-gray-500 font-mono tracking-widest bg-black flex justify-between select-none">
                  <span>匹配标的 ({filteredTickers.length})</span>
                  <span>
                    LIST {Math.round(watchlistIdleRefreshSeconds / 60)}m
                    {watchlistLastUpdatedAt ? ` · ${new Date(watchlistLastUpdatedAt).toLocaleTimeString()}` : ''}
                  </span>
                </div>

                {filteredTickers.map((ticker) => (
                  <button
                    key={ticker.symbol}
                    onClick={() => {
                      handleTickerSelect(ticker.symbol);
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-mono flex items-center justify-between transition hover:bg-emerald-500/10 ${selectedSymbol === ticker.symbol ? 'bg-emerald-500/10 border-l-2 border-emerald-500 text-emerald-400' : 'text-gray-300'}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-extrabold tracking-wide uppercase">{ticker.symbol}</span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[130px] font-sans font-medium">{ticker.name}</span>
                    </div>
                    <div className="text-right flex flex-col justify-center">
                      <span className="font-bold text-[11px]">${ticker.price.toFixed(2)}</span>
                      <span className={`text-[9px] font-semibold ${ticker.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {ticker.change >= 0 ? '+' : ''}{ticker.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                ))}

                {/* Create custom input ticker if not present in the current filter list */}
                {searchQuery.trim() !== '' && !filteredTickers.some(t => t.symbol.toUpperCase() === searchQuery.toUpperCase().trim()) && (
                  <button
                    onClick={() => handleCreateCustomTicker(searchQuery)}
                    className="w-full text-left px-3 py-3 text-xs font-mono text-emerald-400 hover:bg-emerald-500/15 transition flex items-center gap-1.5 font-bold"
                  >
                    <Plus className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>创建新指标/标的: <strong className="text-yellow-400 select-text uppercase">{searchQuery}</strong></span>
                  </button>
                )}

                {filteredTickers.length === 0 && searchQuery.trim() === '' && (
                  <div className="p-3 text-xs text-gray-500 font-mono text-center">
                    输入任意美股或加密货币代码...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transparent Backdrop to close dropdown on outer click */}
          {isDropdownOpen && (
            <div
              className="fixed inset-0 z-40 bg-transparent cursor-default"
              onClick={() => setIsDropdownOpen(false)}
            />
          )}
        </div>

        {/* Ticker values stream metrics */}
        <div className="flex items-center gap-4 text-xs font-mono bg-[#18181e] px-4 py-2 rounded-lg border border-gray-850/80">
          <div className="flex flex-col">
            <span className="text-[8px] text-gray-500 uppercase">现价 SPOT PRICE</span>
            <span className="text-gray-100 font-bold">${activeTicker.price.toFixed(2)}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-[8px] text-gray-500 uppercase">涨跌幅 CHANGE</span>
            <span className={`font-bold ${activeTicker.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeTicker.change >= 0 ? '+' : ''}{activeTicker.changePercent.toFixed(2)}%
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[8px] text-gray-500 uppercase">隐波 IMPLIED VOL</span>
            <span className="text-sky-400 font-bold">{activeTicker.iv}%</span>
          </div>

          <div className="flex flex-col hidden sm:flex">
            <span className="text-[8px] text-gray-500 uppercase">52W 高/低 Range</span>
            <span className="text-gray-300 font-medium">${activeTicker.low} - ${activeTicker.high}</span>
          </div>
        </div>

        {/* System parameters indicator right */}
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-mono">
          <span className="text-gray-500 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${liveMarketData?.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {headerStatus.marketLabel}
          </span>
          <span className="text-[10px] text-cyan-300 border border-cyan-500/30 bg-cyan-950/20 px-2 py-1">
            {headerStatus.coverageLabel}
          </span>
          <span
            className="text-[10px] text-lime-300 border border-lime-500/30 bg-lime-950/20 px-2 py-1"
            title="切换期权链加载深度"
          >
            {headerStatus.modeLabel}
          </span>
          <div className="flex border border-lime-500/25 bg-black" title="切换期权链加载深度">
            {(['active', 'focused', 'balanced', 'deep'] as LiveBudgetMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleBudgetModeChange(mode)}
                className={`px-2 py-1 text-[9px] font-black uppercase border-r border-lime-500/15 last:border-r-0 ${
                  liveRequestParams.budgetMode === mode
                    ? 'bg-lime-500/20 text-lime-200'
                    : 'text-gray-500 hover:text-lime-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            onClick={toggleWsSimulation}
            className={`text-[10px] border px-2 py-1 font-bold ${isWsSimulationEnabled ? 'text-fuchsia-200 border-fuchsia-400 bg-fuchsia-900/40' : 'hidden'}`}
            title="本地 WS 仿真仅用于开发验证"
          >
            WS SIM ON
          </button>
        </div>

      </header>

      {/* PRIMARY RESPONSIVE DOCK WORKSPACE */}
      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden relative">

        {/* LEFT COMPREHENSIVE CONTROL & ANALYSIS BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-68px)] lg:max-h-full scrollbar-thin">

          {/* SEC 0: STANDALONE EXTRACTION OPTIONS CHAIN (MOVED TO TOP PER USER DELEGATION) */}
          <div className="w-full">
            <OptionsChainPanel
              currentStockPrice={globalParams.stockPrice}
              daysToExpiry={globalParams.daysToExpiry}
              onExpiryChange={handleExpiryChange}
              r={globalParams.r}
              activeSymbol={selectedSymbol}
              tickerIV={activeTicker.iv}
              legs={legs}
              onUpdateLegs={setLegs}
              strategyName={strategyName}
              setStrategyName={setStrategyName}
              liveChain={liveChainRows}
              liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
              onVisibleStrikesChange={handleChainVisibleStrikesChange}
            />
          </div>

          <ValidationReportPanel
            activeSymbol={selectedSymbol}
            qualitySummary={liveMarketData?.ok ? liveMarketData.qualitySummary : undefined}
            liveChain={validationChainRows.length > 0 ? validationChainRows : liveChainRows}
            replayResult={validationReplay}
            replayError={validationReplayError}
            isReplayLoading={isValidationReplayLoading}
            rustAnalysis={rustPositionAnalysis}
            isRustAnalysisLoading={isRustAnalysisLoading}
          />

          {/* SEC 1: TOP DOCK COMBINED HORIZONTAL CONTROL GRID */}
          <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4">

            {/* Select Strategy Presets & Parameter Sliders (5 cols width on XL) */}
            <div className="2xl:col-span-5 flex flex-col gap-4">

              {/* A. Strategic Presets Section */}
              <div className="bg-[#16161a] border border-gray-800 rounded-none p-4">
                <h3 className="text-[#ff9f1c] font-black text-xs font-mono uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f1c] inline-block animate-pulse" />
                  🎯 预设期权策略加载 (Select Strategy Presets)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 animate-fade-in">
                  {templates.map((tpl) => {
                    const isActive = strategyName === tpl.name;
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => handleLoadTemplate(tpl.name, tpl.legs)}
                        className={`px-2.5 py-1.5 rounded-none border text-left text-[11px] font-bold cursor-pointer transition ${isActive ? 'bg-[#ff9f1c]/10 text-[#ff9f1c] border-[#ff9f1c]/50' : 'bg-[#1b1b21]/60 text-gray-400 border-gray-800/80 hover:text-white hover:bg-[#202028]'}`}
                      >
                        <div className="truncate">{tpl.name.split(' (')[0]}</div>
                        <span className="text-[8.5px] text-gray-500 font-mono italic block mt-0.5 truncate uppercase">
                          {tpl.name.split(' (')[1]?.replace(')', '') || 'LegCombo'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* B. Simulation sliders parameters */}
              <div className="bg-[#16161a] border border-gray-800 rounded-none p-4 space-y-3.5-offset">
                <h3 className="text-[#ff9f1c] font-black text-xs font-mono uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f1c] inline-block animate-pulse" />
                  ⚙️ 模拟现价环境调节 (Simulation Sliders)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Spot scale */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-gray-400">
                      <span>标的股价 (Spot)</span>
                      <span className="text-emerald-400 font-extrabold font-mono">${globalParams.stockPrice.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={activeTicker.price * 0.7}
                      max={activeTicker.price * 1.3}
                      step={selectedSymbol === 'BTC_USD' ? '50' : '0.50'}
                      value={globalParams.stockPrice}
                      onChange={(e) => setGlobalParams({ ...globalParams, stockPrice: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-500 h-1 bg-gray-800 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[8px] text-gray-500 block text-right font-mono font-bold">
                      标的基准: ${activeTicker.price}
                    </span>
                  </div>

                  {/* Till Expiry Days (T) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-gray-400">
                      <span>时间流逝 (Days)</span>
                      <span className="text-sky-400 font-extrabold font-mono">{globalParams.daysToExpiry} 天</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max={Math.max(120, ...legs.map(l => l.expiryDays))}
                      step={Math.max(120, ...legs.map(l => l.expiryDays)) > 1000 ? "10" : "1"}
                      value={Math.min(globalParams.daysToExpiry, Math.max(120, ...legs.map(l => l.expiryDays)))}
                      onChange={(e) => setGlobalParams({ ...globalParams, daysToExpiry: parseInt(e.target.value) })}
                      className="w-full accent-sky-500 h-1 bg-gray-800 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[8px] text-gray-500 block text-right font-mono font-bold">
                      期限滑轴: 0.5 - {Math.max(120, ...legs.map(l => l.expiryDays))}天
                    </span>
                  </div>

                  {/* Base rate (r) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-gray-400">
                      <span>无风险年化 (r)</span>
                      <span className="text-violet-400 font-extrabold font-mono">{globalParams.r}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="10.0"
                      step="0.10"
                      value={globalParams.r}
                      onChange={(e) => setGlobalParams({ ...globalParams, r: parseFloat(e.target.value) })}
                      className="w-full accent-violet-500 h-1 bg-gray-800 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[8px] text-gray-500 block text-right font-mono font-bold">
                      央行基准利息
                    </span>
                  </div>
                </div>

              </div>

            </div>

            {/* C. Option Leg Matrix list editor (7 cols length on XL) */}
            <div className="2xl:col-span-7 bg-[#16161a] border border-gray-800 rounded-none p-4 flex flex-col justify-between">

              <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                <div>
                  <h3 className="text-gray-100 font-black text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="text-emerald-400 w-4.5 h-4.5" />
                    期权多腿持仓矩阵 (Option Leg Editor)
                  </h3>
                  <p className="text-[9.5px] text-gray-400 font-mono mt-0.5">
                    自主调配各交易腿的行权价、方向及配比，盈亏模型在下方主视区中即时渲染
                  </p>
                </div>

                {/* Add Leg button */}
                <button
                  onClick={handleAddLeg}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black px-3 py-1.5 rounded-none flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添合约腿
                </button>
              </div>

              {/* Scrollable list container */}
              <div className="space-y-2 max-h-[145px] overflow-y-auto scrollbar-thin flex-1 pr-1.5">
                {legs.length === 0 ? (
                  <div className="text-center py-6 bg-gray-900/10 border border-dashed border-gray-800 rounded-none">
                    <AlertCircle className="w-6 h-6 text-gray-500 mx-auto mb-1" />
                    <p className="text-[11px] text-gray-400 font-mono">目前无任何合约腿配置。点击左侧加载预设或点击上方添加合约腿</p>
                  </div>
                ) : (
                  legs.map((leg) => (
                    <LegRow
                      key={leg.id}
                      leg={leg}
                      tickerPrice={globalParams.stockPrice}
                      liveExpiries={liveMarketData?.ok ? liveMarketData.expiries : undefined}
                      onUpdate={handleUpdateLeg}
                      onDelete={handleDeleteLeg}
                    />
                  ))
                )}
              </div>

              {/* Strategy summary line */}
              {legs.length > 0 && (
                <div className="bg-[#1e1e24]/60 border border-gray-800/80 p-2 rounded-none flex items-center justify-between text-[11px] font-mono mt-2">
                  <span className="text-gray-400 uppercase font-bold tracking-wider">结构方案组合:</span>
                  <span className="text-emerald-400 font-black tracking-wide text-xs underline decoration-wavy decoration-emerald-800/80">
                    {strategyName}
                  </span>
                </div>
              )}

            </div>

          </div>

          {/* SEC 2: LOWER FULL-WIDTH MAIN FOCUS TAB WORKSPACE */}
          <div className="bg-[#0e0e11] border border-gray-800 p-4 rounded-none min-h-[500px]">

            {/* Visualizer navigation headers tabs */}
            <div className="flex flex-wrap items-center justify-between border-b border-gray-800 pb-3 mb-4 gap-4">

              {/* Tab options selectors */}
              <div className="flex bg-black p-1 rounded-none border border-gray-800 text-xs overflow-x-auto scrollbar-thin max-w-full font-mono uppercase tracking-wider">

                <button
                  onClick={() => setActiveTab('workspace')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'workspace' ? 'bg-[#ff0055]/15 text-[#ff0055] border border-[#ff0055]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <Layers3 className="w-3.5 h-3.5 text-[#ff0055]" />
                  🖥️ COCKPIT WORKSPACE (多窗对比)
                </button>

                <button
                  onClick={() => setActiveTab('2d')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === '2d' ? 'bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <BarChart2 className="w-3.5 h-3.5 text-[#00e5ff]" />
                  2D PNL CHART
                </button>
                <button
                  onClick={() => setActiveTab('3d')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === '3d' ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <Layers className="w-3.5 h-3.5 text-[#ff9f1c]" />
                  3D RISK EXPOSURE
                </button>
                <button
                  onClick={() => setActiveTab('odds')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'odds' ? 'bg-[#00ff33]/15 text-[#00ff33] border border-[#00ff33]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#00ff33]" />
                  VOL ODDS
                </button>
                <button
                  onClick={() => setActiveTab('volatility')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'volatility' ? 'bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <Activity className="w-3.5 h-3.5 text-[#a855f7]" />
                  VOL MONITOR
                </button>
                <button
                  onClick={() => setActiveTab('quant')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'quant' ? 'bg-[#00ffcc]/15 text-[#00ffcc] border border-[#00ffcc]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <Compass className="w-3.5 h-3.5 text-[#00ffcc]" />
                  QUANT FLOW
                </button>
                <button
                  onClick={() => setActiveTab('compare')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'compare' ? 'bg-[#ff00ff]/15 text-[#ff00ff] border border-[#ff00ff]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <Scale className="w-3.5 h-3.5 text-[#ff00ff]" />
                  PORTFOLIO
                </button>
                <button
                  onClick={() => setActiveTab('trading')}
                  className={`px-4 py-2 rounded-none transition font-black flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'trading' ? 'bg-[#ffd700]/15 text-[#ffd700] border border-[#ffd700]/40 shadow-inner' : 'text-gray-400 hover:text-white'}`}
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-[#ffd700]" />
                  SIMULATION
                </button>
              </div>

            </div>

            {/* TAB CONTAINER BODY SELECTION */}
            <div className="space-y-4">

              {activeTab === 'workspace' && (
                <div className="space-y-4">
                  {/* WORKSPACE PRESETS AND SWITCHES */}
                  <div className="bg-[#121216] border border-gray-800 p-3 rounded-none flex flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#ff0055] font-black">● COCKPIT WORKSPACE:</span>
                      <span className="text-gray-400">选择要在平铺中展示的模块，可用鼠标按住标题栏 <strong>拖动排序</strong> 调整布局</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 justify-start xl:justify-end max-w-full">
                      {Object.keys(panelMetadata).map(id => (
                        <label key={id} className="flex items-center gap-1 cursor-pointer hover:text-white select-none text-gray-300 bg-black/40 border border-gray-850 px-1.5 py-0.5">
                          <input
                            type="checkbox"
                            checked={panelVisibility[id]}
                            onChange={() => togglePanelVisibility(id)}
                            className="accent-[#ff0055] rounded-none cursor-pointer"
                          />
                          <span>{id.toUpperCase()}</span>
                        </label>
                      ))}

                      <button
                        onClick={resetWorkspaceLayout}
                        className="bg-gray-850 hover:bg-gray-800 text-white font-black px-2 py-1 rounded-none text-[10px] transition uppercase tracking-wider border border-gray-700"
                      >
                        重置 Reset
                      </button>
                    </div>
                  </div>

                  {/* PLOTTING WORKSPACE CARDS GRID OR FOCUS MAXIMIZED VIEW */}
                  {maximizedPanelId ? (
                    <div className="bg-[#050507] border border-[#ff9f1c]/40 rounded-none p-5 relative flex flex-col w-full min-h-[700px] animate-fadeIn transition-all">
                      {/* Maximized Custom Header bar */}
                      <div className="bg-[#0c0c0e] border border-gray-850 px-4 py-3.5 flex items-center justify-between gap-3 font-mono text-[11px] mb-4 shadow-xl select-none">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[#ff9f1c] font-black uppercase tracking-widest text-[12px] font-mono">
                            工作区独立聚焦视窗 (FOCUSED VIEWPORT PANE)
                          </span>
                          <span className="text-gray-655 font-normal">//</span>
                          {panelMetadata[maximizedPanelId]?.icon}
                          <span className={`font-black tracking-widest truncate text-xs ${panelMetadata[maximizedPanelId]?.colorText}`}>
                            {panelMetadata[maximizedPanelId]?.title}
                          </span>
                        </div>

                        {/* Control buttons of focused state */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => togglePanelHeight(maximizedPanelId)}
                            className="px-2.5 py-1 bg-gray-900 border border-gray-800 hover:border-text-white text-[#00ffcc] hover:text-white font-black rounded transition text-[10px] uppercase flex items-center gap-1.5"
                            title="修改高度级别"
                          >
                            <ChevronsUpDown className="w-3 h-3 text-[#00ffcc]" />
                            <span>高度调节: {workspacePanelHeightLabel(panelHeights[maximizedPanelId])}</span>
                          </button>

                          <button
                            onClick={() => setMaximizedPanelId(null)}
                            className="px-3 py-1 bg-emerald-950/40 hover:bg-[#ff0055]/30 text-[#00ffcc] hover:text-white border border-emerald-800/80 hover:border-[#ff0055]/50 font-black rounded transition text-[10.5px] uppercase tracking-wider flex items-center gap-1.5 shadow-lg"
                            title="退出独立聚焦视窗，还原多窗格平铺对比布局"
                          >
                            <Minimize2 className="w-3.5 h-3.5 text-[#00ffcc]" />
                            <span>还原平铺布局 (Restore Grid)</span>
                          </button>
                        </div>
                      </div>

                      {/* Maximized Content viewport */}
                      <div className="p-4 bg-black border border-gray-900 flex-1 overflow-x-auto min-h-[640px]">
                        {renderPanelContent(maximizedPanelId, true)}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {panelOrder.map((id, index) => {
                        if (!panelVisibility[id]) return null;
                        const meta = panelMetadata[id];
                        const isFull = panelWidths[id] === 'full';

                        return (
                          <div
                            key={id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, id)}
                            onDragOver={(e) => handleDragOver(e, id)}
                            onDragEnd={handleDragEnd}
                            className={`${isFull ? 'xl:col-span-2' : 'xl:col-span-1'} bg-[#0a0a0c] border border-gray-855 rounded-none transition-all duration-350 ${draggedId === id ? 'opacity-30 border-[#ff0055]' : 'opacity-100 hover:border-gray-700/80'} relative flex flex-col`}
                          >
                            {/* Panel Custom Header Grid */}
                            <div className="bg-[#121215] border-b border-gray-850 px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono select-none">

                              {/* Grip and title */}
                              <div className="flex items-center gap-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-white flex-1 min-w-0" title="拖动此头部区域可重排布局">
                                <GripVertical className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                {meta?.icon}
                                <span className={`font-black tracking-wide truncate ${meta?.colorText}`}>
                                  {meta?.title}
                                </span>
                                <span className="text-[9px] text-gray-650 font-normal">
                                  [#{meta?.originalIndex ?? index + 1}]
                                </span>
                              </div>

                              {/* Adjusters tools on right */}
                              <div className="flex items-center justify-end gap-1 text-[10px] shrink-0 max-w-[52%] flex-wrap">
                                {/* Reposition Shift Left */}
                                <button
                                  onClick={() => shiftPanel(id, 'left')}
                                  disabled={index === 0}
                                  className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-20 border border-transparent hover:border-gray-800 rounded transition"
                                  title="前移布局"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                                {/* Reposition Shift Right */}
                                <button
                                  onClick={() => shiftPanel(id, 'right')}
                                  disabled={index === panelOrder.length - 1}
                                  className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-20 border border-transparent hover:border-gray-800 rounded transition"
                                  title="后移布局"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                </button>

                                <div className="w-[1px] h-3.5 bg-gray-800 mx-1" />

                                {/* Resize width button */}
                                <button
                                  onClick={() => togglePanelWidth(id)}
                                  className="px-1.5 py-0.5 bg-gray-950 border border-gray-850 hover:border-text-white text-[#ff0055] hover:text-white font-bold rounded transition text-[8.5px] flex items-center gap-1 uppercase"
                                  title={isFull ? "自适应调整为半宽（1/2列宽）" : "自适应调整为全宽（双列铺满）"}
                                >
                                  <Columns className="w-2.5 h-2.5 text-gray-400" />
                                  <span className="hidden 2xl:inline">{isFull ? '1/2 宽' : '1/1 宽'}</span>
                                </button>

                                {/* Resize height button */}
                                <button
                                  onClick={() => togglePanelHeight(id)}
                                  className="px-1.5 py-0.5 bg-gray-955 border border-gray-850 hover:border-text-white text-[#00ffcc] hover:text-white font-bold rounded transition text-[8.5px] flex items-center gap-1 uppercase"
                                  title={`自适应调整高度 (当前: ${workspacePanelHeightLabel(panelHeights[id])})`}
                                >
                                  <ChevronsUpDown className="w-2.5 h-2.5 text-gray-400" />
                                  <span className="hidden 2xl:inline">{workspacePanelHeightShortLabel(panelHeights[id])}</span>
                                </button>

                                {/* Zoom Focus inside Workspace */}
                                <button
                                  onClick={() => setMaximizedPanelId(id)}
                                  className="px-1.5 py-0.5 bg-gray-955 border border-[#ff9f1c]/30 hover:border-[#ff9f1c] text-[#ff9f1c] hover:text-white font-bold rounded transition text-[8.5px] flex items-center gap-1 uppercase"
                                  title="在当前工作区聚焦并最大化（大视区分析）"
                                >
                                  <Maximize2 className="w-2.5 h-2.5 text-[#ff9f1c] animate-pulse" />
                                  <span className="hidden 2xl:inline">单独聚焦</span>
                                </button>

                                {/* Maximize to full separate tab view */}
                                <button
                                  onClick={() => setActiveTab(id as any)}
                                  className="px-1.5 py-0.5 bg-gray-955 border border-gray-850 hover:border-text-white text-gray-500 hover:text-white rounded transition text-[9px] uppercase"
                                  title="切换至顶层独立导航标签页"
                                >
                                  独立页
                                </button>
                              </div>

                            </div>

                            {/* Panel dynamic Body content */}
                            <div className="p-4 bg-black flex-1 overflow-x-auto">
                              {renderPanelContent(id)}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === '2d' && (
                <div className="h-[780px] w-full">
                  <TwoDChart
                    legs={legs}
                    currentStockPrice={globalParams.stockPrice}
                    daysToExpiry={globalParams.daysToExpiry}
                    r={globalParams.r}
                  />
                </div>
              )}

              {activeTab === '3d' && (
                <div className="h-[780px] w-full">
                  <ThreeDChart
                    legs={legs}
                    currentStockPrice={globalParams.stockPrice}
                    daysToExpiry={globalParams.daysToExpiry}
                    asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
                    r={globalParams.r}
                    rustAnalysis={rustPositionAnalysis}
                  />
                </div>
              )}

              {activeTab === 'odds' && (
                <VolatilityOddsPanel
                  currentStockPrice={globalParams.stockPrice}
                  daysToExpiry={globalParams.daysToExpiry}
                  r={globalParams.r}
                  activeSymbol={selectedSymbol}
                  tickerIV={activeTicker.iv}
                  liveTicker={liveMarketData?.ok ? liveMarketData.ticker : undefined}
                  liveVolSummary={liveMarketData?.ok ? liveMarketData.volSummary : undefined}
                  liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
                  asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
                  onImportStrategy={handleImportAISuggestion}
                />
              )}

              {activeTab === 'volatility' && (
                <VolatilityMonitor
                  currentStockPrice={globalParams.stockPrice}
                  daysToExpiry={globalParams.daysToExpiry}
                  r={globalParams.r}
                  activeSymbol={selectedSymbol}
                  tickerIV={activeTicker.iv}
                  liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
                  liveVolSummary={liveMarketData?.ok ? liveMarketData.volSummary : undefined}
                  liveVolSurface={liveMarketData?.ok ? liveMarketData.volSurface : undefined}
                  asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
                />
              )}

              {activeTab === 'quant' && (
                <QuantFlowRadar
                  currentStockPrice={globalParams.stockPrice}
                  activeSymbol={selectedSymbol}
                  tickerIV={activeTicker.iv}
                  asOfDate={liveMarketData?.ok ? liveMarketData.asOfDate : undefined}
                  liveExpiries={liveMarketData?.ok ? liveMarketData.expiries || [] : []}
                  liveChain={liveMarketData?.ok ? liveMarketData.chain || [] : []}
                />
              )}

              {activeTab === 'compare' && (
                <StrategyReport
                  legs={legs}
                  currentStockPrice={globalParams.stockPrice}
                  daysToExpiry={globalParams.daysToExpiry}
                  r={globalParams.r}
                  strategyName={strategyName}
                  activeSymbol={selectedSymbol}
                  rustAnalysis={rustPositionAnalysis}
                />
              )}

              {activeTab === 'trading' && (
                <AccountLedger
                  activeLegs={legs}
                  activeSymbol={selectedSymbol}
                  tickerPrice={globalParams.stockPrice}
                  r={globalParams.r}
                  strategyName={strategyName}
                />
              )}

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
