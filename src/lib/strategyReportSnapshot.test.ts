import assert from 'node:assert/strict';
import { resolveStrategyReportSnapshot } from './strategyReportSnapshot';

const baseAnalysis = {
  netPremium: 400,
  currentPnL: 20,
  maxProfit: 900,
  maxLoss: -400,
  breakevens: [104],
  greeks: { delta: 12, gamma: 0.1, vega: 1.2, theta: -0.4 },
};

assert.deepEqual(
  resolveStrategyReportSnapshot({
    activeSymbol: 'MRVL',
    strategyName: 'Long Call',
    analysis: baseAnalysis,
    rustAnalysis: {
      ok: true,
      engine: 'rust-option-core-cli',
      result: {
        engine: 'rust-option-core',
        net_premium: 250,
        current_pnl: 251.349444,
        max_profit: 750,
        max_loss: -250,
        breakevens: [102.5],
        greeks: { delta: 41.84, gamma: -0.43, vega: -1.18, theta: 0.06 },
        scenarios: [],
      },
    },
  }),
  {
    strategyName: 'Long Call',
    symbol: 'MRVL',
    engineLabel: 'Rust option-core · institutional position analysis',
    netPremium: 250,
    currentPnL: 251.349444,
    maxProfit: 750,
    maxLoss: -250,
    breakevens: [102.5],
    greeks: { delta: 41.84, gamma: -0.43, vega: -1.18, theta: 0.06 },
  },
);

assert.deepEqual(
  resolveStrategyReportSnapshot({
    activeSymbol: 'MU',
    strategyName: 'Fallback',
    analysis: baseAnalysis,
    rustAnalysis: { ok: false, error: 'bridge unavailable' },
  }),
  {
    strategyName: 'Fallback',
    symbol: 'MU',
    engineLabel: 'TypeScript Black-Scholes fallback',
    netPremium: 400,
    currentPnL: 20,
    maxProfit: 900,
    maxLoss: -400,
    breakevens: [104],
    greeks: { delta: 12, gamma: 0.1, vega: 1.2, theta: -0.4 },
  },
);

console.log('strategyReportSnapshot helpers passed');
