/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BASE_DATE_STR, LiveExpiry, LiveVolSummary, OptionLeg, Strategy, TickerInfo } from '../types';
import { cdfNormal, calculateBSPrice, calculateLegPayoff, analyzeStrategy } from '../lib/optionsMath';
import { getStrategyTemplates } from '../lib/strategyTemplates';
import {
  Percent, TrendingUp, AlertTriangle, HelpCircle, Check, Sparkles,
  Plus, Calendar, ArrowRight, BookOpen, Target, Crosshair, Sparkle,
  Sliders, ShieldCheck, DollarSign, RefreshCw, HelpCircle as InfoIcon
} from 'lucide-react';

interface VolatilityOddsPanelProps {
  currentStockPrice: number;
  daysToExpiry: number;
  r: number;
  activeSymbol: string;
  tickerIV: number;
  liveTicker?: TickerInfo;
  liveVolSummary?: LiveVolSummary;
  liveExpiries?: LiveExpiry[];
  asOfDate?: string;
  onImportStrategy: (legs: OptionLeg[], name: string) => void;
}

interface EvaluatedStrategy {
  name: string;
  legs: OptionLeg[];
  pnlAtTarget: number;
  maxLoss: number;
  maxProfit: number;
  netPremium: number;
  rRatio: number; // Reward to risk ratio
  probabilityOfInTheMoney: number; // Probability target is reached or strategy is profitable
  isPrioritized: boolean; // R >= 2
  totalDebitCost: number; // netPremium * 100 (if debit)
  isUnderBudget: boolean; // under user budget cost
}

// Date calculation helper
const calculateDaysBetween = (startStr: string, endStr: string): number => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 30;
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
};

