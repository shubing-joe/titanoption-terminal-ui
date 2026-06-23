import type { Greeks, RustPositionAnalysisResponse } from '../types';
import type { StrategyAnalysis } from './optionsMath';

export interface StrategyReportSnapshot {
  strategyName: string;
  symbol: string;
  engineLabel: string;
  netPremium: number;
  currentPnL: number;
  maxProfit: number | string;
  maxLoss: number | string;
  breakevens: number[];
  greeks: Greeks;
}

interface StrategyReportSnapshotInput {
  activeSymbol: string;
  strategyName: string;
  analysis: StrategyAnalysis;
  rustAnalysis?: RustPositionAnalysisResponse;
}

export function resolveStrategyReportSnapshot(input: StrategyReportSnapshotInput): StrategyReportSnapshot {
  const rustResult = input.rustAnalysis?.ok ? input.rustAnalysis.result : undefined;
  if (rustResult) {
    return {
      strategyName: input.strategyName,
      symbol: input.activeSymbol,
      engineLabel: 'Rust option-core · institutional position analysis',
      netPremium: rustResult.net_premium,
      currentPnL: rustResult.current_pnl,
      maxProfit: rustResult.max_profit,
      maxLoss: rustResult.max_loss,
      breakevens: rustResult.breakevens,
      greeks: rustResult.greeks,
    };
  }

  return {
    strategyName: input.strategyName,
    symbol: input.activeSymbol,
    engineLabel: 'TypeScript Black-Scholes fallback',
    netPremium: input.analysis.netPremium,
    currentPnL: input.analysis.currentPnL,
    maxProfit: input.analysis.maxProfit,
    maxLoss: input.analysis.maxLoss,
    breakevens: input.analysis.breakevens,
    greeks: input.analysis.greeks,
  };
}

export function formatReportUsd(value: number | string): string {
  if (value === Infinity || value === 'Infinity') return '∞ Theoretical Infinity 无极限';
  if (value === -Infinity || value === '-Infinity') return '∞ Theoretical Infinity 无下限保护';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return `$${Math.abs(parsed).toFixed(1)}`;
}
