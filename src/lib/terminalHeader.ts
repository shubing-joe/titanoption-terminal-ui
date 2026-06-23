import type { LiveMarketData } from '../types';
import type { LiveRequestParams } from './liveRequest';

export interface TerminalHeaderStatusInput {
  liveMarketData?: LiveMarketData | null;
  isLiveLoading?: boolean;
  liveRequestParams: LiveRequestParams;
}

export interface TerminalHeaderStatus {
  marketLabel: string;
  coverageLabel: string;
  modeLabel: string;
}

function shortErrorLabel(error?: string): string {
  const text = String(error || '').trim();
  if (!text) return 'Provider error';
  const statusMatch = text.match(/HTTP Error\s+(\d+)/i) || text.match(/status(?:\s+code)?\s+(\d+)/i);
  if (statusMatch) return `Provider ${statusMatch[1]}`;
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

export function terminalHeaderStatus(input: TerminalHeaderStatusInput): TerminalHeaderStatus {
  const isLive = Boolean(input.liveMarketData?.ok);
  const isFailed = input.liveMarketData?.ok === false;
  const rowCount = isLive ? Number(input.liveMarketData?.volSummary?.rowCount || 0) : 0;
  const mode = input.liveRequestParams.budgetMode.toUpperCase();
  const selectedRefreshSeconds = Number(input.liveMarketData?.refreshPolicy?.selectedLegRefreshSeconds);
  const selectedRefreshLabel = input.liveRequestParams.budgetMode === 'active'
    ? ` · 选中腿 ${Number.isFinite(selectedRefreshSeconds) && selectedRefreshSeconds > 0 ? selectedRefreshSeconds : 1}s`
    : '';
  return {
    marketLabel: isLive
      ? `PUBLIC MOCK · ${rowCount} contracts`
      : isFailed
        ? 'mock 行情失败'
      : input.isLiveLoading
        ? 'mock 行情加载中'
        : '仿真交易模拟柜台',
    coverageLabel: isLive
      ? `期权链 ${rowCount} rows · ±${input.liveRequestParams.visibleStrikes}`
      : isFailed
        ? `期权链未更新 · ${shortErrorLabel(input.liveMarketData?.error)}`
      : '期权链等待 mock 数据',
    modeLabel: `链深度 ${mode} · ${input.liveRequestParams.expiryWindowDays}D${selectedRefreshLabel}`,
  };
}
