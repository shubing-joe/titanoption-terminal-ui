import { LiveMarketData, LiveOptionChainRow, QuoteQualitySummary, RustPositionAnalysisResponse, ValidationReplayResult } from '../types';

export interface ComputeEngineSummaryInput {
  liveChain?: LiveOptionChainRow[];
  qualitySummary?: QuoteQualitySummary;
  replayResult?: ValidationReplayResult;
  rustCoreEnabled?: boolean;
}

export interface ComputeEngineSummary {
  status: 'INSTITUTIONAL_CHECKED' | 'PARTIAL_MODEL' | 'MISSING';
  engineLabel: string;
  greekCoverageLabel: string;
  replayLabel: string;
  rustLabel: string;
  degradationLabel: string;
}

export function formatQualityRatio(summary?: QuoteQualitySummary): string {
  if (!summary || summary.input_count <= 0) return 'N/A';
  const ratio = (summary.accepted_count / summary.input_count) * 100;
  return `${ratio.toFixed(1)}% pass · ${summary.accepted_count}/${summary.input_count}`;
}

export function topRejectionReasons(summary?: QuoteQualitySummary): string[] {
  if (!summary?.rejection_reasons) return [];
  return Object.entries(summary.rejection_reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}: ${count}`);
}

export function summarizeReplayValidation(result?: ValidationReplayResult): { status: 'PASS' | 'WARN' | 'N/A'; text: string } {
  if (!result) return { status: 'N/A', text: 'Replay validation not loaded' };
  const status = result.pricing_checks > 0 && result.rejected_rows < result.total_rows ? 'PASS' : 'WARN';
  return {
    status,
    text: `${result.pricing_checks} checks · max diff $${result.max_abs_diff.toFixed(4)} · rejected ${result.rejected_rows}/${result.total_rows}`,
  };
}

function formatUsd(value: number | string | null | undefined): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value || 'N/A');
  const sign = parsed < 0 ? '-' : '';
  return `${sign}$${Math.abs(parsed).toFixed(2)}`;
}

export function summarizeRustPositionAnalysis(response?: RustPositionAnalysisResponse): { status: 'PASS' | 'WARN' | 'N/A'; text: string; riskText: string } {
  if (!response) {
    return { status: 'N/A', text: 'Rust option-core analysis not loaded', riskText: 'No active Rust bridge result' };
  }
  if (!response.ok || !response.result) {
    return { status: 'WARN', text: response.error || 'Rust option-core analysis failed', riskText: 'Fallback to TypeScript sandbox calculations' };
  }
  const result = response.result;
  const breakevens = result.breakevens.length > 0 ? result.breakevens.join(' / ') : 'none';
  const score = Number.isFinite(result.quality_score) ? ` · score ${Number(result.quality_score).toFixed(0)}/100` : '';
  const flags = result.risk_flags && result.risk_flags.length > 0 ? ` · flags ${result.risk_flags.join(' / ')}` : '';
  return {
    status: 'PASS',
    text: `${response.engine || result.engine}${score} · net ${formatUsd(result.net_premium)} · PnL ${formatUsd(result.current_pnl)} · B/E ${breakevens}`,
    riskText: `Max +${formatUsd(result.max_profit)} / ${formatUsd(result.max_loss)}${flags} · Δ ${result.greeks.delta.toFixed(2)} · Γ ${result.greeks.gamma.toFixed(2)} · ν ${result.greeks.vega.toFixed(2)} · θ ${result.greeks.theta.toFixed(2)}`,
  };
}

export function publicSandboxNote(noteId: string): string {
  if (noteId === 'no_live_provider') {
    return 'Browser mock fixtures only · no live provider credentials';
  }
  if (noteId === 'no_execution') {
    return 'No order submission · no routing integration';
  }
  return 'Visual preview surface · private decision modules excluded';
}

function hasFiniteGreek(row: LiveOptionChainRow): boolean {
  return [row.delta, row.gamma, row.theta, row.vega].every((value) => value != null && Number.isFinite(Number(value)));
}

export function computeEngineSummary(input: ComputeEngineSummaryInput = {}): ComputeEngineSummary {
  const rows = Array.isArray(input.liveChain) ? input.liveChain : [];
  const totalRows = rows.length;
  const greeksRows = rows.filter(hasFiniteGreek).length;
  const modelRows = rows.filter(row => {
    const source = String(row.source || '').toLowerCase();
    return source.includes('model') || source.includes('fallback') || !source;
  }).length;
  const greekCoverage = totalRows > 0 ? (greeksRows / totalRows) * 100 : 0;
  const hasReplay = Boolean(input.replayResult && input.replayResult.pricing_checks > 0);
  const qualityInputCount = Number(input.qualitySummary?.input_count || 0);
  const qualityAcceptedCount = Number(input.qualitySummary?.accepted_count || 0);
  const hasQualityRows = totalRows === 0 && qualityInputCount > 0;
  const status = totalRows === 0
    ? hasQualityRows ? 'PARTIAL_MODEL' : 'MISSING'
    : modelRows > 0 || greekCoverage < 80 || !hasReplay
      ? 'PARTIAL_MODEL'
      : 'INSTITUTIONAL_CHECKED';

  return {
    status,
    engineLabel: 'Public mock validation + option-core interface',
    greekCoverageLabel: totalRows > 0
      ? `Greeks coverage ${greekCoverage.toFixed(1)}% · ${greeksRows}/${totalRows} rows`
      : hasQualityRows
        ? `Greeks coverage pending · quality gate ${qualityAcceptedCount}/${qualityInputCount} rows`
      : 'Greeks coverage N/A · no chain rows',
    replayLabel: hasReplay && input.replayResult
      ? `Reference replay ${input.replayResult.pricing_checks} checks · max diff $${input.replayResult.max_abs_diff.toFixed(4)}`
      : 'Reference replay pending · no cross-check loaded',
    rustLabel: input.rustCoreEnabled
      ? 'Rust option-core compiled · payoff/Greeks/scenario bridge ready'
      : 'Rust option-core not enabled in this terminal session',
    degradationLabel: modelRows > 0
      ? `${modelRows} model/fallback rows require caution`
      : hasQualityRows
        ? 'Detailed Greeks row coverage pending from live chain payload'
      : 'No model/fallback rows in current chain window',
  };
}

export function resolveValidationChain(data?: LiveMarketData | null): LiveOptionChainRow[] {
  if (!data?.ok) return [];
  const snapshotRows = data.optionMarketSnapshot?.normalizedChain || [];
  if (snapshotRows.length > 0) {
    return snapshotRows.map((row): LiveOptionChainRow => ({
      contractTicker: row.contractTicker,
      type: row.type,
      expiry: row.expiry,
      strike: Number(row.strike || 0),
      bid: Number(row.bid || 0),
      ask: Number(row.ask || 0),
      mark: Number(row.mark || row.mid || 0),
      volume: Number(row.volume || 0),
      openInterest: Number(row.openInterest || 0),
      iv: row.iv,
      delta: row.delta,
      gamma: row.gamma,
      theta: row.theta,
      vega: row.vega,
      source: row.source,
    }));
  }
  return data.chain || [];
}