export default function VolatilityOddsPanel({
  currentStockPrice,
  daysToExpiry,
  r,
  activeSymbol,
  tickerIV,
  liveTicker,
  liveVolSummary,
  liveExpiries = [],
  asOfDate = BASE_DATE_STR,
  onImportStrategy
}: VolatilityOddsPanelProps) {
  // 1. Dynamic Sandbox Overrides (lets the user override any predefined ticker values)
  const [isCustomAsset, setIsCustomAsset] = useState<boolean>(true); // default to custom so user has Micron MU with 950 initialized
  const [sandboxSymbol, setSandboxSymbol] = useState<string>('MU');
  const [sandboxSpotPrice, setSandboxSpotPrice] = useState<number>(900); // simulation spot
  const [isCustomIV, setIsCustomIV] = useState<boolean>(true); // allow direct IV selection and modification
  const [sandboxIV, setSandboxIV] = useState<number>(38); // custom analysis IV

  // 2. Date expectations
  const [startDate, setStartDate] = useState<string>(asOfDate);
  const [endDate, setEndDate] = useState<string>('2027-01-15'); // default to long-term early Jan 2027
  const [daysToExpiryCustom, setDaysToExpiryCustom] = useState<number>(218);
  const nearestLiveExpiry = liveExpiries[0]?.date || '2026-06-18';

  // Recalculate days To expiry whenever dates change
  useEffect(() => {
    const days = calculateDaysBetween(startDate, endDate);
    setDaysToExpiryCustom(days);
  }, [startDate, endDate]);

  useEffect(() => {
    setStartDate(asOfDate);
  }, [asOfDate]);

  // Set preset handler
  const selectDatePreset = (pStart: string, pEnd: string) => {
    setStartDate(pStart);
    setEndDate(pEnd);
  };

  // 3. User targets and expectation bounds
  const [targetMode, setTargetMode] = useState<'single' | 'range'>('range'); // default to range target
  const [targetPriceMin, setTargetPriceMin] = useState<number>(950);
  const [targetPriceMax, setTargetPriceMax] = useState<number>(1000);
  const [targetPriceSingle, setTargetPriceSingle] = useState<number>(950);

  const [confidence, setConfidence] = useState<number>(80); // prediction confidence (e.g. 80%)
  const [maxBudgetLimit, setMaxBudgetLimit] = useState<number>(500); // 成本在500u以内
  const [minRRandAboveOnly, setMinRRandAboveOnly] = useState<boolean>(true); // default to true to prioritize 2R+
  const [marketBias, setMarketBias] = useState<'bullish' | 'bearish' | 'range' | 'breakout'>('bullish');

  // Pick whichever values are operational
  const activeSpot = isCustomAsset ? sandboxSpotPrice : currentStockPrice;
  const activeIV = isCustomIV ? sandboxIV : tickerIV;
  const activeDays = daysToExpiryCustom;
  const volatilityInputLabel = liveVolSummary?.source ? 'MOCK VOL INPUT' : 'MANUAL IV INPUT';

  // Synchronization hook with system presets (runs only when isCustomAsset is toggled OFF)
  useEffect(() => {
    if (!isCustomAsset) {
      setSandboxSpotPrice(currentStockPrice);
    }
  }, [currentStockPrice, isCustomAsset]);

  useEffect(() => {
    if (!isCustomIV) {
      setSandboxIV(liveVolSummary?.atmIv || tickerIV);
    }
  }, [tickerIV, liveVolSummary?.atmIv, isCustomIV]);

  useEffect(() => {
    setSandboxSymbol(activeSymbol);
    setSandboxSpotPrice(liveTicker?.price || currentStockPrice);
    setSandboxIV(liveVolSummary?.atmIv || liveTicker?.iv || tickerIV);
    setIsCustomAsset(false);
    setIsCustomIV(false);
    setTargetPriceMin(Number(((liveTicker?.price || currentStockPrice) * 1.05).toFixed(2)));
    setTargetPriceMax(Number(((liveTicker?.price || currentStockPrice) * 1.12).toFixed(2)));
    setTargetPriceSingle(Number(((liveTicker?.price || currentStockPrice) * 1.08).toFixed(2)));
  }, [activeSymbol, liveTicker?.price, liveTicker?.iv, liveVolSummary?.atmIv, tickerIV]);

  // 4. Probability Engine Math
  const volFraction = activeIV / 100;
  const timeFraction = activeDays / 365;
  const oneSigmaMove = activeSpot * volFraction * Math.sqrt(timeFraction);

  const oneSigmaLower = Math.max(0.1, activeSpot - oneSigmaMove);
  const oneSigmaUpper = activeSpot + oneSigmaMove;
  const twoSigmaLower = Math.max(0.1, activeSpot - 2 * oneSigmaMove);
  const twoSigmaUpper = activeSpot + 2 * oneSigmaMove;

  // Probability of exceeding a hurdle
  const calculateProbabilityToOvercomeEx = (spotPrice: number, barrier: number, isAbove: boolean, ivValue: number, daysValue: number): number => {
    const T = daysValue / 365;
    const sigma = ivValue / 100;
    const rate = r / 100;
    if (T <= 0 || sigma <= 0) return barrier === spotPrice ? 0.5 : (barrier < spotPrice ? 1.0 : 0.0);

    const d2 = (Math.log(spotPrice / barrier) + (rate - (sigma * sigma) / 2.0) * T) / (sigma * Math.sqrt(T));
    const probAbove = cdfNormal(d2);
    return isAbove ? probAbove : (1 - probAbove);
  };

  // Target probability calculator
  let targetProbDescription = '';
  let targetProbValue = 0.5;

  if (targetMode === 'single') {
    const isAbove = targetPriceSingle >= activeSpot;
    targetProbValue = calculateProbabilityToOvercomeEx(activeSpot, targetPriceSingle, isAbove, activeIV, activeDays);
    targetProbDescription = `到期日股价${isAbove ? '超越' : '低于'} $${targetPriceSingle} 的概率`;
  } else {
    // Range math [Min, Max]
    const pAboveMin = calculateProbabilityToOvercomeEx(activeSpot, targetPriceMin, true, activeIV, activeDays);
    const pAboveMax = calculateProbabilityToOvercomeEx(activeSpot, targetPriceMax, true, activeIV, activeDays);

    // Probability of finishing inside [Min, Max]
    const insideRange = Math.abs(pAboveMin - pAboveMax);

    // Probability of being above the minimum target hurdle (950+)
    const aboveMin = pAboveMin;

    targetProbValue = insideRange;
    targetProbDescription = `到期日股价精准落在 $${targetPriceMin} - $${targetPriceMax} 区间内的概率`;
  }

  // Calculate above-hurdle probability specifically (e.g., above 950)
  const hurdlePrice = targetMode === 'single' ? targetPriceSingle : targetPriceMin;
  const probAboveHurdle = calculateProbabilityToOvercomeEx(activeSpot, hurdlePrice, true, activeIV, activeDays);

  // 5. Quant Strategy Evaluator Sandbox
  const templates = getStrategyTemplates(activeSpot, activeIV);

  const evaluatedList: EvaluatedStrategy[] = templates.map((tpl) => {
    // 1. Black-Scholes pricing mapping
    const validatedLegs = tpl.legs.map(leg => {
      const bsPrice = calculateBSPrice(activeSpot, leg.strike, activeDays, activeIV, r, leg.type);
      return {
        ...leg,
        expiryDays: activeDays,
        premium: Number(Math.max(0.01, bsPrice).toFixed(2)),
        isCustomPremium: false
      };
    });

    // 2. Payoff breakdown limits
    const analysis = analyzeStrategy(validatedLegs, activeSpot, activeDays, r);

    // 3. Compute pay-off at customer's evaluation point (average or min target depending on mode)
    const evalTargetPrice = targetMode === 'single' ? targetPriceSingle : Math.round((targetPriceMin + targetPriceMax) / 2);
    let pnlAtTarget = 0;
    validatedLegs.forEach((leg) => {
      pnlAtTarget += calculateLegPayoff(leg, evalTargetPrice);
    });

    const maxLoss = Math.abs(analysis.maxLoss);

    // 4. Reward-To-Risk Ratio (赔率比 R)
    let rRatio = 0;
    if (pnlAtTarget > 0 && maxLoss > 0) {
      rRatio = pnlAtTarget / maxLoss;
    } else if (pnlAtTarget > 0 && maxLoss === 0) {
      rRatio = 99.9;
    }

    // 5. Total Premium cost (considering 1 contract = 100 shares multiplier)
    const totalDebitCost = analysis.netPremium > 0 ? Number((analysis.netPremium * 100).toFixed(0)) : 0;
    const isUnderBudget = totalDebitCost <= maxBudgetLimit;

    // 6. Probability estimate
    let probabilityOfInTheMoney = 0.5;
    const breakevens = analysis.breakevens;
    if (breakevens.length === 1) {
      const b1 = breakevens[0];
      const bullishSpread = tpl.name.includes('牛市') || tpl.name.includes('看涨') || tpl.name.includes('买入看涨');
      probabilityOfInTheMoney = calculateProbabilityToOvercomeEx(activeSpot, b1, bullishSpread, activeIV, activeDays);
    } else if (breakevens.length === 2) {
      const bLower = breakevens[0];
      const bUpper = breakevens[1];
      const probInside = Math.abs(
        calculateProbabilityToOvercomeEx(activeSpot, bLower, true, activeIV, activeDays) -
        calculateProbabilityToOvercomeEx(activeSpot, bUpper, true, activeIV, activeDays)
      );
      probabilityOfInTheMoney = tpl.name.includes('铁鹰') || tpl.name.includes('蝴蝶') ? probInside : (1 - probInside);
    } else {
      probabilityOfInTheMoney = probAboveHurdle;
    }

    return {
      name: tpl.name,
      legs: validatedLegs,
      pnlAtTarget,
      maxLoss,
      maxProfit: analysis.maxProfit,
      netPremium: analysis.netPremium,
      rRatio,
      probabilityOfInTheMoney,
      totalDebitCost,
      isUnderBudget,
      isPrioritized: rRatio >= 2.0
    };
  });

  // Filters based on criteria
  const filteredAndSortedEvaluators = evaluatedList
    .filter(item => {
      // Keep only matches under budget constraints
      if (!item.isUnderBudget) return false;

      // Filter by market direction outlook
      const isBullType = item.name.includes('看涨') || item.name.includes('牛市');
      const isBearType = item.name.includes('看跌') || item.name.includes('熊市');
      const isRangeType = item.name.includes('铁鹰') || item.name.includes('蝴蝶');
      const isBreakType = item.name.includes('跨式') || item.name.includes('买入看涨') || item.name.includes('期权');

      if (marketBias === 'bullish') return isBullType || !isBearType;
      if (marketBias === 'bearish') return isBearType || !isBullType;
      if (marketBias === 'range') return isRangeType || item.name.includes('Covered');
      return isBreakType || isBullType;
    })
    .sort((a, b) => b.rRatio - a.rRatio);

  const finalDisplayed = minRRandAboveOnly
    ? filteredAndSortedEvaluators.filter(item => item.rRatio >= 2.0)
    : filteredAndSortedEvaluators;

  return (
    <div className="space-y-4 font-mono text-gray-200">

      {/* COCKPIT HEADER */}
      <div className="bg-black border-2 border-[#ff9f1c]/40 p-4 rounded-none flex items-start gap-3.5 shadow-lg">
        <div className="p-2.5 rounded-none bg-[#ff9f1c]/10 text-[#ff9f1c] border border-[#ff9f1c]/30">
          <Sliders className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-white font-extrabold text-sm tracking-tight flex items-center gap-1.5 uppercase">
              &lt;G VOLATILITY & ODDS MATRIX COCKPIT&gt;
              <span className="text-[10px] text-[#ff9f1c] bg-[#ff9f1c]/10 border border-[#ff9f1c]/30 px-1.5 py-0.5 font-bold font-mono">
                UNDER 500U FILTERED
              </span>
              <span className="text-[10px] text-sky-300 bg-sky-500/10 border border-sky-500/25 px-1.5 py-0.5 font-bold font-mono">
                ENGINE: TYPESCRIPT BLACK-SCHOLES SANDBOX
              </span>
              <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 font-bold font-mono">
                not Rust option-core
              </span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 font-bold font-mono">
                {volatilityInputLabel}
              </span>
              <span className="text-[10px] text-gray-500 font-mono font-bold">ANALYSIS BASELINE: {asOfDate} UTC</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed mt-1 font-sans">
            您可以<strong>自主控制并分析任何波动率 (IV)、标的股价与到期时间</strong>。支持计算区间股价概率（例如 <strong>950-1000 以上概率</strong>）、并为您在 <strong>$500u 预算以内</strong> 精准配置 <strong>$\ge 2R$ 高赔率</strong> 的期权神级组合。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* PANEL LEFT: DYNAMIC PARAMETER OVERRIDES */}
        <div className="lg:col-span-5 bg-black border-2 border-[#ff9f1c]/20 rounded-none p-4 space-y-4 shadow-sm">

          {/* HEADER SECTOR */}
          <div className="border-b border-gray-900 pb-2 flex justify-between items-center">
            <span className="text-xs text-[#ff9f1c] font-black uppercase tracking-wider font-mono flex items-center gap-1">
              <Sparkle className="w-3 h-3 fill-[#ff9f1c]" />
              1. UNDERLYING TICKER & VOL IV
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-400 font-mono">
              <input
                type="checkbox"
                checked={isCustomAsset}
                onChange={(e) => setIsCustomAsset(e.target.checked)}
                className="rounded-none bg-black border-gray-800 text-[#ff9f1c] focus:ring-0"
              />
              ENABLE OVERRIDE
            </label>
          </div>

          {/* Asset Symbol & Custom Spot Input */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-500 font-mono block">标的代码 Symbol:</span>
              <input
                type="text"
                value={isCustomAsset ? sandboxSymbol : activeSymbol}
                disabled={!isCustomAsset}
                onChange={(e) => setSandboxSymbol(e.target.value.toUpperCase())}
                className="w-full bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono text-gray-100 focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-500 font-mono block">虚拟标的价 Spot Price:</span>
              <input
                type="number"
                value={isCustomAsset ? sandboxSpotPrice : Math.round(currentStockPrice)}
                disabled={!isCustomAsset}
                onChange={(e) => setSandboxSpotPrice(Number(e.target.value) || 0)}
                className="w-full bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono text-yellow-400 focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* VOLATILITY SELECTOR ADJUSTMENT ("波动率我可以自己选择和分析") */}
          <div className="space-y-2 bg-[#1b1b22]/40 p-3 rounded-lg border border-gray-850">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-gray-400 font-semibold flex items-center gap-1">
                <Sliders className="w-3 h-3 text-sky-400" />
                隐含波动率 IV (Implied Volatility):
              </span>
              <label className="flex items-center gap-1 text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCustomIV}
                  onChange={(e) => setIsCustomIV(e.target.checked)}
                  className="rounded bg-gray-900 border-gray-850 text-sky-500 focus:ring-0 scale-75"
                />
                自主选择
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="5"
                max="150"
                step="1"
                disabled={!isCustomIV}
                value={activeIV}
                onChange={(e) => setSandboxIV(Number(e.target.value))}
                className="w-full accent-sky-400 h-1 bg-gray-800 rounded-lg cursor-pointer disabled:opacity-40"
              />
              <span className="text-xs font-bold font-mono text-sky-400 bg-sky-400/10 border border-sky-450/20 px-2 py-0.5 rounded whitespace-nowrap">
                {activeIV}%
              </span>
            </div>
            <p className="text-[9px] text-gray-500 italic mt-0.5 font-sans">
              *您可以无缝增减波动率以观察在标的暴涨暴跌或剧变时对期权价格和胜算概率的真实压力测试。
            </p>
          </div>

          {/* DYNAMIC DATE SELECTION ("时间在2026.6.18-2027.01 的概率有80%") */}
          <div className="space-y-2">
            <span className="text-[10px] text-gray-400 font-mono block">2. 分析到期时间期限 (Simulation Expiry Timeline):</span>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[9px] text-gray-600 font-mono">基准起始日期(今日):</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850/80 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-gray-300"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-gray-600 font-mono">期权到期日期:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850/80 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-yellow-500"
                />
              </div>
            </div>

            {/* Exp date presets */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => selectDatePreset(asOfDate, nearestLiveExpiry)}
                className={`py-1 px-2 text-[10px] rounded border font-mono transition text-left flex items-center justify-between ${endDate === nearestLiveExpiry ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'bg-gray-950/40 text-gray-400 border-gray-850/80 hover:bg-gray-900'}`}
              >
                <span>短线到期 ({nearestLiveExpiry})</span>
                <span className="bg-sky-500/10 px-1 rounded text-[9px] text-sky-300">{calculateDaysBetween(asOfDate, nearestLiveExpiry)}天</span>
              </button>
              <button
                type="button"
                onClick={() => selectDatePreset(asOfDate, '2027-01-15')}
                className={`py-1 px-2 text-[10px] rounded border font-mono transition text-left flex items-center justify-between ${endDate === '2027-01-15' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-gray-950/40 text-gray-400 border-gray-850/80 hover:bg-gray-900'}`}
              >
                <span>跨年长线 (2027-01-15)</span>
                <span className="bg-amber-500/10 px-1 rounded text-[9px] text-amber-300">{calculateDaysBetween(asOfDate, '2027-01-15')}天</span>
              </button>
            </div>

            <div className="p-2 bg-gray-950 rounded border border-gray-850/85 flex justify-between items-center text-xs font-mono">
              <span className="text-gray-500">计算出对应总时长:</span>
              <span className="text-sky-400 font-extrabold">{activeDays} 天 ({(activeDays/365).toFixed(3)}年)</span>
            </div>
          </div>

          {/* DUST COST THRESHOLD ("成本在500u以内") */}
          <div className="space-y-2 bg-emerald-950/10 border border-emerald-500/10 p-3 rounded-lg">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                单笔期权建仓硬性净成本限制 (Budget Limit):
              </span>
              <button
                type="button"
                onClick={() => setMaxBudgetLimit(500)}
                className="text-emerald-400 font-bold bg-emerald-400/10 hover:bg-emerald-400/20 px-1 py-0.5 rounded text-[8px] tracking-tight transition"
              >
                重设 $500u 限制
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="2000"
                step="50"
                value={maxBudgetLimit}
                onChange={(e) => setMaxBudgetLimit(Number(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-gray-800 rounded-lg cursor-pointer"
              />
              <span className="text-xs font-black font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded whitespace-nowrap min-w-[70px] text-center">
                ${maxBudgetLimit} u
              </span>
            </div>
            <p className="text-[9px] text-gray-500 font-sans mt-1">
              *系统将自动排除超过该净金成本 (Debit Cost) 的持仓交易，确保风险彻底控制在 <strong>${maxBudgetLimit}u</strong> 范围。
            </p>
          </div>

        </div>

        {/* PANEL RIGHT: TARGET PRICE EXPLAINER & METRICS */}
        <div className="lg:col-span-7 bg-black border-2 border-[#ff9f1c]/20 rounded-none p-4 flex flex-col justify-between space-y-4 shadow-sm">

          <div>
            <div className="border-b border-gray-900 pb-2 mb-3 flex flex-wrap justify-between items-center gap-2">
              <span className="text-xs text-[#ff9f1c] font-black uppercase tracking-wider font-mono flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-[#ff9f1c]" />
                2. EXPECTED TARGET & STATISTICAL ODDS
              </span>

              {/* Target Mode Toggle */}
              <div className="flex bg-black p-0.5 rounded-none border border-gray-800 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setTargetMode('single')}
                  className={`px-2 py-0.5 rounded-none transition ${targetMode === 'single' ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] font-black' : 'text-gray-500 hover:text-white'}`}
                >
                  SINGLE TARGET
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('range')}
                  className={`px-2 py-0.5 rounded-none transition ${targetMode === 'range' ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] font-black' : 'text-gray-500 hover:text-white'}`}
                >
                  RANGE (950-1000+)
                </button>
              </div>
            </div>

            {/* Target Price range sliders/inputs */}
            {targetMode === 'range' ? (
              <div className="space-y-3 bg-[#0a0a0c] p-3.5 rounded-none border border-gray-900">
                <p className="text-[11px] text-gray-400 font-sans leading-normal">
                  设置预期的股价变动上下沿（比如您看好股价上涨到达 <strong>$950 - $1000</strong> 或以上）：
                </p>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-gray-500 font-mono block">最低目标股价 Bound Low:</span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={targetPriceMin}
                        onChange={(e) => setTargetPriceMin(Number(e.target.value) || 0)}
                        className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs font-mono font-bold text-yellow-400"
                      />
                      <button
                        type="button"
                        onClick={() => setTargetPriceMin(Number((activeSpot * 1.05).toFixed(2)))}
                        className="bg-gray-900 hover:bg-gray-800 px-1.5 py-1 text-[8px] font-mono text-gray-400 rounded min-w-[36px]"
                      >
                        设950
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-gray-500 font-mono block">最高目标股价 Bound High:</span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={targetPriceMax}
                        onChange={(e) => setTargetPriceMax(Number(e.target.value) || 0)}
                        className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs font-mono font-bold text-yellow-400"
                      />
                      <button
                        type="button"
                        onClick={() => setTargetPriceMax(Number((activeSpot * 1.12).toFixed(2)))}
                        className="bg-gray-900 hover:bg-gray-800 px-1.5 py-1 text-[8px] font-mono text-gray-400 rounded min-w-[36px]"
                      >
                        设1000
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-[10.5px] text-gray-500 leading-normal flex flex-wrap gap-x-4 gap-y-1 font-mono pt-1">
                  <span>当前价格距离区间下凹: <strong className="text-gray-300">{(((targetPriceMin - activeSpot) / activeSpot) * 100).toFixed(1)}%</strong></span>
                  <span>当前价格距离区间上凸: <strong className="text-gray-300">{(((targetPriceMax - activeSpot) / activeSpot) * 100).toFixed(1)}%</strong></span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-[#1e1e24]/40 p-3.5 rounded-lg border border-gray-850/80">
                <span className="text-[10px] text-gray-400 font-mono block">预期单点目标价格 Price Hurdles:</span>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={targetPriceSingle}
                    onChange={(e) => setTargetPriceSingle(Number(e.target.value) || 0)}
                    className="w-32 bg-gray-950 border border-gray-800 rounded px-2.5 py-1 text-xs font-mono font-bold text-yellow-400 focus:outline-none"
                  />
                  <input
                    type="range"
                    min={activeSpot * 0.5}
                    max={activeSpot * 1.5}
                    step="10"
                    value={targetPriceSingle}
                    onChange={(e) => setTargetPriceSingle(Number(e.target.value))}
                    className="w-full accent-yellow-400 h-1 bg-gray-800 rounded"
                  />
                </div>
              </div>
            )}

            {/* VOLATILITY STATISTICAL ENVELOPE DETAILS */}
            <div className="mt-4 p-3 bg-gray-950 rounded-lg border border-gray-850/80 space-y-3.5">

              {/* Linear spectrum meter of sigma levels */}
              <div className="relative pt-4 pb-2">
                <div className="h-1.5 w-full bg-gray-800 rounded-full relative flex items-center">

                  {/* Sigma ranges shade */}
                  <div className="absolute left-[12%] right-[12%] h-1.5 bg-gray-700/40 rounded-full" />
                  <div className="absolute left-[26%] right-[26%] h-1.5 bg-emerald-500/10 rounded-full border-x border-emerald-500/20" />

                  {/* Spot price block */}
                  <span className="absolute left-[50%] -translate-x-[50%] w-3 h-3 bg-white block rounded-full border border-gray-950 z-20 shadow">
                    <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 font-mono font-extrabold whitespace-nowrap">
                      Spot ${activeSpot}
                    </span>
                  </span>

                  {/* Range high/low target pins */}
                  {targetMode === 'range' ? (
                    <>
                      {/* Min point pin */}
                      {(() => {
                        const maxSpan = 2.4 * oneSigmaMove;
                        const diff = targetPriceMin - activeSpot;
                        const percentOffset = 50 + (diff / maxSpan) * 50;
                        const constrainedOffset = Math.min(94, Math.max(6, percentOffset));
                        return (
                          <span
                            className="absolute w-2.5 h-2.5 bg-yellow-500 rounded-full border border-gray-950 z-25 shadow"
                            style={{ left: `${constrainedOffset}%`, transform: 'translate(-50%)' }}
                          >
                            <span className="absolute -top-8 left-1/2 -translate-x-full text-[8px] text-yellow-400 font-mono font-bold whitespace-nowrap bg-black/90 px-1.5 py-0.5 rounded border border-yellow-550/10 shadow">
                              L ${targetPriceMin}
                            </span>
                          </span>
                        );
                      })()}
                      {/* Max point pin */}
                      {(() => {
                        const maxSpan = 2.4 * oneSigmaMove;
                        const diff = targetPriceMax - activeSpot;
                        const percentOffset = 50 + (diff / maxSpan) * 50;
                        const constrainedOffset = Math.min(94, Math.max(6, percentOffset));
                        return (
                          <span
                            className="absolute w-2.5 h-2.5 bg-yellow-500 rounded-full border border-gray-950 z-25 shadow"
                            style={{ left: `${constrainedOffset}%`, transform: 'translate(-50%)' }}
                          >
                            <span className="absolute -top-8 left-1/2 translate-x-1 text-[8px] text-yellow-400 font-mono font-bold whitespace-nowrap bg-black/90 px-1.5 py-0.5 rounded border border-yellow-550/10 shadow">
                              H ${targetPriceMax}
                            </span>
                          </span>
                        );
                      })()}
                    </>
                  ) : (
                    /* Single target point peg */
                    (() => {
                      const maxSpan = 2.4 * oneSigmaMove;
                      const diff = targetPriceSingle - activeSpot;
                      const percentOffset = 50 + (diff / maxSpan) * 50;
                      const constrainedOffset = Math.min(94, Math.max(6, percentOffset));
                      return (
                        <span
                          className="absolute w-3 h-3 bg-yellow-500 rounded-full border-2 border-gray-950 z-25 shadow animate-pulse"
                          style={{ left: `${constrainedOffset}%`, transform: 'translate(-50%)' }}
                        >
                          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] text-yellow-400 font-mono font-bold whitespace-nowrap bg-yellow-500/5 border border-yellow-500/20 px-1 py-0.5 rounded">
                            Target ${targetPriceSingle}
                          </span>
                        </span>
                      );
                    })()
                  )}

                  {/* Left-Right boundaries markers labels */}
                  <div className="absolute left-[26%] -translate-x-1/2 -bottom-5 text-[8.5px] text-emerald-400/80 font-mono">
                    -$1σ = ${oneSigmaLower.toFixed(1)}
                  </div>
                  <div className="absolute right-[26%] translate-x-1/2 -bottom-5 text-[8.5px] text-emerald-400/80 font-mono">
                    +$1σ = ${oneSigmaUpper.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* STATISTICAL ESTIMATES LIST */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-900 text-[10px] font-mono leading-normal text-gray-400">
                <div className="space-y-1.5 bg-gray-900/30 p-2 rounded">
                  <div className="flex justify-between">
                    <span>隐含波动率波动宽度 (±1σ):</span>
                    <span className="text-emerald-400 font-bold">±${oneSigmaMove.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>极端历史对冲宽度 (±2σ):</span>
                    <span className="text-gray-300 font-bold">±${(oneSigmaMove * 2).toFixed(1)}</span>
                  </div>
                </div>

                <div className="space-y-1.5 bg-yellow-500/5 p-2 rounded border border-yellow-500/10">
                  <div className="flex justify-between">
                    <span className="text-yellow-400/90 font-sans">超越最低目标价 (${hurdlePrice}+) 概率:</span>
                    <span className="text-yellow-400 font-black text-xs">{(probAboveHurdle * 100).toFixed(1)}%</span>
                  </div>
                  {targetMode === 'range' && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">刚好落在 ${targetPriceMin}-${targetPriceMax} 概率:</span>
                      <span className="text-sky-300 font-bold">{(targetProbValue * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* DYNAMIC ANALYSIS EXPLAINER FOOTER */}
          <div className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-lg text-[9.5px] leading-relaxed text-emerald-400 font-sans">
            <strong>📊 科学量化结论:</strong> 在隐含波动率 <strong>{activeIV}%</strong>、以及到期天数 <strong>{activeDays} 天</strong> 状态下：
            {targetMode === 'range' ? (
              <span> 标的股价突破 hurdle <strong>${targetPriceMin} 元</strong> (即超越最低起征点) 的总概率为 <strong>{(probAboveHurdle * 100).toFixed(1)}%</strong>。对应好赔率交易如下，请配合下方 2R 以上优势配置。</span>
            ) : (
              <span> 股价最终超越单点预期 <strong>${targetPriceSingle}</strong> 目标价格的精算物理概率为 <strong>{(targetProbValue * 100).toFixed(1)}%</strong>。</span>
            )}
          </div>

        </div>

      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-[#141417] border border-gray-850 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow">

        <div className="flex items-center gap-2">
          {/* Bias filtering */}
          <span className="text-[11px] text-gray-500 font-mono uppercase">方向偏好:</span>
          <div className="flex bg-gray-950 p-0.5 rounded border border-gray-850 text-[10px] font-mono">
            {(['bullish', 'bearish', 'range', 'breakout'] as const).map((bias) => (
              <button
                key={bias}
                type="button"
                onClick={() => setMarketBias(bias)}
                className={`px-2 py-1 rounded transition ${marketBias === bias ? 'bg-yellow-500/15 text-yellow-400 font-black' : 'text-gray-500 hover:text-white'}`}
              >
                {bias === 'bullish' && '看多 ↗️'}
                {bias === 'bearish' && '看空 ↘️'}
                {bias === 'range' && '横盘 ↔️'}
                {bias === 'breakout' && '剧震 ⚡'}
              </button>
            ))}
          </div>
        </div>

        {/* Filters switcher */}
        <div className="flex items-center gap-4">

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={minRRandAboveOnly}
              onChange={(e) => setMinRRandAboveOnly(e.target.checked)}
              className="rounded bg-gray-950 border-gray-800 text-yellow-500 focus:ring-yellow-500/30"
            />
            <span className="text-gray-300 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
              优先推荐 2R+ 以上好赔率组合
            </span>
          </label>

          <span className="h-4 w-px bg-gray-800" />

          <div className="text-[10px] text-gray-400 font-mono">
            符合预算与赔率条件的有效组合: <span className="text-emerald-400 font-extrabold">{finalDisplayed.length}</span> / {evaluatedList.length}
          </div>

        </div>

      </div>

      {/* STRATEGIES ODD-INDEX MATRIX (R-RATIO ANALYSIS) */}
      <div className="bg-black border-2 border-[#ff9f1c]/30 rounded-none p-4 shadow">

        <div className="flex flex-wrap items-center justify-between mb-3 border-b border-gray-900 pb-2.5 gap-2">
          <div>
            <h4 className="text-xs text-white font-extrabold uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#ff9f1c] fill-[#ff9f1c]" />
              &lt;G RECOMMENDED OPTION STRUCTURES &gt;
            </h4>
            <p className="text-[10.5px] text-gray-400 font-sans mt-0.5">
              系统根据您选定的 IV 属性与到期日价格区间，将所有不符预算 (${maxBudgetLimit}u) 与亏损组合过滤，寻找**最佳风险收益回报比率**配置：
            </p>
          </div>
        </div>

        {finalDisplayed.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-800 rounded-xl bg-[#1b1b22]/10">
            <AlertTriangle className="w-8 h-8 text-yellow-500/70 mx-auto mb-2" />
            <p className="text-xs text-gray-400 font-semibold">
              未搜寻到符合当前约束条件的高赔率低成本策略组合
            </p>
            <p className="text-[10px] text-gray-500 mt-1 font-sans">
              建议您可以：(1) 在左侧滑动调节「建仓成本上限」至更宽松条件；(2) 取消勾选「优先推荐 2R+」；(3) 加大预期的目标价跨度。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left select-none">
              <thead>
                <tr className="border-b border-gray-850 text-gray-400 uppercase text-[9.5px]">
                  <th className="py-2.5 px-3">期权交易策略</th>
                  <th className="py-2.5 text-center">合约腿组成 Legs</th>
                  <th className="py-2.5 text-right text-sky-300">账面买卖 premium</th>
                  <th className="py-2.5 text-right text-emerald-400 font-bold">每手最大净支出 (标的成本)</th>
                  <th className="py-2.5 text-right">绝对最大风险 Max Loss</th>
                  <th className="py-2.5 text-right text-emerald-450">预期中位价 (${Math.round(hurdlePrice)}u) 收益</th>
                  <th className="py-2.5 text-right text-yellow-400 font-extrabold hover:underline">赔率比 Reward-to-Risk (R)</th>
                  <th className="py-2.5 text-right pr-3">快速部署 Loader</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850">
                {finalDisplayed.map((item, idx) => {
                  const isFavorable = item.rRatio >= 2.0;

                  return (
                    <tr key={idx} className={`hover:bg-gray-900/30 transition-all ${isFavorable ? 'bg-yellow-500/[0.015]' : ''}`}>

                      {/* Name */}
                      <td className="py-3 px-3">
                        <div className="font-sans font-extrabold text-gray-100 flex items-center gap-1">
                          {item.name.split(' (')[0]}
                          {isFavorable && (
                            <span className="text-[9px] bg-yellow-400/10 text-yellow-400 border border-yellow-500/20 px-1 py-0.5 rounded font-bold">
                              2R+ 极强优势
                            </span>
                          )}
                        </div>
                        <div className="text-[9.5px] text-gray-500 italic lowercase block mt-0.5">
                          {item.name.split(' (')[1]?.replace(')', '') || 'Custom Option Combo'}
                        </div>
                      </td>

                      {/* Legs */}
                      <td className="py-3 text-center text-[10px] text-gray-300">
                        <span className="font-bold">{item.legs.length} 腿组成</span>
                        <div className="text-[9px] text-gray-500">
                          {item.legs.map(l => `${l.side === 'buy' ? '+' : '-'}${l.strike}${l.type === 'call' ? 'C' : 'P'}`).join(', ')}
                        </div>
                      </td>

                      {/* Premium per point */}
                      <td className="py-3 text-right">
                        {item.netPremium >= 0 ? (
                          <span className="text-rose-300 font-semibold">${item.netPremium.toFixed(2)} Debit</span>
                        ) : (
                          <span className="text-emerald-400 font-extrabold">${Math.abs(item.netPremium).toFixed(2)} Credit</span>
                        )}
                      </td>

                      {/* Actual Contract Capital Cost / Debit Outlay */}
                      <td className="py-3 text-right">
                        {item.netPremium > 0 ? (
                          <span className="text-emerald-400 font-extrabold bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20">
                            ${item.totalDebitCost} u
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20">
                            $0 (收取 ${Math.abs(item.netPremium * 100).toFixed(0)}u 权利金)
                          </span>
                        )}
                      </td>

                      {/* Max Loss */}
                      <td className="py-3 text-right text-rose-400 font-mono">
                        {item.maxLoss === 99999 || item.maxLoss === Infinity ? '理论上无限制' : `$${(item.maxLoss * 100).toFixed(0)} u`}
                      </td>

                      {/* PNL at Target */}
                      <td className="py-3 text-right font-black text-emerald-400">
                        {item.pnlAtTarget <= 0 ? (
                          <span className="text-zinc-650">0.00 u</span>
                        ) : (
                          `+$${(item.pnlAtTarget * 100).toFixed(0)} u`
                        )}
                      </td>

                      {/* Reward-To-Risk Ratio (赔率比 R) */}
                      <td className="py-3 text-right">
                        {item.pnlAtTarget <= 0 ? (
                          <span className="text-gray-600">0.00 R</span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className={`text-sm font-black tracking-wider ${isFavorable ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.25)] font-mono' : 'text-gray-300 font-mono'}`}>
                              {item.rRatio >= 90 ? '无损收益' : `${item.rRatio.toFixed(2)} R`}
                            </span>
                            <span className="text-[8.5px] text-gray-500 block font-sans">
                              (收益是最大风险的 {item.rRatio.toFixed(1)} 倍)
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Action trigger to import to live sandbox charts */}
                      <td className="py-3 text-right pr-3">
                        <button
                          type="button"
                          onClick={() => {
                            // Convert back to legs, multiplying correct strike scale
                            onImportStrategy(item.legs, `${item.name} (${activeSpot} Spot)`);
                          }}
                          className={`text-[10px] font-extrabold px-3 py-2 rounded-lg transition-transform active:scale-95 whitespace-nowrap ${isFavorable ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:scale-[1.02] text-white font-black shadow shadow-emerald-950/40' : 'bg-gray-800 hover:bg-gray-750 text-gray-300'}`}
                        >
                          一键装载分析
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}
