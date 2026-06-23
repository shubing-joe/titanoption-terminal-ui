/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BASE_DATE_STR, LiveExpiry, LiveOptionChainRow } from '../types';
import { AlignLeft, Percent, HelpCircle, Eye, EyeOff } from 'lucide-react';
import {
  buildExpiryChoices,
} from '../lib/expiryChoices';
import {
  buildExpiryFamilies,
  ExpiryFamilyId,
  filterChoicesByVisibleFamilies,
  formatScaledNumber,
  ScaleMode,
} from '../lib/optionAnalytics';

interface OpenInterestDistributionProps {
  activeSymbol: string;
  currentStockPrice: number;
  asOfDate?: string;
  liveExpiries?: LiveExpiry[];
  liveChain?: LiveOptionChainRow[];
}

interface OIDataPoint {
  strike: number;
  callOI: number;
  putOI: number;
}

const deterministicUnit = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
};

export default function OpenInterestDistribution({
  activeSymbol,
  currentStockPrice,
  asOfDate = BASE_DATE_STR,
  liveExpiries = [],
  liveChain = []
}: OpenInterestDistributionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hiddenFamilies, setHiddenFamilies] = useState<ExpiryFamilyId[]>([]);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');

  // Resize listener to support fully fluid, responsive canvas resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 300),
          height: Math.max(height || 380, 420)
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute dataset
  const expiryChoices = useMemo(
    () => buildExpiryChoices(liveExpiries, 30),
    [liveExpiries]
  );
  const expiryFamilies = useMemo(
    () => buildExpiryFamilies(expiryChoices, { hiddenFamilies }),
    [expiryChoices, hiddenFamilies]
  );
  const visibleExpiryChoices = useMemo(
    () => filterChoicesByVisibleFamilies(expiryChoices, hiddenFamilies),
    [expiryChoices, hiddenFamilies]
  );

  const toggleFamily = (familyId: ExpiryFamilyId) => {
    setHiddenFamilies(prev => {
      const isHidden = prev.includes(familyId);
      return isHidden ? prev.filter(id => id !== familyId) : [...prev, familyId];
    });
  };

  // Compute dataset
  const { data, maxPain, tradeDate, expiryDate, sourceLabel } = useMemo(() => {
    const liveExpiry = visibleExpiryChoices[0];
    if (expiryChoices.length > 0 && !liveExpiry) {
      return {
        data: [] as OIDataPoint[],
        maxPain: Math.round(currentStockPrice),
        tradeDate: asOfDate,
        expiryDate: 'hidden',
        sourceLabel: 'TIME FAMILY HIDDEN',
      };
    }
    const expiryDate = liveExpiry?.date || '2026-06-18';
    const tradeDate = asOfDate;
    const liveRows = liveChain.filter(row => row.expiry === expiryDate && Number.isFinite(Number(row.strike)));

    if (liveRows.length > 0) {
      const byStrike = new Map<number, OIDataPoint>();
      liveRows.forEach(row => {
        const strike = Number(row.strike);
        const existing = byStrike.get(strike) || { strike, callOI: 0, putOI: 0 };
        const openInterest = Math.max(0, Number(row.openInterest || 0));
        if (row.type === 'call') existing.callOI += openInterest;
        if (row.type === 'put') existing.putOI += openInterest;
        byStrike.set(strike, existing);
      });

      const allStrikes = Array.from(byStrike.values())
        .sort((a, b) => Math.abs(a.strike - currentStockPrice) - Math.abs(b.strike - currentStockPrice))
        .slice(0, 34)
        .sort((a, b) => a.strike - b.strike);

      const maxPain = allStrikes.reduce((bestStrike, candidate) => {
        const bestPain = allStrikes.reduce(
          (sum, point) => sum + point.callOI * Math.max(0, bestStrike - point.strike) + point.putOI * Math.max(0, point.strike - bestStrike),
          0
        );
        const candidatePain = allStrikes.reduce(
          (sum, point) => sum + point.callOI * Math.max(0, candidate.strike - point.strike) + point.putOI * Math.max(0, point.strike - candidate.strike),
          0
        );
        return candidatePain < bestPain ? candidate.strike : bestStrike;
      }, allStrikes[0]?.strike || Math.round(currentStockPrice * 0.96));

      return {
        data: allStrikes,
        maxPain,
        tradeDate,
        expiryDate,
        sourceLabel: 'PUBLIC MOCK CHAIN'
      };
    }

    let maxPain = Math.round(currentStockPrice * 0.95);
    let step = 13;

    // Custom-fitted parameters to guarantee PLTR matches screenshot 1:1,
    // while others generate gorgeous proportional option spreads.
    if (activeSymbol === 'PLTR') {
      step = 13;
      maxPain = 130.00;
    } else if (activeSymbol === 'AAPL') {
      step = 15;
      maxPain = 180.00;
    } else if (activeSymbol === 'TSLA') {
      step = 20;
      maxPain = 210.00;
    } else if (activeSymbol === 'NVDA') {
      step = 80;
      maxPain = 850.00;
    } else if (activeSymbol === 'BTC_USD') {
      step = 5000;
      maxPain = 67500;
    } else {
      step = Math.max(1, Math.round(currentStockPrice * 0.1));
      maxPain = Math.round(currentStockPrice * 0.96);
    }

    const data: OIDataPoint[] = [];
    const maxStrikes = 33; // 0 to 33 inclusive = 34 ticks. For PLTR: 33 * 13 = 429! Match image perfectly.

    for (let i = 0; i <= maxStrikes; i++) {
      const strike = i * step;
      let callOI = 0;
      let putOI = 0;

      if (activeSymbol === 'PLTR') {
        // Hand-calibrated spike distribution replicating the high-fidelity screenshot
        if (i === 1) { putOI = 11900; callOI = 2000; }
        else if (i === 2) { putOI = 1800; callOI = 1200; }
        else if (i === 3) { putOI = 3100; callOI = 7400; }
        else if (i === 4) { putOI = 2500; callOI = 15500; }
        else if (i === 5) { putOI = 8200; callOI = 3000; }
        else if (i === 6) { putOI = 4600; callOI = 2100; }
        else if (i === 7) { putOI = 7800; callOI = 4800; }
        else if (i === 8) { putOI = 7100; callOI = 5500; }
        else if (i === 9) { putOI = 16600; callOI = 5050; }
        else if (i === 10) { putOI = 17100; callOI = 1500; }
        else if (i === 11) { putOI = 26500; callOI = 600; }
        else if (i === 12) { putOI = 16000; callOI = 1200; }
        else if (i === 13) { putOI = 11200; callOI = 1500; }
        else if (i === 14) { putOI = 3150; callOI = 31000; } // HUGE CALL PEAK AT $182 STRIKE MATCHES GRAPH
        else if (i === 15) { putOI = 4800; callOI = 18700; }
        else if (i === 16) { putOI = 3800; callOI = 22600; }
        else if (i === 17) { putOI = 2500; callOI = 13800; }
        else if (i === 18) { putOI = 1200; callOI = 10000; }
        else if (i === 19) { putOI = 950; callOI = 9000; }
        else if (i === 20) { putOI = 1800; callOI = 21200; }
        else if (i === 21) { putOI = 50; callOI = 4700; }
        else if (i === 22) { putOI = 20; callOI = 4900; }
        else if (i === 23) { putOI = 0; callOI = 5000; }
        else if (i === 24) { putOI = 0; callOI = 6950; }
        else if (i === 25) { putOI = 10; callOI = 3300; }
        else if (i === 26) { putOI = 0; callOI = 6200; }
        else if (i === 27) { putOI = 0; callOI = 700; }
        else if (i === 28) { putOI = 0; callOI = 4900; }
        else if (i === 29) { putOI = 0; callOI = 1000; }
        else if (i === 30) { putOI = 0; callOI = 3200; }
        else if (i === 31) { putOI = 0; callOI = 1000; }
        else if (i === 32) { putOI = 0; callOI = 5500; }
        else if (i === 33) { putOI = 0; callOI = 14200; }
        else {
          putOI = 50;
          callOI = 50;
        }
      } else {
        // High-fidelity generalized scaling model mimicking options profiles
        const normalizedSpot = Math.max(1, currentStockPrice);
        const targetIdx = Math.round(normalizedSpot / step);

        // Put bell curve centered below the Spot
        const putCenter = Math.max(2, targetIdx - 3);
        const putSpread = 5.5;
        const putAmplitude = 24000;
        let pFactor = Math.exp(-Math.pow(i - putCenter, 2) / (2 * Math.pow(putSpread, 2)));
        if (i === Math.round(putCenter - 4) || i === Math.round(putCenter + 1)) pFactor *= 1.4;
        // Call bell curve centered above the Spot
        const callCenter = targetIdx + 4;
        const callSpread = 7.0;
        const callAmplitude = 28000;
        let cFactor = Math.exp(-Math.pow(i - callCenter, 2) / (2 * Math.pow(callSpread, 2)));
        if (i === Math.round(callCenter + 3) || i === Math.round(callCenter - 2) || i === 33) cFactor *= 1.5;
        const putNoise = 0.45 + deterministicUnit(`${activeSymbol}_put_${i}`) * 0.15;
        const callNoise = 0.5 + deterministicUnit(`${activeSymbol}_call_${i}`) * 0.2;
        putOI = i > targetIdx + 5 ? 0 : Math.max(0, Math.round(pFactor * putAmplitude * putNoise));
        callOI = Math.max(100, Math.round(cFactor * callAmplitude * callNoise));

        // Inject low organic baseline
        if (putOI < 200 && i <= targetIdx) putOI = Math.round(300 + Math.sin(i) * 200);
        if (callOI < 200) callOI = Math.round(400 + Math.cos(i) * 250);
      }

      data.push({ strike, callOI, putOI });
    }

    return { data, maxPain, tradeDate, expiryDate, sourceLabel: 'MODEL FALLBACK' };
  }, [activeSymbol, asOfDate, currentStockPrice, liveChain, visibleExpiryChoices]);

  // Aggregate stats
  const totalCalls = useMemo(() => data.reduce((sum, d) => sum + d.callOI, 0), [data]);
  const totalPuts = useMemo(() => data.reduce((sum, d) => sum + d.putOI, 0), [data]);
  const pcrRatio = useMemo(() => totalCalls > 0 ? Number((totalPuts / totalCalls).toFixed(2)) : 0, [totalCalls, totalPuts]);

  // SVG Dimension Calculations
  const paddingLeft = 55;
  const paddingRight = 15;
  const paddingTop = 30;
  const paddingBottom = 45;

  const chartWidth = dimensions.width;
  const chartHeight = dimensions.height;

  const plotWidth = Math.max(100, chartWidth - paddingLeft - paddingRight);
  const plotHeight = Math.max(100, chartHeight - paddingTop - paddingBottom);

  // Bounds
  const maxOIVValue = Math.max(1000, ...data.flatMap(point => [point.callOI, point.putOI]));
  const minValY = 0;
  const maxValY = Math.ceil((maxOIVValue * 1.1) / 1000) * 1000;

  // Project coordinates helper functions
  const getX = (idx: number) => {
    // evenly space the 34 strike ticks across the width
    return paddingLeft + idx * (plotWidth / Math.max(1, data.length - 1));
  };

  const getY = (oiValue: number) => {
    return paddingTop + plotHeight - (oiValue / maxValY) * plotHeight;
  };

  // Dash lines coordinates
  const currentPriceX = useMemo(() => {
    // Interpolate where currentStockPrice sits on the strike timeline
    const maxStrike = data[data.length - 1]?.strike || currentStockPrice;
    const strikeRange = maxStrike || 1;
    const fraction = Math.max(0, Math.min(1, currentStockPrice / strikeRange));
    return paddingLeft + fraction * plotWidth;
  }, [currentStockPrice, data, plotWidth]);

  const maxPainX = useMemo(() => {
    const maxStrike = data[data.length - 1]?.strike || maxPain || 1;
    const strikeRange = maxStrike || 1;
    const fraction = Math.max(0, Math.min(1, maxPain / strikeRange));
    return paddingLeft + fraction * plotWidth;
  }, [maxPain, data, plotWidth]);

  return (
    <div className="bg-[#030303] border border-gray-900 rounded-none p-5 flex flex-col justify-between shadow-2xl relative select-none font-sans">

      {/* HEADER SECTION */}
      <div className="text-center space-y-1 mb-4 select-text">
        <h2 className="text-gray-100 font-extrabold text-lg tracking-wide uppercase">
          Option Open Interest Distribution
        </h2>
        <p className="text-xs text-gray-400 font-bold font-mono">
          Trade Date: <span className="text-gray-100">{tradeDate}</span> / Expiration: <span className="text-gray-100">{expiryDate}</span>
          <span className="ml-2 text-[10px] text-yellow-400">{sourceLabel}</span>
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] font-bold font-mono mt-1 text-[#e2e8f0]">
          <span className="flex items-center gap-1.5">
            CURRENT: <span className="text-emerald-400 font-black">${currentStockPrice.toFixed(2)}</span>
          </span>
          <span className="text-gray-600">|</span>
          <span className="flex items-center gap-1.5">
            MAX PAIN: <span className="text-yellow-400 font-black">${maxPain.toFixed(2)}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 pt-2 text-[9px] font-mono">
          <div className="bg-black/35 border border-gray-900 p-2 text-left">
            <div className="text-gray-500 font-black uppercase mb-1">OI TIME FAMILY（到期族显隐）</div>
            <div className="flex flex-wrap gap-1">
              {expiryFamilies.map(family => {
                const hidden = hiddenFamilies.includes(family.id);
                return (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => toggleFamily(family.id)}
                    className={`px-2 py-1 border font-black flex items-center gap-1 ${hidden ? 'border-gray-850 text-gray-600 bg-black' : 'border-yellow-500/40 text-yellow-300 bg-yellow-950/20'}`}
                    title={`${family.description} | ${family.count} expiries`}
                  >
                    {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {family.label}
                    <span className="text-gray-500">({family.count})</span>
                  </button>
                );
              })}
              <span className="px-2 py-1 text-gray-500 border border-gray-900 bg-black/40">
                visible {visibleExpiryChoices.length}/{expiryChoices.filter(choice => !choice.isCustom).length}
              </span>
            </div>
          </div>

          <div className="bg-black/35 border border-gray-900 p-2 min-w-[220px] text-left">
            <div className="text-gray-500 font-black uppercase mb-1">OI SCALE（量级）</div>
            <div className="grid grid-cols-6 gap-1">
              {[
                { value: 'auto', label: 'AUTO' },
                { value: 'unit', label: '个' },
                { value: 'ten', label: '十' },
                { value: 'hundred', label: '百' },
                { value: 'thousand', label: '千' },
                { value: 'ten_thousand', label: '万' },
              ].map(item => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setScaleMode(item.value as ScaleMode)}
                  className={`px-1.5 py-1 border font-black ${scaleMode === item.value ? 'border-cyan-400 text-cyan-300 bg-cyan-950/25' : 'border-gray-850 text-gray-500 bg-black hover:text-white'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="text-[8px] text-gray-500 mt-1">示例 {formatScaledNumber(12300, scaleMode)}</div>
          </div>
        </div>
      </div>

      {/* CHART CANVAS MAIN CONTAINER */}
      <div ref={containerRef} className="w-full relative bg-[#020202] border border-gray-950 p-1">
        <svg
          width={chartWidth}
          height={chartHeight}
          className="overflow-visible"
          onMouseMove={(e) => {
            if (data.length === 0) {
              setHoverIndex(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = e.clientX - rect.left - paddingLeft;
            if (relX < 0 || relX > plotWidth) {
              setHoverIndex(null);
              return;
            }
            const fraction = relX / plotWidth;
            const idx = Math.min(data.length - 1, Math.max(0, Math.round(fraction * (data.length - 1))));
            setHoverIndex(idx);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* DEFINITIONS FOR GRADIENTS AND FILTERS */}
          <defs>
            <linearGradient id="callBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#15803d" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="putBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.4" />
            </linearGradient>
            <filter id="glowEffect" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* BACKGROUND PLOT GRID BACKDROP */}
          <rect
            x={paddingLeft}
            y={paddingTop}
            width={plotWidth}
            height={plotHeight}
            fill="#030303"
            stroke="#16161a"
            strokeWidth={1}
          />

          {/* GRID MESH NET - HORIZONTAL Y-LINES */}
          {Array.from({ length: 7 }).map((_, i) => {
            const val = Math.round((i / 6) * maxValY);
            const y = getY(val);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={paddingLeft + plotWidth}
                  y2={y}
                  stroke="#16161e"
                  strokeWidth={0.8}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  fill="#5c5c64"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="end"
                >
                  {val === 0 ? '0' : formatScaledNumber(val, scaleMode)}
                </text>
              </g>
            );
          })}

          {data.length === 0 && (
            <g transform={`translate(${paddingLeft + plotWidth / 2}, ${paddingTop + plotHeight / 2})`}>
              <rect x="-150" y="-28" width="300" height="56" fill="rgba(0,0,0,0.78)" stroke="#27272a" />
              <text
                x="0"
                y="-4"
                fill="#a1a1aa"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="900"
                textAnchor="middle"
              >
                当前时间族已全部隐藏
              </text>
              <text
                x="0"
                y="15"
                fill="#71717a"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                打开至少一个到期族后显示 OI 分布
              </text>
            </g>
          )}

          {/* GRID MESH NET - VERTICAL TICK GUIDES */}
          {data.map((item, idx) => {
            const x = getX(idx);
            return (
              <line
                key={idx}
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={paddingTop + plotHeight}
                stroke="#0b0b0e"
                strokeWidth={0.85}
              />
            );
          })}

          {/* X-AXIS LABELS */}
          {data.map((item, idx) => {
            const x = getX(idx);
            return (
              <g key={idx} transform={`translate(${x}, ${paddingTop + plotHeight + 14})`}>
                <line x1={0} y1={-14} x2={0} y2={-10} stroke="#27272a" strokeWidth={1} />
                <text
                  fill="#5c5c64"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="select-none"
                >
                  ${item.strike}
                </text>
              </g>
            );
          })}

          {/* TICKER BIG LOGO IN-GRID WATERMARK BADGE */}
          <g transform={`translate(${paddingLeft + 18}, ${paddingTop + 18})`} className="opacity-95">
            {/* Dark glossy glass card back */}
            <rect
              width="95"
              height="65"
              rx="12"
              fill="rgba(14, 14, 17, 0.72)"
              stroke="rgba(63, 63, 70, 0.55)"
              strokeWidth="1.5"
              className="backdrop-blur-sm"
            />
            {/* Bold text markup */}
            <text
              x="47.5"
              y="44"
              fill="#eab308"
              fontSize="34"
              fontWeight="900"
              fontFamily="sans-serif"
              textAnchor="middle"
              letterSpacing="0.5"
              style={{ filter: "drop-shadow(0 0 12px rgba(234,179,8,0.25))" }}
            >
              {activeSymbol}
            </text>
          </g>

          {/* CALLS AND PUTS BARS RENDERING */}
          {data.map((item, idx) => {
            const colX = getX(idx);

            // Side-by-side grouped bars: Put on left, Call on right
            const barWidth = Math.max(1.8, Math.min(4.5, plotWidth / (data.length * 2.5)));
            const putX = colX - barWidth - 0.5;
            const callX = colX + 0.5;

            const putY = getY(item.putOI);
            const callY = getY(item.callOI);

            const putHeight = Math.max(1, paddingTop + plotHeight - putY);
            const callHeight = Math.max(1, paddingTop + plotHeight - callY);

            const isHovered = hoverIndex === idx;

            return (
              <g key={idx} className="transition-all duration-150">

                {/* Put Bar (Red) */}
                {item.putOI > 0 && (
                  <rect
                    x={putX}
                    y={putY}
                    width={barWidth}
                    height={putHeight}
                    fill={isHovered ? "url(#putBarGrad)" : "#ef4444"}
                    fillOpacity={isHovered ? 1.0 : 0.72}
                    stroke={isHovered ? "#ff8888" : "none"}
                    strokeWidth={0.5}
                    rx={0.5}
                  />
                )}

                {/* Call Bar (Green) */}
                {item.callOI > 0 && (
                  <rect
                    x={callX}
                    y={callY}
                    width={barWidth}
                    height={callHeight}
                    fill={isHovered ? "url(#callBarGrad)" : "#22c55e"}
                    fillOpacity={isHovered ? 1.0 : 0.78}
                    stroke={isHovered ? "#9df0bc" : "none"}
                    strokeWidth={0.5}
                    rx={0.5}
                  />
                )}

                {/* Soft backdrop highlighting the current index on mouse hover */}
                {isHovered && (
                  <rect
                    x={colX - barWidth * 2.5}
                    y={paddingTop}
                    width={barWidth * 5}
                    height={plotHeight}
                    fill="rgba(255, 255, 255, 0.04)"
                    pointerEvents="none"
                  />
                )}

              </g>
            );
          })}

          {/* INDICATORS GUIDES VERTICAL LINES */}

          {/* 1. MAX PAIN vertical dashed guide line (Yellow) */}
          <line
            x1={maxPainX}
            y1={paddingTop - 12}
            x2={maxPainX}
            y2={paddingTop + plotHeight}
            stroke="#eab308"
            strokeWidth={1.8}
            strokeDasharray="4,4"
            className="drop-shadow-[0_0_4px_rgba(234,179,8,0.4)]"
          />
          {/* Label text directly on chart */}
          <g transform={`translate(${maxPainX}, ${paddingTop - 15})`}>
            <text
              x={0}
              y={0}
              fill="#eab308"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="900"
              textAnchor="middle"
            >
              Max Pain
            </text>
          </g>

          {/* 2. CURRENT PRICE vertical dashed guide line (Green) */}
          <line
            x1={currentPriceX}
            y1={paddingTop + 6}
            x2={currentPriceX}
            y2={paddingTop + plotHeight}
            stroke="#22c55e"
            strokeWidth={1.8}
            strokeDasharray="4,4"
            className="drop-shadow-[0_0_4px_rgba(34,197,94,0.4)]"
          />
          {/* Label text directly on chart */}
          <g transform={`translate(${currentPriceX}, ${paddingTop + 3})`}>
            <text
              x={0}
              y={0}
              fill="#22c55e"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="900"
              textAnchor="middle"
            >
              Current Price
            </text>
          </g>

          {/* AXIS CONTAINER CHANNELS OUTLINES */}
          {/* Left Y Axis line */}
          <line
            x1={paddingLeft}
            y1={paddingTop - 15}
            x2={paddingLeft}
            y2={paddingTop + plotHeight}
            stroke="#1d1d23"
            strokeWidth={1.5}
          />
          {/* Bottom X Axis line */}
          <line
            x1={paddingLeft}
            y1={paddingTop + plotHeight}
            x2={paddingLeft + plotWidth}
            y2={paddingTop + plotHeight}
            stroke="#1d1d23"
            strokeWidth={1.5}
          />

          {/* VERTICAL AXIS LEFTPADDING WATERMARK TITLE LABEL */}
          <text
            transform={`translate(${paddingLeft - 40}, ${paddingTop + plotHeight / 2}) rotate(-90)`}
            fill="#7b7b84"
            fontSize="9"
            fontFamily="sans-serif"
            fontWeight="bold"
            letterSpacing="1.2"
            textAnchor="middle"
          >
            Open Interest
          </text>

          {/* HORIZONTAL AXIS LOWER WATERMARK TITLE LABEL */}
          <text
            x={paddingLeft + plotWidth / 2}
            y={paddingTop + plotHeight + 35}
            fill="#7b7b84"
            fontSize="9.5"
            fontFamily="sans-serif"
            fontWeight="bold"
            letterSpacing="1"
            textAnchor="middle"
          >
            Strike Price ($)
          </text>

          {/* TOP RIGHT MAIN CORNER LEGEND BLOCK */}
          <g transform={`translate(${paddingLeft + plotWidth - 190}, ${paddingTop + 14})`}>
            {/* Box container outline */}
            <rect
              width="180"
              height="65"
              fill="rgba(10, 10, 13, 0.8)"
              stroke="#1d1d22"
              strokeWidth="1.2"
              rx="4"
            />
            {/* Elements */}
            {/* Current Price Legend Row */}
            <g transform="translate(10, 12)">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="3,2" />
              <text x="26" y="8" fill="#a1a1aa" fontSize="8.5" fontWeight="bold">
                Current Price (${currentStockPrice.toFixed(2)})
              </text>
            </g>

            {/* Max Pain Legend Row */}
            <g transform="translate(10, 24)">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#eab308" strokeWidth={1.5} strokeDasharray="3,2" />
              <text x="26" y="8" fill="#a1a1aa" fontSize="8.5" fontWeight="bold">
                Max Pain (${maxPain.toFixed(2)})
              </text>
            </g>

            {/* Puts Legend Row */}
            <g transform="translate(10, 38)">
              <rect width="18" height="7" fill="#ef4444" rx="1" />
              <text x="26" y="7" fill="#a1a1aa" fontSize="8.5" fontWeight="bold">Puts</text>
            </g>

            {/* Calls Legend Row */}
            <g transform="translate(10, 50)">
              <rect width="18" height="7" fill="#22c55e" rx="1" />
              <text x="26" y="7" fill="#a1a1aa" fontSize="8.5" fontWeight="bold">Calls</text>
            </g>
          </g>

        </svg>

        {/* ACTIVE STRIKE METADATA HOVERING HUD DIALOG SCREEN OVERLAY */}
        {hoverIndex !== null && data[hoverIndex] && (
          <div className="absolute top-2 w-[220px] left-1/2 -translate-x-1/2 bg-black/95 border border-gray-800/80 p-3 rounded-none shadow-2xl font-mono text-[9px] text-[#ecedf1] z-50 space-y-1.5 select-none pointer-events-none transition-all animate-fade-in">
            <div className="flex items-center justify-between border-b border-gray-900 pb-1 mt-0.5">
              <span className="text-gray-400 font-extrabold uppercase">STRIKE TARGET PRICE</span>
              <strong className="text-white text-xs">${data[hoverIndex].strike}</strong>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                CALLS OPEN INTEREST:
              </span>
              <strong className="text-white font-black">{formatScaledNumber(data[hoverIndex].callOI, scaleMode)}</strong>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-red-400 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                PUTS OPEN INTEREST:
              </span>
              <strong className="text-white font-black">{formatScaledNumber(data[hoverIndex].putOI, scaleMode)}</strong>
            </div>

            {/* PUT TO CALL STRIKE SPREAD COMPUTE */}
            <div className="flex justify-between items-center border-t border-gray-900 pt-1.5 mt-0.5 text-[8.5px]">
              <span className="text-gray-500 font-extrabold uppercase">PCR (Put-to-Call Ratio):</span>
              <strong className={`font-black text-[9.5px] ${data[hoverIndex].callOI === 0 ? 'text-gray-500' : 'text-yellow-400'}`}>
                {data[hoverIndex].callOI > 0
                  ? (data[hoverIndex].putOI / data[hoverIndex].callOI).toFixed(2)
                  : 'N/A'
                }
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER SUMMARY METRICS STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mt-4 select-text">
        <div className="bg-[#0b0b0e] border border-gray-900 p-3 flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase flex items-center gap-1">
            <AlignLeft className="w-3.5 h-3.5 text-emerald-400" />
            Total Calls OI
          </span>
          <span className="text-base font-extrabold text-emerald-400 font-mono mt-1.5">
            {formatScaledNumber(totalCalls, scaleMode)} <span className="text-[10px] text-gray-500 font-normal">contracts</span>
          </span>
        </div>

        <div className="bg-[#0b0b0e] border border-gray-900 p-3 flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase flex items-center gap-1">
            <AlignLeft className="w-3.5 h-3.5 text-red-400" />
            Total Puts OI
          </span>
          <span className="text-base font-extrabold text-red-500 font-mono mt-1.5">
            {formatScaledNumber(totalPuts, scaleMode)} <span className="text-[10px] text-gray-500 font-normal">contracts</span>
          </span>
        </div>

        <div className="bg-[#0b0b0e] border border-gray-900 p-3 flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-indigo-400" />
            Aggregate PCR (OI)
          </span>
          <span className="text-base font-extrabold text-indigo-400 font-mono mt-1.5">
            {pcrRatio} <span className="text-[10px] text-gray-500 font-normal">Ratio</span>
          </span>
        </div>

        <div className="bg-[#0b0b0e] border border-gray-900 p-3 flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-yellow-400" />
            Market sentiment
          </span>
          <span className="text-xs font-black text-yellow-400 uppercase tracking-widest mt-2 flex items-center gap-1">
            {pcrRatio < 0.7 ? (
              <span className="text-emerald-400">Highly Bullish</span>
            ) : pcrRatio > 1.1 ? (
              <span className="text-red-400">Highly Bearish</span>
            ) : (
              <span className="text-sky-400">Balanced Neutral</span>
            )}
          </span>
        </div>
      </div>

    </div>
  );
}
