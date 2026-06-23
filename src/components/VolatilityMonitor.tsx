/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BASE_DATE_STR, LiveExpiry, LiveVolSummary, LiveVolSurface } from '../types';
import { Sliders, HelpCircle, Calendar, RefreshCw, Layers, TrendingUp, Sparkles, TrendingDown, Info, ShieldCheck, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface VolatilityMonitorProps {
  currentStockPrice: number;
  daysToExpiry: number;
  r: number;
  activeSymbol: string;
  tickerIV: number;
  liveExpiries?: LiveExpiry[];
  liveVolSummary?: LiveVolSummary;
  liveVolSurface?: LiveVolSurface;
  asOfDate?: string;
}

// Simple deterministic pseudo-random key-locked random walk for rich, continuous curves
function getPRNG(seedPhrase: string) {
  let hash = 0;
  for (let i = 0; i < seedPhrase.length; i++) {
    hash = seedPhrase.charCodeAt(i) + ((hash << 5) - hash);
  }
  return function() {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };
}

export default function VolatilityMonitor({
  currentStockPrice,
  daysToExpiry,
  r,
  activeSymbol,
  tickerIV,
  liveExpiries = [],
  liveVolSummary,
  liveVolSurface,
  asOfDate = BASE_DATE_STR
}: VolatilityMonitorProps) {
  // 1. UI Navigation Filter States
  const [atmPeriod, setAtmPeriod] = useState<'ALL' | '7D' | '1M' | '3M' | '1Y'>('3M');
  const [skewPeriod, setSkewPeriod] = useState<'ALL' | '1D' | '7D' | '15D' | '1M' | '3M' | '6M' | '1Y'>('3M');
  const [rvPeriod, setRvPeriod] = useState<'ALL' | '1D' | '7D' | '15D' | '1M' | '3M' | '6M' | '1Y'>('3M');

  // Expiry snapshot hours simulation (for Volatility Term Structure)
  const [snapshotDaysOffset, setSnapshotDaysOffset] = useState<number>(0);

  // Volatility historical term toggles (cliking legend toggles display)
  const [visibleTerms, setVisibleTerms] = useState<Record<string, boolean>>({
    '1d': true,
    '1w': true,
    '1m': true,
    '2m': false,
    '3m': true,
    '6m': true,
    '1y': false,
    '7d HV': true,
  });

  // Toggling legend items
  const toggleTermVisibility = (term: string) => {
    setVisibleTerms(prev => ({
      ...prev,
      [term]: !prev[term]
    }));
  };

  // 2. Interactive Chart Hover HUD States
  const [atmHoverIdx, setAtmHoverIdx] = useState<number | null>(null);
  const [skewHoverIdx, setSkewHoverIdx] = useState<number | null>(null);
  const [rvHoverIdx, setRvHoverIdx] = useState<number | null>(null);
  const [tsHoverIdx, setTsHoverIdx] = useState<number | null>(null);

  // Refresh trigger state (to allow manual regeneration/updates)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // 3. Dynamic High-Fidelity Data Generation
  const cleanedSymbol = activeSymbol.replace('_USD', '').replace('USDT', '');

  // Calculate timelines
  const periodsCount = useMemo(() => {
    const maps = {
      '7D': 7,
      '15D': 15,
      '1M': 30,
      '3M': 92,
      '6M': 180,
      '1Y': 365,
      'ALL': 240,
      '1D': 24 // hours
    };
    return maps;
  }, []);

  const hasBackendVolSurface = Boolean(
    liveVolSurface?.termStructure?.length ||
    liveVolSurface?.atmIvHistory?.length ||
    liveVolSurface?.skewHistory?.length ||
    liveVolSurface?.realizedVolHistory?.length
  );
  const provenanceLabel = hasBackendVolSurface
    ? 'SOURCE: BACKEND VOL SURFACE'
    : 'SOURCE: FRONTEND FALLBACK MODEL';
  const provenanceDetail = hasBackendVolSurface
    ? String(liveVolSurface?.source || 'backend_calculated')
    : 'not live history';

  const normalizeSurfaceHistory = (
    rows: Array<{ date: string; terms: Record<string, number | null> }> | undefined,
    fallbackTerms: Record<string, number>,
    fallbackDate: string
  ) => {
    const normalized = (rows || [])
      .filter(row => row?.date && row.terms)
      .map(row => ({
        date: row.date,
        terms: Object.fromEntries(
          Object.entries(fallbackTerms).map(([term, fallback]) => {
            const value = row.terms?.[term];
            return [term, Number.isFinite(Number(value)) ? Number(value) : fallback];
          })
        ) as Record<string, number>
      }));
    return normalized.length > 0 ? normalized : [{ date: fallbackDate, terms: fallbackTerms }];
  };

  // ATM & RV & Skew Data. Prefer backend-calculated surface; only synthesize when backend has no surface.
  const syntheticDataset = useMemo(() => {
    const prng = getPRNG(cleanedSymbol + refreshTrigger);
    const count = 120; // 120 standard points
    const baseIV = liveVolSummary?.atmIv || tickerIV || 45;

    const scaleFactor = baseIV / 45; // scale relative to asset average
    const data: Array<{
      date: string;
      terms: Record<string, number>;
      hvs: Record<string, number>;
      skews: Record<string, number>;
      '7d HV'?: number;
    }> = [];

    const baseDates = Array.from({ length: count }).map((_, i) => {
      const d = new Date(`${asOfDate}T10:00:00Z`);
      d.setDate(d.getDate() - (count - i));
      return d.toISOString().split('T')[0];
    });

    // Start with a stable baseline and add correlated auto-regressive random walk
    let currentBaselineIV = baseIV;
    let currentBaselineSkew = 0.5; // positive skew by default

    for (let i = 0; i < count; i++) {
      // Auto-regressive walk (IV)
      const shockIV = (prng() - 0.49) * 2.2;
      currentBaselineIV = currentBaselineIV * 0.96 + (baseIV + shockIV) * 0.04;
      currentBaselineIV = Math.max(10, Math.min(130, currentBaselineIV));

      // Correlation: lower underlyings or crash yields IV spikes, skew shifts
      const shockSkew = (prng() - 0.5) * 1.5;
      currentBaselineSkew = currentBaselineSkew * 0.92 + shockSkew * 0.08;

      const termsIV: Record<string, number> = {};
      const termsHV: Record<string, number> = {};
      const termsSkew: Record<string, number> = {};

      const termsList = ['1d', '1w', '1m', '2m', '3m', '6m', '1y'];

      termsList.forEach((term, tIdx) => {
        // Different terms have slightly shifted values (term structure contango/backwardation)
        // 1d is highly volatile, 1y is sticky
        const stickiness = (tIdx + 1) / 7;
        const termSpecificOffset = (tIdx - 2.5) * 2 * scaleFactor;
        const termVolatility = (1.5 - stickiness) * 1.5;
        const termValue = currentBaselineIV + termSpecificOffset + (prng() - 0.5) * termVolatility;

        termsIV[term] = Number(Math.max(8, Math.min(140, termValue)).toFixed(2));

        // Realized volatility is smoothed and lags IV slightly (HV premium)
        const lagIndex = Math.max(0, i - 2);
        const hvMeanRatio = 0.85; // typically RV < IV
        termsHV[term] = Number(Math.max(6, Math.min(130, termValue * hvMeanRatio + Math.sin(i / 10) * 1.5)).toFixed(2));

        // Skew typically is narrower on longer maturities
        const skewScale = 1.0 - (tIdx / 10);
        const skewValue = (currentBaselineSkew * 2.5 + (tIdx - 1.5) * 0.4) * skewScale + (prng() - 0.5) * 0.3;
        termsSkew[term] = Number(Math.max(-10, Math.min(8, skewValue)).toFixed(2));
      });

      // Special line: 7d HV
      const hv7d = currentBaselineIV * 0.82 + Math.cos(i / 5) * 3 * scaleFactor + (prng() - 0.5) * 1;

      data.push({
        date: baseDates[i],
        terms: termsIV,
        hvs: termsHV,
        skews: termsSkew,
        // Include 7d HV directly
        '7d HV': Number(Math.max(5, hv7d).toFixed(2))
      });
    }

    return data;
  }, [asOfDate, cleanedSymbol, tickerIV, liveVolSummary?.atmIv, refreshTrigger]);

  const dataset = useMemo(() => {
    if (!hasBackendVolSurface) return syntheticDataset;

    const fallbackDate = new Date().toISOString().split('T')[0];
    const baseIV = Number(liveVolSummary?.atmIv || tickerIV || 45);
    const baseRV = Number(liveVolSummary?.realizedVol || baseIV * 0.82);
    const atmRows = normalizeSurfaceHistory(
      liveVolSurface?.atmIvHistory,
      { '1d': baseIV, '1w': baseIV, '1m': baseIV, '2m': baseIV, '3m': baseIV, '6m': baseIV, '1y': baseIV },
      fallbackDate
    );
    const rvRows = normalizeSurfaceHistory(
      liveVolSurface?.realizedVolHistory,
      { '1d': baseRV, '1w': baseRV, '1m': baseRV, '2m': baseRV, '3m': baseRV, '6m': baseRV, '1y': baseRV },
      fallbackDate
    );
    const skewRows = normalizeSurfaceHistory(
      liveVolSurface?.skewHistory,
      { '1d': 0, '1w': 0, '1m': 0, '2m': 0, '3m': 0, '6m': 0, '1y': 0 },
      fallbackDate
    );
    const dates = Array.from(new Set([...atmRows, ...rvRows, ...skewRows].map(row => row.date))).sort();
    const lastAtm = atmRows[atmRows.length - 1]?.terms || {};
    const lastRv = rvRows[rvRows.length - 1]?.terms || {};
    const lastSkew = skewRows[skewRows.length - 1]?.terms || {};
    const byDate = <T extends { date: string },>(rows: T[]) => new Map(rows.map(row => [row.date, row]));

    const atmByDate = byDate(atmRows);
    const rvByDate = byDate(rvRows);
    const skewByDate = byDate(skewRows);

    return dates.map(date => {
      const terms = { ...lastAtm, ...(atmByDate.get(date)?.terms || {}) };
      const hvs = { ...lastRv, ...(rvByDate.get(date)?.terms || {}) };
      const skews = { ...lastSkew, ...(skewByDate.get(date)?.terms || {}) };
      return {
        date,
        terms,
        hvs,
        skews,
        '7d HV': Number(hvs['1w'] || hvs['1d'] || baseRV),
      };
    });
  }, [hasBackendVolSurface, liveVolSurface, liveVolSummary?.atmIv, liveVolSummary?.realizedVol, tickerIV, syntheticDataset]);

  // Handle active period slicing for historical data
  const slicedATMData = useMemo(() => {
    const daysToShow = periodsCount[atmPeriod] || 90;
    return dataset.slice(-daysToShow);
  }, [dataset, atmPeriod, periodsCount]);

  const slicedSkewData = useMemo(() => {
    const daysToShow = periodsCount[skewPeriod] || 90;
    return dataset.slice(-daysToShow);
  }, [dataset, skewPeriod, periodsCount]);

  const slicedRVData = useMemo(() => {
    const daysToShow = periodsCount[rvPeriod] || 90;
    return dataset.slice(-daysToShow);
  }, [dataset, rvPeriod, periodsCount]);

  // 4. Volatility Term Structure snapshopped curve calculations
  type TermStructureSnapshotPoint = {
    expiry: string;
    days: number;
    label: string;
    atmIv: number;
    fwdIv: number;
    skew25d?: number | null;
    sampleSize?: number;
  };

  const termStructureSnapshot = useMemo<TermStructureSnapshotPoint[]>(() => {
    const backendTermStructure = (liveVolSurface?.termStructure || [])
      .filter(point => point.expiry && Number.isFinite(Number(point.days)))
      .map(point => ({
        expiry: point.expiry.replace(/^20/, '').replace(/-/g, ''),
        days: Number(point.days),
        label: `${point.expiry} (${point.days}D)`,
        atmIv: Number(point.atmIv ?? liveVolSummary?.atmIv ?? tickerIV ?? 45),
        fwdIv: Number(point.fwdIv ?? point.atmIv ?? liveVolSummary?.atmIv ?? tickerIV ?? 45),
        skew25d: point.skew25d,
        sampleSize: point.sampleSize,
      }));
    if (backendTermStructure.length > 0) {
      return backendTermStructure;
    }

    const prng = getPRNG(cleanedSymbol + '_term_' + snapshotDaysOffset + refreshTrigger);

    // Create expiries relative to today's simulated baseline (June 11, 2026)
    const liveTenors = liveExpiries.slice(0, 7).map(expiry => ({
      name: expiry.date.replace(/^20/, '').replace(/-/g, ''),
      days: expiry.days,
      label: `${expiry.days}D`
    }));
    const tenors = liveTenors.length > 0 ? liveTenors : [
      { name: '18Jun26', days: 7, label: '7D' },
      { name: '26Jun26', days: 15, label: '15D' },
      { name: '17Jul26', days: 36, label: '36D' },
      { name: '21Aug26', days: 71, label: '71D' },
      { name: '16Oct26', days: 127, label: '127D' },
      { name: '15Jan27', days: 218, label: '218D' },
      { name: '18Jun27', days: 372, label: '372D' }
    ];

    const baseIV = liveVolSummary?.atmIv || tickerIV || 45;

    // Simulate shifts based on offset (backwardation or contango)
    // Positive offset shifts curves flatter or inverted; standard offset is contango (normal)
    const curveShapeShift = Math.sin(snapshotDaysOffset / 3) * 3;
    const isContango = snapshotDaysOffset % 2 === 0;

    return tenors.map((t, idx) => {
      // ATM IV forward curve (usually contango: shorter term lower vol, long-term stabilizes)
      let atmValue = baseIV;
      if (isContango) {
        // Contango: shorter term lower, long term higher
        atmValue = baseIV * 0.85 + (idx * 2) + curveShapeShift;
      } else {
        // Inverted / backwardation structure: short term spikes, long term sticky average
        atmValue = baseIV * 1.15 - (idx * 1.5) + curveShapeShift;
      }

      // Add a slight dip for specific options maturity zone (W-shaped or V-shaped curvature)
      if (idx === 2) atmValue -= 3.5; // dip around 30-40d (very typical option signature)
      if (idx === 3) atmValue -= 1.5;

      const atmFinal = Number(Math.max(12, atmValue + (prng() - 0.5) * 1.8).toFixed(2));

      // Forward Implied Volatility (FWD IV)
      // Usually FWD standard is higher than ATM when upward, spikes during dips, and smooths out
      const fwdBias = isContango ? 1.05 : 0.95;
      const noise = (prng() - 0.5) * 2.5;
      const fwdFinal = Number(Math.max(10, atmFinal * fwdBias + (idx === 2 ? -4 : 1.2) + noise).toFixed(2));

      return {
        expiry: t.name,
        days: t.days,
        label: `${t.name} (${t.label})`,
        atmIv: atmFinal,
        fwdIv: fwdFinal,
        skew25d: null,
      };
    });
  }, [cleanedSymbol, tickerIV, liveExpiries, liveVolSummary?.atmIv, liveVolSurface?.termStructure, snapshotDaysOffset, refreshTrigger]);

  const snapDateText = useMemo(() => {
    // Starting date baseline: Oct 1, 2025 like in image (or Jun 11, 2026 based on workspace UTC)
    const base = new Date(asOfDate);
    base.setDate(base.getDate() + snapshotDaysOffset);
    const d1 = base.toISOString().split('T')[0];

    const nextDay = new Date(base);
    nextDay.setDate(nextDay.getDate() + 1);
    const d2 = nextDay.toISOString().split('T')[0];

    return `${d1} 08:00 ~ ${d2} 08:00`;
  }, [asOfDate, snapshotDaysOffset]);

  const latestTermSignal = useMemo(() => {
    const points = termStructureSnapshot.filter(point => Number.isFinite(point.atmIv));
    const first = points[0];
    const last = points[points.length - 1];
    const latestSkew = [...points].reverse().find(point => point.skew25d !== null && point.skew25d !== undefined)?.skew25d;
    const termSlope = first && last ? Number((last.atmIv - first.atmIv).toFixed(2)) : 0;
    return {
      skew25d: typeof latestSkew === 'number' ? latestSkew : null,
      termSlope,
      structureLabel: termSlope > 1 ? 'contango' : termSlope < -1 ? 'backwardation' : 'flat',
    };
  }, [termStructureSnapshot]);

  const chartYBounds = (
    data: any[],
    fields: string[],
    chartType: 'atm' | 'skew' | 'rv',
    fallbackMin: number,
    fallbackMax: number,
    pad: number
  ) => {
    const values = data.flatMap(item => fields.map(field => {
      if (field === '7d HV') return item['7d HV'];
      if (chartType === 'atm') return item.terms?.[field];
      if (chartType === 'skew') return item.skews?.[field];
      return item.hvs?.[field];
    })).filter((value): value is number => Number.isFinite(Number(value)));
    if (values.length === 0) return { yMin: fallbackMin, yMax: fallbackMax };
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const lower = Math.min(fallbackMin, minValue - pad);
    const upper = Math.max(fallbackMax, maxValue + pad);
    return {
      yMin: chartType === 'skew' ? Math.floor(lower) : Math.max(0, Math.floor(lower / 5) * 5),
      yMax: chartType === 'skew' ? Math.ceil(upper) : Math.ceil(upper / 5) * 5,
    };
  };

  const atmFields = ['1d', '1w', '1m', '3m', '6m', '7d HV'];
  const skewFields = ['1d', '1w', '1m', '3m', '6m'];
  const rvFields = ['1d', '1w', '1m', '3m', '6m'];
  const atmBounds = chartYBounds(
    slicedATMData,
    atmFields,
    'atm',
    Math.max(5, (liveVolSummary?.atmIv || tickerIV || 45) - 22),
    Math.min(150, (liveVolSummary?.atmIv || tickerIV || 45) + 25),
    4
  );
  const skewBounds = chartYBounds(slicedSkewData, skewFields, 'skew', -7, 5, 2);
  const rvBounds = chartYBounds(
    slicedRVData,
    rvFields,
    'rv',
    Math.max(5, ((liveVolSummary?.realizedVol || tickerIV * 0.72) || 35) - 20),
    Math.min(130, ((liveVolSummary?.realizedVol || tickerIV * 0.95) || 55) + 20),
    4
  );

  // 5. HELPER COLORS FOR RENDER
  const termColors: Record<string, string> = {
    '1d': '#38bdf8', // sky-400
    '1w': '#22d3ee', // cyan-400
    '1m': '#f59e0b', // amber-500
    '2m': '#a855f7', // purple-500
    '3m': '#ef4444', // red-500
    '6m': '#06b6d4', // cyan-600
    '1y': '#10b981', // emerald-500
    '7d HV': '#a21caf', // deep purple / magenta-700
  };

  // 2D SVG Line-Plotting coordinates helpers
  const renderSVGLineChart = (
    data: any[],
    fields: string[],
    yMin: number,
    yMax: number,
    chartType: 'atm' | 'skew' | 'rv',
    hoverIdx: number | null,
    setHoverIdx: (idx: number | null) => void,
    hasZeroReferenceLine = false
  ) => {
    const width = 640;
    const height = 240;
    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 35;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0;
    const yRange = yMax - yMin;

    const getX = (idx: number) => paddingLeft + idx * xStep;
    const getY = (val: number) => {
      const ratio = (val - yMin) / (yRange || 1);
      return paddingTop + plotHeight - ratio * plotHeight;
    };

    // Build SVG paths for each field
    const paths = fields.map(field => {
      // Check if visible
      if (chartType === 'atm' && field === '7d HV') {
        if (!visibleTerms['7d HV']) return null;
      } else {
        if (!visibleTerms[field]) return null;
      }

      let dStr = '';
      data.forEach((item, idx) => {
        let val = 0;
        if (field === '7d HV') {
          val = item['7d HV'];
        } else if (chartType === 'atm') {
          val = item.terms[field];
        } else if (chartType === 'skew') {
          val = item.skews[field];
        } else {
          val = item.hvs[field];
        }

        const x = getX(idx);
        const y = getY(val);
        dStr += `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      return { field, dStr };
    }).filter(p => p !== null) as Array<{ field: string; dStr: string }>;

    // Hover helper
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const relativeX = clientX - paddingLeft;

      if (relativeX < 0 || relativeX > plotWidth) {
        setHoverIdx(null);
        return;
      }

      const fraction = relativeX / plotWidth;
      const idx = Math.min(data.length - 1, Math.max(0, Math.round(fraction * Math.max(data.length - 1, 0))));
      setHoverIdx(idx);
    };

    const handleMouseLeave = () => {
      setHoverIdx(null);
    };

    // Calculate Y-axis ticks
    const yTicksCount = 5;
    const yTicks = Array.from({ length: yTicksCount }).map((_, i) => {
      const val = yMin + (i * yRange) / (yTicksCount - 1);
      return { val, y: getY(val) };
    });

    // Calculate X-axis ticks (4 simple readable date marks)
    const xTicksIndices = [
      0,
      Math.floor(Math.max(data.length - 1, 0) * 0.33),
      Math.floor(Math.max(data.length - 1, 0) * 0.66),
      data.length - 1
    ].filter((idx, index, all) => idx >= 0 && all.indexOf(idx) === index);

    return (
      <div className="relative w-full">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible select-none cursor-crosshair font-mono"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Background mesh grid */}
          <rect x={paddingLeft} y={paddingTop} width={plotWidth} height={plotHeight} fill="#020204" />

          {/* Horizontal Grid lines */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={t.y}
                x2={width - paddingRight}
                y2={t.y}
                stroke="#12121e"
                strokeWidth={1}
                strokeDasharray={idx === 0 || idx === yTicksCount - 1 ? 'none' : '2,2'}
              />
              <text
                x={paddingLeft - 8}
                y={t.y + 4}
                fill="#4b5563"
                fontSize={9}
                textAnchor="end"
              >
                {t.val.toFixed(chartType === 'skew' ? 1 : 0)}
                {chartType !== 'skew' && '%'}
              </text>
            </g>
          ))}

          {/* Zero reference line for skew */}
          {hasZeroReferenceLine && yMin < 0 && yMax > 0 && (
            <line
              x1={paddingLeft}
              y1={getY(0)}
              x2={width - paddingRight}
              y2={getY(0)}
              stroke="#ef4444"
              strokeWidth={1.2}
              strokeOpacity={0.4}
              strokeDasharray="4,2"
            />
          )}

          {/* Vertical grid lines at X tick spots */}
          {xTicksIndices.map(idx => (
            <g key={idx}>
              <line
                x1={getX(idx)}
                y1={paddingTop}
                x2={getX(idx)}
                y2={paddingTop + plotHeight}
                stroke="#12121e"
                strokeWidth={1}
              />
              <text
                x={getX(idx)}
                y={paddingTop + plotHeight + 16}
                fill="#4b5563"
                fontSize={9}
                textAnchor={idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}
              >
                {data[idx]?.date}
              </text>
            </g>
          ))}

          {/* Line plots */}
          {paths.map(p => (
            <path
              key={p.field}
              d={p.dStr}
              fill="none"
              stroke={termColors[p.field] || '#99f6e4'}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          ))}

          {/* Hover indicator lines & focus points & metadata panel */}
          {hoverIdx !== null && data[hoverIdx] && (
            <g>
              {/* Vertical line indicator */}
              <line
                x1={getX(hoverIdx)}
                y1={paddingTop}
                x2={getX(hoverIdx)}
                y2={paddingTop + plotHeight}
                stroke="#ffffff"
                strokeWidth={1}
                strokeOpacity={0.25}
                strokeDasharray="2,2"
              />

              {/* Intersect Dots */}
              {fields.map(field => {
                if (chartType === 'atm' && field === '7d HV') {
                  if (!visibleTerms['7d HV']) return null;
                } else {
                  if (!visibleTerms[field]) return null;
                }

                let val = 0;
                if (field === '7d HV') {
                  val = data[hoverIdx]['7d HV'];
                } else if (chartType === 'atm') {
                  val = data[hoverIdx].terms[field];
                } else if (chartType === 'skew') {
                  val = data[hoverIdx].skews[field];
                } else {
                  val = data[hoverIdx].hvs[field];
                }

                return (
                  <circle
                    key={field}
                    cx={getX(hoverIdx)}
                    cy={getY(val)}
                    r={3.5}
                    fill="#020204"
                    stroke={termColors[field] || '#fff'}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* EXTREMELY BEAUTIFUL & CLEAN FLOATING HUD METRICS WHEN HOVERING OR RESTING */}
        {hoverIdx !== null && data[hoverIdx] && (
          <div className="absolute top-2 right-4 bg-black/90 border border-gray-800 px-2.5 py-1.5 rounded text-[10px] space-y-1 z-35 font-mono shadow-xl select-none text-left pointer-events-none min-w-[125px] flex flex-col gap-0.5">
            <div className="text-gray-400 font-extrabold border-b border-gray-800 pb-1 mb-1">
              🗓️ {data[hoverIdx].date}
            </div>
            {fields.map(field => {
              if (chartType === 'atm' && field === '7d HV') {
                if (!visibleTerms['7d HV']) return null;
              } else {
                if (!visibleTerms[field]) return null;
              }

              let val = 0;
              if (field === '7d HV') {
                val = data[hoverIdx]['7d HV'];
              } else if (chartType === 'atm') {
                val = data[hoverIdx].terms[field];
              } else if (chartType === 'skew') {
                val = data[hoverIdx].skews[field];
              } else {
                val = data[hoverIdx].hvs[field];
              }

              return (
                <div key={field} className="flex justify-between gap-4 font-semibold">
                  <span className="flex items-center gap-1" style={{ color: termColors[field] }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: termColors[field] }} />
                    {field}:
                  </span>
                  <span className="text-white font-extrabold">{val.toFixed(2)}{chartType !== 'skew' && '%'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // 6. VOLATILITY TERM STRUCTURE CHART SPECIFIC SVG RENDER
  const renderTermStructureChart = () => {
    const width = 640;
    const height = 240;
    const paddingLeft = 50;
    const paddingRight = 30;
    const paddingTop = 25;
    const paddingBottom = 40;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const allVolValues = termStructureSnapshot.flatMap(t => [t.atmIv, t.fwdIv]).filter(Number.isFinite);
    const minVol = allVolValues.length > 0 ? Math.min(...allVolValues) : 15;
    const maxVol = allVolValues.length > 0 ? Math.max(...allVolValues) : 55;
    const yMin = Math.max(0, Math.floor((minVol - 8) / 5) * 5);
    const yMax = Math.min(180, Math.ceil((maxVol + 8) / 5) * 5);
    const yRange = yMax - yMin;

    const xDenominator = Math.max(1, termStructureSnapshot.length - 1);
    const getX = (idx: number) => paddingLeft + idx * (plotWidth / xDenominator);
    const getY = (val: number) => {
      const ratio = (val - yMin) / (yRange || 1);
      return paddingTop + plotHeight - ratio * plotHeight;
    };

    // Calculate lines paths
    let dAtm = '';
    let dFwd = '';

    termStructureSnapshot.forEach((t, idx) => {
      const x = getX(idx);
      const atmY = getY(t.atmIv);
      const fwdY = getY(t.fwdIv);

      dAtm += `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${atmY.toFixed(1)}`;
      dFwd += `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${fwdY.toFixed(1)}`;
    });

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left - paddingLeft;

      if (relativeX < 0 || relativeX > plotWidth) {
        setTsHoverIdx(null);
        return;
      }

      const step = plotWidth / xDenominator;
      const idx = Math.min(termStructureSnapshot.length - 1, Math.max(0, Math.round(relativeX / step)));
      setTsHoverIdx(idx);
    };

    const handleMouseLeave = () => {
      setTsHoverIdx(null);
    };

    const yTicks = Array.from({ length: 5 }).map((_, idx) => yMin + ((yMax - yMin) * idx) / 4);

    return (
      <div className="relative w-full">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible select-none cursor-crosshair font-mono"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Background grid box */}
          <rect x={paddingLeft} y={paddingTop} width={plotWidth} height={plotHeight} fill="#020204" />

          {/* Grids lines */}
          {yTicks.map(val => (
            <g key={val}>
              <line
                x1={paddingLeft}
                y1={getY(val)}
                x2={width - paddingRight}
                y2={getY(val)}
                stroke="#12121e"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
              <text x={paddingLeft - 8} y={getY(val) + 4} fill="#4b5563" fontSize={9} textAnchor="end">
                {val}%
              </text>
            </g>
          ))}

          {/* Vertical lines and labels */}
          {termStructureSnapshot.map((t, idx) => (
            <g key={idx}>
              <line
                x1={getX(idx)}
                y1={paddingTop}
                x2={getX(idx)}
                y2={paddingTop + plotHeight}
                stroke="#12121e"
                strokeWidth={1}
              />
              <text
                x={getX(idx)}
                y={paddingTop + plotHeight + 16}
                fill="#4b5563"
                fontSize={9}
                textAnchor="middle"
              >
                {t.expiry}
              </text>
              <text
                x={getX(idx)}
                y={paddingTop + plotHeight + 28}
                fill="#1f2937"
                fontSize={8}
                className="font-bold"
                textAnchor="middle"
              >
                ({t.days}d)
              </text>
            </g>
          ))}

          {/* ATM IV Path (Solid Blue) */}
          <path
            d={dAtm}
            fill="none"
            stroke="#1e70e3"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* FWD IV Path (Dashed Green) */}
          <path
            d={dFwd}
            fill="none"
            stroke="#10b981"
            strokeWidth={1.8}
            strokeDasharray="4,4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Circles points */}
          {termStructureSnapshot.map((t, idx) => (
            <g key={idx}>
              {/* ATM Circle Point */}
              <circle
                cx={getX(idx)}
                cy={getY(t.atmIv)}
                r={3.5}
                className="transition-all"
                fill="#1e70e3"
                stroke="#000"
                strokeWidth={1.5}
              />
              {/* FWD Circle Point */}
              <circle
                cx={getX(idx)}
                cy={getY(t.fwdIv)}
                r={3.5}
                className="transition-all"
                fill="#020204"
                stroke="#10b981"
                strokeWidth={2}
              />
            </g>
          ))}

          {/* Interactive hovering HUD lines */}
          {tsHoverIdx !== null && termStructureSnapshot[tsHoverIdx] && (
            <g>
              <line
                x1={getX(tsHoverIdx)}
                y1={paddingTop}
                x2={getX(tsHoverIdx)}
                y2={paddingTop + plotHeight}
                stroke="#ffffff"
                strokeWidth={1}
                strokeOpacity={0.25}
              />
              <circle
                cx={getX(tsHoverIdx)}
                cy={getY(termStructureSnapshot[tsHoverIdx].atmIv)}
                r={5.5}
                fill="#1e70e3"
                stroke="#fff"
                strokeWidth={2}
              />
              <circle
                cx={getX(tsHoverIdx)}
                cy={getY(termStructureSnapshot[tsHoverIdx].fwdIv)}
                r={5.5}
                fill="#10b981"
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* Hover info panel */}
        {tsHoverIdx !== null && termStructureSnapshot[tsHoverIdx] && (
          <div className="absolute top-2 right-4 bg-black/90 border border-gray-800 px-3 py-2 rounded text-[10px] space-y-1.5 z-35 font-mono shadow-2xl select-none text-left pointer-events-none min-w-[140px]">
            <div className="text-gray-400 font-extrabold border-b border-gray-800 pb-1 flex justify-between">
              <span>{termStructureSnapshot[tsHoverIdx].expiry}</span>
              <span className="text-yellow-500">[{termStructureSnapshot[tsHoverIdx].days} D]</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-blue-450 font-bold flex items-center gap-1 text-[#1e70e3]">
                  <span className="w-2 h-2 rounded-full bg-[#1e70e3] inline-block" />
                  ATM IV:
                </span>
                <span className="text-white font-extrabold">{termStructureSnapshot[tsHoverIdx].atmIv.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-450 font-bold flex items-center gap-1 text-[#10b981]">
                  <span className="w-2 h-2 border border-[#10b981] inline-block" />
                  FWD IV:
                </span>
                <span className="text-white font-extrabold">{termStructureSnapshot[tsHoverIdx].fwdIv.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-mono text-gray-200">

      {/* 1. TOP STATS AND GRAPHICAL SUMMARY DASHBOARD */}
      <div className="bg-black border-2 border-purple-500/40 p-4 rounded-none flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-none bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-white font-extrabold text-sm tracking-tight flex items-center gap-1.5 uppercase">
                &lt;G GREEKS.LIVE VOLATILITY INTELLIGENCE TERMINAL&gt;
              </h3>
              <span className="text-[9px] text-[#ff9f1c] bg-[#ff9f1c]/10 border border-[#ff9f1c]/30 px-1 py-0.5 font-bold font-mono">
                {hasBackendVolSurface ? 'BACKEND VOL FEED' : 'FALLBACK VOL MODEL'}
              </span>
              <span className={`text-[9px] px-1 py-0.5 font-bold font-mono border ${
                hasBackendVolSurface
                  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30'
              }`}>
                {provenanceLabel}
              </span>
              <span className="text-[9px] text-gray-400 bg-black/40 border border-gray-800 px-1 py-0.5 font-bold font-mono">
                {provenanceDetail}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed mt-1 font-sans">
              实时隐含波动率 Term Structure 曲线、历史 ATM IV 与 Realized Volatility 以及 25Δ 偏度（Risk Reversals Skew）对比精算面板。
            </p>
          </div>
        </div>

        {/* Global actions and metrics indicators */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Quick Stats indicators */}
          <div className="text-[10px] space-y-0.5 border-r border-gray-800 pr-3 hidden sm:block">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">ATM IV Mean:</span>
              <span className="text-pink-400 font-bold">{(liveVolSummary?.atmIv || tickerIV || 45).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">25Δ Skew:</span>
              <span className="text-emerald-400 font-bold">
                {latestTermSignal.skew25d === null ? 'N/A' : `${latestTermSignal.skew25d.toFixed(2)}%`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRefreshTrigger(prev => prev + 1)}
            className="flex items-center gap-1.5 text-[10px] font-black bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2. py-2 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            RE-CALIBRATE FEEDS
          </button>
        </div>
      </div>

      {/* 2. MAIN GRID LAYOUT: 2x2 MULTI-TERM COCKPIT */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* CHART A: ATM IV HISTORY */}
        <div className="bg-[#141417] border border-gray-800 rounded-none p-4.5 flex flex-col justify-between space-y-3.5 shadow-md relative">

          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-white uppercase tracking-tight flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-pink-500" />
                {cleanedSymbol} ATM IV History
              </span>
              <span className="bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded px-1.5 py-0.5 text-[8.5px] font-semibold">
                7D HV: {(liveVolSummary?.realizedVol || tickerIV * 0.82 || 32.64).toFixed(2)}%
              </span>
            </div>

            {/* Timelines periods */}
            <div className="flex bg-black p-0.5 rounded border border-gray-800 text-[9px] font-mono">
              {(['ALL', '7D', '1M', '3M', '1Y'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setAtmPeriod(p)}
                  className={`px-1.5 py-0.5 rounded transition font-bold ${atmPeriod === p ? 'bg-pink-500/15 text-pink-400 font-black' : 'text-gray-500 hover:text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Render Area */}
          <div className="w-full flex-1 min-h-[240px] flex items-center justify-center">
            {renderSVGLineChart(
              slicedATMData,
              atmFields,
              atmBounds.yMin,
              atmBounds.yMax,
              'atm',
              atmHoverIdx,
              setAtmHoverIdx
            )}
          </div>

          {/* Interactive Legend Row */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-gray-900 border-dashed text-[10px] select-none justify-center">
            {['1d', '1w', '1m', '3m', '6m', '7d HV'].map(term => {
              const isVisible = term === '7d HV' ? visibleTerms['7d HV'] : visibleTerms[term];
              const color = termColors[term];
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => toggleTermVisibility(term)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all ${
                    isVisible
                      ? 'bg-gray-950 text-white border-gray-850'
                      : 'bg-black/20 text-gray-600 border-transparent opacity-40 hover:opacity-75'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                  <span className="font-bold">{term}</span>
              {isVisible ? <Eye className="w-3 h-3 text-gray-500" /> : <EyeOff className="w-3 h-3 text-gray-700" />}
                </button>
              );
            })}
            <span className={`px-2 py-1 border text-[9px] font-black ${
              hasBackendVolSurface ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : 'border-yellow-500/30 text-yellow-400 bg-yellow-500/5'
            }`}>
              {hasBackendVolSurface ? 'BACKEND CALC' : 'FALLBACK MODEL'}
            </span>
          </div>

        </div>

        {/* CHART B: 25Δ SKEW PROFILE */}
        <div className="bg-[#141417] border border-gray-800 rounded-none p-4.5 flex flex-col justify-between space-y-3.5 shadow-md relative">

          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-white uppercase tracking-tight flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-orange-400" />
                {cleanedSymbol} 25Δ Risk Reversal Skew
              </span>
              <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded px-1.5 py-0.5 text-[8.5px] font-semibold">
                Atm Skew Focus
              </span>
            </div>

            {/* Timelines periods */}
            <div className="flex bg-black p-0.5 rounded border border-gray-800 text-[9px] font-mono">
              {(['ALL', '1D', '7D', '15D', '1M', '3M', '6M', '1Y'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setSkewPeriod(p)}
                  className={`px-1.5 py-0.5 rounded transition font-bold ${skewPeriod === p ? 'bg-orange-500/15 text-orange-400 font-black' : 'text-gray-500 hover:text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Render Area */}
          <div className="w-full flex-1 min-h-[240px] flex items-center justify-center">
            {renderSVGLineChart(
              slicedSkewData,
              skewFields,
              skewBounds.yMin,
              skewBounds.yMax,
              'skew',
              skewHoverIdx,
              setSkewHoverIdx,
              true // has zero line
            )}
          </div>

          {/* Interactive Legend Row */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-gray-900 border-dashed text-[10px] select-none justify-center">
            {['1d', '1w', '1m', '3m', '6m'].map(term => {
              const isVisible = visibleTerms[term];
              const color = termColors[term];
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => toggleTermVisibility(term)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all ${
                    isVisible
                      ? 'bg-gray-950 text-white border-gray-850'
                      : 'bg-black/20 text-gray-600 border-transparent opacity-40 hover:opacity-75'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                  <span className="font-bold">{term}</span>
                  {isVisible ? <Eye className="w-3 h-3 text-gray-500" /> : <EyeOff className="w-3 h-3 text-gray-700" />}
                </button>
              );
            })}
          </div>

        </div>

        {/* CHART C: REALIZED VOLATILITY (RV / HV COMPARE) */}
        <div className="bg-[#141417] border border-gray-800 rounded-none p-4.5 flex flex-col justify-between space-y-3.5 shadow-md relative">

          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-white uppercase tracking-tight flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-sky-450" />
                {cleanedSymbol} Realized Volatility (RV)
              </span>
              <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded px-1.5 py-0.5 text-[8.5px] font-semibold">
                Historic Actual Vol
              </span>
            </div>

            {/* Timelines periods */}
            <div className="flex bg-black p-0.5 rounded border border-gray-800 text-[9px] font-mono">
              {(['ALL', '1D', '7D', '15D', '1M', '3M', '6M', '1Y'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setRvPeriod(p)}
                  className={`px-1.5 py-0.5 rounded transition font-bold ${rvPeriod === p ? 'bg-sky-400/15 text-sky-400 font-black' : 'text-gray-500 hover:text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Render Area */}
          <div className="w-full flex-1 min-h-[240px] flex items-center justify-center">
            {renderSVGLineChart(
              slicedRVData,
              rvFields,
              rvBounds.yMin,
              rvBounds.yMax,
              'rv',
              rvHoverIdx,
              setRvHoverIdx
            )}
          </div>

          {/* Interactive Legend Row */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-gray-900 border-dashed text-[10px] select-none justify-center">
            {['1d', '1w', '1m', '3m', '6m'].map(term => {
              const isVisible = visibleTerms[term];
              const color = termColors[term];
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => toggleTermVisibility(term)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all ${
                    isVisible
                      ? 'bg-gray-950 text-white border-gray-850'
                      : 'bg-black/20 text-gray-600 border-transparent opacity-40 hover:opacity-75'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                  <span className="font-bold">{term}</span>
                  {isVisible ? <Eye className="w-3 h-3 text-gray-500" /> : <EyeOff className="w-3 h-3 text-gray-700" />}
                </button>
              );
            })}
          </div>

        </div>

        {/* CHART D: VOLATILITY TERM STRUCTURE SNAPSHOT */}
        <div className="bg-[#141417] border border-gray-800 rounded-none p-4.5 flex flex-col justify-between space-y-3.5 shadow-md relative">

          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-white uppercase tracking-tight flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                {cleanedSymbol} Volatility Term Structure
              </span>
            </div>

            {/* Snapshot date hours selector prev/next indicator */}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-gray-500 text-[9px] hidden sm:inline">{snapDateText}</span>
              <div className="flex p-0.5 bg-black rounded border border-gray-800">
                <button
                  onClick={() => setSnapshotDaysOffset(prev => prev - 1)}
                  className="px-1.5 py-0.5 hover:text-white text-gray-500 font-bold transition flex items-center"
                  title="Previous Snapshot Curve"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span className="text-[8px] tracking-tight">Prev</span>
                </button>
                <span className="w-px bg-gray-800 h-3 mx-1 self-center" />
                <button
                  onClick={() => setSnapshotDaysOffset(prev => prev + 1)}
                  className="px-1.5 py-0.5 hover:text-white text-gray-500 font-bold transition flex items-center"
                  title="Next Snapshot Curve"
                >
                  <span className="text-[8px] tracking-tight">Next</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Render Area */}
          <div className="w-full flex-1 min-h-[240px] flex items-center justify-center">
            {renderTermStructureChart()}
          </div>

          {/* Legends mapping */}
          <div className="flex items-center justify-center gap-6 pt-2 border-t border-gray-900 border-dashed text-[10px] font-mono">
            <span className="flex items-center gap-2">
              <span className="w-3 h-1 bg-[#1e70e3] inline-block rounded-full" />
              <span className="text-gray-400">ATM IV (At-the-Money Implied Vol)</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-[#10b981] inline-block" />
              <span className="text-gray-400">FWD IV (Forward Future Volatility)</span>
            </span>
            {hasBackendVolSurface && (
              <span className="text-emerald-400">
                rows={String(liveVolSurface?.diagnostics?.acceptedOptionRows ?? 'n/a')}
              </span>
            )}
          </div>

        </div>

      </div>

      {/* 3. PROFESSIONAL BOTTOM ANALYSIS WORKSPACE BOARD */}
      <div className="bg-[#0b0c10] border border-gray-850 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-start shadow">
        <div className="p-2 sm:p-3 rounded-none bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-white font-extrabold text-xs tracking-wide uppercase">
            &lt;QUANT SIGNAL: TERM STRUCTURE ANALYSIS&gt;
          </h4>
          <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
            当前期限结构呈现<strong>【{latestTermSignal.structureLabel} 结构，远近 ATM IV 斜率 {latestTermSignal.termSlope.toFixed(2)} vol pts】</strong>。
            {hasBackendVolSurface ? ' 数据来自公开 mock option chain 质量门后的计算面板。' : ' 当前使用前端降级模型，等待 mock volSurface。'}
            {(liveVolSummary?.atmIv || tickerIV) > 50 ? (
              <span className="text-yellow-400 font-mono block mt-1.5 bg-yellow-500/5 p-2 rounded border border-yellow-500/10">
                [波幅提示] 标的 ATM IV 约 {(liveVolSummary?.atmIv || tickerIV).toFixed(1)}%，25Δ skew {latestTermSignal.skew25d === null ? 'N/A' : `${latestTermSignal.skew25d.toFixed(2)}%`}。优先检查买方结构是否被高 IV 溢价侵蚀。
              </span>
            ) : (
              <span className="text-emerald-400 font-mono block mt-1.5 bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                [期权策略契机] 波动率相对平稳。继续结合盘口价差、OI/volume 与目标区间赔率决定是否进入 daily play queue。
              </span>
            )}
          </p>
        </div>
      </div>

    </div>
  );
}
