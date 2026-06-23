import type { ApiBudgetGovernor, CacheTelemetry, OptionWsPlan, WsQuoteTelemetry, WsWorkerTelemetry } from '../types';

export interface LiveRequestParams {
  budgetMode: LiveBudgetMode;
  visibleStrikes: number;
  limit: number;
  expiryWindowDays: number;
  simulateWs: boolean;
}

export type LiveBudgetMode = 'active' | 'focused' | 'balanced' | 'deep';

interface LiveBudgetProfile {
  mode: LiveBudgetMode;
  visibleStrikes: number;
  limit: number;
  expiryWindowDays: number;
}

export interface ApiBudgetSummary {
  restPerMinute: number;
  optionWebSocketPerMinute: number;
  fullMarketSnapshotCost: number;
  planLabel: string;
}

export const PUBLIC_MOCK_BUDGET: ApiBudgetSummary = {
  restPerMinute: 0,
  optionWebSocketPerMinute: 0,
  fullMarketSnapshotCost: 0,
  planLabel: 'Public mock only',
};

const LIVE_BUDGET_PROFILES: Record<LiveBudgetMode, LiveBudgetProfile> = {
  active: {
    mode: 'active',
    visibleStrikes: 8,
    limit: 120,
    expiryWindowDays: 60,
  },
  focused: {
    mode: 'focused',
    visibleStrikes: 12,
    limit: 160,
    expiryWindowDays: 45,
  },
  balanced: {
    mode: 'balanced',
    visibleStrikes: 16,
    limit: 240,
    expiryWindowDays: 90,
  },
  deep: {
    mode: 'deep',
    visibleStrikes: 25,
    limit: 240,
    expiryWindowDays: 1095,
  },
};

export function clampVisibleStrikes(value: number): number {
  if (!Number.isFinite(value)) return 16;
  return Math.min(25, Math.max(3, Math.round(value)));
}

export function resolveExpiryWindowDays(daysToExpiry: number): number {
  const days = Number.isFinite(daysToExpiry) ? Math.max(0, Math.round(daysToExpiry)) : 90;
  if (days <= 90) return 90;
  return Math.min(1095, Math.ceil(days / 30) * 30);
}

export function buildLiveRequestParams(
  visibleStrikes: number,
  simulateWs = false,
  budgetMode: LiveBudgetMode = 'balanced',
): LiveRequestParams {
  const profile = LIVE_BUDGET_PROFILES[budgetMode] ?? LIVE_BUDGET_PROFILES.balanced;
  const shouldUseExplicitVisibleStrikes =
    profile.mode === 'balanced' &&
    Number.isFinite(visibleStrikes) &&
    visibleStrikes !== LIVE_BUDGET_PROFILES.balanced.visibleStrikes;
  const requestedVisibleStrikes = clampVisibleStrikes(
    shouldUseExplicitVisibleStrikes
      ? visibleStrikes
      : profile.visibleStrikes,
  );
  return {
    budgetMode: profile.mode,
    visibleStrikes: requestedVisibleStrikes,
    limit: profile.limit,
    expiryWindowDays: profile.expiryWindowDays,
    simulateWs,
  };
}

export function buildLiveMarketUrl(symbol: string, params: LiveRequestParams): string {
  const query = new URLSearchParams({
    budgetMode: params.budgetMode,
    visibleStrikes: String(params.visibleStrikes),
    limit: String(params.limit),
    expiryWindowDays: String(params.expiryWindowDays),
    simulateWs: String(Boolean(params.simulateWs)),
  });
  return `/api/market/live/${encodeURIComponent(symbol)}?${query.toString()}`;
}

export function budgetModeLabel(params: LiveRequestParams): string {
  return `预算档 ${params.budgetMode.toUpperCase()} · ±${params.visibleStrikes} · ${params.expiryWindowDays}D · max ${params.limit} rows`;
}

export function selectedLiveRefreshIntervalMs(
  budgetMode: LiveBudgetMode,
  selectedLegRefreshSeconds?: number | null,
): number {
  if (budgetMode !== 'active') {
    return budgetMode === 'deep' ? 30_000 : 5_000;
  }
  const seconds = Number(selectedLegRefreshSeconds);
  return Math.max(1, Number.isFinite(seconds) ? seconds : 1) * 1000;
}

