/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OptionLeg, PositionLeg, StockLeg, Greeks } from '../types';

// Cumulative Standard Normal Distribution (high accuracy polynomial approximation)
export function cdfNormal(x: number): number {
  if (isNaN(x)) return 0.5;
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c2 = 0.39894228; // 1 / sqrt(2 * PI)

  if (x >= 0.0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c2 * Math.exp(-x * x / 2.0) * t *
      (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c2 * Math.exp(-x * x / 2.0) * t *
      (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

// Probability Density Function (PDF) of standard normal distribution
export function pdfNormal(x: number): number {
  if (isNaN(x)) return 0.39894228;
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes pricing
 * @param S Stock Price
 * @param K Strike Price
 * @param days Days to Expiry
 * @param iv Volatility in percentage (e.g. 30)
 * @param r Risk-Free Rate in percentage (e.g. 4.5)
 * @param type 'call' | 'put'
 */
export function calculateBSPrice(
  S: number,
  K: number,
  days: number,
  iv: number,
  r: number,
  type: 'call' | 'put'
): number {
  if (days <= 0.001) {
    // Payoff at expiration
    return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  const T = days / 365.0;
  const sigma = iv / 100.0;
  const rate = r / 100.0;

  if (sigma <= 0) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);

  const d1 = (Math.log(S / K) + (rate + (sigma * sigma) / 2.0) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (type === 'call') {
    return S * cdfNormal(d1) - K * Math.exp(-rate * T) * cdfNormal(d2);
  } else {
    return K * Math.exp(-rate * T) * cdfNormal(-d2) - S * cdfNormal(-d1);
  }
}

/**
 * Calculates Greeks for a single standard European Option
 */
export function calculateBSGreeks(
  S: number,
  K: number,
  days: number,
  iv: number,
  r: number,
  type: 'call' | 'put'
): Greeks {
  if (days <= 0.05) {
    // Greeks degenerate at expiration. Return boundary values or 0
    return {
      delta: type === 'call' ? (S > K ? 1.0 : 0.0) : (S < K ? -1.0 : 0.0),
      gamma: 0,
      vega: 0,
      theta: 0,
    };
  }

  const T = days / 365.0;
  const sigma = iv / 100.0;
  const rate = r / 100.0;

  if (sigma <= 0) {
    return {
      delta: type === 'call' ? (S > K ? 1.0 : 0.0) : (S < K ? -1.0 : 0.0),
      gamma: 0,
      vega: 0,
      theta: 0,
    };
  }

  const d1 = (Math.log(S / K) + (rate + (sigma * sigma) / 2.0) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const n_d1 = pdfNormal(d1);
  const N_d1 = cdfNormal(d1);
  const N_d2 = cdfNormal(d2);

  // Gamma (Same for Call/Put)
  const gamma = n_d1 / (S * sigma * Math.sqrt(T));

  // Vega (Same for Call/Put, standard is output divided by 100 to show per 1% IV change)
  const vega = (S * Math.sqrt(T) * n_d1) / 100.0;

  let delta = 0;
  let theta = 0;

  if (type === 'call') {
    delta = N_d1;
    // Theta is usually negative. Show annual theta divided by 365 for daily theta.
    const theta1 = -(S * n_d1 * sigma) / (2.0 * Math.sqrt(T));
    const theta2 = rate * K * Math.exp(-rate * T) * N_d2;
    theta = (theta1 - theta2) / 365.0;
  } else {
    delta = N_d1 - 1.0;
    const theta1 = -(S * n_d1 * sigma) / (2.0 * Math.sqrt(T));
    const theta2 = rate * K * Math.exp(-rate * T) * cdfNormal(-d2);
    theta = (theta1 + theta2) / 365.0;
  }

  return { delta, gamma, vega, theta };
}

/**
 * Calculates options payoff at expiration for a specific stock price
 */
function isStockLeg(leg: PositionLeg): leg is StockLeg {
  return leg.kind === 'stock';
}

function calculateStockLegPnL(leg: StockLeg, S: number): number {
  const multiplier = leg.side === 'buy' ? 1 : -1;
  return (S - leg.entryPrice) * multiplier * leg.quantity;
}

export function calculateLegPayoff(leg: PositionLeg, S: number): number {
  if (isStockLeg(leg)) {
    return calculateStockLegPnL(leg, S);
  }

  const multiplier = leg.side === 'buy' ? 1 : -1;
  const finalValue = leg.type === 'call' ? Math.max(0, S - leg.strike) : Math.max(0, leg.strike - S);

  // profit/loss = (Value at expiration - entered price) * multiplier * contracts * 100
  // note that standard US option contract is for 100 shares
  return (finalValue - leg.premium) * multiplier * leg.quantity * 100;
}

/**
 * Calculates option value and P&L at some time before expiration
 */
export function calculateLegValueAndPnL(
  leg: PositionLeg,
  currentStockPrice: number,
  targetDays: number,
  r: number
): { value: number; pnl: number; Greeks: Greeks } {
  if (isStockLeg(leg)) {
    const pnl = calculateStockLegPnL(leg, currentStockPrice);
    const multiplier = leg.side === 'buy' ? 1 : -1;
    return {
      value: currentStockPrice,
      pnl,
      Greeks: {
        delta: multiplier * leg.quantity,
        gamma: 0,
        vega: 0,
        theta: 0,
      },
    };
  }

  // If targetDays is exceedingly close to 0, use payoff logic
  if (targetDays <= 0.01) {
    const finalValue = leg.type === 'call' ? Math.max(0, currentStockPrice - leg.strike) : Math.max(0, leg.strike - currentStockPrice);
    const pnl = calculateLegPayoff(leg, currentStockPrice);
    return {
      value: finalValue,
      pnl,
      Greeks: {
        delta: leg.side === 'buy' ? (leg.type === 'call' ? (currentStockPrice > leg.strike ? 1 : 0) : (currentStockPrice < leg.strike ? -1 : 0)) : (leg.type === 'call' ? (currentStockPrice > leg.strike ? -1 : 0) : (currentStockPrice < leg.strike ? 1 : 0)),
        gamma: 0,
        vega: 0,
        theta: 0
      }
    };
  }

  const priceNow = calculateBSPrice(currentStockPrice, leg.strike, targetDays, leg.iv, r, leg.type);
  const multiplier = leg.side === 'buy' ? 1 : -1;

  // profit/loss = (current price - entry price) * buy/sell multiplier * quantity * 100
  const pnl = (priceNow - leg.premium) * multiplier * leg.quantity * 100;

  const bsGreeks = calculateBSGreeks(currentStockPrice, leg.strike, targetDays, leg.iv, r, leg.type);
  const positionGreeks = {
    delta: bsGreeks.delta * multiplier * leg.quantity * 100,
    gamma: bsGreeks.gamma * multiplier * leg.quantity * 100,
    vega: bsGreeks.vega * multiplier * leg.quantity * 100,
    theta: bsGreeks.theta * multiplier * leg.quantity * 100,
  };

  return {
    value: priceNow,
    pnl,
    Greeks: positionGreeks
  };
}

export function calculatePositionPayoff(legs: PositionLeg[], S: number): number {
  return legs.reduce((total, leg) => total + calculateLegPayoff(leg, S), 0);
}

export function calculatePositionValueAndPnL(
  legs: PositionLeg[],
  currentStockPrice: number,
  targetDays: number,
  r: number
): { value: number; pnl: number; Greeks: Greeks } {
  return legs.reduce(
    (total, leg) => {
      const legState = calculateLegValueAndPnL(leg, currentStockPrice, targetDays, r);
      return {
        value: total.value + legState.value,
        pnl: total.pnl + legState.pnl,
        Greeks: {
          delta: total.Greeks.delta + legState.Greeks.delta,
          gamma: total.Greeks.gamma + legState.Greeks.gamma,
          vega: total.Greeks.vega + legState.Greeks.vega,
          theta: total.Greeks.theta + legState.Greeks.theta,
        },
      };
    },
    {
      value: 0,
      pnl: 0,
      Greeks: {
        delta: 0,
        gamma: 0,
        vega: 0,
        theta: 0,
      },
    }
  );
}

/**
 * Aggregate metrics of a custom multi-leg strategy
 */
export interface StrategyAnalysis {
  netPremium: number; // cost or credit (+ for debit, - for credit)
  currentPnL: number;
  maxProfit: number; // infinity represented as Infinity
  maxLoss: number;
  breakevens: number[];
  greeks: Greeks;
}

export function analyzeStrategy(
  legs: PositionLeg[],
  currentStockPrice: number,
  daysToExpiry: number,
  r: number
): StrategyAnalysis {
  let netPremium = 0;
  let portfolioDelta = 0;
  let portfolioGamma = 0;
  let portfolioVega = 0;
  let portfolioTheta = 0;

  for (const leg of legs) {
    if (isStockLeg(leg)) {
      const costFactor = leg.side === 'buy' ? 1 : -1;
      netPremium += leg.entryPrice * costFactor * leg.quantity;
    } else {
      const costFactor = leg.side === 'buy' ? 1 : -1;
      netPremium += leg.premium * costFactor * leg.quantity * 100;
    }

    // Calculate dynamic Greeks at the current Stock Price
    const legAnalysis = calculateLegValueAndPnL(leg, currentStockPrice, daysToExpiry, r);
    portfolioDelta += legAnalysis.Greeks.delta;
    portfolioGamma += legAnalysis.Greeks.gamma;
    portfolioVega += legAnalysis.Greeks.vega;
    portfolioTheta += legAnalysis.Greeks.theta;
  }

  // To find Max Profit and Max Loss, sample the strategy payoff across a wide range of prices around strikes
  const anchorPrices = legs.map(l => isStockLeg(l) ? l.entryPrice : l.strike);
  const minStrike = anchorPrices.length > 0 ? Math.min(...anchorPrices) : currentStockPrice;
  const maxStrike = anchorPrices.length > 0 ? Math.max(...anchorPrices) : currentStockPrice;

  const sampleMin = Math.max(1, minStrike * 0.1);
  const sampleMax = maxStrike * 2;
  const steps = 1500;
  const stepSize = (sampleMax - sampleMin) / steps;

  let sampledMaxProfit = -Infinity;
  let sampledMaxLoss = Infinity;

  const samplePoints: { S: number; pnl: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const S = sampleMin + i * stepSize;
    let totalPayoff = 0;
    for (const leg of legs) {
      totalPayoff += calculateLegPayoff(leg, S);
    }
    sampledMaxProfit = Math.max(sampledMaxProfit, totalPayoff);
    sampledMaxLoss = Math.min(sampledMaxLoss, totalPayoff);
    samplePoints.push({ S, pnl: totalPayoff });
  }

  // Find breakeven points where PnL crosses 0
  const breakevens: number[] = [];
  for (let i = 0; i < samplePoints.length - 1; i++) {
    const pt1 = samplePoints[i];
    const pt2 = samplePoints[i+1];
    if ((pt1.pnl <= 0 && pt2.pnl > 0) || (pt1.pnl >= 0 && pt2.pnl < 0)) {
      // Linear interpolation to find precise point
      const ratio = Math.abs(pt1.pnl) / (Math.abs(pt1.pnl) + Math.abs(pt2.pnl));
      const strikeIdx = pt1.S + ratio * (pt2.S - pt1.S);
      breakevens.push(Number(strikeIdx.toFixed(2)));
    }
  }

  // Check asymptotic endpoints to determine if max profit/loss are theoretical infinity
  let isMaxProfitInfinity = false;
  let isMaxLossInfinity = false;

  const leftTailPnL = samplePoints[0].pnl;
  const rightTailPnL = samplePoints[samplePoints.length - 1].pnl;
  const prevLeftTailPnL = samplePoints[1].pnl;
  const prevRightTailPnL = samplePoints[samplePoints.length - 2].pnl;

  if (rightTailPnL > prevRightTailPnL + 0.01) {
    // Rising infinitely towards the right
    isMaxProfitInfinity = true;
  } else if (rightTailPnL < prevRightTailPnL - 0.01) {
    isMaxLossInfinity = true;
  }

  if (leftTailPnL > prevLeftTailPnL + 0.01) {
    isMaxProfitInfinity = true;
  } else if (leftTailPnL < prevLeftTailPnL - 0.01) {
    isMaxLossInfinity = true;
  }

  return {
    netPremium,
    currentPnL: calculatePositionValueAndPnL(legs, currentStockPrice, daysToExpiry, r).pnl,
    maxProfit: isMaxProfitInfinity ? Infinity : sampledMaxProfit,
    maxLoss: isMaxLossInfinity ? -Infinity : sampledMaxLoss,
    breakevens: breakevens.filter((v, i, self) => self.indexOf(v) === i), // deduplicate
    greeks: {
      delta: portfolioDelta,
      gamma: portfolioGamma,
      vega: portfolioVega,
      theta: portfolioTheta,
    }
  };
}
