"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_DETAILS, LEDGER_CATEGORIES } from "@/lib/ledger";
import type { LedgerRecord } from "@/lib/ledger";
import {
  buildLedgerCsv,
  createCsvFilename,
  downloadCsvFile,
} from "@/lib/ledger-csv";
import {
  filterHistoryRecords,
  getHistoryDateRange,
  selectHistoryExportRecords,
} from "@/lib/ledger-history";
import type {
  HistoryCategoryFilter,
  HistoryDatePreset,
  HistoryDirectionFilter,
  HistoryExportScope,
} from "@/lib/ledger-history";

interface LedgerHistoryProps {
  records: LedgerRecord[];
  now: number;
  isLoading: boolean;
  storageError: string;
  onLoadLatestRecords: () => Promise<{
    records: LedgerRecord[];
    refreshedAt: number;
  }>;
  onEdit: (record: LedgerRecord) => void;
  onDelete: (record: LedgerRecord) => void;
}

interface ExportFeedback {
  tone: "success" | "error";
  message: string;
}

const EXPORT_DUPLICATE_GUARD_MS = 1000;

const DATE_OPTIONS: Array<{ value: HistoryDatePreset; label: string }> = [
  { value: "today", label: "今天" },
  { value: "last7", label: "最近 7 天" },
  { value: "last30", label: "最近 30 天" },
  { value: "custom", label: "自定义" },
];

const DIRECTION_OPTIONS: Array<{
  value: HistoryDirectionFilter;
  label: string;
}> = [
  { value: "all", label: "全部收支" },
  { value: "income", label: "进账" },
  { value: "cost", label: "成本" },
];

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultCustomRange(now: number) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

