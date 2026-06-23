import type { OptionLeg } from '../types';
import { calculateLegPayoff, calculateLegValueAndPnL } from './optionsMath';

export interface TwoDChartScalePoint {
  S: number;
  expiryPnL: number;
  currentPnL: number;
  timelinePnLs: number[];
  legPnLs: number[];
}

export interface TwoDChartScale {
  xMin: number;
  xMax: number;
  xRange: number;
  yLower: number;
  yUpper: number;
  yRange: number;
  sampleData: TwoDChartScalePoint[];
}

interface BuildTwoDChartScaleInput {
  legs: OptionLeg[];
  currentStockPrice: number;
  daysToExpiry: number;
  r: number;
  xZoomPercent: number;
  samples?: number;
  includeIndividualLegs: boolean;
  visibleDecayDays: number[];
}

export function resolveLegScenarioDays(leg: OptionLeg, targetDays: number, maxExpiry: number): number {
  return Math.max(0.01, targetDays * (leg.expiryDays / maxExpiry));
}

function pushFinite(values: number[], value: number) {
  if (Number.isFinite(value)) values.push(value);
}

function resolveVisibleXDomain(legs: OptionLeg[], currentStockPrice: number, xZoomPercent: number) {
  const paddingFactor = Math.max(0.05, Math.min(0.85, xZoomPercent / 100));
  const zoomSpan = Math.max(1, currentStockPrice * paddingFactor);
  const strikes = legs.map((leg) => leg.strike).filter(Number.isFinite);
  const minStrike = strikes.length > 0 ? Math.min(...strikes) : currentStockPrice;
  const maxStrike = strikes.length > 0 ? Math.max(...strikes) : currentStockPrice;
  const strikeSpan = Math.max(1, maxStrike - minStrike);
  const topologyPadding = Math.max(zoomSpan * 0.16, strikeSpan * 0.18, currentStockPrice * 0.035, 1);

  return {
    xMin: Math.max(1, Math.min(currentStockPrice - zoomSpan, minStrike - topologyPadding)),
    xMax: Math.max(currentStockPrice + zoomSpan, maxStrike + topologyPadding),
  };
}

export function buildTwoDChartScale({
  legs,
  currentStockPrice,
  daysToExpiry,
  r,
  xZoomPercent,
  samples = 200,
  includeIndividualLegs,
  visibleDecayDays,
}: BuildTwoDChartScaleInput): TwoDChartScale {
  const { xMin, xMax } = resolveVisibleXDomain(legs, currentStockPrice, xZoomPercent);
  const xRange = Math.max(0.01, xMax - xMin);
  const sampleCount = Math.max(1, Math.floor(samples));
  const maxExpiry = Math.max(...legs.map((leg) => leg.expiryDays), 30);
  const sampleData: TwoDChartScalePoint[] = [];
  const yValues: number[] = [0];

  for (let i = 0; i <= sampleCount; i++) {
    const S = xMin + (i / sampleCount) * xRange;
    let expiryPnL = 0;
    let currentPnL = 0;

    for (const leg of legs) {
      expiryPnL += calculateLegPayoff(leg, S);
      const legState = calculateLegValueAndPnL(
        leg,
        S,
        resolveLegScenarioDays(leg, daysToExpiry, maxExpiry),
        r,
      );
      currentPnL += legState.pnl;
    }

    const timelinePnLs = visibleDecayDays.map((days) => {
      let timelinePnL = 0;
      for (const leg of legs) {
        if (days < 0.1) {
          timelinePnL += calculateLegPayoff(leg, S);
        } else {
          const state = calculateLegValueAndPnL(
            leg,
            S,
            resolveLegScenarioDays(leg, days, maxExpiry),
            r,
          );
          timelinePnL += state.pnl;
        }
      }
      return timelinePnL;
    });

    const legPnLs = includeIndividualLegs
      ? legs.map((leg) => calculateLegPayoff(leg, S))
      : [];

    pushFinite(yValues, expiryPnL);
    pushFinite(yValues, currentPnL);
    timelinePnLs.forEach((value) => pushFinite(yValues, value));
    legPnLs.forEach((value) => pushFinite(yValues, value));

    sampleData.push({
      S,
      expiryPnL,
      currentPnL,
      timelinePnLs,
      legPnLs,
    });
  }

  const activeYMin = Math.min(...yValues);
  const activeYMax = Math.max(...yValues);
  const activeYRange = activeYMax - activeYMin;
  const yPadding = Math.max(activeYRange * 0.18, 120);
  const yLower = activeYMin - yPadding;
  const yUpper = activeYMax + yPadding;
  const yRange = Math.max(1, yUpper - yLower);

  return {
    xMin,
    xMax,
    xRange,
    yLower,
    yUpper,
    yRange,
    sampleData,
  };
}