export function liveCoverageLabel(params: LiveRequestParams, rowCount?: number | null): string {
  const rows = Number.isFinite(Number(rowCount)) ? `${Number(rowCount)} rows` : 'rows pending';
  return `MOCK ±${params.visibleStrikes} · ${rows} · REST ${PUBLIC_MOCK_BUDGET.restPerMinute}/min`;
}

export function cacheTelemetryLabel(telemetry?: CacheTelemetry | null): string {
  if (!telemetry?.events?.length) return 'Cache pending';
  const budgetEvents = telemetry.events.filter(event => event.layer === 'http');
  const events = budgetEvents.length > 0 ? budgetEvents : telemetry.events;
  const hitCount = events.filter(event => event.hit).length;
  const missCount = events.length - hitCount;
  const ttlSeconds = events
    .map(event => Number(event.ttlSeconds))
    .find(value => Number.isFinite(value) && value > 0);
  const ttlLabel = ttlSeconds ? ` · ${Math.round(ttlSeconds)}s` : '';
  return `Cache H${hitCount}/M${missCount}${ttlLabel}`;
}

export function optionWsPlanLabel(plan?: OptionWsPlan | null): string {
  if (!plan) return 'WS pending';
  if (!plan.enabled) return `WS off · REST fallback ${Number(plan.fallbackRestCount || 0)}`;
  const budget = Number.isFinite(Number(plan.budgetPerMinute))
    ? Number(plan.budgetPerMinute)
    : PUBLIC_MOCK_BUDGET.optionWebSocketPerMinute;
  const selected = Number.isFinite(Number(plan.selectedCount)) ? Number(plan.selectedCount) : 0;
  const fallback = Number.isFinite(Number(plan.fallbackRestCount)) ? Number(plan.fallbackRestCount) : 0;
  return `WS ${selected}/${budget} · REST fallback ${fallback}`;
}

export function wsQuoteTelemetryLabel(telemetry?: WsQuoteTelemetry | null): string {
  if (!telemetry) return 'WS quotes pending';
  if (!telemetry.enabled) return 'WS quotes off';
  const merged = Number.isFinite(Number(telemetry.mergedCount)) ? Number(telemetry.mergedCount) : 0;
  const subscribed = Number.isFinite(Number(telemetry.subscribedCount)) ? Number(telemetry.subscribedCount) : 0;
  const stale = Number.isFinite(Number(telemetry.staleQuoteCount)) ? Number(telemetry.staleQuoteCount) : 0;
  return `WS quotes ${merged}/${subscribed} merged · stale ${stale}`;
}

export function wsWorkerTelemetryLabel(telemetry?: WsWorkerTelemetry | null): string {
  if (!telemetry) return 'WS worker pending';
  if (!telemetry.enabled) return 'WS worker off';
  const accepted = Number.isFinite(Number(telemetry.acceptedCount)) ? Number(telemetry.acceptedCount) : 0;
  const subscribed = Number.isFinite(Number(telemetry.subscribedCount)) ? Number(telemetry.subscribedCount) : 0;
  const ignored = Number.isFinite(Number(telemetry.ignoredCount)) ? Number(telemetry.ignoredCount) : 0;
  return `WS worker ${accepted}/${subscribed} accepted · ignored ${ignored}`;
}

export function budgetGovernorLabel(governor?: ApiBudgetGovernor | null): string {
  if (!governor) return 'Budget pending';
  const restBudget = Number.isFinite(Number(governor.restBudgetPerMinute)) ? Number(governor.restBudgetPerMinute) : PUBLIC_MOCK_BUDGET.restPerMinute;
  const restRequests = Number.isFinite(Number(governor.estimatedRestRequests)) ? Number(governor.estimatedRestRequests) : 0;
  const wsBudget = Number.isFinite(Number(governor.optionWsBudgetPerMinute)) ? Number(governor.optionWsBudgetPerMinute) : PUBLIC_MOCK_BUDGET.optionWebSocketPerMinute;
  const wsSelected = Number.isFinite(Number(governor.wsSelectedCount)) ? Number(governor.wsSelectedCount) : 0;
  const cachePct = Math.max(0, Math.min(100, Math.round(Number(governor.httpCacheHitRatio || 0) * 100)));
  return `Budget REST ${restRequests}/${restBudget} · WS ${wsSelected}/${wsBudget} · cache ${cachePct}%`;
}
