/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { OptionLeg } from '../types';
import { analyzeStrategy, calculateLegPayoff, calculateLegValueAndPnL } from '../lib/optionsMath';
import { summarizePayoffBoundaries } from '../lib/optionAnalytics';
import { buildTwoDChartScale, resolveLegScenarioDays } from '../lib/twoDChartScale';
import { MousePointer, Scale, Award, Info, Sparkles } from 'lucide-react';

interface TwoDChartProps {
  legs: OptionLeg[];
  currentStockPrice: number;
  daysToExpiry: number;
  r: number;
}

export default function TwoDChart({ legs, currentStockPrice, daysToExpiry, r }: TwoDChartProps) {
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 420 });

  // Local Price zoom (percentage span from center spot)
  const [xZoomPercent, setXZoomPercent] = useState<number>(30); // 10% (tight zoom) to 60% (wide view)
  const [chartFontSize, setChartFontSize] = useState<number>(13); // 13px minimum chart text scaling
  const [showIndividualLegs, setShowIndividualLegs] = useState<boolean>(true);
  const [showDecayFamily, setShowDecayFamily] = useState<boolean>(true);
  const [showBoundaryMarkers, setShowBoundaryMarkers] = useState<boolean>(true);

  // Hover target coordinates
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [targetStockPrice, setTargetStockPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!chartAreaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 300),
          height: Math.max(height || 360, 360)
        });
      }
    });
    observer.observe(chartAreaRef.current);
    return () => observer.disconnect();
  }, []);

  // Generate intermediate non-linear theta temporal decay curves
  const decayTimelines: { days: number; color: string; label: string; isDash: boolean }[] = [];
  if (daysToExpiry > 1) {
    // Today's curve
    decayTimelines.push({ days: daysToExpiry, color: '#00e5ff', label: `T-${daysToExpiry.toFixed(0)}天 (今天)`, isDash: false });

    // Intermediate 1 (e.g., 50% time left)
    const midDays1 = Math.round(daysToExpiry * 0.5);
    if (midDays1 > 1 && midDays1 < daysToExpiry) {
      decayTimelines.push({ days: midDays1, color: '#a855f7', label: `T-${midDays1}天 (中期溢价)`, isDash: true });
    }

    // Intermediate 2 (e.g., 15% time left)
    const midDays2 = Math.round(daysToExpiry * 0.15);
    if (midDays2 > 0 && midDays2 < midDays1) {
      decayTimelines.push({ days: midDays2, color: '#f59e0b', label: `T-${midDays2}天 (临期衰减)`, isDash: true });
    }
  } else {
    // Under 1 day
    decayTimelines.push({ days: daysToExpiry, color: '#00e5ff', label: `今天 (T-${daysToExpiry.toFixed(1)}天)`, isDash: false });
  }
  // Expiry curve
  decayTimelines.push({ days: 0.001, color: '#00ff33', label: '到期盈亏线 (Expiry)', isDash: false });
  const visibleDecayTimelines = showDecayFamily
    ? decayTimelines
    : decayTimelines.filter((timeline) => timeline.days < 0.1);
  const strategyAnalysis = analyzeStrategy(legs, currentStockPrice, daysToExpiry, r);
  const payoffBoundarySummary = summarizePayoffBoundaries({
    breakevens: strategyAnalysis.breakevens,
    maxProfit: strategyAnalysis.maxProfit,
    maxLoss: strategyAnalysis.maxLoss,
    currentStockPrice,
  });

  const samples = 200;
  const maxExpiry = Math.max(...legs.map(l => l.expiryDays), 30);
  const getLegDays = (leg: OptionLeg, targetDays: number) => {
    return resolveLegScenarioDays(leg, targetDays, maxExpiry);
  };
  const chartScale = buildTwoDChartScale({
    legs,
    currentStockPrice,
    daysToExpiry,
    r,
    xZoomPercent,
    samples,
    includeIndividualLegs: showIndividualLegs,
    visibleDecayDays: visibleDecayTimelines.map((timeline) => timeline.days),
  });
  const { xMin, xMax, xRange, yLower, yUpper, yRange, sampleData } = chartScale;

  // Pixel mapping helpers
  const getCanvasX = (S: number, width: number) => {
    return 70 + ((S - xMin) / xRange) * (width - 92);
  };

  const getCanvasY = (val: number, height: number) => {
    return (height - 45) - ((val - yLower) / yRange) * (height - 85);
  };

  const getStockPriceFromCanvasX = (cx: number, width: number) => {
    const rawRatio = (cx - 70) / (width - 92);
    const clampedRatio = Math.max(0, Math.min(1, rawRatio));
    return xMin + clampedRatio * xRange;
  };

  // Evaluate exact P&L at CURRENT SPOT PRICE for the time/profit dynamic list
  const currentSpotPnLForTimelines = visibleDecayTimelines.map(timeline => {
    let sumPnL = 0;
    for (const leg of legs) {
      if (timeline.days === 0.001) {
        sumPnL += calculateLegPayoff(leg, currentStockPrice);
      } else {
        const state = calculateLegValueAndPnL(leg, currentStockPrice, getLegDays(leg, timeline.days), r);
        sumPnL += state.pnl;
      }
    }
    return { ...timeline, pnl: sumPnL };
  });

  const expiryLossSamples = sampleData.filter(pt => pt.expiryPnL < 0);
  const lossAreaRatio = sampleData.length > 0 ? expiryLossSamples.length / sampleData.length : 0;
  const lossAreaLabel = expiryLossSamples.length > 0
    ? `${(lossAreaRatio * 100).toFixed(1)}% LOSS AREA · $${expiryLossSamples[0].S.toFixed(1)}-$${expiryLossSamples[expiryLossSamples.length - 1].S.toFixed(1)}`
    : '0.0% LOSS AREA';

  // Re-render chart on data or viewport resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retain sharp displays on high DPR settings
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const { width, height } = dimensions;

    // Clear and background fill
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (legs.length === 0) {
      ctx.fillStyle = '#ff9f1c'; // terminal amber
      ctx.font = `${chartFontSize + 1}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('请先加载期权预设或添加多腿仓位以渲染 2D 预测曲线', width / 2, height / 2);
      return;
    }

    // Grid System: Y-axis label lines
    ctx.strokeStyle = 'rgba(255, 159, 28, 0.05)';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = 'rgba(255, 159, 28, 0.8)'; // Bloomberg Terminal Amber
    ctx.font = `${chartFontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';

    const yTicks = 6;
    for (let k = 0; k <= yTicks; k++) {
      const val = yLower + (k / yTicks) * yRange;
      const cy = getCanvasY(val, height);

      ctx.beginPath();
      ctx.moveTo(70, cy);
      ctx.lineTo(width - 22, cy);
      ctx.stroke();

      const prefix = val > 0 ? '+' : '';
      ctx.fillText(`${prefix}$${Math.round(val)}`, 60, cy + 3.5);
    }

    // Horizontal Zero PnL Reference line
    const y0 = getCanvasY(0, height);
    ctx.beginPath();
    ctx.moveTo(70, y0);
    ctx.lineTo(width - 22, y0);
    ctx.strokeStyle = 'rgba(255, 159, 28, 0.35)'; // Amber zero-baseline
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineWidth = 1;

    // Grid System: X-axis label lines (price guidelines)
    ctx.textAlign = 'center';
    const xTicks = 8;
    for (let k = 0; k <= xTicks; k++) {
      const price = xMin + (k / xTicks) * xRange;
      const cx = getCanvasX(price, width);

      ctx.beginPath();
      ctx.moveTo(cx, 35);
      ctx.lineTo(cx, height - 45);
      ctx.strokeStyle = 'rgba(255, 159, 28, 0.05)';
      ctx.stroke();

      ctx.fillText(`$${price.toFixed(1)}`, cx, height - 28);
    }

    // Individual option leg payoff profiles (thin styled lines)
    if (showIndividualLegs) {
      legs.forEach((leg, idx) => {
        ctx.beginPath();
        sampleData.forEach((pt, i) => {
          const payoff = pt.legPnLs[idx] ?? calculateLegPayoff(leg, pt.S);
          const cx = getCanvasX(pt.S, width);
          const cy = getCanvasY(payoff, height);
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.setLineDash([2, 5]);
        const colors = ['#ec4899', '#38bdf8', '#d946ef', '#fbbf24', '#22c55e'];
        ctx.strokeStyle = colors[idx % colors.length];
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // Render ALL non-linear theta-decay family curves
    visibleDecayTimelines.forEach((timeline, timelineIndex) => {
      // Expiration path is handled solidly at the end
      if (timeline.days < 0.1) return;

      ctx.beginPath();
      sampleData.forEach((pt, i) => {
        const timelinePnL = pt.timelinePnLs[timelineIndex] ?? 0;
        const cx = getCanvasX(pt.S, width);
        const cy = getCanvasY(timelinePnL, height);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });

      if (timeline.isDash) {
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
      } else {
        ctx.lineWidth = 2.2;
      }
      ctx.strokeStyle = timeline.color;
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Strategy Payoff at Expiration: red for loss segments, green for profit segments.
    const pointsExpiry: { x: number; y: number }[] = [];
    for (let i = 0; i <= samples; i++) {
      const pt = sampleData[i];
      const cx = getCanvasX(pt.S, width);
      const cy = getCanvasY(pt.expiryPnL, height);
      pointsExpiry.push({ x: cx, y: cy });
    }

    const drawSegment = (isLoss: boolean) => {
      ctx.beginPath();
      let isDrawing = false;
      for (let i = 0; i < sampleData.length; i++) {
        const pt = sampleData[i];
        const matches = isLoss ? pt.expiryPnL < 0 : pt.expiryPnL >= 0;
        if (!matches) {
          isDrawing = false;
          continue;
        }
        const point = pointsExpiry[i];
        if (!isDrawing) {
          ctx.moveTo(point.x, point.y);
          isDrawing = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.strokeStyle = isLoss ? '#ff2d55' : '#00ff33';
      ctx.lineWidth = isLoss ? 3.4 : 3.2;
      ctx.stroke();
    };

    // Fill profit and loss payoff areas separately so loss is visually explicit.
    ctx.globalCompositeOperation = 'destination-over';
    let activeLossRegion = false;
    ctx.fillStyle = 'rgba(255, 45, 85, 0.18)';
    for (let i = 0; i < sampleData.length; i++) {
      const pt = sampleData[i];
      if (pt.expiryPnL < 0 && !activeLossRegion) {
        activeLossRegion = true;
        ctx.beginPath();
        ctx.moveTo(pointsExpiry[i].x, y0);
      }
      if (pt.expiryPnL < 0) {
        ctx.lineTo(pointsExpiry[i].x, pointsExpiry[i].y);
      }
      if ((pt.expiryPnL >= 0 || i === sampleData.length - 1) && activeLossRegion) {
        const closePoint = pointsExpiry[Math.max(0, i - 1)];
        ctx.lineTo(closePoint.x, y0);
        ctx.closePath();
        ctx.fill();
        activeLossRegion = false;
      }
    }

    ctx.beginPath();
    ctx.moveTo(getCanvasX(xMin, width), y0);
    pointsExpiry.forEach((pt, idx) => {
      if (sampleData[idx].expiryPnL >= 0) ctx.lineTo(pt.x, pt.y);
    });
    ctx.lineTo(getCanvasX(xMax, width), y0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 255, 51, 0.055)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    drawSegment(false);
    drawSegment(true);

    if (expiryLossSamples.length > 0) {
      const lossMidSample = expiryLossSamples[Math.floor(expiryLossSamples.length / 2)];
      const labelX = Math.min(width - 180, Math.max(78, getCanvasX(lossMidSample.S, width) - 55));
      const labelY = Math.min(height - 62, Math.max(50, getCanvasY(lossMidSample.expiryPnL, height) + 24));
      ctx.fillStyle = 'rgba(80, 0, 20, 0.72)';
      ctx.strokeStyle = 'rgba(255, 45, 85, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(labelX, labelY, 154, 24);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff5a7a';
      ctx.font = `bold ${Math.max(13, chartFontSize - 1)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(lossAreaLabel, labelX + 6, labelY + 16);
    }

    // Professional boundary markers: breakevens and strategy risk limits.
    if (showBoundaryMarkers) {
      payoffBoundarySummary.boundaryMarkers.forEach((marker, markerIndex) => {
        if (marker.price < xMin || marker.price > xMax) return;
        const cx = getCanvasX(marker.price, width);
        const isBreakeven = marker.kind === 'breakeven';
        ctx.beginPath();
        ctx.moveTo(cx, 35);
        ctx.lineTo(cx, height - 45);
        ctx.setLineDash(isBreakeven ? [6, 4] : []);
        ctx.strokeStyle = isBreakeven ? 'rgba(250, 204, 21, 0.82)' : 'rgba(255, 159, 28, 0.55)';
        ctx.lineWidth = isBreakeven ? 1.7 : 1.2;
        ctx.stroke();
        ctx.setLineDash([]);

        const label = isBreakeven
          ? payoffBoundarySummary.breakevenLabels[markerIndex] || marker.label
          : marker.label;
        const labelW = Math.min(190, Math.max(86, label.length * 7.2));
        const labelX = Math.min(width - labelW - 22, Math.max(74, cx - labelW / 2));
        const labelY = isBreakeven ? 42 + markerIndex * 26 : height - 72;
        ctx.fillStyle = isBreakeven ? 'rgba(80, 65, 0, 0.78)' : 'rgba(80, 40, 0, 0.65)';
        ctx.strokeStyle = isBreakeven ? 'rgba(250, 204, 21, 0.9)' : 'rgba(255, 159, 28, 0.65)';
        ctx.beginPath();
        ctx.rect(labelX, labelY, labelW, 20);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isBreakeven ? '#fde047' : '#ff9f1c';
        ctx.font = `bold ${Math.max(11, chartFontSize - 2)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, labelX + labelW / 2, labelY + 14);
      });

      const riskBoxLines = [
        payoffBoundarySummary.maxProfitLabel,
        payoffBoundarySummary.maxLossLabel,
      ];
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.strokeStyle = 'rgba(255, 159, 28, 0.55)';
      ctx.beginPath();
      ctx.rect(78, 42, 190, 46);
      ctx.fill();
      ctx.stroke();
      riskBoxLines.forEach((line, idx) => {
        ctx.fillStyle = idx === 0 ? '#00ff33' : '#ff5a7a';
        ctx.font = `bold ${Math.max(11, chartFontSize - 2)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(line, 88, 60 + idx * 18);
      });
    }

    // Strike points guidelines
    const sortedLegs = [...legs].sort((a, b) => a.strike - b.strike);
    sortedLegs.forEach((leg, index) => {
      const cx = getCanvasX(leg.strike, width);
      if (cx >= 70 && cx <= width - 22) {
        ctx.beginPath();
        ctx.moveTo(cx, 35);
        ctx.lineTo(cx, height - 45);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        const textY = 24 + (index % 3) * 10;
        if (index % 3 > 0) {
          ctx.beginPath();
          ctx.moveTo(cx, 35);
          ctx.lineTo(cx, textY - 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(13, chartFontSize - 1)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`行权 $${leg.strike}`, cx, textY);
      }
    });

    // Highlight: Current Spot Price
    const curX = getCanvasX(currentStockPrice, width);
    if (curX >= 70 && curX <= width - 22) {
      ctx.beginPath();
      ctx.moveTo(curX, 35);
      ctx.lineTo(curX, height - 45);
      ctx.strokeStyle = '#ff9f1c'; // Spot Price Amber marker
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.lineWidth = 1;

      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.arc(curX, y0, 4, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#ff9f1c';
      ctx.font = `bold ${chartFontSize}px "JetBrains Mono", monospace`;
      ctx.fillText(`现价: $${currentStockPrice.toFixed(2)}`, curX, height - 12);
    }

    // Hover Crosshair coordinate tracks
    if (hoverX !== null && hoverY !== null && targetStockPrice !== null) {
      if (hoverX >= 70 && hoverX <= width - 22) {
        ctx.beginPath();
        ctx.moveTo(hoverX, 35);
        ctx.lineTo(hoverX, height - 45);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.stroke();

        // Evaluate all timeline curve P&Ls for the hover cross
        const pnlLevels = visibleDecayTimelines.map(timeline => {
          let tPnL = 0;
          for (const leg of legs) {
            if (timeline.days === 0.001) {
              tPnL += calculateLegPayoff(leg, targetStockPrice);
            } else {
              const state = calculateLegValueAndPnL(leg, targetStockPrice, getLegDays(leg, timeline.days), r);
              tPnL += state.pnl;
            }
          }
          return { label: timeline.label, price: tPnL, color: timeline.color };
        });

        // Plot dots on curves
        pnlLevels.forEach((level) => {
          const cy = getCanvasY(level.price, height);
          ctx.beginPath();
          ctx.arc(hoverX, cy, 4, 0, 2 * Math.PI);
          ctx.fillStyle = level.color;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        });

        // Custom Callout Box detailing P&Ls across decay intervals
        ctx.fillStyle = '#0a0a0c';
        ctx.strokeStyle = '#ff9f1c';
        ctx.lineWidth = 1.25;

        const cardW = 175;
        const cardH = 34 + pnlLevels.length * 15;
        const cX = hoverX + cardW + 15 > width ? hoverX - cardW - 15 : hoverX + 15;
        const cY = Math.min(height - cardH - 15, Math.max(40, hoverY - cardH / 2));

        ctx.beginPath();
        ctx.rect(cX, cY, cardW, cardH);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 1;

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(13, chartFontSize - 1)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`估算股价: $${targetStockPrice.toFixed(2)}`, cX + 8, cY + 16);

        pnlLevels.forEach((lvl, idx) => {
          ctx.fillStyle = lvl.color;
          ctx.font = `${Math.max(13, chartFontSize - 1)}px "JetBrains Mono", monospace`;
          const prefix = lvl.price > 0 ? '+' : '';
          ctx.fillText(`${lvl.label.split(' ')[0]}: ${prefix}$${lvl.price.toFixed(1)}`, cX + 8, cY + 31 + idx * 15);
        });
      }
    }

  }, [legs, currentStockPrice, daysToExpiry, r, dimensions, hoverX, hoverY, targetStockPrice, yLower, yUpper, yRange, xMin, xMax, xRange, xZoomPercent, chartFontSize, showIndividualLegs, showDecayFamily, showBoundaryMarkers, lossAreaLabel, expiryLossSamples, payoffBoundarySummary, visibleDecayTimelines]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const currentPriceFloat = getStockPriceFromCanvasX(cx, dimensions.width);

    setHoverX(cx);
    setHoverY(cy);
    setTargetStockPrice(currentPriceFloat);
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    setHoverY(null);
    setTargetStockPrice(null);
  };

  return (
    <div id="two-d-panel" className="bg-black border-2 border-[#ff9f1c]/30 rounded-none p-4 h-full flex flex-col relative overflow-hidden">

      {/* Dynamic Header Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-gray-950 pb-3">
        <div>
          <h3 className="text-[#ff9f1c] font-black font-mono tracking-wider flex items-center gap-2 text-sm uppercase">
            <Scale className="text-[#ff9f1c] w-4.5 h-4.5" />
            &lt;G 2D PAYOFF FORECAST MATRIX&gt;
          </h3>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            DODGE OVER PRICE SPECTRUMS. NON-LINEAR THETA DECAY MILITARY PLOT.
          </p>
        </div>

        {/* Local interactive adjusters */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-gray-300">

          {/* Zoom Slider */}
          <div className="flex items-center gap-1.5 bg-[#08080a] px-2.5 py-1.5 border border-gray-805">
            <span className="text-gray-500 uppercase text-[9px] font-bold">X轴价格缩放 (Zoom):</span>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={xZoomPercent}
              onChange={(e) => setXZoomPercent(parseInt(e.target.value))}
              className="w-16 accent-[#ff9f1c] h-1 cursor-pointer bg-gray-800 rounded-none"
              title="调整横坐标股价显示区间，聚焦关键盈亏平衡点"
            />
            <span className="text-[#ff9f1c] text-[10px] font-bold">{xZoomPercent}%</span>
          </div>

          {/* Typography scale button */}
          <div className="flex items-center bg-[#08080a] border border-gray-805 text-[10px]">
            <button
              onClick={() => setChartFontSize(prev => prev === 13 ? 15 : prev === 15 ? 17 : 13)}
              className="px-2 py-1.5 hover:text-white border-r border-gray-850"
              title="调整报表/轴上的文本字号大小"
            >
              字号 Size: <strong className="text-yellow-400 font-black">{chartFontSize}px</strong>
            </button>

            <button
              onClick={() => setShowIndividualLegs(prev => !prev)}
              className={`px-2 py-1.5 hover:text-white font-bold ${showIndividualLegs ? 'text-sky-400 bg-sky-950/20' : 'text-gray-500'}`}
              title="切换是否在背景在以细虚线渲染各个期权分腿的初级盈亏"
            >
              {showIndividualLegs ? '分腿显' : '分腿隐'}
            </button>
            <button
              onClick={() => setShowDecayFamily(prev => !prev)}
              className={`px-2 py-1.5 hover:text-white font-bold border-l border-gray-850 ${showDecayFamily ? 'text-violet-300 bg-violet-950/20' : 'text-gray-500'}`}
              title="隐藏或显示 T-时间族曲线，只保留到期盈亏线时更容易读边界"
            >
              {showDecayFamily ? '时间族显' : '时间族隐'}
            </button>
            <button
              onClick={() => setShowBoundaryMarkers(prev => !prev)}
              className={`px-2 py-1.5 hover:text-white font-bold border-l border-gray-850 ${showBoundaryMarkers ? 'text-yellow-300 bg-yellow-950/15' : 'text-gray-500'}`}
              title="隐藏或显示盈亏平衡点、最大收益/风险界限"
            >
              {showBoundaryMarkers ? '界限显' : '界限隐'}
            </button>
          </div>

        </div>
      </div>

      {/* Render graph */}
      <div ref={chartAreaRef} data-chart-area="2d-payoff" className="flex-1 min-h-0 w-full relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        />

        {/* Absolute mini legend of curve maps */}
        <div className="absolute top-2 right-2 bg-black/90 border border-gray-900 text-[9.5px] font-mono text-[#ff9f1c] p-2 rounded-none space-y-1 z-1 pointer-events-auto">
          <div className="text-[8.5px] text-gray-500 font-bold border-b border-gray-950 pb-1 mb-1">
            双轴衰减时线族 (Decay Family)
          </div>
          {visibleDecayTimelines.map((timeline) => (
            <div key={timeline.days} className="flex items-center gap-1.5">
              <span
                className="w-4 h-[1.8px] inline-block"
                style={{
                  backgroundColor: timeline.color,
                  borderBottom: timeline.isDash ? '1px dashed #ffffff99' : 'none'
                }}
              />
              <span className="text-gray-300 font-semibold">{timeline.label}</span>
            </div>
          ))}
          {showBoundaryMarkers && payoffBoundarySummary.breakevenLabels.map((label) => (
            <div key={label} className="flex items-center gap-1.5 text-yellow-300">
              <span className="w-4 h-[1.8px] inline-block border-b border-dashed border-yellow-300" />
              <span className="font-semibold">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SEC: Multi-timeline Decay yield Table (时间和对应收益函数要多一点细节和对应上) */}
      <div className="mt-3.5 p-3 bg-[#0a0a0c] border border-gray-950 rounded-none font-mono text-[11px] select-none text-gray-300">
        <div className="flex items-center justify-between border-b border-gray-900 pb-1.5 mb-2">
          <div className="flex items-center gap-1 text-[#ff9f1c] font-black uppercase text-[10px]">
            <Award className="w-4 h-4 text-[#ff9f1c]" />
            时间跨度与静态预期损益映射 (Time Decay family Yield Breakdown):
          </div>
          <span className="text-[9px] text-gray-500 font-bold uppercase">
            基准标的价: ${currentStockPrice.toFixed(2)}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {currentSpotPnLForTimelines.map((timeline) => {
            const isLoss = timeline.pnl < 0;
            const textClass = isLoss ? 'text-rose-500' : timeline.pnl > 0 ? 'text-emerald-400' : 'text-gray-400';
            const flag = timeline.pnl > 0 ? '+' : '';
            return (
              <div
                key={timeline.days}
                className="p-2 border border-gray-900/80 bg-black/45 rounded-none flex flex-col justify-between"
              >
                <div className="flex items-center gap-1.5 text-gray-500 text-[10px]">
                  <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: timeline.color }} />
                  <span>{timeline.label.split(' ')[0]}</span>
                </div>
                <div className={`text-xs font-black mt-1 font-mono tracking-wide ${textClass}`}>
                  静态盈亏: {flag}${timeline.pnl.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
