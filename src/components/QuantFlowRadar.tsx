/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { BASE_DATE_STR, LiveExpiry, LiveOptionChainRow } from '../types';
import {
  TrendingUp, Activity, Search, RefreshCw, BarChart2, ShieldAlert,
  Flame, HelpCircle, Layers, Sliders, Calendar, PlayCircle, Eye, EyeOff,
  Filter, Grid, Download, ListCollapse, Award
} from 'lucide-react';
import OpenInterestDistribution from './OpenInterestDistribution';
import { buildExpiryChoices } from '../lib/expiryChoices';
import {
  buildRadarMetricConfig,
  buildExpiryFamilies,
  deriveLiveIvStats,
  ExpiryFamilyId,
  formatScaledNumber,
  RadarMetricId,
  ScaleMode
} from '../lib/optionAnalytics';

interface QuantFlowRadarProps {
  currentStockPrice: number;
  activeSymbol: string;
  tickerIV: number;
  asOfDate?: string;
  liveExpiries?: LiveExpiry[];
  liveChain?: LiveOptionChainRow[];
}

// Simple deterministic generator helper based on ticker hash to keep curves consistent
function getDeterministicRandom(seedPhrase: string) {
  let hash = 0;
  for (let i = 0; i < seedPhrase.length; i++) {
    hash = seedPhrase.charCodeAt(i) + ((hash << 5) - hash);
  }
  return function(min = 0, max = 1) {
    const x = Math.sin(hash++) * 10000;
    const r = x - Math.floor(x);
    return min + r * (max - min);
  };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const dateFromBase = (offsetDays: number, baseDate = BASE_DATE_STR): string => {
  const date = new Date(`${baseDate}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
};

const dateRangeLabel = (dates: string[]): string => {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first && last ? `${first} - ${last}` : 'N/A';
};

const readBooleanEnvFlag = (name: string, fallback = false): boolean => {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = env?.[name];
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const ALLOW_SYNTHETIC_QUANT_HISTORY = readBooleanEnvFlag('VITE_TITANOPTION_SYNTHETIC_QUANT_HISTORY', false);
const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const formatInteger = (value: number): string =>
  integerFormatter.format(Number.isFinite(value) ? Math.round(value) : 0);

const average = (values: number[]): number | null => {
  const finite = values.filter(isFiniteNumber);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

export default function QuantFlowRadar({
  currentStockPrice: propPrice,
  activeSymbol: propSymbol,
  tickerIV: propIV,
  asOfDate = BASE_DATE_STR,
  liveExpiries = [],
  liveChain = []
}: QuantFlowRadarProps) {

  // List of 45 high-profile stocks/assets matching the dashboard in the image
  const initialTickers = useMemo(() => [
    { symbol: 'AAPL', name: 'Apple Inc.', basePrice: 184.50 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', basePrice: 160.20 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', basePrice: 175.40 },
    { symbol: 'ANET', name: 'Arista Networks', basePrice: 285.50 },
    { symbol: 'ASTS', name: 'AST SpaceMobile', basePrice: 11.20 },
    { symbol: 'AVGO', name: 'Broadcom Inc.', basePrice: 1350.00 },
    { symbol: 'BTBT', name: 'Bit Digital Inc.', basePrice: 3.40 },
    { symbol: 'CIFR', name: 'Cipher Mining', basePrice: 4.10 },
    { symbol: 'CLSK', name: 'CleanSpark Inc.', basePrice: 16.50 },
    { symbol: 'COIN', name: 'Coinbase Global', basePrice: 242.80 },
    { symbol: 'CRCL', name: 'Circle Internet', basePrice: 23.40 },
    { symbol: 'CRM', name: 'Salesforce Inc.', basePrice: 294.50 },
    { symbol: 'GLD', name: 'SPDR Gold Shares', basePrice: 215.30 },
    { symbol: 'GOOG', name: 'Alphabet Inc.', basePrice: 172.50 },
    { symbol: 'HYG', name: 'iShares High Yield Corp', basePrice: 76.80 },
    { symbol: 'IBIT', name: 'iShares Bitcoin Trust', basePrice: 38.50 },
    { symbol: 'IBM', name: 'International Business', basePrice: 188.20 },
    { symbol: 'INTC', name: 'Intel Corp.', basePrice: 30.50 },
    { symbol: 'IREN', name: 'Iris Energy Ltd.', basePrice: 6.20 },
    { symbol: 'LITE', name: 'Lumentum Holdings', basePrice: 46.80 },
    { symbol: 'LUNR', name: 'Intuitive Machines', basePrice: 5.40 },
    { symbol: 'MARA', name: 'MARA Holdings', basePrice: 19.80 },
    { symbol: 'META', name: 'Meta Platforms Inc.', basePrice: 475.20 },
    { symbol: 'MRVL', name: 'Marvell Technology', basePrice: 68.30 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', basePrice: 415.60 },
    { symbol: 'MSTR', name: 'MicroStrategy Inc.', basePrice: 1450.00 },
    { symbol: 'MU', name: 'Micron Technology', basePrice: 112.40 },
    { symbol: 'NFLX', name: 'Netflix Inc.', basePrice: 610.50 },
    { symbol: 'NOK', name: 'Nokia Corp.', basePrice: 15.29 }, // matching NOK screenshot!
    { symbol: 'NVDA', name: 'NVIDIA Corp.', basePrice: 875.12 },
    { symbol: 'ORCL', name: 'Oracle Corp.', basePrice: 124.50 },
    { symbol: 'PLTR', name: 'Palantir Technologies', basePrice: 22.80 },
    { symbol: 'QCOM', name: 'Qualcomm Inc.', basePrice: 174.50 },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', basePrice: 435.50 },
    { symbol: 'RIOT', name: 'Riot Platforms Inc.', basePrice: 11.40 },
    { symbol: 'RKLB', name: 'Rocket Lab USA', basePrice: 4.80 },
    { symbol: 'SATS', name: 'EchoStar Corp.', basePrice: 16.20 },
    { symbol: 'SNDK', name: 'SanDisk Legacy', basePrice: 72.50 },
    { symbol: 'SOFI', name: 'SoFi Technologies', basePrice: 7.20 },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', basePrice: 512.40 },
    { symbol: 'TSLA', name: 'Tesla Inc.', basePrice: 218.30 },
    { symbol: 'TSM', name: 'Taiwan Semiconductor', basePrice: 142.50 },
    { symbol: 'V', name: 'Visa Inc.', basePrice: 272.30 },
    { symbol: 'VRT', name: 'Vertiv Holdings Co.', basePrice: 82.40 },
    { symbol: 'WFC', name: 'Wells Fargo & Co.', basePrice: 58.20 }
  ], []);

  // UI Interactive States
  const [selectedTickerSymbol, setSelectedTickerSymbol] = useState<string>(propSymbol || 'NOK');
  const [radarSubTab, setRadarSubTab] = useState<'analytics' | 'oi'>('analytics');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeZoneFilter, setActiveZoneFilter] = useState<'ALL' | 'HIGH' | 'NEUTRAL' | 'LOW'>('ALL');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [flowScaleMode, setFlowScaleMode] = useState<ScaleMode>('auto');
  const [hiddenFlowFamilies, setHiddenFlowFamilies] = useState<ExpiryFamilyId[]>([]);
  const [hiddenRadarMetrics, setHiddenRadarMetrics] = useState<RadarMetricId[]>([]);

  // Sync parent selection to local selectedTickerSymbol when changed
  useEffect(() => {
    if (propSymbol) {
      setSelectedTickerSymbol(propSymbol);
    }
  }, [propSymbol]);

  // Hover States for HUD popups
  const [trendHoverIdx, setTrendHoverIdx] = useState<number | null>(null);
  const [maxPainHoverIdx, setMaxPainHoverIdx] = useState<number | null>(null);
  const [heatmapHoverPos, setHeatmapHoverPos] = useState<{ x: string; y: string; val: number } | null>(null);

  // Clean Symbol helper
  const cleanSymbol = selectedTickerSymbol.replace('_USD', '').replace('USDT', '');
  const hasSelectedLiveChain = cleanSymbol === propSymbol && liveChain.length > 0;
  const effectiveLiveChain = hasSelectedLiveChain ? liveChain : [];
  const quantSourceLabel = hasSelectedLiveChain
    ? 'PUBLIC MOCK OPTION CHAIN'
    : 'NO MOCK CHAIN SELECTED';

  // Calculate prices and random-seeded dynamic IV attributes for 45 symbols
  const tickersCalculated = useMemo(() => {
    return initialTickers.map(t => {
      const g = getDeterministicRandom(t.symbol + refreshTrigger);

      // Determine realistic options distribution for each ticker
      // High beta crypto trackers/AI like MSTR/ASTS/AMD get high IV rank, steady ETFs like SPY get low
      let ivRank = Math.floor(g(10, 100));

      // Force match exact screenshots for standard keys!
      if (t.symbol === 'AAPL') ivRank = 47;
      if (t.symbol === 'AMD') ivRank = 94;
      if (t.symbol === 'AMZN') ivRank = 23;
      if (t.symbol === 'ANET') ivRank = 48;
      if (t.symbol === 'ASTS') ivRank = 83;
      if (t.symbol === 'AVGO') ivRank = 46;
      if (t.symbol === 'BTBT') ivRank = 38;
      if (t.symbol === 'CIFR') ivRank = 24;
      if (t.symbol === 'CLSK') ivRank = 38;
      if (t.symbol === 'COIN') ivRank = 40;
      if (t.symbol === 'CRM') ivRank = 50;
      if (t.symbol === 'GLD') ivRank = 53;
      if (t.symbol === 'GOOG') ivRank = 35;
      if (t.symbol === 'HYG') ivRank = 11;
      if (t.symbol === 'IBIT') ivRank = 21;
      if (t.symbol === 'IBM') ivRank = 51;
      if (t.symbol === 'INTC') ivRank = 79;
      if (t.symbol === 'LUNR') ivRank = 100;
      if (t.symbol === 'NOK') ivRank = 12; // matching exact NOK screenshot rank 12!
      if (t.symbol === 'NVDA') ivRank = 43;
      if (t.symbol === 'QQQ') ivRank = 100;
      if (t.symbol === 'RKLB') ivRank = 91;
      if (t.symbol === 'TSLA') ivRank = 53;
      if (t.symbol === 'TSM') ivRank = 86;

      const baseIv = g(18, 120);
      const minIv = baseIv * g(0.5, 0.85);
      const maxIv = baseIv * g(1.2, 2.2);
      const currentIv = minIv + (ivRank / 100) * (maxIv - minIv);

      let zone: 'HIGH' | 'NEUTRAL' | 'LOW' = 'NEUTRAL';
      if (ivRank >= 60) zone = 'HIGH';
      else if (ivRank < 30) zone = 'LOW';

      return {
        ...t,
        ivRank,
        currentIv: Number(currentIv.toFixed(1)),
        minIv: Number(minIv.toFixed(1)),
        maxIv: Number(maxIv.toFixed(1)),
        zone
      };
    });
  }, [initialTickers, refreshTrigger]);

  const liveIvStats = useMemo(() => deriveLiveIvStats(effectiveLiveChain, propIV), [effectiveLiveChain, propIV]);

  const activeTicker = useMemo(() => {
    const base = tickersCalculated.find(t => t.symbol === cleanSymbol) || tickersCalculated[0];
    if (cleanSymbol === propSymbol && Number.isFinite(propPrice) && propPrice > 0) {
      return {
        ...base,
        basePrice: propPrice,
        currentIv: liveIvStats.currentIv,
        minIv: liveIvStats.minIv,
        maxIv: liveIvStats.maxIv,
        ivRank: liveIvStats.ivRank,
        zone: liveIvStats.zone,
        ivSource: liveIvStats.source,
        ivRowCount: liveIvStats.rowCount,
      };
    }
    return base;
  }, [tickersCalculated, cleanSymbol, propSymbol, propPrice, liveIvStats]);

  const liveExpiryChoices = useMemo(() => {
    return [...liveExpiries]
      .filter(expiry => expiry.date && Number.isFinite(Number(expiry.days)))
      .sort((a, b) => Number(a.days) - Number(b.days));
  }, [liveExpiries]);

  const radarExpiryChoices = useMemo(() => {
    return buildExpiryChoices(liveExpiries, liveExpiryChoices[0]?.days || 2);
  }, [liveExpiries, liveExpiryChoices]);

  const flowExpiryFamilies = useMemo(() => {
    return buildExpiryFamilies(radarExpiryChoices, { hiddenFamilies: hiddenFlowFamilies });
  }, [radarExpiryChoices, hiddenFlowFamilies]);

  const visibleFlowExpiryChoices = useMemo(() => {
    return flowExpiryFamilies.flatMap(family => family.visibleChoices);
  }, [flowExpiryFamilies]);

  const hasConfiguredFlowExpiries = radarExpiryChoices.some(choice => !choice.isCustom);

  const toggleFlowFamily = (familyId: ExpiryFamilyId) => {
    setHiddenFlowFamilies(prev => (
      prev.includes(familyId)
        ? prev.filter(id => id !== familyId)
        : [...prev, familyId]
    ));
  };

  const liveRowsByExpiry = useMemo(() => {
    const grouped = new Map<string, LiveOptionChainRow[]>();
    effectiveLiveChain.forEach(row => {
      if (!row.expiry) return;
      const rows = grouped.get(row.expiry) || [];
      rows.push(row);
      grouped.set(row.expiry, rows);
    });
    return grouped;
  }, [effectiveLiveChain]);

  const liveChainSummary = useMemo(() => {
    const rows = effectiveLiveChain;
    const expirySet = new Set<string>();
    const strikeSet = new Set<number>();
    let totalOi = 0;
    let totalVolume = 0;
    let callOi = 0;
    let putOi = 0;
    let callVolume = 0;
    let putVolume = 0;
    const ivValues: number[] = [];
    const expiryMeta = new Map(liveExpiries.map(expiry => [expiry.date, expiry]));

    rows.forEach(row => {
      if (row.expiry) expirySet.add(row.expiry);
      const strike = Number(row.strike);
      if (Number.isFinite(strike)) strikeSet.add(strike);

      const oi = Number(row.openInterest || 0);
      const volume = Number(row.volume || 0);
      totalOi += Number.isFinite(oi) ? oi : 0;
      totalVolume += Number.isFinite(volume) ? volume : 0;
      if (row.type === 'call') {
        callOi += Number.isFinite(oi) ? oi : 0;
        callVolume += Number.isFinite(volume) ? volume : 0;
      } else {
        putOi += Number.isFinite(oi) ? oi : 0;
        putVolume += Number.isFinite(volume) ? volume : 0;
      }

      const iv = Number(row.iv);
      if (Number.isFinite(iv) && iv > 0) ivValues.push(iv);
    });

    const sortedStrikes = Array.from(strikeSet).sort((a, b) => a - b);
    const expirySummaries = Array.from(liveRowsByExpiry.entries())
      .map(([expiry, expiryRows]) => {
        const expiryStrikes = new Set<number>();
        let expiryOi = 0;
        let expiryVolume = 0;
        let expiryCallOi = 0;
        let expiryPutOi = 0;
        const expiryIvs: number[] = [];

        expiryRows.forEach(row => {
          const strike = Number(row.strike);
          if (Number.isFinite(strike)) expiryStrikes.add(strike);
          const oi = Number(row.openInterest || 0);
          const volume = Number(row.volume || 0);
          expiryOi += Number.isFinite(oi) ? oi : 0;
          expiryVolume += Number.isFinite(volume) ? volume : 0;
          if (row.type === 'call') {
            expiryCallOi += Number.isFinite(oi) ? oi : 0;
          } else {
            expiryPutOi += Number.isFinite(oi) ? oi : 0;
          }
          const iv = Number(row.iv);
          if (Number.isFinite(iv) && iv > 0) expiryIvs.push(iv);
        });

        return {
          expiry,
          days: expiryMeta.get(expiry)?.days,
          rows: expiryRows.length,
          strikeCount: expiryStrikes.size,
          totalOi: expiryOi,
          totalVolume: expiryVolume,
          callOi: expiryCallOi,
          putOi: expiryPutOi,
          avgIv: average(expiryIvs),
        };
      })
      .sort((a, b) => Number(a.days ?? 9999) - Number(b.days ?? 9999) || a.expiry.localeCompare(b.expiry));

    const topOpenInterestRows = [...rows]
      .sort((a, b) => Number(b.openInterest || 0) - Number(a.openInterest || 0))
      .slice(0, 8);

    return {
      rowCount: rows.length,
      expiryCount: expirySet.size,
      strikeCount: strikeSet.size,
      totalOi,
      totalVolume,
      callOi,
      putOi,
      callVolume,
      putVolume,
      ivMin: ivValues.length > 0 ? Math.min(...ivValues) : null,
      ivMax: ivValues.length > 0 ? Math.max(...ivValues) : null,
      strikeMin: sortedStrikes[0],
      strikeMax: sortedStrikes[sortedStrikes.length - 1],
      expirySummaries,
      topOpenInterestRows,
    };
  }, [effectiveLiveChain, liveExpiries, liveRowsByExpiry]);

  const strikeStepForSpot = (spot: number): number => {
    if (spot > 1000) return 25;
    if (spot > 200) return 5;
    if (spot > 50) return 2.5;
    if (spot > 15) return 1;
    if (spot > 5) return 0.25;
    return 0.1;
  };

  // Aggregate Zone Counts
  const zonesCounts = useMemo(() => {
    const counts = { HIGH: 0, NEUTRAL: 0, LOW: 0 };
    tickersCalculated.forEach(t => {
      counts[t.zone]++;
    });
    return counts;
  }, [tickersCalculated]);

  // Tickers filter array based on Search input & active Zone tab filter
  const filteredTickers = useMemo(() => {
    return tickersCalculated.filter(t => {
      const matchSearch = t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchZone = activeZoneFilter === 'ALL' || t.zone === activeZoneFilter;
      return matchSearch && matchZone;
    });
  }, [tickersCalculated, searchQuery, activeZoneFilter]);

  const radarMetricConfig = useMemo(() => buildRadarMetricConfig(hiddenRadarMetrics), [hiddenRadarMetrics]);
  const visibleRadarMetricIds = useMemo(() => (
    new Set(radarMetricConfig.filter(metric => metric.visible).map(metric => metric.id))
  ), [radarMetricConfig]);

  const toggleRadarMetric = (metricId: RadarMetricId) => {
    setHiddenRadarMetrics(prev => (
      prev.includes(metricId)
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    ));
  };

  // 1. GENEROUS MOCK DATA: Historical 14D 50-Delta IV Trend vs Underlying Close price
  const historicalTrendData = useMemo(() => {
    const generator = getDeterministicRandom(cleanSymbol + '_historical_flow_' + refreshTrigger);
    const length = 120;

    const dates = Array.from({ length }).map((_, i) => {
      return dateFromBase(-((length - 1 - i) * 6), asOfDate);
    });

    let currentIv = activeTicker.currentIv * 2.8; // higher ranges matching 0-500% in image
    let currentPrice = activeTicker.basePrice * 0.7; // underlying close trend line

    return dates.map((date, idx) => {
      // Auto-regressive walk with occasional wild IV spikes (like mid-2025!)
      const skewFactor = Math.sin(idx / 10) * 15;
      const stepIv = (generator(-0.49, 0.5) * 80) + skewFactor;
      currentIv = currentIv * 0.95 + (activeTicker.currentIv * 2.5 + stepIv) * 0.05;

      // Let's create an epic volatility spike around index 50-70 as seen in NOK screenshot
      if (idx > 40 && idx < 80) {
        currentIv += generator(15, 60);
      }
      currentIv = Math.max(10, Math.min(480, currentIv));

      // Stock Price smooth random walk
      const stepPrice = (generator(-0.48, 0.52) * (activeTicker.basePrice * 0.04));
      currentPrice = currentPrice * 0.97 + (currentPrice + stepPrice) * 0.03;

      // Create a late breakout rally matching the right-side dash lines.
      if (idx > 95) {
        currentPrice += (idx - 95) * (activeTicker.basePrice * 0.06);
      }

      return {
        date,
        ivTrend: Number(currentIv.toFixed(1)),
        underlyingPrice: Number(currentPrice.toFixed(2))
      };
    });
  }, [activeTicker, asOfDate, cleanSymbol, refreshTrigger]);

  // 2. GENEROUS MOCK DATA: NOK Daily Open Interest Change Heatmap (X-Axis Strike vs Y-Axis Date)
  const heatmapData = useMemo(() => {
    const generator = getDeterministicRandom(cleanSymbol + '_heatmap_grid_' + refreshTrigger);

    // Rows: Dates (approx 35 trading days)
    const datesList = Array.from({ length: 30 }).map((_, i) => {
      return dateFromBase(-((30 - 1 - i) * 2), asOfDate);
    });

    // Columns: Option strikes centered around current asset spot price
    const spot = activeTicker.basePrice;

    let strikeStep = 1.0;
    let decimals = 0;

    if (spot < 5) {
      strikeStep = 0.1;
      decimals = 1;
    } else if (spot < 15) {
      strikeStep = 0.25;
      decimals = 2;
    } else if (spot < 50) {
      strikeStep = 1.0;
      decimals = 0;
    } else if (spot < 200) {
      strikeStep = 2.5;
      decimals = 1;
    } else if (spot < 1000) {
      strikeStep = 5.0;
      decimals = 0;
    } else {
      strikeStep = 25.0;
      decimals = 0;
    }

    const rawStrikes = Array.from({ length: 45 }).map((_, idx) => {
      const offset = (idx - 22) * strikeStep;
      return Number(Math.max(strikeStep, spot + offset).toFixed(decimals));
    });

    // Clean up duplicate strike items to prevent React duplicated key warnings on low-priced tickers
    const strikesList = Array.from(new Set(rawStrikes))
      .filter(s => s > 0)
      .sort((a, b) => a - b);

    // Make table grid matrix with realistic random spikes representing huge order flows!
    const grid: Record<string, Record<number, number>> = {};
    datesList.forEach(date => {
      grid[date] = {};
      strikesList.forEach(strike => {
        // High density cluster of trading interest centered around ATM (at the money)
        const isNearATM = Math.abs(strike - spot) < (spot * 0.35);
        let baseAct = 0.0;

        if (isNearATM) {
          const coinFlip = generator();
          if (coinFlip > 0.88) {
            // Extreme flow block (+30K to +50K contracts!)
            baseAct = generator() > 0.45 ? generator(12, 45) : generator(-40, -10);
          } else if (coinFlip > 0.6) {
            // Standard light positioning flow
            baseAct = generator(-8, 12);
          }
        } else {
          // Deep out of money gets rare spikes (cheap lottery call options!)
          if (generator() > 0.97) {
            baseAct = generator(5, 30);
          }
        }

        grid[date][strike] = Number(baseAct.toFixed(1));
      });
    });

    return {
      dates: datesList,
      strikes: strikesList,
      grid
    };
  }, [activeTicker, asOfDate, cleanSymbol, refreshTrigger]);

  // 3. Positioning Flow Call/Put Open Interest changes grouped by Expirations
  const positioningFlowData = useMemo(() => {
    const generator = getDeterministicRandom(cleanSymbol + '_flow_exp_' + refreshTrigger);

    const expiries = (
      visibleFlowExpiryChoices.length > 0
        ? visibleFlowExpiryChoices.slice(0, 8).map(expiry => ({ name: expiry.date, dte: `${expiry.days}d DTE` }))
        : hasConfiguredFlowExpiries
          ? []
        : [
            { name: '2026-06-18', dte: '7d DTE' },
            { name: '2026-06-26', dte: '15d DTE' },
            { name: '2026-07-17', dte: '36d DTE' },
            { name: '2026-08-21', dte: '71d DTE' },
          ]
    ).reverse(); // put longer term at top like image

    const spot = activeTicker.basePrice;
    const strikeStep = strikeStepForSpot(spot);

    return expiries.map(exp => {
      const liveRows = liveRowsByExpiry.get(exp.name) || [];
      const uniqueLiveStrikes: number[] = Array.from(new Set(liveRows.map(row => Number(row.strike)).filter(isFiniteNumber)));
      const liveStrikes = uniqueLiveStrikes
        .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))
        .slice(0, 8)
        .sort((a, b) => a - b);
      const strikesForExpiry = liveStrikes.length > 0
        ? liveStrikes
        : Array.from({ length: 8 }).map((_, sIdx) => Number(Math.max(1.0, spot + (sIdx - 3.5) * strikeStep).toFixed(1)));

      const strikes = strikesForExpiry.map((strikeVal) => {
        const callRow = liveRows.find(row => row.type === 'call' && Number(row.strike) === strikeVal);
        const putRow = liveRows.find(row => row.type === 'put' && Number(row.strike) === strikeVal);
        // Generate Call ΔOI (contracts)
        const callDelta = callRow
          ? Number((Number(callRow.openInterest || 0) * (generator(-0.18, 0.28))).toFixed(0))
          : generator() > 0.25
            ? Number(generator(-2500, 16000).toFixed(0))
            : Number(generator(-6000, 0).toFixed(0));

        // Generate Put ΔOI (contracts)
        const putDelta = putRow
          ? Number((Number(putRow.openInterest || 0) * (generator(-0.18, 0.28))).toFixed(0))
          : generator() > 0.3
            ? Number(generator(-1800, 11000).toFixed(0))
            : Number(generator(-4500, 0).toFixed(0));

        const isAnomaly = Math.abs(callDelta) > 13000 || Math.abs(putDelta) > 9000;

        return {
          strike: strikeVal,
          callDelta,
          putDelta,
          isAnomaly
        };
      });

      return {
        expiration: exp.name,
        dte: exp.dte,
        strikes
      };
    });
  }, [activeTicker, cleanSymbol, hasConfiguredFlowExpiries, liveRowsByExpiry, refreshTrigger, visibleFlowExpiryChoices]);

  // 4. Max Pain Price Trend across dates
  const maxPainTrendData = useMemo(() => {
    const generator = getDeterministicRandom(cleanSymbol + '_max_pain_' + refreshTrigger);
    const count = 30;

    const dates = Array.from({ length: count }).map((_, i) => {
      return dateFromBase(-((count - 1 - i) * 2), asOfDate);
    });

    const spot = activeTicker.basePrice;

    // Series for different option expirations
    const expiries = liveExpiryChoices.length > 0
      ? liveExpiryChoices.slice(0, 4).map(expiry => expiry.date)
      : ['2026-06-18', '2026-06-26', '2026-07-17', '2026-08-21'];

    let painBaseline = spot * 0.85;

    const datesSeries = dates.map((date, dIdx) => {
      // Max pain trend climbs to meet or gravitate around stock current spot!
      const walk = (generator(-0.35, 0.65) * (spot * 0.05));
      painBaseline = painBaseline * 0.94 + (spot * 0.95 + walk) * 0.06;

      const items: Record<string, number> = {};
      expiries.forEach((exp, idx) => {
        // Longer term expirations have slightly separated baseline levels
        const separation = (idx - 1.5) * (spot * 0.06);
        const randOffset = generator(-0.3, 0.3) * (spot * 0.02);
        items[exp] = Number(Math.max(1.0, painBaseline + separation + randOffset).toFixed(2));
      });

      return {
        date,
        series: items
      };
    });

    return {
      dates,
      seriesNames: expiries,
      data: datesSeries
    };
  }, [activeTicker, asOfDate, cleanSymbol, liveExpiryChoices, refreshTrigger]);

  const historicalDateRange = dateRangeLabel(historicalTrendData.map(point => point.date));
  const heatmapDateRange = dateRangeLabel(heatmapData.dates);
  const maxPainDateRange = dateRangeLabel(maxPainTrendData.dates);
  const selectedExpiryLabel = liveExpiryChoices.length > 0
    ? liveExpiryChoices.slice(0, 4).map(expiry => `${expiry.date} (${expiry.days}d)`).join(' / ')
    : 'Fallback synthetic expiries';

  return (
    <div className="space-y-6 font-mono text-gray-200">

      {/* TOP SUMMARY HUB MARGIN CONTAINER */}
      <div className="bg-black border-2 border-[#a855f7]/50 rounded-none p-4 flex flex-col lg:flex-row items-center justify-between gap-5 shadow-2xl">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30 shrink-0">
            <Award className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-white text-md font-black uppercase tracking-widest flex items-center gap-2">
                &lt;QUANT RADAR & OPTION FLOW COCKPIT&gt;
              </h2>
              <span className="text-[9px] text-[#00ffcc] border border-[#00ffcc]/30 bg-[#00ffcc]/5 px-2 py-0.5 font-bold">
                PUBLIC MOCK CHAIN
              </span>
              <span className={`text-[9px] border px-2 py-0.5 font-bold ${
                hasSelectedLiveChain
                  ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/5'
                  : 'text-yellow-300 border-yellow-400/30 bg-yellow-400/5'
              }`}>
                {quantSourceLabel}
              </span>
              <span className="text-[9px] text-gray-400 border border-gray-800 bg-black/40 px-2 py-0.5 font-bold">
                mock chain rows: {effectiveLiveChain.length}
              </span>
              <span className="text-[9px] text-gray-400 border border-gray-800 bg-black/40 px-2 py-0.5 font-bold">
                expiry count: {liveChainSummary.expiryCount}
              </span>
              <span className="text-[9px] text-gray-400 border border-gray-800 bg-black/40 px-2 py-0.5 font-bold">
                strike count: {liveChainSummary.strikeCount}
              </span>
              <span className="text-[9px] text-gray-400 border border-gray-800 bg-black/40 px-2 py-0.5 font-bold">
                total OI: {formatInteger(liveChainSummary.totalOi)}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed font-sans">
              当前版本 #5 头部与主内容使用浏览器 mock option chain：IV 分布、到期覆盖、strike 覆盖、成交量与 open interest。历史 ΔOI 与 Max Pain 需要后端历史合约后再启用。
            </p>
          </div>
        </div>

        {/* Global Controller bar controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search ticker (e.g. AAPL)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8.5 pr-4 py-1.5 w-[190px] rounded-none bg-[#111] border border-gray-800 text-xs text-white focus:outline-none focus:border-[#a855f7] font-sans"
            />
          </div>

          <button
            type="button"
            onClick={() => setRefreshTrigger(p => p + 1)}
            className="flex items-center gap-1.5 text-xs font-bold bg-[#a855f7]/15 hover:bg-[#a855f7]/30 text-[#a855f7] border border-[#a855f7]/40 px-3.5 py-2 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            REFRESH VIEW
          </button>
        </div>
      </div>

      {/* Cockpit Sub-Tab Selector bar */}
      <div className="flex bg-black p-1 rounded-none border border-gray-800 text-xs overflow-x-auto font-mono uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setRadarSubTab('analytics')}
          className={`flex-1 py-3 px-4 rounded-none transition font-black flex items-center justify-center gap-2 whitespace-nowrap ${
            radarSubTab === 'analytics'
              ? 'bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/40 shadow-inner'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Activity className="w-4 h-4 text-[#a855f7]" />
          &lt;INTEGRATED OPTION FLOWS ANALYTICS&gt;
        </button>
        <button
          type="button"
          onClick={() => setRadarSubTab('oi')}
          className={`flex-1 py-3 px-4 rounded-none transition font-black flex items-center justify-center gap-2 whitespace-nowrap ${
            radarSubTab === 'oi'
              ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/40 shadow-inner'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart2 className="w-4 h-4 text-[#ff9f1c]" />
          &lt;持仓量分布配置 OI DISTRIBUTION MATRIX&gt;
        </button>
      </div>

      {/* SECTION I: PUBLIC MOCK OPTION CHAIN SUMMARY */}
      <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5.5 shadow-xl">
        <div className="border-b border-gray-850 pb-3 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-md font-extrabold text-[#c8a2c8] flex items-center gap-2 uppercase">
              <Sliders className="w-5 h-5 text-[#a855f7]" />
              Public Mock Option Chain Summary
            </h3>
            <p className="text-[10px] text-gray-500 mt-1 leading-normal font-sans">
              Source: {quantSourceLabel} | As of {asOfDate} | IV range: {liveChainSummary.ivMin === null || liveChainSummary.ivMax === null ? 'N/A' : `${liveChainSummary.ivMin.toFixed(1)}% - ${liveChainSummary.ivMax.toFixed(1)}%`} | Strike span: {liveChainSummary.strikeMin === undefined || liveChainSummary.strikeMax === undefined ? 'N/A' : `$${liveChainSummary.strikeMin} - $${liveChainSummary.strikeMax}`}.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono min-w-[360px]">
            <div className="bg-black/45 border border-gray-850 p-2">
              <span className="block text-gray-500 uppercase font-black">Rows</span>
              <strong className="text-white text-sm">{formatInteger(liveChainSummary.rowCount)}</strong>
            </div>
            <div className="bg-black/45 border border-gray-850 p-2">
              <span className="block text-gray-500 uppercase font-black">Expiries</span>
              <strong className="text-sky-300 text-sm">{formatInteger(liveChainSummary.expiryCount)}</strong>
            </div>
            <div className="bg-black/45 border border-gray-850 p-2">
              <span className="block text-gray-500 uppercase font-black">Strikes</span>
              <strong className="text-purple-300 text-sm">{formatInteger(liveChainSummary.strikeCount)}</strong>
            </div>
            <div className="bg-black/45 border border-gray-850 p-2">
              <span className="block text-gray-500 uppercase font-black">Volume</span>
              <strong className="text-emerald-300 text-sm">{formatInteger(liveChainSummary.totalVolume)}</strong>
            </div>
          </div>
        </div>

        {hasSelectedLiveChain ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-4 bg-black/35 border border-gray-850 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <span className="text-[10px] text-gray-500 uppercase font-black">Open Interest Split</span>
                <span className="text-[10px] text-gray-400">total OI: {formatInteger(liveChainSummary.totalOi)}</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'CALL OI', value: liveChainSummary.callOi, color: 'bg-emerald-500', text: 'text-emerald-300' },
                  { label: 'PUT OI', value: liveChainSummary.putOi, color: 'bg-red-500', text: 'text-red-300' },
                ].map(item => {
                  const pct = liveChainSummary.totalOi > 0 ? Math.max(2, (item.value / liveChainSummary.totalOi) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between text-[10px] font-mono mb-1">
                        <span className="text-gray-500">{item.label}</span>
                        <strong className={item.text}>{formatInteger(item.value)}</strong>
                      </div>
                      <div className="h-2 bg-gray-900 border border-gray-800">
                        <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] pt-2">
                <div className="bg-[#0e0e11] border border-gray-900 p-2">
                  <span className="block text-gray-500 uppercase font-black">Call Vol</span>
                  <strong className="text-emerald-300">{formatInteger(liveChainSummary.callVolume)}</strong>
                </div>
                <div className="bg-[#0e0e11] border border-gray-900 p-2">
                  <span className="block text-gray-500 uppercase font-black">Put Vol</span>
                  <strong className="text-red-300">{formatInteger(liveChainSummary.putVolume)}</strong>
                </div>
              </div>
            </div>

            <div className="xl:col-span-4 bg-black/35 border border-gray-850 p-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2 mb-3">
                <span className="text-[10px] text-gray-500 uppercase font-black">Expiry Coverage</span>
                <span className="text-[10px] text-gray-400">{formatInteger(liveChainSummary.expiryCount)} expiries</span>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {liveChainSummary.expirySummaries.slice(0, 8).map(expiry => (
                  <div key={expiry.expiry} className="bg-[#0e0e11] border border-gray-900 p-2 grid grid-cols-[1fr_auto] gap-2 text-[10px]">
                    <div>
                      <div className="text-white font-black">{expiry.expiry}</div>
                      <div className="text-gray-500">{expiry.days ?? 'N/A'}d · {expiry.rows} rows · {expiry.strikeCount} strikes</div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-300 font-black">OI {formatInteger(expiry.totalOi)}</div>
                      <div className="text-gray-500">IV {expiry.avgIv === null ? 'N/A' : `${expiry.avgIv.toFixed(1)}%`}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-4 bg-black/35 border border-gray-850 p-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2 mb-3">
                <span className="text-[10px] text-gray-500 uppercase font-black">Top OI Contracts</span>
                <span className="text-[10px] text-gray-400">mock rows only</span>
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {liveChainSummary.topOpenInterestRows.map((row, idx) => (
                  <div key={`${row.contractTicker || row.expiry}-${row.type}-${row.strike}-${idx}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-[#0e0e11] border border-gray-900 px-2 py-1.5 text-[10px]">
                    <span className={`font-black ${row.type === 'call' ? 'text-emerald-300' : 'text-red-300'}`}>{row.type.toUpperCase()}</span>
                    <span className="text-gray-300 truncate">{row.expiry} · ${row.strike}</span>
                    <span className="text-white font-black">OI {formatInteger(Number(row.openInterest || 0))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-black/35 border border-gray-900 px-6 py-12 text-center text-xs text-gray-500">
            当前选中标的没有公开 mock option chain。#5 不再用合成历史数据填充主视图，请先切回带有 mock chain 的标的或刷新 mock 数据。
          </div>
        )}

        {ALLOW_SYNTHETIC_QUANT_HISTORY && (
          <>
        <div className="mb-4 mt-6 bg-black/40 border border-gray-850 p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-black tracking-wider">
            <Filter className="w-3.5 h-3.5 text-[#a855f7]" />
            SYNTHETIC RADAR METRICS CONFIG
          </div>
          <div className="flex flex-wrap gap-1.5">
            {radarMetricConfig.map(metric => (
              <button
                key={metric.id}
                type="button"
                onClick={() => toggleRadarMetric(metric.id)}
                className={`px-2.5 py-1 text-[10px] font-black border transition flex items-center gap-1.5 ${
                  metric.visible
                    ? 'text-[#00ffcc] border-[#00ffcc]/40 bg-[#00ffcc]/10'
                    : 'text-gray-600 border-gray-800 bg-black hover:text-gray-300'
                }`}
                title={metric.label}
              >
                {metric.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {metric.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#18181c] border-l-4 border-red-500 p-4.5 rounded-none flex items-center justify-between">
            <div>
              <span className="text-gray-500 text-[10px] font-bold tracking-wider uppercase">High Volatility Zone</span>
              <div className="text-xs text-red-400 font-semibold mt-0.5">IV Rank &gt;= 60</div>
            </div>
            <div className="text-3xl font-black text-red-500">{zonesCounts.HIGH}</div>
          </div>
          <div className="bg-[#18181c] border-l-4 border-yellow-500 p-4.5 rounded-none flex items-center justify-between">
            <div>
              <span className="text-gray-500 text-[10px] font-bold tracking-wider uppercase">Neutral Volatility Zone</span>
              <div className="text-xs text-yellow-500 font-semibold mt-0.5">30 &lt;= IV Rank &lt; 60</div>
            </div>
            <div className="text-3xl font-black text-yellow-500">{zonesCounts.NEUTRAL}</div>
          </div>
          <div className="bg-[#18181c] border-l-4 border-cyan-500 p-4.5 rounded-none flex items-center justify-between">
            <div>
              <span className="text-gray-500 text-[10px] font-bold tracking-wider uppercase">Low Volatility Zone</span>
              <div className="text-xs text-cyan-400 font-semibold mt-0.5">IV Rank &lt; 30</div>
            </div>
            <div className="text-3xl font-black text-cyan-400">{zonesCounts.LOW}</div>
          </div>
        </div>

        {/* RADAR SPEEDOMETER ROUND GAUGE GRID */}
        {filteredTickers.length === 0 ? (
          <div className="bg-black/30 border border-gray-900 px-6 py-12 text-center text-xs text-gray-500">
            No active ticker found matching filters. Modify search strings.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredTickers.map(baseTicker => {
              const t = baseTicker.symbol === activeTicker.symbol ? activeTicker : baseTicker;
              const ringColor = t.zone === 'HIGH' ? '#ef4444' : t.zone === 'NEUTRAL' ? '#eab308' : '#06b6d4';
              const ringBg = '#1c1c22';
              const isSelected = selectedTickerSymbol === t.symbol;
              const zoneLabel = t.zone === 'HIGH' ? '高波动' : t.zone === 'LOW' ? '低波动' : '中性';
              const cardBg = t.zone === 'HIGH'
                ? 'bg-red-950/10'
                : t.zone === 'LOW'
                  ? 'bg-cyan-950/10'
                  : 'bg-yellow-950/10';

              // speedometer arc calculations (240 deg active range)
              const radius = 30;
              const cx = 42;
              const cy = 40;
              const strokeWidth = 5;
              const circ = 2 * Math.PI * radius;
              const arcSweep = 240; // 240 deg sweep
              const dashArray = `${(circ * (arcSweep / 360)).toFixed(1)} ${circ.toFixed(1)}`;
              const dashOffset = (circ * (arcSweep / 360) * (1 - t.ivRank / 100)).toFixed(1);

              return (
                <div
                  key={t.symbol}
                  onClick={() => setSelectedTickerSymbol(t.symbol)}
                  title={`${t.symbol} ${t.name} | ${zoneLabel} | IV ${t.currentIv}% | Rank ${t.ivRank}`}
                  className={`relative p-3 rounded-none flex flex-col items-center justify-center cursor-pointer select-none transition-all min-h-[154px] ${
                    isSelected
                      ? 'bg-purple-950/20 border-2 border-[#a855f7]'
                      : `${cardBg} border border-gray-850 hover:border-gray-700 hover:bg-[#15151a]`
                  }`}
                >
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2">
                    {visibleRadarMetricIds.has('zone') ? (
                      <span
                        className="flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 border uppercase"
                        style={{ color: ringColor, borderColor: `${ringColor}66`, backgroundColor: `${ringColor}14` }}
                      >
                        {t.zone === 'HIGH' ? <Flame className="w-2.5 h-2.5" /> : t.zone === 'LOW' ? <ShieldAlert className="w-2.5 h-2.5" /> : <Activity className="w-2.5 h-2.5" />}
                        {zoneLabel}
                      </span>
                    ) : <span />}
                    {visibleRadarMetricIds.has('rank') && (
                      <span className="text-[8px] text-gray-500 font-black">R{t.ivRank}</span>
                    )}
                  </div>

                  {/* Gauge Ring */}
                  <div className="relative w-24 h-20 flex items-center justify-center mt-3">
                    <svg width="84" height="80" viewBox="0 0 84 80" className="rotate-[150deg]">
                      {/* Grey background guide arc */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="none"
                        stroke={ringBg}
                        strokeWidth={strokeWidth}
                        strokeDasharray={dashArray}
                        strokeLinecap="round"
                      />
                      {/* Active colored arc indicating IV Rank weight */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </svg>

                    {/* Content inside the Ring (Ticker, Rank number details) */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                      <span className="font-extrabold text-[12px] text-white tracking-widest leading-none">
                        {t.symbol}
                      </span>
                      {visibleRadarMetricIds.has('rank') ? (
                        <>
                          <span className="text-[10px] text-gray-500 font-bold scale-[0.8] leading-tight">
                            IV Rank
                          </span>
                          <span className="text-[16px] font-black leading-none mt-0.5" style={{ color: ringColor }}>
                            {t.ivRank}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-500 font-bold scale-[0.8] leading-tight">
                          Radar
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Range indicators text bottom */}
                  <div className="grid grid-cols-2 gap-1 w-full mt-1.5 font-mono select-none">
                    {visibleRadarMetricIds.has('iv') && (
                      <div className="bg-black/35 border border-gray-900 px-1 py-0.5 text-center">
                        <span className="block text-[7px] text-gray-600 font-black">当前IV</span>
                        <span className="block text-[9px] text-gray-300 font-black">{t.currentIv}%</span>
                      </div>
                    )}
                    {visibleRadarMetricIds.has('range') && (
                      <div className="bg-black/35 border border-gray-900 px-1 py-0.5 text-center">
                        <span className="block text-[7px] text-gray-600 font-black">区间</span>
                        <span className="block text-[9px] text-gray-300 font-black">{t.minIv}-{t.maxIv}%</span>
                      </div>
                    )}
                    {visibleRadarMetricIds.has('price') && (
                      <div className="bg-black/35 border border-gray-900 px-1 py-0.5 text-center">
                        <span className="block text-[7px] text-gray-600 font-black">现价</span>
                        <span className="block text-[9px] text-gray-300 font-black">${t.basePrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-[8px] text-gray-600 text-center font-mono select-none mt-1 truncate max-w-full w-full">
                    {t.name}
                  </div>
                  {t.symbol === activeTicker.symbol && 'ivSource' in t && (
                    <div className="text-[7px] text-[#00ffcc] font-black mt-1 uppercase tracking-wide">
                      {t.ivSource === 'live_chain' ? `MOCK IV STATS · ${Number('ivRowCount' in t ? t.ivRowCount : 0)} ROWS` : 'FALLBACK IV STATS'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>

      {radarSubTab === 'analytics' ? (
        <>
          {!ALLOW_SYNTHETIC_QUANT_HISTORY ? (
            <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5 animate-fadeIn">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Historical Flow Contracts Missing</h3>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed font-sans">
                #5 当前默认不渲染历史 IV、历史 ΔOI 与 Max Pain 曲线，因为后端还没有提供真实历史合同。若只做视觉回归，可显式设置 <span className="font-mono text-amber-300">VITE_TITANOPTION_SYNTHETIC_QUANT_HISTORY=true</span> 打开旧合成面板；交易判断路径保持关闭。
              </p>
            </div>
          ) : (
        <>
          {/* SECTION II: TWO COLUMN COMPREHENSIVE CHARTS FLOW */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fadeIn">

        {/* CHART A: HISTORICAL 14D 50-DELTA IV TREND WITH LEFT/RIGHT DOUBLE Y AXIS */}
        <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5 flex flex-col justify-between relative shadow-xl">
          <div className="border-b border-gray-850 pb-2.5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-black text-white uppercase tracking-wider">
                Historical 14D 50-Delta IV Trend (Variance Interpolated)
              </span>
            </div>
            <div className="bg-[#ff9f1c]/10 text-[#ff9f1c] border border-[#ff9f1c]/30 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold">
              POTENTIAL EXP-SKEW INFLECTION
            </div>
          </div>

          <div className="text-[10px] text-gray-500 border-b border-gray-900/50 pb-1.5 mb-2.5 flex items-center justify-between">
            <span>Period: {historicalDateRange} ({historicalTrendData.length} samples)</span>
            <span className="text-[#a855f7] font-semibold flex items-center gap-1">
              Active Focus: <strong className="text-white bg-[#a855f7]/10 px-1">{cleanSymbol}</strong>
            </span>
          </div>

          {/* SVG Historical Double Y Chart Component */}
          <div className="w-full relative min-h-[300px] flex items-center justify-center bg-black/40 border border-gray-900 p-2">
            {(() => {
              const width = 640;
              const height = 300;
              const paddingLeft = 60;
              const paddingRight = 60;
              const paddingTop = 30;
              const paddingBottom = 40;

              const plotWidth = width - paddingLeft - paddingRight;
              const plotHeight = height - paddingTop - paddingBottom;

              const dataList = historicalTrendData;
              const count = dataList.length;

              // left bounds (IV trend 0% to 500%)
              const leftMin = 0;
              const leftMax = 500;

              // right bounds (Stock Price +/- 30% bounds deviation)
              const rightPrices = dataList.map(v => v.underlyingPrice);
              const rightMin = Math.max(1.0, Math.min(...rightPrices) * 0.9);
              const rightMax = Math.max(10, Math.max(...rightPrices) * 1.1);

              const getX = (idx: number) => paddingLeft + idx * (plotWidth / (count - 1));
              const getLeftY = (val: number) => paddingTop + plotHeight - ((val - leftMin) / (leftMax - leftMin)) * plotHeight;
              const getRightY = (val: number) => paddingTop + plotHeight - ((val - rightMin) / (rightMax - rightMin)) * plotHeight;

              // Generate Paths
              let dIv = '';
              let dStock = '';

              dataList.forEach((item, idx) => {
                const x = getX(idx);
                const ivY = getLeftY(item.ivTrend);
                const stockY = getRightY(item.underlyingPrice);

                dIv += `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ivY.toFixed(1)}`;
                dStock += `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${stockY.toFixed(1)}`;
              });

              // X-Ticks dates indicators
              const xTickMarks = [
                0,
                Math.floor(count * 0.15),
                Math.floor(count * 0.3),
                Math.floor(count * 0.45),
                Math.floor(count * 0.6),
                Math.floor(count * 0.75),
                Math.floor(count * 0.9),
                count - 1
              ];

              return (
                <div className="w-full relative">
                  <svg
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    className="overflow-visible select-none cursor-crosshair font-mono"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = e.clientX - rect.left - paddingLeft;
                      if (relX < 0 || relX > plotWidth) { setTrendHoverIdx(null); return; }
                      const fraction = relX / plotWidth;
                      const idx = Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))));
                      setTrendHoverIdx(idx);
                    }}
                    onMouseLeave={() => setTrendHoverIdx(null)}
                  >
                    {/* Dark grid canvas */}
                    <rect x={paddingLeft} y={paddingTop} width={plotWidth} height={plotHeight} fill="#030305" />

                    {/* Left Axis Horizontal Grids (IV range) */}
                    {[0, 100, 200, 300, 400, 500].map(val => {
                      const y = getLeftY(val);
                      return (
                        <g key={val}>
                          <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#121218" strokeWidth={1} strokeDasharray="2,2" />
                          <text x={paddingLeft - 8} y={y + 3.5} fill="#555" fontSize={9} textAnchor="end">{val.toFixed(1)}%</text>
                        </g>
                      );
                    })}

                    {/* Right Axis Tick Labels prices */}
                    {Array.from({ length: 6 }).map((_, i) => {
                      const fraction = i / 5;
                      const val = rightMin + fraction * (rightMax - rightMin);
                      const y = getRightY(val);
                      return (
                        <text key={i} x={width - paddingRight + 8} y={y + 3.5} fill="#4ade80" fillOpacity={0.7} fontSize={9} textAnchor="start">
                          ${val.toFixed(2)}
                        </text>
                      );
                    })}

                    {/* Vertical dates mesh lines */}
                    {xTickMarks.map(idx => (
                      <g key={idx}>
                        <line x1={getX(idx)} y1={paddingTop} x2={getX(idx)} y2={paddingTop + plotHeight} stroke="#121218" strokeWidth={1} />
                        <text x={getX(idx)} y={paddingTop + plotHeight + 14} fill="#555" fontSize={8.5} transform={`rotate(-25, ${getX(idx)}, ${paddingTop + plotHeight + 14})`} textAnchor="end">
                          {dataList[idx]?.date}
                        </text>
                      </g>
                    ))}

                    {/* Solid Bright Yellow Line - IV trend */}
                    <path d={dIv} fill="none" stroke="#facc15" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />

                    {/* Dotted White/Gray Line - Underlying close */}
                    <path d={dStock} fill="none" stroke="#999" strokeWidth={1.3} strokeDasharray="3,3" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Big Symbol Emblem watermark top left on chart canvas */}
                    <g transform="translate(85, 45)">
                      <rect width="110" height="48" rx="8" fill="#181820" stroke="#333" strokeWidth={1} />
                      <text x="55" y="32" fill="#eab308" fontSize="24" fontFamily="monospace" fontWeight="900" textAnchor="middle">{cleanSymbol}</text>
                    </g>

                    {/* Live hovering overlay detail values */}
                    {trendHoverIdx !== null && dataList[trendHoverIdx] && (
                      <g>
                        <line x1={getX(trendHoverIdx)} y1={paddingTop} x2={getX(trendHoverIdx)} y2={paddingTop + plotHeight} stroke="#fff" strokeWidth={1} strokeOpacity={0.25} />
                        {/* IV node point */}
                        <circle cx={getX(trendHoverIdx)} cy={getLeftY(dataList[trendHoverIdx].ivTrend)} r={4} fill="#facc15" stroke="#000" strokeWidth={1.5} />
                        {/* Price node point */}
                        <circle cx={getX(trendHoverIdx)} cy={getRightY(dataList[trendHoverIdx].underlyingPrice)} r={4} fill="#fff" stroke="#4ade80" strokeWidth={1.5} />
                      </g>
                    )}
                  </svg>

                  {/* Float Hover Card HUD top-right on Canvas */}
                  {trendHoverIdx !== null && dataList[trendHoverIdx] && (
                    <div className="absolute top-2 right-16 bg-black/95 border border-gray-800 p-2 text-[9px] pointer-events-none rounded shadow-2xl space-y-1 font-mono min-w-[155px]">
                      <div className="text-gray-400 font-extrabold border-b border-gray-800 pb-0.5 mb-1">
                        DATE: {dataList[trendHoverIdx].date}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#facc15] font-bold">14D 50-Delta IV:</span>
                        <strong className="text-white font-extrabold">{dataList[trendHoverIdx].ivTrend}%</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-400 font-bold">Underlying Close:</span>
                        <strong className="text-white font-extrabold">${dataList[trendHoverIdx].underlyingPrice}</strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Graphical Legend keys */}
          <div className="flex items-center justify-center gap-6 mt-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-[#facc15] inline-block" />
              <span className="text-gray-400">14D 50-Delta IV (Left Axis)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-gray-500 border-t border-dashed inline-block" />
              <span className="text-gray-400">Underlying Close (Right Axis)</span>
            </span>
          </div>
        </div>

        {/* CHART B: CALL OPTIONS HEATMAP (STRIKES VS DATES) */}
        <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5 flex flex-col justify-between relative shadow-xl">
          <div className="border-b border-gray-850 pb-2.5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-black text-white uppercase tracking-wider">
                {cleanSymbol} Call Options Daily Open Interest Change
              </span>
            </div>
            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold">
              TOTAL ΔOI SPREAD MAP
            </div>
          </div>

          <div className="text-[10px] text-gray-500 border-b border-gray-900/50 pb-1.5 mb-2.5">
            Centered around spot pricing &amp; Top 45 Strike buckets | Window: {heatmapDateRange} | Symmetric Clip 99th Pct
          </div>

          {/* Matrix Heatmap Scroll Workspace frame */}
          <div className="relative w-full h-[300px] overflow-auto bg-[#030305] border border-gray-900 p-1 select-none">
            {(() => {
              const dates = heatmapData.dates;
              const strikes = heatmapData.strikes;
              const cellW = 12;
              const cellH = 9.5;
              const labelW = 75;
              const labelH = 20;

              // Grid matrix canvas size calculations
              const svgW = labelW + strikes.length * cellW;
              const svgH = labelH + dates.length * cellH;

              // Heatmap continuous gradient render map helper
              const getCellColor = (val: number) => {
                if (val === 0) return 'rgba(10, 10, 15, 0.9)';
                if (val > 0) {
                  const factor = Math.min(1, val / 45);
                  return `rgba(0, 255, 128, ${0.15 + factor * 0.85})`; // emerald vibrant greens
                } else {
                  const factor = Math.min(1, Math.abs(val) / 40);
                  return `rgba(239, 68, 68, ${0.15 + factor * 0.85})`; // crimson/pink unwinds
                }
              };

              return (
                <div className="relative" style={{ minWidth: `${svgW}px` }}>
                  <svg width={svgW} height={svgH} className="font-mono">
                    {/* Draw Dates labels on left side column */}
                    {dates.map((d, dIdx) => (
                      <g key={d}>
                        <text x={labelW - 8} y={labelH + dIdx * cellH + 7.5} fill="#555" fontSize={8} textAnchor="end">
                          {d}
                        </text>
                        <line x1={labelW - 4} y1={labelH + dIdx * cellH} x2={labelW} y2={labelH + dIdx * cellH} stroke="#111" strokeWidth={1} />
                      </g>
                    ))}

                    {/* Draw Grid Cells and values */}
                    {dates.map((d, dIdx) => {
                      return strikes.map((strike, sIdx) => {
                        const val = heatmapData.grid[d][strike] || 0;
                        const cellX = labelW + sIdx * cellW;
                        const cellY = labelH + dIdx * cellH;

                        return (
                          <rect
                            key={`${d}_${strike}`}
                            x={cellX}
                            y={cellY}
                            width={cellW - 1}
                            height={cellH - 1}
                            fill={getCellColor(val)}
                            className="cursor-pointer hover:stroke-white hover:stroke-[1.2px] hover:z-20 transition-colors"
                            onMouseEnter={() => setHeatmapHoverPos({ x: strike.toFixed(1), y: d, val })}
                            onMouseLeave={() => setHeatmapHoverPos(null)}
                          />
                        );
                      });
                    })}

                    {/* Draw Strikes tilted labels at bottom */}
                    {strikes.map((s, sIdx) => {
                      const x = labelW + sIdx * cellW + cellW / 2;
                      return (
                        <g key={s}>
                          <line x1={x} y1={labelH - 4} x2={x} y2={labelH} stroke="#111" strokeWidth={1} />
                          {sIdx % 2 === 0 && (
                            <text
                              x={x}
                              y={labelH - 6}
                              fill="#666"
                              fontSize={7.5}
                              textAnchor="start"
                              transform={`rotate(-45, ${x}, ${labelH - 6})`}
                            >
                              ${s.toFixed(1)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>

                  {/* Heatmap Cell Metadata Tooltip */}
                  {heatmapHoverPos && (
                    <div className="absolute top-2 right-4 bg-black/95 border border-gray-800 p-2 w-[145px] text-[9px] font-mono rounded shadow-2xl select-none z-30 flex flex-col gap-0.5">
                      <div className="text-gray-400 font-extrabold pb-0.5 border-b border-gray-900">
                        OPTION FLOW DETAILS
                      </div>
                      <div className="flex justify-between"><span>Strike Target:</span><strong>${heatmapHoverPos.x}</strong></div>
                      <div className="flex justify-between"><span>Record Date:</span><strong>{heatmapHoverPos.y}</strong></div>
                      <div className="flex justify-between border-t border-gray-900 pt-0.5 mt-0.5">
                        <span>OI Change (ΔOI):</span>
                        <strong className={heatmapHoverPos.val >= 0 ? 'text-[#00ff80]' : 'text-red-400'}>
                          {heatmapHoverPos.val >= 0 ? '+' : ''}{heatmapHoverPos.val}K contracts
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Color Gradient Key Legend bottom */}
          <div className="flex items-center justify-between mt-3 text-[9.5px]">
            <span className="text-red-400 flex items-center gap-1.5">
              <span className="w-3.5 h-2 bg-red-600 inline-block" />
              -31.4K (Unwind Contracts)
            </span>
            <span className="text-gray-500 font-bold">Grid Heat Cell</span>
            <span className="text-emerald-400 flex items-center gap-1.5">
              <span className="w-3.5 h-2 bg-emerald-500 inline-block" />
              +31.4K (Fresh Call Built)
            </span>
          </div>
        </div>

      </div>

      {/* SECTION III: OPTION EXPIRATIONS POSITIONING FLOW & MAX PAIN TREND */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* LEFT COLUMN POSITIONING EXPIRY FLOW BARS (SPAN 7) */}
        <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5 xl:col-span-7 flex flex-col justify-between shadow-xl relative">
          <div className="border-b border-gray-850 pb-2.5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-black text-white uppercase tracking-wider">
                Positioning Flow: Call/Put ΔOI by Expiration Target
              </span>
            </div>
            <span className="text-[10px] text-gray-500 font-bold">Symmetric Net Bar layout</span>
          </div>

          <div className="text-[10px] text-gray-400 border-b border-gray-900 pb-2 mb-3.5 flex justify-between uppercase">
            <span>SPOT DEVIATION: ${activeTicker.basePrice.toFixed(2)}</span>
            <span className="text-yellow-400 flex items-center gap-0.5">
              ANOMALY = OPTION BUILD (ΔOI &gt; 2.0σ)
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 mb-3 text-[9px] font-mono">
            <div className="bg-black/35 border border-gray-900 p-2">
              <div className="text-gray-500 font-black uppercase mb-1">FLOW TIME FAMILY（时间族显隐）</div>
              <div className="flex flex-wrap gap-1">
                {flowExpiryFamilies.map(family => {
                  const hidden = hiddenFlowFamilies.includes(family.id);
                  return (
                    <button
                      key={family.id}
                      type="button"
                      onClick={() => toggleFlowFamily(family.id)}
                      className={`px-2 py-1 border font-black flex items-center gap-1 ${hidden ? 'border-gray-850 text-gray-600 bg-black' : 'border-purple-500/40 text-purple-300 bg-purple-950/20'}`}
                      title={`${family.description} | ${family.count} expiries`}
                    >
                      {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {family.label}
                      <span className="text-gray-500">({family.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-black/35 border border-gray-900 p-2 min-w-[220px]">
              <div className="text-gray-500 font-black uppercase mb-1">ΔOI SCALE（量级）</div>
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
                    onClick={() => setFlowScaleMode(item.value as ScaleMode)}
                    className={`px-1.5 py-1 border font-black ${flowScaleMode === item.value ? 'border-cyan-400 text-cyan-300 bg-cyan-950/25' : 'border-gray-850 text-gray-500 bg-black hover:text-white'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="text-[8px] text-gray-500 mt-1">示例 {formatScaledNumber(12300, flowScaleMode)}</div>
            </div>
          </div>

          {/* List layout of multiple Expirations grouped horizontally */}
          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
            {positioningFlowData.length === 0 ? (
              <div className="bg-black/35 border border-gray-900 px-4 py-10 text-center text-xs text-gray-500">
                当前时间族已全部隐藏，打开至少一个时间族后显示 ΔOI 定位流。
              </div>
            ) : positioningFlowData.map((exp, pIdx) => {
              return (
                <div key={exp.expiration} className="bg-black/35 border border-gray-900 p-3 flex flex-col md:flex-row md:items-center gap-3">
                  {/* Left Metadata Side Badge */}
                  <div className="md:w-[22%] border-r border-gray-850 pr-2.5 flex flex-col justify-center">
                    <span className="text-xs font-black text-white leading-none">{exp.expiration}</span>
                    <span className="text-[9.5px] font-extrabold text-purple-400 mt-1 uppercase">({exp.dte})</span>
                  </div>

                  {/* Horizontal Bar charts side-by-side representing Strikes inside expiration */}
                  <div className="flex-1 space-y-1.5 font-mono text-[9.5px] w-full">
                    <div className="flex justify-between text-[8px] text-gray-500 uppercase border-b border-gray-950 pb-0.5">
                      <span>&larr; Put ΔOI (Contracts build)</span>
                      <span>STRIKE</span>
                      <span>Call ΔOI (Contracts build) &rarr;</span>
                    </div>

                    {exp.strikes.map((sGroup, sIdx) => {
                      // Normalize sizes relative to max range (~16,000 contracts)
                      const maxBound = 16000;
                      const callW = Math.min(100, Math.max(2, (Math.abs(sGroup.callDelta) / maxBound) * 100));
                      const putW = Math.min(100, Math.max(2, (Math.abs(sGroup.putDelta) / maxBound) * 100));

                      return (
                        <div key={sIdx} className="flex items-center gap-1.5 w-full">

                          {/* Left side Put Bar (Orange/Coral) */}
                          <div className="flex-1 flex justify-end">
                            <div className="flex items-center gap-1.5 w-full justify-end max-w-[200px]">
                              {sGroup.putDelta > 1000 && sGroup.isAnomaly && (
                                <span className="text-yellow-500 scale-[1.1] animate-bounce">*</span>
                              )}
                              <span className="text-red-400 font-medium opacity-60 text-[8px] min-w-[42px] text-right">{formatScaledNumber(sGroup.putDelta, flowScaleMode)}</span>
                              <div
                                style={{ width: `${putW}%` }}
                                className={`h-2.5 rounded-l transition-all ${sGroup.putDelta >= 0 ? 'bg-red-500/80 border-r border-[#ff3333]' : 'bg-red-950/20 opacity-40 border-r border-gray-700'}`}
                              />
                            </div>
                          </div>

                          {/* Central Strike Price Node Label */}
                          <div className="w-[15%] text-center text-white font-extrabold bg-[#111] px-1.5 py-0.5 rounded border border-gray-800 shrink-0 select-none">
                            ${sGroup.strike}
                          </div>

                          {/* Right side Call Bar (Emerald vibrant green) */}
                          <div className="flex-1 flex justify-start">
                            <div className="flex items-center gap-1.5 w-full justify-start max-w-[200px]">
                              <div
                                style={{ width: `${callW}%` }}
                                className={`h-2.5 rounded-r transition-all ${sGroup.callDelta >= 0 ? 'bg-emerald-500/80 border-l border-[#00ff80]' : 'bg-emerald-950/20 opacity-40 border-l border-gray-700'}`}
                              />
                              <span className="text-[#00ffcc] font-medium opacity-60 text-[8px] min-w-[42px]">{formatScaledNumber(sGroup.callDelta, flowScaleMode)}</span>
                              {sGroup.callDelta > 11000 && sGroup.isAnomaly && (
                                <span className="text-yellow-500 scale-[1.1] animate-bounce">*</span>
                              )}
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footnotes tags description */}
          <div className="text-[8.5px] text-gray-500 leading-normal mt-2.5 font-sans">
            * Bars Right = Call Open Interest expansion/unwind; Bars Left = Put Open Interest build up matching total daily transaction flows. Spot nearest to standard strike parameters labeled in white boxes.
          </div>
        </div>

        {/* RIGHT COLUMN: MAX PAIN PRICE TREND GRAPH (SPAN 5) */}
        <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5 xl:col-span-5 flex flex-col justify-between shadow-xl relative">
          <div className="border-b border-gray-850 pb-2.5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-red-400" />
              <span className="text-xs font-black text-white uppercase tracking-wider">
                Max Pain Price Trend
              </span>
            </div>
            <span className="bg-red-500/10 text-red-400 border border-red-500/30 rounded px-2 py-0.5 text-[8px] font-extrabold">
              GRAVITY WELL MATRIX
            </span>
          </div>

          <div className="text-[10px] text-gray-500 pb-1.5 mb-2.5 border-b border-gray-900/50">
            Mapping max pain history ({maxPainDateRange}) | Expiries: {selectedExpiryLabel}
          </div>

          {/* SVG Max Pain Curve rendering panel */}
          <div className="w-full relative min-h-[300px] flex items-center justify-center bg-black/40 border border-gray-900 p-2">
            {(() => {
              const width = 440;
              const height = 280;
              const paddingLeft = 45;
              const paddingRight = 15;
              const paddingTop = 25;
              const paddingBottom = 40;

              const plotWidth = width - paddingLeft - paddingRight;
              const plotHeight = height - paddingTop - paddingBottom;

              const seriesNames = maxPainPriceTrendDataCalculated().seriesNames;
              const dates = maxPainPriceTrendDataCalculated().dates;
              const chartData = maxPainPriceTrendDataCalculated().data;

              // Find bounds centering on prices
              const allValues: number[] = [];
              chartData.forEach(d => {
                seriesNames.forEach(name => {
                  allValues.push(d.series[name]);
                });
              });

              const spot = activeTicker.basePrice;
              const minVal = Math.max(1.0, Math.min(spot * 0.55, ...allValues) * 0.95);
              const maxVal = Math.max(10.0, Math.max(spot * 1.05, ...allValues) * 1.05);

              const getX = (idx: number) => paddingLeft + idx * (plotWidth / (dates.length - 1));
              const getY = (val: number) => paddingTop + plotHeight - ((val - minVal) / (maxVal - minVal)) * plotHeight;

              // Lines collection colors matching red tones in screenshot!
              const seriesColors = [
                '#991b1b', // dark red-800
                '#dc2626', // medium red-600
                '#f87171', // light pink-red-400
                '#fca5a5'  // thin red-300
              ];

              return (
                <div className="w-full relative">
                  <svg
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    className="overflow-visible select-none cursor-crosshair font-mono"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = e.clientX - rect.left - paddingLeft;
                      if (relX < 0 || relX > plotWidth) { setMaxPainHoverIdx(null); return; }
                      const fraction = relX / plotWidth;
                      const idx = Math.min(dates.length - 1, Math.max(0, Math.round(fraction * (dates.length - 1))));
                      setMaxPainHoverIdx(idx);
                    }}
                    onMouseLeave={() => setMaxPainHoverIdx(null)}
                  >
                    {/* Grid mesh backdrop */}
                    <rect x={paddingLeft} y={paddingTop} width={plotWidth} height={plotHeight} fill="#020204" />

                    {/* Y-Axes Grids */}
                    {Array.from({ length: 5 }).map((_, i) => {
                      const fraction = i / 4;
                      const val = minVal + fraction * (maxVal - minVal);
                      const y = getY(val);
                      return (
                        <g key={i}>
                          <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#121218" strokeWidth={1} strokeDasharray="3,3" />
                          <text x={paddingLeft - 8} y={y + 3} fill="#555" fontSize={8} textAnchor="end">${val.toFixed(2)}</text>
                        </g>
                      );
                    })}

                    {/* Date labels X-axis */}
                    {[0, Math.floor(dates.length * 0.33), Math.floor(dates.length * 0.66), dates.length - 1].map(idx => (
                      <g key={idx}>
                        <line x1={getX(idx)} y1={paddingTop} x2={getX(idx)} y2={paddingTop + plotHeight} stroke="#121218" strokeWidth={1} />
                        <text x={getX(idx)} y={paddingTop + plotHeight + 14} fill="#555" fontSize={7.5} textAnchor="middle">
                          {dates[idx]}
                        </text>
                      </g>
                    ))}

                    {/* Dotted CURRENT UNDERLYING STOCK PRICE reference horizontal bar */}
                    <line
                      x1={paddingLeft}
                      y1={getY(spot)}
                      x2={width - paddingRight}
                      y2={getY(spot)}
                      stroke="#999"
                      strokeWidth={1.5}
                      strokeDasharray="4,4"
                      strokeOpacity={0.8}
                    />

                    {/* Custom CURRENT PRICE badge watermark at center of dotted line */}
                    <g transform={`translate(${paddingLeft + plotWidth / 2 - 50}, ${getY(spot) - 13})`}>
                      <rect width="100" height="15" rx="3" fill="#181820" stroke="#444" strokeWidth={0.8} />
                      <text x="50" y="10" fill="#fff" fontSize="7.5" fontWeight="bold" textAnchor="middle">
                        CURRENT PLACE (${spot.toFixed(2)})
                      </text>
                    </g>

                    {/* Plot Series max pain lines */}
                    {seriesNames.map((exp, sIdx) => {
                      let dStr = '';
                      chartData.forEach((item, idx) => {
                        const x = getX(idx);
                        const y = getY(item.series[exp] || spot);
                        dStr += `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                      });

                      const color = seriesColors[sIdx] || '#ff4444';

                      return (
                        <g key={exp}>
                          <path d={dStr} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                          {/* Draw end node circle */}
                          {chartData[chartData.length - 1] && (
                            <circle
                              cx={getX(dates.length - 1)}
                              cy={getY(chartData[chartData.length - 1].series[exp] || spot)}
                              r={3}
                              fill={color}
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Hover vertical alignment bar */}
                    {maxPainHoverIdx !== null && chartData[maxPainHoverIdx] && (
                      <line x1={getX(maxPainHoverIdx)} y1={paddingTop} x2={getX(maxPainHoverIdx)} y2={paddingTop + plotHeight} stroke="#fff" strokeWidth={1} strokeOpacity={0.25} />
                    )}

                  </svg>

                  {/* Hover HUD details Overlay bottom of the canvas */}
                  {maxPainHoverIdx !== null && chartData[maxPainHoverIdx] && (
                    <div className="absolute top-2 right-4 bg-black/95 border border-gray-800 p-2 text-[8.5px] rounded shadow-2xl space-y-1 font-mono min-w-[155px] text-left pointer-events-none">
                      <div className="text-gray-400 font-extrabold border-b border-gray-850 pb-0.5 mb-1 uppercase">
                        Snapshot: {chartData[maxPainHoverIdx].date}
                      </div>
                      {seriesNames.map((exp, sIdx) => (
                        <div key={exp} className="flex justify-between gap-4">
                          <span className="flex items-center gap-1 font-semibold" style={{ color: seriesColors[sIdx] }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: seriesColors[sIdx] }} />
                            Exp {exp}:
                          </span>
                          <strong className="text-white">${chartData[maxPainHoverIdx].series[exp]}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              );
            })()}
          </div>

          {/* Custom Labels mapped legends below chart */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3.5 text-[8px] tracking-tight text-gray-500 font-bold uppercase select-none">
            {maxPainPriceTrendDataCalculated().seriesNames.map((name, sIdx) => {
              const colors = ['#991b1b', '#dc2626', '#f87171', '#fca5a5'];
              return (
                <span key={name} className="flex items-center gap-1 border border-gray-900 bg-[#16161a] px-2 py-1">
                  <span className="w-2.5 h-1.5 inline-block" style={{ backgroundColor: colors[sIdx] }} />
                  Max Pain ({name})
                </span>
              );
            })}
          </div>
        </div>

      </div>
        </>
      )}
    </>
  ) : (
        <div className="bg-[#0e0e11] border border-gray-900 rounded-none p-5.5 shadow-xl animate-fadeIn space-y-4">
          <div className="border-b border-gray-850 pb-3 mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-md font-extrabold text-[#ff9f1c] flex items-center gap-2 uppercase">
                <BarChart2 className="w-5 h-5 text-[#ff9f1c]" />
                Strike Open Interest (OI) Distribution
              </h3>
              <p className="text-[10px] text-gray-500 mt-1 leading-normal font-sans text-left">
                Active target code: <span className="text-white font-mono font-bold bg-[#ff9f1c]/10 px-1 py-0.5 rounded">{selectedTickerSymbol}</span> | Price Spot: <span className="text-emerald-400 font-mono font-bold">${activeTicker.basePrice.toFixed(2)}</span>
              </p>
            </div>
            <span className="bg-[#ff9f1c]/10 text-[#ff9f1c] border border-[#ff9f1c]/30 rounded px-2 py-0.5 text-[8.5px] font-extrabold">
              DIRECT CONTRACT FEED
            </span>
          </div>

          <div className="w-full">
            <OpenInterestDistribution
              activeSymbol={selectedTickerSymbol}
              currentStockPrice={activeTicker.basePrice}
              asOfDate={asOfDate}
              liveExpiries={liveExpiryChoices}
              liveChain={effectiveLiveChain}
            />
          </div>
        </div>
      )}

    </div>
  );

  // Helper internal data formatting closures
  function maxPainPriceTrendDataCalculated() {
    return maxPainTrendData;
  }
}
