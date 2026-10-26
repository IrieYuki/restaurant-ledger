import { CATEGORY_DETAILS, LEDGER_CATEGORIES } from "./ledger";
import type { LedgerCategory, LedgerRecord } from "./ledger";

export interface CategoryLedgerSummary {
  amountCents: number;
  count: number;
}

export type CategoryLedgerSummaries = Record<
  LedgerCategory,
  CategoryLedgerSummary
>;

export interface LedgerFinancialSummary {
  categories: CategoryLedgerSummaries;
  receiptsCents: number;
  costsCents: number;
  differenceCents: number;
  recordCount: number;
}

export interface DailyLedgerSummary extends LedgerFinancialSummary {
  dateStart: number;
  dateKey: string;
}

export interface PeriodLedgerSummary extends LedgerFinancialSummary {
  key: string;
  label: string;
  start: number;
  end: number;
}

function createCategorySummaries(): CategoryLedgerSummaries {
  return {
    普通进账: { amountCents: 0, count: 0 },
    会员充值: { amountCents: 0, count: 0 },
    备菜成本: { amountCents: 0, count: 0 },
    其他成本: { amountCents: 0, count: 0 },
  };
}

function createEmptySummary(): LedgerFinancialSummary {
  return {
    categories: createCategorySummaries(),
    receiptsCents: 0,
    costsCents: 0,
    differenceCents: 0,
    recordCount: 0,
  };
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToYuan(cents: number): number {
  return cents / 100;
}

export function getLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function nextLocalDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function addRecordToSummary(
  summary: LedgerFinancialSummary,
  record: LedgerRecord,
): void {
  const cents = amountToCents(record.amount);
  const categorySummary = summary.categories[record.category];

  categorySummary.amountCents += cents;
  categorySummary.count += 1;
  summary.recordCount += 1;

  if (CATEGORY_DETAILS[record.category].direction === "income") {
    summary.receiptsCents += cents;
  } else {
    summary.costsCents += cents;
  }

  summary.differenceCents = summary.receiptsCents - summary.costsCents;
}

function addSummary(
  target: LedgerFinancialSummary,
  source: LedgerFinancialSummary,
): void {
  for (const category of LEDGER_CATEGORIES) {
    target.categories[category].amountCents +=
      source.categories[category].amountCents;
    target.categories[category].count += source.categories[category].count;
  }

  target.receiptsCents += source.receiptsCents;
  target.costsCents += source.costsCents;
  target.differenceCents = target.receiptsCents - target.costsCents;
  target.recordCount += source.recordCount;
}

export function selectRecordsInRange(
  records: LedgerRecord[],
  start: number,
  end: number,
): LedgerRecord[] {
  return records.filter(
    (record) => record.createdAt >= start && record.createdAt < end,
  );
}

export function summarizeLedgerRecords(
  records: LedgerRecord[],
): LedgerFinancialSummary {
  const summary = createEmptySummary();

  for (const record of records) {
    addRecordToSummary(summary, record);
  }

  return summary;
}

export function buildDailyLedgerSummaries(
  records: LedgerRecord[],
  start: number,
  end: number,
): DailyLedgerSummary[] {
  if (end <= start) {
    return [];
  }

  const dailySummaries = new Map<string, DailyLedgerSummary>();
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < end) {
    const dateStart = cursor.getTime();
    const dateKey = getLocalDateKey(dateStart);
    dailySummaries.set(dateKey, {
      ...createEmptySummary(),
      dateStart,
      dateKey,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const record of selectRecordsInRange(records, start, end)) {
    const summary = dailySummaries.get(getLocalDateKey(record.createdAt));
    if (summary) {
      addRecordToSummary(summary, record);
    }
  }

  return Array.from(dailySummaries.values());
}

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildPeriodSummaries(
  days: DailyLedgerSummary[],
  getKey: (day: DailyLedgerSummary) => string,
  getLabel: (
    firstDay: DailyLedgerSummary,
    lastDay: DailyLedgerSummary,
  ) => string,
): PeriodLedgerSummary[] {
  const periods = new Map<string, PeriodLedgerSummary>();

  for (const day of days) {
    const key = getKey(day);
    const existing = periods.get(key);

    if (existing) {
      addSummary(existing, day);
      existing.end = nextLocalDayStart(day.dateStart);
      continue;
    }

    const summary = createEmptySummary();
    addSummary(summary, day);
    periods.set(key, {
      ...summary,
      key,
      label: getLabel(day, day),
      start: day.dateStart,
      end: nextLocalDayStart(day.dateStart),
    });
  }

  return Array.from(periods.values())
    .filter((period) => period.recordCount > 0)
    .map((period) => {
      const firstDay = days.find((day) => day.dateStart === period.start);
      const lastDay = days.find(
        (day) => nextLocalDayStart(day.dateStart) === period.end,
      );

      return {
        ...period,
        label:
          firstDay && lastDay ? getLabel(firstDay, lastDay) : period.label,
      };
    });
}

export function buildWeeklyLedgerSummaries(
  days: DailyLedgerSummary[],
): PeriodLedgerSummary[] {
  return buildPeriodSummaries(
    days,
    (day) => {
      const date = new Date(day.dateStart);
      const daysSinceMonday = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - daysSinceMonday);
      return getLocalDateKey(date.getTime());
    },
    (firstDay, lastDay) => {
      const startLabel = formatShortDate(firstDay.dateStart);
      const endLabel = formatShortDate(lastDay.dateStart);
      return startLabel === endLabel
        ? startLabel
        : `${startLabel}–${endLabel}`;
    },
  );
}

export function buildMonthlyLedgerSummaries(
  days: DailyLedgerSummary[],
): PeriodLedgerSummary[] {
  return buildPeriodSummaries(
    days,
    (day) => {
      const date = new Date(day.dateStart);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    },
    (firstDay) => {
      const date = new Date(firstDay.dateStart);
      return `${date.getFullYear()}年${date.getMonth() + 1}月`;
    },
  );
}