export default function LedgerHistory({
  records,
  now,
  isLoading,
  storageError,
  onLoadLatestRecords,
  onEdit,
  onDelete,
}: LedgerHistoryProps) {
  const [datePreset, setDatePreset] =
    useState<HistoryDatePreset>("last30");
  const [category, setCategory] = useState<HistoryCategoryFilter>("all");
  const [direction, setDirection] =
    useState<HistoryDirectionFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [exportFeedback, setExportFeedback] =
    useState<ExportFeedback | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const exportInFlightRef = useRef(false);
  const lastExportAttemptAtRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const filterResult = useMemo(
    () =>
      filterHistoryRecords(
        records,
        {
          datePreset,
          category,
          direction,
          customStart,
          customEnd,
        },
        now,
      ),
    [category, customEnd, customStart, datePreset, direction, now, records],
  );

  const dateRange = getHistoryDateRange(
    { datePreset, customStart, customEnd },
    now,
  );
  const resultCount = filterResult.records.length;

  function selectDatePreset(nextPreset: HistoryDatePreset) {
    setDatePreset(nextPreset);
    setExportFeedback(null);

    if (nextPreset === "custom" && (!customStart || !customEnd)) {
      const defaultRange = getDefaultCustomRange(now);
      setCustomStart(defaultRange.start);
      setCustomEnd(defaultRange.end);
    }
  }

  function resetFilters() {
    setDatePreset("last30");
    setCategory("all");
    setDirection("all");
    setCustomStart("");
    setCustomEnd("");
    setExportFeedback(null);
  }

  async function exportRecords(scope: HistoryExportScope) {
    const attemptStartedAt = Date.now();

    if (
      exportInFlightRef.current ||
      attemptStartedAt - lastExportAttemptAtRef.current <
        EXPORT_DUPLICATE_GUARD_MS
    ) {
      return;
    }

    lastExportAttemptAtRef.current = attemptStartedAt;
    exportInFlightRef.current = true;
    setIsExporting(true);
    setExportFeedback(null);

    try {
      if (isLoading) {
        setExportFeedback({
          tone: "error",
          message: "历史记录仍在读取中，请稍后再导出。",
        });
        return;
      }

      if (storageError) {
        setExportFeedback({
          tone: "error",
          message: "本地账本当前不可用，无法生成导出文件。",
        });
        return;
      }

      const { records: latestRecords, refreshedAt } =
        await onLoadLatestRecords();

      if (!isMountedRef.current) return;

      const exportSelection = selectHistoryExportRecords(
        scope,
        latestRecords,
        {
          datePreset,
          category,
          direction,
          customStart,
          customEnd,
        },
        refreshedAt,
      );

      if (exportSelection.error) {
        setExportFeedback({
          tone: "error",
          message: exportSelection.error,
        });
        return;
      }

      const recordsToExport = exportSelection.records;

      if (recordsToExport.length === 0) {
        setExportFeedback({
          tone: "error",
          message:
            scope === "all"
              ? "当前没有已保存的记录，未生成 CSV 文件。"
              : "当前筛选结果为空，未生成 CSV 文件。",
        });
        return;
      }

      const exportedAt = Date.now();
      const csv = buildLedgerCsv(recordsToExport);
      const filename = createCsvFilename(scope, exportedAt);
      downloadCsvFile(csv, filename);
      setExportFeedback({
        tone: "success",
        message: `已生成并开始下载 ${recordsToExport.length} 条记录：${filename}`,
      });
    } catch (error) {
      if (isMountedRef.current) {
        setExportFeedback({
          tone: "error",
          message:
            error instanceof Error && error.message
              ? `读取最新账目失败，未生成文件：${error.message}`
              : "读取最新账目失败，未生成文件，请重试。",
        });
      }
    } finally {
      exportInFlightRef.current = false;
      lastExportAttemptAtRef.current = Date.now();
      if (isMountedRef.current) {
        setIsExporting(false);
      }
    }
  }

  return (
    <section
      id="history"
      aria-labelledby="history-heading"
      className="mt-5 scroll-mt-5 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-[0_1px_2px_rgba(35,45,38,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eeede8] px-4 py-4 sm:px-5">
        <div>
          <h2
            id="history-heading"
            className="text-lg font-semibold tracking-tight"
          >
            历史记录
          </h2>
          <p className="mt-1 text-xs text-[#858d87]">
            组合日期、类别和收支类型查看完整记录
          </p>
        </div>
        <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-xs text-[#727a74]">
          {isLoading ? "读取中" : `共 ${records.length} 条`}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="rounded-2xl border border-[#e8e7e1] bg-[#faf9f5] p-4">
          <fieldset>
            <legend className="text-sm font-medium text-[#3f4b43]">
              日期范围
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {DATE_OPTIONS.map((option) => {
                const isSelected = datePreset === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isExporting}
                    aria-pressed={isSelected}
                    onClick={() => selectDatePreset(option.value)}
                    className={`flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      isSelected
                        ? "border-[#215c46] bg-[#215c46] text-white"
                        : "border-[#dcded7] bg-white text-[#566159] hover:border-[#aeb8b1]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {datePreset === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-[#566159]">
                <span className="mb-1.5 block text-xs font-medium text-[#6f7871]">
                  开始日期
                </span>
                <input
                  type="date"
                  value={customStart}
                  disabled={isExporting}
                  onChange={(event) => {
                    setCustomStart(event.target.value);
                    setExportFeedback(null);
                  }}
                  className="min-h-11 w-full rounded-lg border border-[#d9dbd4] bg-white px-3 py-2 text-sm text-[#26332a] outline-none focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
                />
              </label>
              <label className="text-sm text-[#566159]">
                <span className="mb-1.5 block text-xs font-medium text-[#6f7871]">
                  结束日期
                </span>
                <input
                  type="date"
                  value={customEnd}
                  disabled={isExporting}
                  onChange={(event) => {
                    setCustomEnd(event.target.value);
                    setExportFeedback(null);
                  }}
                  className="min-h-11 w-full rounded-lg border border-[#d9dbd4] bg-white px-3 py-2 text-sm text-[#26332a] outline-none focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-[#566159]">
              <span className="mb-1.5 block text-xs font-medium text-[#6f7871]">
                类别
              </span>
              <select
                value={category}
                disabled={isExporting}
                onChange={(event) => {
                  setCategory(event.target.value as HistoryCategoryFilter);
                  setExportFeedback(null);
                }}
                className="min-h-11 w-full rounded-lg border border-[#d9dbd4] bg-white px-3 py-2.5 text-sm text-[#26332a] outline-none focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
              >
                <option value="all">全部记录</option>
                {LEDGER_CATEGORIES.map((ledgerCategory) => (
                  <option key={ledgerCategory} value={ledgerCategory}>
                    {ledgerCategory}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-[#566159]">
              <span className="mb-1.5 block text-xs font-medium text-[#6f7871]">
                收支类型
              </span>
              <select
                value={direction}
                disabled={isExporting}
                onChange={(event) => {
                  setDirection(event.target.value as HistoryDirectionFilter);
                  setExportFeedback(null);
                }}
                className="min-h-11 w-full rounded-lg border border-[#d9dbd4] bg-white px-3 py-2.5 text-sm text-[#26332a] outline-none focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
              >
                {DIRECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#858d87]">
              {dateRange.ok
                ? "筛选包含所选日期当天的全部记录"
                : "请完善日期范围"}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isExporting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-[#5e6861] hover:bg-[#ecebe5]"
            >
              重置筛选
            </button>
          </div>
        </div>

        {filterResult.error && !storageError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
          >
            {filterResult.error}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-[#dce5dd] bg-[#f4f8f4] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#2f4c3d]">
                导出 CSV
              </h3>
              <p
                id="csv-export-note"
                className="mt-1 max-w-xl text-xs leading-5 text-[#66746b]"
              >
                文件会保存到浏览器下载设置或你选择的位置，不会上传。导出后文件不再受本页面 IndexedDB 保护，请妥善保管。
              </p>
            </div>
            <div className="grid shrink-0 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void exportRecords("filtered")}
                disabled={isLoading || Boolean(storageError) || isExporting}
                aria-busy={isExporting}
                aria-describedby="csv-export-note"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#215c46] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#194b39] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isExporting
                  ? "正在读取最新数据…"
                  : `导出筛选结果（${resultCount} 条）`}
              </button>
              <button
                type="button"
                onClick={() => void exportRecords("all")}
                disabled={isLoading || Boolean(storageError) || isExporting}
                aria-busy={isExporting}
                aria-describedby="csv-export-note"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#bfc9c1] bg-white px-3 py-2.5 text-sm font-medium text-[#405148] hover:bg-[#edf2ed] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isExporting
                  ? "正在读取最新数据…"
                  : `导出全部记录（${records.length} 条）`}
              </button>
            </div>
          </div>

          {exportFeedback ? (
            <p
              role={exportFeedback.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${
                exportFeedback.tone === "error"
                  ? "bg-rose-50 text-rose-800"
                  : "bg-white text-[#215c46]"
              }`}
            >
              {exportFeedback.message}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#3f4b43]">查询结果</h3>
          <p className="text-xs text-[#7f8781]" aria-live="polite">
            {isLoading
              ? "正在读取…"
              : storageError
                ? "数据不可用"
                : `显示 ${resultCount} 条`}
          </p>
        </div>

        {isLoading ? (
          <div className="mt-3 rounded-xl bg-[#f8f8f4] px-4 py-12 text-center text-sm text-[#858d87]">
            正在读取历史记录…
          </div>
        ) : storageError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-800">
            无法读取本地历史记录，请重试读取。
          </div>
        ) : filterResult.error ? (
          <div className="mt-3 rounded-xl bg-[#f8f8f4] px-4 py-10 text-center text-sm text-[#858d87]">
            修正筛选条件后即可查看记录。
          </div>
        ) : resultCount === 0 ? (
          <div className="mt-3 rounded-xl bg-[#f8f8f4] px-4 py-10 text-center">
            <p className="text-sm font-medium text-[#566159]">
              {records.length === 0
                ? "还没有任何账目记录"
                : "没有符合当前筛选条件的记录"}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#858d87]">
              {records.length === 0
                ? "保存第一笔账目后，可以在这里查看完整历史。"
                : "可以调整日期、类别或收支类型后重新查看。"}
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-[#efeee9] border-y border-[#efeee9]">
            {filterResult.records.map((record) => {
              const details = CATEGORY_DETAILS[record.category];
              const isIncome = details.direction === "income";

              return (
                <li
                  key={record.id}
                  className="flex items-start gap-3 px-1 py-4 sm:px-2"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                      isIncome ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-medium text-[#2b372f]">
                        {record.note || details.description}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${details.badgeClass}`}
                      >
                        {record.category}
                      </span>
                      <span className="rounded-full bg-[#f1f1ed] px-2 py-0.5 text-[11px] text-[#69726b]">
                        {isIncome ? "进账" : "成本"}
                      </span>
                    </div>
                    <time
                      dateTime={new Date(record.createdAt).toISOString()}
                      className="mt-1.5 block text-xs text-[#858d87]"
                    >
                      {dateTimeFormatter.format(new Date(record.createdAt))}
                    </time>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p
                      className={`pt-0.5 text-sm font-semibold tabular-nums sm:text-base ${
                        isIncome ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isIncome ? "+" : "-"}¥
                      {moneyFormatter.format(record.amount)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(record)}
                        aria-label={`编辑记录：${record.note || details.description}，${record.category}，${moneyFormatter.format(record.amount)} 元`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#d8dad3] bg-white px-2 py-2 text-xs font-medium text-[#506057] hover:bg-[#f4f5f1]"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(record)}
                        aria-label={`删除记录：${record.note || details.description}，${record.category}，${moneyFormatter.format(record.amount)} 元`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-rose-200 bg-white px-2 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
