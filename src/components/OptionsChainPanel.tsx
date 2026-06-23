/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OptionLeg, TickerInfo, Greeks, LiveExpiry, LiveOptionChainRow } from '../types';
import { calculateBSPrice } from '../lib/optionsMath';
import { buildExpiryChoices, selectedExpiryValue } from '../lib/expiryChoices';
import { buildExpiryFamilies, buildExpiryPager, ExpiryFamilyId, formatScaledNumber, ScaleMode } from '../lib/optionAnalytics';
import { resolveOptionChainAvailability } from '../lib/optionChainAvailability';
import { buildOptionChainSide } from '../lib/optionChainRows';
import { buildOptionQuoteTicket, QuoteTicketSide } from '../lib/optionQuoteTicket';
import OptionQuoteWorkbench from './OptionQuoteWorkbench';
import {
  Plus, Edit2, TrendingUp, TrendingDown, Eye, Filter, Check,
  HelpCircle, Settings, ChevronDown, ChevronLeft, ChevronRight, ChevronsRight, Sparkles, RefreshCw, Layers, CheckSquare, Square
} from 'lucide-react';

interface OptionsChainPanelProps {
  currentStockPrice: number;
  daysToExpiry: number;
  onExpiryChange?: (days: number) => void;
  r: number;
  activeSymbol: string;
  tickerIV: number;
  legs: OptionLeg[];
  onUpdateLegs: (legs: OptionLeg[]) => void;
  strategyName: string;
  setStrategyName: (name: string) => void;
  liveChain?: LiveOptionChainRow[];
  liveExpiries?: LiveExpiry[];
  onVisibleStrikesChange?: (visibleStrikes: number) => void;
}

// Columns that can be toggled in the options chain view
type ColumnKey = 'delta' | 'gamma' | 'vega' | 'theta' | 'intrinsic' | 'extrinsic' | 'volume' | 'itmProb';

const EXPIRY_PAGE_SIZE = 6;
const DEFAULT_SELECTED_LEG_REFRESH_SECONDS = 1;

const formatLiveNumber = (isTradable: boolean, value: number, digits: number): string => (
  isTradable ? value.toFixed(digits) : '--'
);

const formatLiveUsd = (isTradable: boolean, value: number, digits: number): string => (
  isTradable ? `$${value.toFixed(digits)}` : '--'
);

