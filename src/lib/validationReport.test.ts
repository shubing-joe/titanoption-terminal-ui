import assert from 'node:assert/strict';
import {
  computeEngineSummary,
  formatQualityRatio,
  publicSandboxNote,
  resolveValidationChain,
  summarizeRustPositionAnalysis,
  summarizeReplayValidation,
} from './validationReport';

assert.equal(
  formatQualityRatio({ input_count: 236, accepted_count: 229, rejected_count: 7, rejection_reasons: { iv_outlier: 7 } }),
  '97.0% pass · 229/236',
);
assert.equal(formatQualityRatio(undefined), 'N/A');

assert.deepEqual(
  summarizeReplayValidation({
    total_rows: 4,
    accepted_rows: 2,
    rejected_rows: 2,
    pricing_checks: 2,
    max_abs_diff: 0.0035,
    avg_abs_diff: 0.0032,
    warnings: ['row 2 rejected: crossed_market'],
  }),
  {
    status: 'PASS',
    text: '2 checks · max diff $0.0035 · rejected 2/4',
  },
);

assert.equal(
  publicSandboxNote('no_execution'),
  'No order submission · no routing integration',
);

assert.deepEqual(
  computeEngineSummary({
    liveChain: [
      { type: 'call', expiry: '2026-06-18', strike: 300, bid: 10, ask: 11, mark: 10.5, volume: 100, openInterest: 200, iv: 120, delta: 0.61, gamma: 0.01, theta: -0.4, vega: 0.12, source: 'public_mock_options_snapshot' },
      { type: 'put', expiry: '2026-06-18', strike: 300, bid: 8, ask: 9, mark: 8.5, volume: 90, openInterest: 180, iv: 118, delta: null, gamma: null, theta: null, vega: null, source: 'model' },
    ],
    replayResult: {
      total_rows: 4,
      accepted_rows: 3,
      rejected_rows: 1,
      pricing_checks: 3,
      max_abs_diff: 0.0042,
      avg_abs_diff: 0.0018,
      warnings: [],
    },
    rustCoreEnabled: true,
  }),
  {
    status: 'PARTIAL_MODEL',
    engineLabel: 'Public mock validation + option-core interface',
    greekCoverageLabel: 'Greeks coverage 50.0% · 1/2 rows',
    replayLabel: 'Reference replay 3 checks · max diff $0.0042',
    rustLabel: 'Rust option-core compiled · payoff/Greeks/scenario bridge ready',
    degradationLabel: '1 model/fallback rows require caution',
  },
);

assert.deepEqual(
  resolveValidationChain({
    ok: true,
    chain: [],
    optionMarketSnapshot: {
      symbol: 'MRVL',
      underlying: { symbol: 'MRVL', price: 308.88, change: 1, changePercent: 0.3, iv: 120 },
      expiries: [],
      qualitySummary: { input_count: 1, accepted_count: 1, rejected_count: 0, rejection_reasons: {} },
      volSurface: {},
      diagnostics: {},
      normalizedChain: [
        { contractTicker: 'O:MRVL260618C00300000', symbol: 'MRVL', type: 'call', expiry: '2026-06-18', strike: 300, bid: 8, ask: 9, mark: 8.5, mid: 8.5, volume: 100, openInterest: 200, iv: 120, delta: 0.5, gamma: 0.01, theta: -0.2, vega: 0.1, source: 'public_mock_options_snapshot' },
      ],
    },
  }).map(row => row.contractTicker),
  ['O:MRVL260618C00300000'],
);

assert.deepEqual(
  computeEngineSummary({
    liveChain: [],
    qualitySummary: { input_count: 239, accepted_count: 229, rejected_count: 10, rejection_reasons: { stale_quote: 10 } },
    replayResult: {
      total_rows: 4,
      accepted_rows: 3,
      rejected_rows: 1,
      pricing_checks: 3,
      max_abs_diff: 0.0042,
      avg_abs_diff: 0.0018,
      warnings: [],
    },
    rustCoreEnabled: true,
  }),
  {
    status: 'PARTIAL_MODEL',
    engineLabel: 'Public mock validation + option-core interface',
    greekCoverageLabel: 'Greeks coverage pending · quality gate 229/239 rows',
    replayLabel: 'Reference replay 3 checks · max diff $0.0042',
    rustLabel: 'Rust option-core compiled · payoff/Greeks/scenario bridge ready',
    degradationLabel: 'Detailed Greeks row coverage pending from live chain payload',
  },
);

assert.deepEqual(
  summarizeRustPositionAnalysis({
    ok: true,
    engine: 'rust-option-core-cli',
    result: {
      engine: 'rust-option-core',
      net_premium: 250,
      current_pnl: 251.349444,
      max_profit: 750,
      max_loss: -250,
      breakevens: [102.5],
      quality_score: 92,
      risk_flags: ['defined_risk', 'positive_delta', 'short_gamma', 'theta_positive'],
      greeks: { delta: 41.84, gamma: -0.43, vega: -1.18, theta: 0.06 },
      scenarios: [{ spot: 95, pnl: -250 }],
    },
  }),
  {
    status: 'PASS',
    text: 'rust-option-core-cli · score 92/100 · net $250.00 · PnL $251.35 · B/E 102.5',
    riskText: 'Max +$750.00 / -$250.00 · flags defined_risk / positive_delta / short_gamma / theta_positive · Δ 41.84 · Γ -0.43 · ν -1.18 · θ 0.06',
  },
);

console.log('validationReport helpers passed');
