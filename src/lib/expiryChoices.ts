import { EXPIRY_PRESETS, ExpiryPreset, LiveExpiry } from '../types';

export interface ExpiryChoice {
  date: string;
  days: number;
  label: string;
  source?: 'live' | 'preset' | 'custom';
  isCustom?: boolean;
}

function normalizedDateLabel(date: string, days: number): string {
  return `${date.replace(/-/g, '.')} (${days}天)`;
}

function toFiniteDays(value: unknown): number | null {
  const days = Number(value);
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : null;
}

function presetDaysFromAsOf(date: string, asOfDate?: string): number | null {
  if (!asOfDate) return null;
  const target = Date.parse(`${date}T00:00:00Z`);
  const base = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(base)) return null;
  return Math.round((target - base) / 86_400_000);
}

function choiceFromItem(item: ExpiryPreset | LiveExpiry, source: 'live' | 'preset', asOfDate?: string): ExpiryChoice | null {
  if (!item?.date) return null;
  const computedPresetDays = source === 'preset' ? presetDaysFromAsOf(item.date, asOfDate) : null;
  const days = computedPresetDays ?? toFiniteDays(item.days);
  if (days == null || days < 0) return null;
  return {
    date: item.date,
    days,
    label: normalizedDateLabel(item.date, days),
    source,
  };
}

export function buildExpiryChoices(liveExpiries: LiveExpiry[] | undefined, currentDays: number): ExpiryChoice[] {
  const liveChoices = (Array.isArray(liveExpiries) ? liveExpiries : [])
    .map((item) => choiceFromItem(item, 'live'))
    .filter((choice): choice is ExpiryChoice => Boolean(choice));
  const asOfDate = inferAsOfDate(liveChoices);
  const presetChoices = EXPIRY_PRESETS
    .map((item) => choiceFromItem(item, 'preset', asOfDate))
    .filter((choice): choice is ExpiryChoice => Boolean(choice));
  const byDate = new Map<string, ExpiryChoice>();

  for (const choice of presetChoices) {
    byDate.set(choice.date, choice);
  }
  for (const choice of liveChoices) {
    byDate.set(choice.date, choice);
  }

  const choices = Array.from(byDate.values())
    .filter((choice) => choice.days >= 0)
    .sort((a, b) => a.days - b.days || a.date.localeCompare(b.date));

  if (!choices.some((choice) => choice.days === currentDays)) {
    choices.push({
      date: 'custom',
      days: currentDays,
      label: `自定义 (${currentDays}天)`,
      source: 'custom',
      isCustom: true,
    });
  }

  return choices;
}

export function selectedExpiryValue(choices: ExpiryChoice[], currentDays: number): string {
  return choices.find((choice) => choice.days === currentDays)?.date || 'custom';
}

export function resolveDaysAfterLiveRefresh(liveExpiries: LiveExpiry[] | undefined, currentDays: number): number {
  const liveChoices = (Array.isArray(liveExpiries) ? liveExpiries : [])
    .map((item) => choiceFromItem(item, 'live'))
    .filter((choice): choice is ExpiryChoice => Boolean(choice));
  if (liveChoices.length === 0) return currentDays;

  const choices = buildExpiryChoices(liveExpiries, currentDays).filter((choice) => !choice.isCustom);
  if (choices.some((choice) => choice.days === currentDays)) {
    return currentDays;
  }
  return liveChoices.sort((a, b) => a.days - b.days || a.date.localeCompare(b.date))[0].days;
}

function inferAsOfDate(liveChoices: ExpiryChoice[]): string | undefined {
  const firstLive = liveChoices
    .filter((choice) => choice.days >= 0)
    .sort((a, b) => a.days - b.days || a.date.localeCompare(b.date))[0];
  if (!firstLive) return undefined;
  const date = new Date(`${firstLive.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() - firstLive.days);
  return date.toISOString().slice(0, 10);
}