export default function OptionsChainPanel({
  currentStockPrice,
  daysToExpiry,
  onExpiryChange,
  r,
  activeSymbol,
  tickerIV,
  legs,
  onUpdateLegs,
  strategyName,
  setStrategyName,
  liveChain = [],
  liveExpiries = [],
  onVisibleStrikesChange
}: OptionsChainPanelProps) {
  // Configuration State
  const [strikeRange, setStrikeRange] = useState<number>(16); // number of strikes above and below Spot
  const [strikeInterval, setStrikeInterval] = useState<number>(0); // 0 means automatic based on ticker
  const [ivModel, setIvModel] = useState<'flat' | 'smile' | 'skew'>('smile'); // skewness configuration
  const [skewFactor, setSkewFactor] = useState<number>(25); // strength of Volatility Smile/Skew
  const [bidAskSpreadPct, setBidAskSpreadPct] = useState<number>(1.5); // standard bid/ask spread (percentage of theoretical option price)
  const [hiddenExpiryFamilies, setHiddenExpiryFamilies] = useState<ExpiryFamilyId[]>([]);
  const [expiryPageIndex, setExpiryPageIndex] = useState<number>(0);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');
  const [selectedQuote, setSelectedQuote] = useState<{
    row: LiveOptionChainRow;
    side: QuoteTicketSide;
    quantity: number;
  } | null>(null);

  // Column visibilities
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    delta: true,
    gamma: false,
    vega: false,
    theta: true,
    intrinsic: true,
    extrinsic: true,
    volume: true,
    itmProb: true
  });

  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const hasLiveChain = liveChain.length > 0;
  const expiryChoices = useMemo(
    () => buildExpiryChoices(liveExpiries, daysToExpiry),
    [liveExpiries, daysToExpiry]
  );
  const expiryFamilies = useMemo(
    () => buildExpiryFamilies(expiryChoices, { hiddenFamilies: hiddenExpiryFamilies }),
    [expiryChoices, hiddenExpiryFamilies]
  );
  const visibleExpiryChoices = useMemo(
    () => expiryFamilies.flatMap((family) => family.visibleChoices),
    [expiryFamilies]
  );
  const expiryPager = useMemo(
    () => buildExpiryPager(visibleExpiryChoices, daysToExpiry, EXPIRY_PAGE_SIZE, expiryPageIndex),
    [visibleExpiryChoices, daysToExpiry, expiryPageIndex]
  );
  const activeExpiry = expiryChoices.find(p => p.days === daysToExpiry) || expiryChoices[0];
  const liveRowsForExpiry = useMemo(() => {
    const expiry = activeExpiry?.date;
    if (!expiry) return liveChain;
    return liveChain.filter(row => row.expiry === expiry);
  }, [activeExpiry?.date, liveChain]);

  const liveStrikesForExpiry = useMemo(() => {
    const strikes: number[] = liveRowsForExpiry
      .map(row => Number(row.strike))
      .filter((strike): strike is number => Number.isFinite(strike) && strike > 0);
    return Array.from(new Set<number>(strikes))
      .sort((a, b) => a - b);
  }, [liveRowsForExpiry]);

  const liveByStrikeAndType = useMemo(() => {
    const byKey = new Map<string, LiveOptionChainRow>();
    for (const row of liveRowsForExpiry) {
      byKey.set(`${row.type}:${Number(row.strike).toFixed(2)}`, row);
    }
    return byKey;
  }, [liveRowsForExpiry]);
  const chainAvailability = useMemo(
    () => resolveOptionChainAvailability(liveChain.length, liveRowsForExpiry.length),
    [liveChain.length, liveRowsForExpiry.length]
  );

  const toggleExpiryFamily = (familyId: ExpiryFamilyId) => {
    setHiddenExpiryFamilies((prev) => (
      prev.includes(familyId)
        ? prev.filter((id) => id !== familyId)
        : [...prev, familyId]
    ));
    setExpiryPageIndex(0);
  };

  const handleExpiryDateChange = (date: string) => {
    if (date === 'custom') return;
    const matched = expiryChoices.find(choice => choice.date === date);
    if (matched && onExpiryChange) {
      onExpiryChange(matched.days);
    }
  };

  useEffect(() => {
    const selectedPage = buildExpiryPager(visibleExpiryChoices, daysToExpiry, EXPIRY_PAGE_SIZE).pageIndex;
    setExpiryPageIndex((current) => {
      const clamped = buildExpiryPager(visibleExpiryChoices, daysToExpiry, EXPIRY_PAGE_SIZE, current).pageIndex;
      return current === clamped && current === selectedPage ? current : selectedPage;
    });
  }, [daysToExpiry, visibleExpiryChoices]);

  // Auto-get beautiful strike interval based on ticker price bounds
  const resolvedStrikeInterval = useMemo(() => {
    if (strikeInterval > 0) return strikeInterval;
    if (activeSymbol === 'BTC_USD') return 1000;
    if (currentStockPrice > 500) return 10;
    if (currentStockPrice > 100) return 5;
    return 2.5;
  }, [activeSymbol, strikeInterval, currentStockPrice]);

  // Generate range of Strike Prices surrounding the current ATM Stock Price
  const strikesList = useMemo(() => {
    const spot = currentStockPrice;
    const interval = resolvedStrikeInterval;

    // Round spot to closest interval
    const atmStrike = Math.round(spot / interval) * interval;

    const list: number[] = [];
    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = atmStrike + i * interval;
      if (strike > 0) {
        list.push(Number(strike.toFixed(2)));
      }
    }

    if (liveStrikesForExpiry.length === 0 || list.length === 0) {
      return list;
    }

    const lower = list[0];
    const upper = list[list.length - 1];
    const liveInsideVisibleWindow = liveStrikesForExpiry.filter(
      strike => strike >= lower && strike <= upper
    );

    return Array.from(new Set<number>([...list, ...liveInsideVisibleWindow]))
      .sort((a, b) => a - b);
  }, [currentStockPrice, resolvedStrikeInterval, strikeRange, liveStrikesForExpiry]);

  const findLiveRow = (strike: number, type: 'call' | 'put') => {
    return liveByStrikeAndType.get(`${type}:${Number(strike).toFixed(2)}`);
  };

  // Calculate Implied Volatility for a specific strike based onselected IV Model (Flat vs Smile vs Skew)
  const getStrikeIV = (strike: number) => {
    const spot = currentStockPrice;
    const diffPct = (strike - spot) / spot;

    if (ivModel === 'flat') {
      return tickerIV;
    } else if (ivModel === 'smile') {
      // Smile: Symmetric parabolic curve (higher IV for deeply OTM and ITM options)
      // IV = ATM_IV + skewFactor * (diffPct)^2
      const offset = (skewFactor / 10) * (diffPct * diffPct) * 100;
      return Math.min(150, Math.max(10, tickerIV + offset));
    } else {
      // Skew: Higher IV for lower strikes (typical for equity index crash fear)
      // Linear slope down, plus small parabolic smile curvature
      const linearOffset = -30 * diffPct * (skewFactor / 25);
      const smileOffset = 10 * (diffPct * diffPct) * 100;
      return Math.min(180, Math.max(5, tickerIV + linearOffset + smileOffset));
    }
  };

  // Build row data for Call and Put for each Strike
  const rowsData = useMemo(() => {
    return strikesList.map((strike) => {
      const liveCall = findLiveRow(strike, 'call');
      const livePut = findLiveRow(strike, 'put');
      const liveIv = liveCall?.iv ?? livePut?.iv;
      const strikeIV = liveIv && liveIv > 0 ? liveIv : getStrikeIV(strike);

      // Simulate some fake open interest / dynamic volume scaled by proximity to ATM
      const atmDist = Math.abs(strike - currentStockPrice) / currentStockPrice;
      const volumeBase = Math.max(10, Math.floor(12500 * Math.exp(-atmDist * 12)));
      const mockVolumeCall = Math.floor(volumeBase * (1.2 + 0.5 * Math.sin(strike)));
      const mockVolumePut = Math.floor(volumeBase * (0.8 + 0.6 * Math.cos(strike * 1.5)));
      const callMetrics = buildOptionChainSide({
        type: 'call',
        liveRow: liveCall,
        currentStockPrice,
        strike,
        daysToExpiry,
        riskFreeRate: r,
        strikeIV,
        bidAskSpreadPct,
        fallbackVolume: mockVolumeCall,
      });
      const putMetrics = buildOptionChainSide({
        type: 'put',
        liveRow: livePut,
        currentStockPrice,
        strike,
        daysToExpiry,
        riskFreeRate: r,
        strikeIV,
        bidAskSpreadPct,
        fallbackVolume: mockVolumePut,
      });

      // Find active legs corresponding to this strike
      const activeCallLegs = legs.filter(l => l.strike === strike && l.type === 'call');
      const activePutLegs = legs.filter(l => l.strike === strike && l.type === 'put');

      return {
        strike,
        strikeIV,
        isATM: Math.abs(strike - currentStockPrice) < resolvedStrikeInterval / 2,
        isCallITM: currentStockPrice > strike,
        isPutITM: currentStockPrice < strike,
        call: {
          ...callMetrics,
          activeLegs: activeCallLegs
        },
        put: {
          ...putMetrics,
          activeLegs: activePutLegs
        }
      };
    });
  }, [strikesList, currentStockPrice, daysToExpiry, r, tickerIV, ivModel, skewFactor, bidAskSpreadPct, resolvedStrikeInterval, legs, liveByStrikeAndType, liveRowsForExpiry]);

  const atmRowIndex = useMemo(() => {
    if (rowsData.length === 0) return -1;
    return rowsData.reduce((bestIdx, row, idx) => {
      const best = rowsData[bestIdx];
      return Math.abs(row.strike - currentStockPrice) < Math.abs(best.strike - currentStockPrice) ? idx : bestIdx;
    }, 0);
  }, [rowsData, currentStockPrice]);

  const quoteTicket = useMemo(() => buildOptionQuoteTicket({
    chain: liveRowsForExpiry,
    selected: selectedQuote?.row,
    side: selectedQuote?.side ?? 'buy',
    quantity: selectedQuote?.quantity ?? 1,
    selectedLegRefreshSeconds: DEFAULT_SELECTED_LEG_REFRESH_SECONDS,
  }), [liveRowsForExpiry, selectedQuote]);

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container || atmRowIndex < 0) return;
    const rowHeight = 42;
    const targetTop = Math.max(0, atmRowIndex * rowHeight - container.clientHeight / 2 + rowHeight);
    container.scrollTop = targetTop;
  }, [atmRowIndex, activeSymbol, activeExpiry?.date, strikeRange, currentStockPrice]);

  // Click handler to instantly trade/manipulate contract leg inside strategies sandbox
  const handleCellClick = (strike: number, optionType: 'call' | 'put', actionSide: 'buy' | 'sell') => {
    // Determine the theoretical option premium at this strike
    const targetRow = rowsData.find(r => r.strike === strike);
    if (!targetRow) return;

    const optData = optionType === 'call' ? targetRow.call : targetRow.put;
    if (!optData.isTradable) return;
    const liveRow = findLiveRow(strike, optionType);
    if (liveRow) {
      setSelectedQuote({
        row: liveRow,
        side: actionSide === 'buy' ? 'buy' : 'sell',
        quantity: 1,
      });
    }
    const premiumToUse = actionSide === 'buy' ? optData.ask : optData.bid;
    const computedIV = targetRow.strikeIV;

    // Check if exact same leg exists
    const matchingLegIndex = legs.findIndex(
      l => l.strike === strike && l.type === optionType && l.side === actionSide
    );

    let updatedLegs = [...legs];

    if (matchingLegIndex >= 0) {
      // Leg exists, let's increment quantity
      updatedLegs[matchingLegIndex] = {
        ...updatedLegs[matchingLegIndex],
        quantity: updatedLegs[matchingLegIndex].quantity + 1
      };
    } else {
      // Create new leg
      const newLeg: OptionLeg = {
        id: `leg_${Date.now()}_chain_${optionType}_${strike}`,
        type: optionType,
        side: actionSide,
        strike: strike,
        expiryDays: daysToExpiry,
        quantity: 1,
        iv: Number(computedIV.toFixed(1)),
        premium: premiumToUse,
        isCustomPremium: false
      };
      updatedLegs.push(newLeg);
    }

    onUpdateLegs(updatedLegs);
    setStrategyName('自定义期权策略组合 (Custom Position)');
  };

  // Remove contract leg completely
  const handleRemoveLeg = (legId: string) => {
    onUpdateLegs(legs.filter(l => l.id !== legId));
    setStrategyName('自定义期权策略组合 (Custom Position)');
  };

  // Clear current sandbox strategy
  const handleClearAllLegs = () => {
    onUpdateLegs([]);
    setStrategyName('未选择策略 (Cleard Sandbox)');
  };

  const toggleColumn = (col: ColumnKey) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const updateStrikeRange = (nextRange: number) => {
    setStrikeRange(nextRange);
    onVisibleStrikesChange?.(nextRange);
  };

  return (
    <div className="bg-black border-2 border-[#ff9f1c]/30 p-4 rounded-none font-mono text-gray-200">

      {/* HEADER SECTION WITH METRICS AND FILTER CONFIGS */}
      <div className="border-b border-gray-900 pb-3 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-[#ff9f1c] font-black uppercase tracking-wider text-sm flex items-center gap-2">
            <Layers className="text-[#ff9f1c] w-5 h-5 animate-pulse" />
            &lt;G REAL-TIME OPTIONS CHAIN ENGINE &gt;
          </h3>
          <p className="text-[10.5px] text-gray-400 mt-1 font-sans">
            交互式高频期权链分析面板。直接点击报价表内的 <span className="bg-[#00ff33]/15 text-[#00ff33] px-1 font-mono text-[10px] border border-[#00ff33]/30 font-bold">ASK (买入)</span> 或 <span className="bg-[#ff3333]/15 text-[#ff3333] px-1 font-mono text-[10px] border border-[#ff3333]/30 font-bold">BID (卖出)</span>，即可<b>同步追加/比对该合约腿</b>，实时更新 2D/3D 沙盒。
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {legs.length > 0 && (
            <button
              onClick={handleClearAllLegs}
              className="text-[10px] font-black border border-red-500/50 bg-[#ff3333]/10 text-red-400 hover:bg-[#ff3333]/25 px-2.5 py-1.5 rounded-none uppercase transition"
            >
              [CLEAR PORTFOLIO ({legs.length})]
            </button>
          )}
          <div className="text-[10px] text-gray-400 bg-gray-950 px-3 py-1.5 border border-gray-800">
            {hasLiveChain ? 'PUBLIC MOCK' : '等待 mock 行情'} IV: <span className="text-[#00e5ff] font-extrabold">{tickerIV}%</span>
          </div>
        </div>
      </div>

      {/* PARAMETER CONFIGURATION TOOLBAR (配置内容) */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-3 bg-[#070709] border border-gray-900 mb-4 text-xs font-mono">

        {/* 1. Range Filters */}
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">DISPLAY STRIKES RANGE</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateStrikeRange(Math.max(3, strikeRange - 2))}
              className="px-1.5 py-0.5 bg-black border border-gray-800 text-gray-300 hover:text-white"
            >-</button>
            <span className="text-[#ff9f1c] font-black w-20 text-center text-xs">
              ± {strikeRange} Strikes
            </span>
            <button
              onClick={() => updateStrikeRange(Math.min(25, strikeRange + 2))}
              className="px-1.5 py-0.5 bg-black border border-gray-800 text-gray-300 hover:text-white"
            >+</button>
          </div>
          <span className="text-[9px] text-gray-500 block">
            行权价间隔-INTERVAL: ${resolvedStrikeInterval}
          </span>
        </div>

        {/* 2. Expiry Selector (行权时间) - ALIGNED WITH USER'S DESIGN */}
        <div className="space-y-1 md:col-span-2">
          <span className="text-[10px] text-[#ff9f1c] font-extrabold uppercase tracking-wide flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 bg-[#ff9f1c] rounded-full animate-ping" />
            EXPIRY FAMILY / DATE (时间族 / 行权时间)
          </span>
          <div className="grid grid-cols-4 gap-1">
            {expiryFamilies.map((family) => {
              const hidden = hiddenExpiryFamilies.includes(family.id);
              const active = family.choices.some(choice => choice.days === daysToExpiry);
              return (
                <button
                  key={family.id}
                  onClick={() => {
                    if (hidden) {
                      toggleExpiryFamily(family.id);
                      return;
                    }
                    const target = family.choices[0];
                    if (target) handleExpiryDateChange(target.date);
                  }}
                  className={`px-1.5 py-1 border text-[9px] font-black transition ${active ? 'border-[#ff9f1c] text-[#ff9f1c] bg-[#ff9f1c]/15' : hidden ? 'border-gray-900 text-gray-600 bg-black/40' : 'border-gray-800 text-gray-300 bg-black hover:text-white'}`}
                  title={`${family.label} ${family.description} · ${hidden ? '已隐藏，点击恢复' : '点击切换到本族最近期限'}`}
                >
                  {family.label} {hidden ? '隐' : family.count}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => setExpiryPageIndex((page) => Math.max(0, page - 1))}
                disabled={!expiryPager.canPrev}
                className="w-7 h-6 flex items-center justify-center border border-gray-850 bg-black text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
                title="上一页期限"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setExpiryPageIndex((page) => Math.min(expiryPager.pageCount - 1, page + 1))}
                disabled={!expiryPager.canNext}
                className="w-7 h-6 flex items-center justify-center border border-gray-850 bg-black text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
                title="下一页期限"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setExpiryPageIndex(Math.max(0, expiryPager.pageCount - 1))}
                disabled={!expiryPager.canNext && expiryPager.pageIndex === expiryPager.pageCount - 1}
                className="h-6 px-2 flex items-center gap-1 border border-gray-850 bg-black text-[9px] text-gray-400 font-black hover:text-[#ff9f1c] disabled:opacity-30 disabled:hover:text-gray-400"
                title="跳到最远期限页"
              >
                <ChevronsRight className="w-3 h-3" />
                远期
              </button>
            </div>
            <span className="text-[9px] text-gray-500 font-black whitespace-nowrap">
              EXP PAGE <span className="text-[#00e5ff]">{expiryPager.pageIndex + 1}/{expiryPager.pageCount}</span> · {expiryPager.totalCount} DATES
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1 py-1">
            {expiryPager.pageItems.map((choice) => {
              const active = choice.days === daysToExpiry;
              return (
                <button
                  key={choice.date}
                  onClick={() => handleExpiryDateChange(choice.date)}
                  className={`min-h-[30px] px-2 py-1 border text-[10px] font-black leading-tight ${active ? 'bg-[#ff9f1c]/20 border-[#ff9f1c] text-[#ff9f1c]' : 'bg-black border-gray-850 text-gray-400 hover:text-white'}`}
                  title={`${choice.date} · ${choice.days} DTE`}
                >
                  <span className="block">{choice.date.slice(5).replace('-', '.')}</span>
                  <span className="block text-[8.5px] opacity-80">{choice.days}D</span>
                </button>
              );
            })}
            {expiryPager.pageItems.length === 0 && (
              <div className="col-span-full border border-gray-900 bg-black px-2 py-2 text-[10px] text-gray-500">
                当前时间族已隐藏；请恢复一个时间族或使用下方全量选择器。
              </div>
            )}
          </div>
          <div className="relative flex items-center bg-black border border-gray-850 p-1 h-[26px] focus-within:border-[#ff9f1c]">
            <select
              value={selectedExpiryValue(expiryChoices, daysToExpiry)}
              onChange={(e) => handleExpiryDateChange(e.target.value)}
              className="w-full bg-transparent text-[10px] text-[#ff9f1c] font-black font-mono focus:outline-none cursor-pointer appearance-none px-1"
            >
              {expiryChoices.map((preset) => (
                <option key={preset.date} value={preset.date} className="bg-[#101014] text-[#ff9f1c]">
                  {preset.isCustom ? preset.label : `${preset.date.replace(/-/g, '.')} (${preset.days}天)`}
                </option>
              ))}
            </select>
            <div className="absolute right-2 pointer-events-none text-gray-500 text-[10px]">▼</div>
          </div>
          <span className="text-[9px] text-sky-400 block font-bold">
            期权距行权: <strong className="text-yellow-400 font-extrabold">{daysToExpiry}</strong> 天后结算
            <span className={chainAvailability.canRenderRows ? 'text-emerald-400' : 'text-amber-300'}>
              {' '}· {chainAvailability.label}
            </span>
          </span>
        </div>

        {/* 2. Volatility Model Choice */}
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">VOLATILITY DEVIATION (IV 结构)</span>
          <select
            value={ivModel}
            onChange={(e) => setIvModel(e.target.value as any)}
            className="w-full bg-black border border-gray-800 text-gray-300 rounded-none py-1 px-1.5 text-xs focus:ring-1 focus:ring-[#ff9f1c] focus:outline-none focus:border-[#ff9f1c]"
          >
            <option value="flat">⚡ FLAT (无偏斜 - 统一 IV)</option>
            <option value="smile">📈 VOL SMILE (微笑对称波动率)</option>
            <option value="skew">📉 VOL SKEW (熊市偏斜 - A股/美股常态)</option>
          </select>
          <span className="text-[9px] text-gray-500 block">
            波动率曲线能更精准预测 OTM 虚值价值
          </span>
        </div>

        {/* 3. Skewness Strength Factor */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500 font-extrabold uppercase">
            <span>VOL CURVE POWER</span>
            <span className="text-[#00e5ff]">{skewFactor}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={skewFactor}
            disabled={ivModel === 'flat'}
            onChange={(e) => setSkewFactor(parseInt(e.target.value))}
            className="w-full accent-[#ff9f1c] h-1 bg-gray-900 cursor-pointer disabled:opacity-30"
          />
          <span className="text-[9px] text-gray-500 block">
            设置极度虚值期权隐波的微笑偏离强度
          </span>
        </div>

        {/* 4. Column Selectors */}
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">DISPLAY METRICS OPTIONS (列配置)</span>
          <div className="flex flex-wrap gap-1.5 max-h-[50px] overflow-y-auto scrollbar-thin">
            {[
              { key: 'delta', label: 'Δ DELTA' },
              { key: 'gamma', label: 'Γ GAMMA' },
              { key: 'vega', label: 'ν VEGA' },
              { key: 'theta', label: 'θ THETA' },
              { key: 'itmProb', label: 'ITM PROB%' },
              { key: 'intrinsic', label: 'INTR VALUE' },
              { key: 'extrinsic', label: 'TIME VALUE' },
              { key: 'volume', label: 'VOL INDIC' }
            ].map(col => {
              const isChecked = visibleColumns[col.key as ColumnKey];
              return (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key as ColumnKey)}
                  className={`text-[8.5px] px-1.5 py-0.5 border flex items-center gap-1 font-bold ${isChecked ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] border-[#ff9f1c]/50' : 'bg-black text-gray-500 border-gray-800 hover:text-white'}`}
                >
                  {isChecked ? '■' : '□'} {col.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Scale selector */}
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">SCALE (量级)</span>
          <div className="grid grid-cols-3 gap-1">
            {[
              { value: 'auto', label: 'AUTO' },
              { value: 'unit', label: '个' },
              { value: 'ten', label: '十' },
              { value: 'hundred', label: '百' },
              { value: 'thousand', label: '千' },
              { value: 'ten_thousand', label: '万' },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setScaleMode(item.value as ScaleMode)}
                className={`px-1.5 py-1 border text-[9px] font-black ${scaleMode === item.value ? 'border-cyan-400 text-cyan-300 bg-cyan-950/25' : 'border-gray-850 text-gray-500 bg-black hover:text-white'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-[9px] text-gray-500 block">量能示例 {formatScaledNumber(12300, scaleMode)}</span>
        </div>
      </div>

      <OptionQuoteWorkbench
        quoteTicket={quoteTicket}
        activeSymbol={activeSymbol}
        scaleMode={scaleMode}
      />

      {/* OPTIONS MATRIX TABULAR BOARD */}
      {!chainAvailability.canRenderRows && (
        <div className="border border-amber-500/30 bg-amber-950/10 px-4 py-6 text-sm text-amber-200 font-mono">
          <div className="font-black tracking-wide">当前不显示模型期权链</div>
          <div className="mt-2 text-[11px] text-amber-100/80">
            {chainAvailability.isMissingSelectedExpiry
              ? '该到期日没有命中公开 mock 期权链行。请选择有 rows 的到期日，或刷新 mock 数据。'
              : '正在等待公开 mock 期权链。没有 bid/ask/Greeks 时，不渲染本地模型报价。'}
          </div>
        </div>
      )}
      {chainAvailability.canRenderRows && (
      <>
      <div ref={tableScrollRef} className="w-full overflow-x-auto border border-gray-900 bg-black max-h-[550px] overflow-y-auto scrollbar-thin">
        <table className="w-full min-w-[1200px] border-collapse text-right select-none">

          {/* Main Title Headers */}
          <thead>
            <tr className="bg-[#0c0c0f] border-b-2 border-gray-800 text-[10px] text-gray-400 font-black tracking-wider">
              {/* Calls Side (Left) */}
              <th colSpan={
                (visibleColumns.volume ? 1 : 0) +
                (visibleColumns.itmProb ? 1 : 0) +
                (visibleColumns.intrinsic ? 1 : 0) +
                (visibleColumns.extrinsic ? 1 : 0) +
                (visibleColumns.delta ? 1 : 0) +
                (visibleColumns.gamma ? 1 : 0) +
                (visibleColumns.vega ? 1 : 0) +
                (visibleColumns.theta ? 1 : 0) +
                4 // Theor, Bid, Ask, Buy/Sell Indicators
              } className="text-center text-[#00e5ff] py-2 border-r border-gray-800">
                CALL OPTIONS (看涨期权)
              </th>

              {/* Strike Column (Middle) */}
              <th className="text-center text-[#ff9f1c] bg-[#141416]/55 px-4 font-extrabold border-r border-gray-800">
                STRIKE
              </th>

              {/* Puts Side (Right) */}
              <th colSpan={
                (visibleColumns.volume ? 1 : 0) +
                (visibleColumns.itmProb ? 1 : 0) +
                (visibleColumns.intrinsic ? 1 : 0) +
                (visibleColumns.extrinsic ? 1 : 0) +
                (visibleColumns.delta ? 1 : 0) +
                (visibleColumns.gamma ? 1 : 0) +
                (visibleColumns.vega ? 1 : 0) +
                (visibleColumns.theta ? 1 : 0) +
                4 // Theor, Bid, Ask, Buy/Sell Indicators
              } className="text-center text-[#ff33ff] py-2">
                PUT OPTIONS (看跌期权)
              </th>
            </tr>

            {/* Individual Columns Headers */}
            <tr className="bg-[#050507] border-b border-gray-950 text-[9px] text-gray-500 font-black uppercase">
              {/* Calls column tags */}
              {visibleColumns.volume && <th className="p-1 px-2">VOLUME ({scaleMode})</th>}
              {visibleColumns.itmProb && <th className="p-1 px-2">ITM%</th>}
              {visibleColumns.intrinsic && <th className="p-1 px-2">INTR VAL</th>}
              {visibleColumns.extrinsic && <th className="p-1 px-2">TIME VAL</th>}
              {visibleColumns.theta && <th className="p-1 px-2">THETA</th>}
              {visibleColumns.vega && <th className="p-1 px-2">VEGA</th>}
              {visibleColumns.gamma && <th className="p-1 px-2">GAMMA</th>}
              {visibleColumns.delta && <th className="p-1 px-2">DELTA</th>}
              <th className="p-1 px-2 text-[#00ff33]">BID (SELL)</th>
              <th className="p-1 px-2 text-[#ff3333]">ASK (BUY)</th>
              <th className="p-1 px-2 text-gray-400">THEOR</th>
              <th className="p-1 px-2 border-r border-gray-800 text-center">POS</th>

              {/* Middle Strike Column */}
              <th className="p-1 px-4 text-center bg-[#0d0d10] text-[#ff9f1c] font-black border-r border-gray-800">IV%</th>

              {/* Puts column tags */}
              <th className="p-1 px-2 text-center">POS</th>
              <th className="p-1 px-2 text-gray-400 text-left">THEOR</th>
              <th className="p-1 px-2 text-[#ff3333] text-left">ASK (BUY)</th>
              <th className="p-1 px-2 text-[#00ff33] text-left">BID (SELL)</th>
              {visibleColumns.delta && <th className="p-1 px-2 text-left">DELTA</th>}
              {visibleColumns.gamma && <th className="p-1 px-2 text-left">GAMMA</th>}
              {visibleColumns.vega && <th className="p-1 px-2 text-left">VEGA</th>}
              {visibleColumns.theta && <th className="p-1 px-2 text-left">THETA</th>}
              {visibleColumns.extrinsic && <th className="p-1 px-2 text-left">TIME VAL</th>}
              {visibleColumns.intrinsic && <th className="p-1 px-2 text-left">INTR VAL</th>}
              {visibleColumns.itmProb && <th className="p-1 px-2 text-left">ITM%</th>}
              {visibleColumns.volume && <th className="p-1 px-2 text-left">VOLUME ({scaleMode})</th>}
            </tr>
          </thead>

          {/* Table Body rows */}
          <tbody className="text-[10px] font-mono leading-none">
            {rowsData.map((row) => {
              const { strike, strikeIV, isCallITM, isPutITM, isATM } = row;
              const isBgHover = hoveredStrike === strike;

              // CSS for Row Highlighting based on ITM / OTM & Hover
              const spotHighlightCls = isATM
                ? 'bg-[#ff9f1c]/10 text-white font-extrabold border-y border-[#ff9f1c]/40'
                : isBgHover ? 'bg-gray-900/60' : '';

              // ITM options are colored dark gray fields for high-end professional visualization
              const callSideCls = isCallITM ? 'bg-[#1a3a30]/15' : 'bg-transparent';
              const putSideCls = isPutITM ? 'bg-[#2b1f3c]/15' : 'bg-transparent';

              return (
                <tr
                  key={strike}
                  onMouseEnter={() => setHoveredStrike(strike)}
                  onMouseLeave={() => setHoveredStrike(null)}
                  className={`${spotHighlightCls} border-b border-gray-900 hover:bg-gray-950/70 transition`}
                >
                  {/* ===================== CALL OPTION SIDE ===================== */}

                  {/* Call Volume */}
                  {visibleColumns.volume && (
                    <td className={`p-1.5 px-2 text-gray-500 text-xs ${callSideCls}`}>
                      {row.call.hasLiveContext ? formatScaledNumber(row.call.volume, scaleMode) : '--'}
                    </td>
                  )}

                  {/* Call ITM Probability */}
                  {visibleColumns.itmProb && (
                    <td className={`p-1.5 px-2 text-teal-400/80 ${callSideCls}`}>
                      {row.call.hasLiveContext ? `${row.call.itmProb.toFixed(1)}%` : '--'}
                    </td>
                  )}

                  {/* Call Intrinsic value */}
                  {visibleColumns.intrinsic && (
                    <td className={`p-1.5 px-2 ${row.call.intrinsic > 0 ? 'text-[#00ff33] font-bold' : 'text-gray-600'} ${callSideCls}`}>
                      {formatLiveUsd(row.call.hasLiveContext, row.call.intrinsic, 1)}
                    </td>
                  )}

                  {/* Call Extrinsic value */}
                  {visibleColumns.extrinsic && (
                    <td className={`p-1.5 px-2 text-[#00e5ff] ${callSideCls}`}>
                      {formatLiveUsd(row.call.hasLiveContext, row.call.extrinsic, 2)}
                    </td>
                  )}

                  {/* Call Greeks: Theta */}
                  {visibleColumns.theta && (
                    <td className={`p-1.5 px-2 text-[#ff3366] ${callSideCls}`}>
                      {formatLiveNumber(row.call.hasLiveContext, row.call.theta, 3)}
                    </td>
                  )}

                  {/* Call Greeks: Vega */}
                  {visibleColumns.vega && (
                    <td className={`p-1.5 px-2 text-[#ffd700] ${callSideCls}`}>
                      {formatLiveNumber(row.call.hasLiveContext, row.call.vega, 3)}
                    </td>
                  )}

                  {/* Call Greeks: Gamma */}
                  {visibleColumns.gamma && (
                    <td className={`p-1.5 px-2 text-[#ff00ff] ${callSideCls}`}>
                      {formatLiveNumber(row.call.hasLiveContext, row.call.gamma, 4)}
                    </td>
                  )}

                  {/* Call Greeks: Delta */}
                  {visibleColumns.delta && (
                    <td className={`p-1.5 px-2 text-gray-300 font-bold ${callSideCls}`}>
                      {formatLiveNumber(row.call.hasLiveContext, row.call.delta, 3)}
                    </td>
                  )}

                  {/* Call Bid Price (Click to Sell Call) */}
                  <td
                    onClick={() => row.call.isTradable && handleCellClick(strike, 'call', 'sell')}
                    title={row.call.isTradable ? '点击以 mock 买入价做空此Call腿 (Sell/Write Short)' : row.call.sourceDetail}
                    className={`p-1.5 px-2 font-bold border-l border-gray-900 ${row.call.isTradable ? 'text-[#00ff33] cursor-pointer hover:bg-[#00ff33]/15 transition' : 'text-gray-700 cursor-not-allowed'} ${callSideCls}`}
                  >
                    {row.call.isTradable ? `$${row.call.bid.toFixed(2)}` : '--'}
                  </td>

                  {/* Call Ask Price (Click to Buy Call) */}
                  <td
                    onClick={() => row.call.isTradable && handleCellClick(strike, 'call', 'buy')}
                    title={row.call.isTradable ? '点击以 mock 卖出价买入此Call腿 (Buy Long Call)' : row.call.sourceDetail}
                    className={`p-1.5 px-2 font-bold border-l border-gray-900/30 ${row.call.isTradable ? 'text-[#ff3333] cursor-pointer hover:bg-[#ff3333]/15 transition' : 'text-gray-700 cursor-not-allowed'} ${callSideCls}`}
                  >
                    {row.call.isTradable ? `$${row.call.ask.toFixed(2)}` : '--'}
                  </td>

                  {/* Call Theoretical price */}
                  <td className={`p-1.5 px-2 text-gray-400 font-medium ${callSideCls}`}>
                    {row.call.hasLiveContext ? `$${row.call.theor.toFixed(2)}` : '--'}
                  </td>

                  {/* Call Active position indicator */}
                  <td className={`p-1.5 px-1 bg-black text-center text-[9px] border-r border-[#ff9f1c]/20 ${row.call.activeLegs.length > 0 ? 'text-[#00e5ff] font-bold bg-[#ff9f1c]/5' : 'text-gray-700'}`}>
                    {row.call.activeLegs.length > 0 ? (
                      <div className="flex flex-col gap-0.5 justify-center items-center">
                        {row.call.activeLegs.map(l => (
                          <span
                            key={l.id}
                            onClick={(e) => { e.stopPropagation(); handleRemoveLeg(l.id); }}
                            className={`px-1 py-0.5 font-sans leading-none text-[8.5px] border cursor-pointer hover:bg-red-500 hover:text-white ${l.side === 'buy' ? 'bg-[#00ff33]/10 text-[#00ff33] border-[#00ff33]/30' : 'bg-[#ff3333]/10 text-[#ff3333] border-[#ff3333]/30'}`}
                          >
                            {l.side === 'buy' ? '+' : '-'}{l.quantity}L
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span
                        title={row.call.sourceDetail}
                        className={
                          row.call.engineLabel === 'MOCK'
                            ? 'text-emerald-500'
                            : row.call.engineLabel === 'MOCK+BS'
                              ? 'text-amber-300'
                              : 'text-gray-600'
                        }
                      >
                        {row.call.engineLabel}
                      </span>
                    )}
                  </td>


                  {/* ===================== CENTER COLUMN (STRIKE AND IV) ===================== */}

                  <td className={`p-1.5 px-3 text-center bg-[#0e0e11] text-[#ff9f1c] font-black border-r border-gray-800 flex items-center justify-between text-xs`}>
                    <span className="text-[8.5px] text-gray-600 font-normal">{row.call.hasLiveContext || row.put.hasLiveContext ? `${strikeIV.toFixed(1)}%` : '--'}</span>
                    <span className="flex-1 text-center font-extrabold text-[#ff9f1c] block">
                      ${strike}
                    </span>
                    {isATM && (
                      <span className="text-[8px] px-1 py-0.5 bg-[#ff9f1c]/15 text-[#ff9f1c] font-bold rounded-none ml-1 animate-pulse border border-[#ff9f1c]/30">ATM</span>
                    )}
                  </td>


                  {/* ===================== PUT OPTION SIDE ===================== */}

                  {/* Put Active position indicator */}
                  <td className={`p-1.5 px-1 bg-black text-center text-[9px] border-r border-gray-900 ${row.put.activeLegs.length > 0 ? 'text-[#ff00ff] font-bold bg-[#ff9f1c]/5' : 'text-gray-700'}`}>
                    {row.put.activeLegs.length > 0 ? (
                      <div className="flex flex-col gap-0.5 justify-center items-center">
                        {row.put.activeLegs.map(l => (
                          <span
                            key={l.id}
                            onClick={(e) => { e.stopPropagation(); handleRemoveLeg(l.id); }}
                            className={`px-1 py-0.5 font-sans leading-none text-[8.5px] border cursor-pointer hover:bg-red-500 hover:text-white ${l.side === 'buy' ? 'bg-[#00ff33]/10 text-[#00ff33] border-[#00ff33]/30' : 'bg-[#ff3333]/10 text-[#ff3333] border-[#ff3333]/30'}`}
                          >
                            {l.side === 'buy' ? '+' : '-'}{l.quantity}L
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span
                        title={row.put.sourceDetail}
                        className={
                          row.put.engineLabel === 'MOCK'
                            ? 'text-emerald-500'
                            : row.put.engineLabel === 'MOCK+BS'
                              ? 'text-amber-300'
                              : 'text-gray-600'
                        }
                      >
                        {row.put.engineLabel}
                      </span>
                    )}
                  </td>

                  {/* Put Theoretical price */}
                  <td className={`p-1.5 px-2 text-left text-gray-400 font-medium ${putSideCls}`}>
                    {row.put.hasLiveContext ? `$${row.put.theor.toFixed(2)}` : '--'}
                  </td>

                  {/* Put Ask Price (Click to Buy Put) */}
                  <td
                    onClick={() => row.put.isTradable && handleCellClick(strike, 'put', 'buy')}
                    title={row.put.isTradable ? '点击以 mock 卖出价买入此Put腿 (Buy Long Put)' : row.put.sourceDetail}
                    className={`p-1.5 px-2 text-left font-bold border-r border-gray-900/30 ${row.put.isTradable ? 'text-[#ff3333] cursor-pointer hover:bg-[#ff3333]/15 transition' : 'text-gray-700 cursor-not-allowed'} ${putSideCls}`}
                  >
                    {row.put.isTradable ? `$${row.put.ask.toFixed(2)}` : '--'}
                  </td>

                  {/* Put Bid Price (Click to Sell Put) */}
                  <td
                    onClick={() => row.put.isTradable && handleCellClick(strike, 'put', 'sell')}
                    title={row.put.isTradable ? '点击以 mock 买入价做空此Put腿 (Sell/Write Short Put)' : row.put.sourceDetail}
                    className={`p-1.5 px-2 text-left font-bold border-r border-gray-900 ${row.put.isTradable ? 'text-[#00ff33] cursor-pointer hover:bg-[#00ff33]/15 transition' : 'text-gray-700 cursor-not-allowed'} ${putSideCls}`}
                  >
                    {row.put.isTradable ? `$${row.put.bid.toFixed(2)}` : '--'}
                  </td>

                  {/* Put Greeks: Delta */}
                  {visibleColumns.delta && (
                    <td className={`p-1.5 px-2 text-left text-gray-300 font-bold ${putSideCls}`}>
                      {formatLiveNumber(row.put.hasLiveContext, row.put.delta, 3)}
                    </td>
                  )}

                  {/* Put Greeks: Gamma */}
                  {visibleColumns.gamma && (
                    <td className={`p-1.5 px-2 text-left text-[#ff00ff] ${putSideCls}`}>
                      {formatLiveNumber(row.put.hasLiveContext, row.put.gamma, 4)}
                    </td>
                  )}

                  {/* Put Greeks: Vega */}
                  {visibleColumns.vega && (
                    <td className={`p-1.5 px-2 text-left text-[#ffd700] ${putSideCls}`}>
                      {formatLiveNumber(row.put.hasLiveContext, row.put.vega, 3)}
                    </td>
                  )}

                  {/* Put Greeks: Theta */}
                  {visibleColumns.theta && (
                    <td className={`p-1.5 px-2 text-left text-[#ff3366] ${putSideCls}`}>
                      {formatLiveNumber(row.put.hasLiveContext, row.put.theta, 3)}
                    </td>
                  )}

                  {/* Put Extrinsic value */}
                  {visibleColumns.extrinsic && (
                    <td className={`p-1.5 px-2 text-left text-[#00e5ff] ${putSideCls}`}>
                      {formatLiveUsd(row.put.hasLiveContext, row.put.extrinsic, 2)}
                    </td>
                  )}

                  {/* Put Intrinsic value */}
                  {visibleColumns.intrinsic && (
                    <td className={`p-1.5 px-2 text-left ${row.put.intrinsic > 0 ? 'text-[#00ff33] font-bold' : 'text-gray-600'} ${putSideCls}`}>
                      {formatLiveUsd(row.put.hasLiveContext, row.put.intrinsic, 1)}
                    </td>
                  )}

                  {/* Put ITM Probability */}
                  {visibleColumns.itmProb && (
                    <td className={`p-1.5 px-2 text-left text-teal-400/80 ${putSideCls}`}>
                      {row.put.hasLiveContext ? `${row.put.itmProb.toFixed(1)}%` : '--'}
                    </td>
                  )}

                  {/* Put Volume */}
                  {visibleColumns.volume && (
                    <td className={`p-1.5 px-2 text-left text-gray-500 text-xs ${putSideCls}`}>
                      {row.put.hasLiveContext ? formatScaledNumber(row.put.volume, scaleMode) : '--'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* QUICK FOOTER TIPS */}
      <div className="mt-3 bg-[#0a0a0c] border border-gray-900 p-2.5 text-[10px] text-gray-500 flex justify-between items-center">
        <span>
          * CALL 侧高亮部分代表实值 (Spot &gt; Strike)；PUT 侧高亮代表实值 (Spot &lt; Strike)
        </span>
        <span className="text-[#ff9f1c] font-black">
          [TITAN MATRIX OPTIONCHAIN V3]
        </span>
      </div>
      </>
      )}
    </div>
  );
}
