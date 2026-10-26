import { CATEGORY_DETAILS } from "./ledger";
import type { LedgerCategory, LedgerDirection, LedgerRecord } from "./ledger";

export type HistoryDatePreset = "today" | "last7" | "last30" | "custom";
export type HistoryCategoryFilter = "all" | LedgerCategory;
export type HistoryDirectionFilter = "all" | LedgerDirection;
export type HistoryExportScope = "all" | "filtered";

export interface HistoryFilters {
  datePreset: HistoryDatePreset;
  category: HistoryCategoryFilter;
  direction: HistoryDirectionFilter;
  customStart: string;
  customEnd: string;
}

export type HistoryDateRangeResult =
  | { ok: true; start: number; end: number }
  | { ok: false; error: string };

export interface HistoryFilterResult {
  records: LedgerRecord[];
  error: string;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getHistoryDateRange(
  filters: Pick<
    HistoryFilters,
    "datePreset" | "customStart" | "customEnd"
  >,
  now: number,
): HistoryDateRangeResult {
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  if (filters.datePreset === "today") {
    return {
      ok: true,
      start: todayStart.getTime(),
      end: tomorrowStart.getTime(),
    };
  }

  if (filters.datePreset === "last7" || filters.datePreset === "last30") {
    const days = filters.datePreset === "last7" ? 7 : 30;
    const start = new Date(todayStart);
    start.setDate(start.getDate() - (days - 1));

    return {
      ok: true,
      start: start.getTime(),
      end: tomorrowStart.getTime(),
    };
  }

  if (!filters.customStart || !filters.customEnd) {
    return { ok: false, error: "请选择开始日期和结束日期。" };
  }

  const customStart = parseLocalDate(filters.customStart);
  const customEnd = parseLocalDate(filters.customEnd);

  if (!customStart || !customEnd) {
    return { ok: false, error: "自定义日期格式无效。" };
  }

  if (customStart.getTime() > customEnd.getTime()) {
    return { ok: false, error: "开始日期不能晚于结束日期。" };
  }

  const endExclusive = new Date(customEnd);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    ok: true,
    start: customStart.getTime(),
    end: endExclusive.getTime(),
  };
}

export function filterHistoryRecords(
  records: LedgerRecord[],
  filters: HistoryFilters,
  now: number,
): HistoryFilterResult {
  const dateRange = getHistoryDateRange(filters, now);

  if (!dateRange.ok) {
    return { records: [], error: dateRange.error };
  }

  const filteredRecords = records
    .filter((record) => {
      if (
        record.createdAt < dateRange.start ||
        record.createdAt >= dateRange.end
      ) {
        return false;
      }

      if (
        filters.category !== "all" &&
        record.category !== filters.category
      ) {
        return false;
      }

      if (
        filters.direction !== "all" &&
        CATEGORY_DETAILS[record.category].direction !== filters.direction
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.createdAt - left.createdAt);

  return { records: filteredRecords, error: "" };
}

export function selectHistoryExportRecords(
  scope: HistoryExportScope,
  records: LedgerRecord[],
  filters: HistoryFilters,
  now: number,
): HistoryFilterResult {
  if (scope === "filtered") {
    return filterHistoryRecords(records, filters, now);
  }

  return {
    records: [...records].sort(
      (left, right) => right.createdAt - left.createdAt,
    ),
    error: "",
  };
}
