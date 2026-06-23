import { BASE_DATE_STR } from '../types.ts';

interface ScenarioDaysDomainInput {
  portfolioDaysToExpiry?: number;
  legExpiryDays: number[];
  includeLegExpiries?: boolean;
}

const MIN_SCENARIO_DAYS = 0.01;

const finitePositive = (value: number | undefined): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function resolveScenarioDaysDomain(input: ScenarioDaysDomainInput): { min: number; max: number } {
  const candidates = [
    finitePositive(input.portfolioDaysToExpiry),
    ...(input.includeLegExpiries === false ? [] : input.legExpiryDays.map(day => finitePositive(day))),
  ].filter((value): value is number => value !== null);
  return {
    min: MIN_SCENARIO_DAYS,
    max: Math.max(...candidates, 1),
  };
}

export function formatAxisDate(days: number, baseDate = BASE_DATE_STR): string {
  const base = new Date(`${baseDate}T12:00:00`);
  base.setDate(base.getDate() + Math.round(days));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export function formatShortAxisDate(days: number, baseDate = BASE_DATE_STR): string {
  const base = new Date(`${baseDate}T12:00:00`);
  base.setDate(base.getDate() + Math.round(days));
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${m}.${d}`;
}
