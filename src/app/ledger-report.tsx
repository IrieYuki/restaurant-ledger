"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadLedgerRecords } from "@/lib/ledger";
import type { LedgerRecord } from "@/lib/ledger";
import { getHistoryDateRange } from "@/lib/ledger-history";
import type { HistoryDatePreset } from "@/lib/ledger-history";
import {
  buildDailyLedgerSummaries,
  buildMonthlyLedgerSummaries,
  buildWeeklyLedgerSummaries,
  selectRecordsInRange,
  summarizeLedgerRecords,
} from "@/lib/ledger-report";
import type {
  DailyLedgerSummary,
  LedgerFinancialSummary,
  PeriodLedgerSummary,
} from "@/lib/ledger-report";

interface ReportDataSuccess {
  ok: true;
  start: number;
  end: number;
  records: LedgerRecord[];
  summary: LedgerFinancialSummary;
  daily: DailyLedgerSummary[];
  weekly: PeriodLedgerSummary[];
  monthly: PeriodLedgerSummary[];
}

type ReportData =
  | ReportDataSuccess
  | { ok: false; error: string };

const DATE_OPTIONS: Array<{ value: HistoryDatePreset; label: string }> = [
  { value: "today", label: "今天" },
  { value: "last7", label: "最近 7 天" },
  { value: "last30", label: "最近 30 天" },
  { value: "custom", label: "自定义" },
];

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monthDayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const refreshTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}¥${moneyFormatter.format(Math.abs(cents) / 100)}`;
}

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

function formatRangeLabel(start: number, endExclusive: number): string {
  const endInclusive = new Date(endExclusive - 1);
  return `${fullDateFormatter.format(new Date(start))}－${fullDateFormatter.format(endInclusive)}`;
}

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "浏览器本地存储空间异常，无法读取报表数据。";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法读取当前浏览器中的账目数据。";
}

function MetricCard({
  label,
  amountCents,
  note,
  cardClass,
  valueClass,
}: {
  label: string;
  amountCents: number;
  note: string;
  cardClass: string;
  valueClass: string;
}) {
  return (
    <article className={`rounded-2xl border p-4 sm:p-5 ${cardClass}`}>
      <h3 className="text-sm font-medium text-[#667067]">{label}</h3>
      <p
        className={`mt-3 break-words text-base font-semibold leading-6 tabular-nums tracking-tight sm:text-2xl ${valueClass}`}
      >
        {formatCents(amountCents)}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-[#7f8781]">{note}</p>
    </article>
  );
}

function DailyTrendChart({ days }: { days: DailyLedgerSummary[] }) {
  const chartMaximum = Math.max(
    1,
    ...days.flatMap((day) => [day.receiptsCents, day.costsCents]),
  );
  const chartWidth = Math.max(320, days.length * 52);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-[#6f7871]">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#2b7a5d]" />
          总收款
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#d18a52]" />
          总成本
        </span>
        <span className="text-[#929891]">总收款 = 普通进账 + 会员充值</span>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div style={{ minWidth: `${chartWidth}px` }}>
          <div className="flex h-56 items-end gap-2 border-b border-[#e9e7e0] px-1">
            {days.map((day) => {
              const date = new Date(day.dateStart);

              return (
                <div
                  key={day.dateKey}
                  className="flex h-full min-w-10 flex-1 flex-col justify-end"
                  title={`${monthDayFormatter.format(date)}：总收款 ${formatCents(day.receiptsCents)}，总成本 ${formatCents(day.costsCents)}`}
                >
                  <div className="flex min-h-0 flex-1 items-end justify-center gap-1">
                    <div
                      className="w-[34%] max-w-4 rounded-t-sm bg-[#2b7a5d]"
                      style={{
                        height: `${(day.receiptsCents / chartMaximum) * 100}%`,
                      }}
                    />
                    <div
                      className="w-[34%] max-w-4 rounded-t-sm bg-[#d18a52]"
                      style={{
                        height: `${(day.costsCents / chartMaximum) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-center text-[11px] text-[#6f7871]">
                    {monthDayFormatter.format(date)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DailySummaryTable({ days }: { days: DailyLedgerSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-[#e9e7e0] text-xs text-[#7f8781]">
          <tr>
            <th className="py-2.5 pr-4 font-medium">日期</th>
            <th className="px-4 py-2.5 text-right font-medium">普通进账</th>
            <th className="px-4 py-2.5 text-right font-medium">会员充值</th>
            <th className="px-4 py-2.5 text-right font-medium">总收款</th>
            <th className="px-4 py-2.5 text-right font-medium">总成本</th>
            <th className="py-2.5 pl-4 text-right font-medium">收支差额</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efeee9]">
          {days.map((day) => (
            <tr key={day.dateKey}>
              <td className="py-3 pr-4 tabular-nums text-[#4d5951]">
                {monthDayFormatter.format(new Date(day.dateStart))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-[#2b372f]">
                {formatCents(day.categories.普通进账.amountCents)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-[#2b372f]">
                {formatCents(day.categories.会员充值.amountCents)}
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums text-[#215c46]">
                {formatCents(day.receiptsCents)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-[#a6532e]">
                {formatCents(day.costsCents)}
              </td>
              <td
                className={`py-3 pl-4 text-right font-medium tabular-nums ${
                  day.differenceCents < 0 ? "text-rose-700" : "text-[#2b372f]"
                }`}
              >
                {formatCents(day.differenceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodSummaryTable({
  title,
  description,
  periods,
}: {
  title: string;
  description: string;
  periods: PeriodLedgerSummary[];
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[#858d87]">{description}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[430px] text-left text-sm">
          <thead className="border-b border-[#e9e7e0] text-xs text-[#7f8781]">
            <tr>
              <th className="py-2.5 pr-4 font-medium">周期</th>
              <th className="px-4 py-2.5 text-right font-medium">总收款</th>
              <th className="px-4 py-2.5 text-right font-medium">总成本</th>
              <th className="py-2.5 pl-4 text-right font-medium">收支差额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#efeee9]">
            {periods.map((period) => (
              <tr key={period.key}>
                <td className="py-3 pr-4 text-[#4d5951]">{period.label}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-[#215c46]">
                  {formatCents(period.receiptsCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[#a6532e]">
                  {formatCents(period.costsCents)}
                </td>
                <td
                  className={`py-3 pl-4 text-right font-medium tabular-nums ${
                    period.differenceCents < 0
                      ? "text-rose-700"
                      : "text-[#2b372f]"
                  }`}
                >
                  {formatCents(period.differenceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LedgerReport() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [datePreset, setDatePreset] =
    useState<HistoryDatePreset>("last7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      try {
        const storedRecords = await loadLedgerRecords();
        if (cancelled) return;
        setRecords(storedRecords);
        setNow(Date.now());
        setLoadError("");
      } catch (error) {
        if (cancelled) return;
        setLoadError(getLoadErrorMessage(error));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reportData = useMemo<ReportData | null>(() => {
    if (now === null) {
      return null;
    }

    const dateRange = getHistoryDateRange(
      { datePreset, customStart, customEnd },
      now,
    );

    if (!dateRange.ok) {
      return { ok: false, error: dateRange.error };
    }

    const rangeRecords = selectRecordsInRange(
      records,
      dateRange.start,
      dateRange.end,
    );
    const daily = buildDailyLedgerSummaries(
      records,
      dateRange.start,
      dateRange.end,
    );

    return {
      ok: true,
      start: dateRange.start,
      end: dateRange.end,
      records: rangeRecords,
      summary: summarizeLedgerRecords(rangeRecords),
      daily,
      weekly: buildWeeklyLedgerSummaries(daily),
      monthly: buildMonthlyLedgerSummaries(daily),
    };
  }, [customEnd, customStart, datePreset, now, records]);

  function selectDatePreset(nextPreset: HistoryDatePreset) {
    setDatePreset(nextPreset);

    if (
      nextPreset === "custom" &&
      (!customStart || !customEnd) &&
      now !== null
    ) {
      const defaultRange = getDefaultCustomRange(now);
      setCustomStart(defaultRange.start);
      setCustomEnd(defaultRange.end);
    }
  }

  function refreshReport() {
    if (isLoading) return;
    setIsLoading(true);
    setLoadError("");
    setReloadToken((current) => current + 1);
  }

  const hasData = reportData?.ok === true && reportData.records.length > 0;

  return (
    <div className="min-h-screen bg-[#f6f4ee] font-sans text-[#1e2a23]">
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#215c46] hover:underline"
            >
              ← 返回首页
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              经营报表
            </h1>
            <p className="mt-1 text-sm leading-6 text-[#69736c]">
              使用当前浏览器 IndexedDB 中的实际账目计算，不包含演示数据。
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={refreshReport}
              disabled={isLoading}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bfcbc2] bg-white px-3.5 py-2 text-sm font-medium text-[#215c46] shadow-sm hover:bg-[#edf3ef] disabled:cursor-wait disabled:opacity-60"
            >
              {isLoading ? "正在读取…" : "刷新数据"}
            </button>
            <p className="text-xs text-[#858d87]">
              {now === null
                ? "正在读取本地数据…"
                : `数据读取于 ${refreshTimeFormatter.format(new Date(now))}`}
            </p>
          </div>
        </header>

        <section
          aria-labelledby="report-filter-heading"
          className="mt-6 rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="report-filter-heading"
              className="text-sm font-semibold text-[#3f4b43]"
            >
              报表范围
            </h2>
            <p className="text-xs text-[#858d87]">
              {reportData?.ok
                ? `共 ${reportData.records.length} 条记录`
                : "按本地日期统计"}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {DATE_OPTIONS.map((option) => {
              const isSelected = datePreset === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isLoading}
                  aria-pressed={isSelected}
                  onClick={() => selectDatePreset(option.value)}
                  className={`flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
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

          {datePreset === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-[#566159]">
                <span className="mb-1.5 block text-xs font-medium text-[#6f7871]">
                  开始日期
                </span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
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
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[#d9dbd4] bg-white px-3 py-2 text-sm text-[#26332a] outline-none focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
                />
              </label>
            </div>
          ) : null}

          {reportData?.ok ? (
            <p className="mt-3 text-xs text-[#7f8781]">
              {`${formatRangeLabel(reportData.start, reportData.end)}，开始日和结束日都包含在统计范围内。`}
            </p>
          ) : reportData && !reportData.ok ? (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"
            >
              {reportData.error}
            </p>
          ) : null}
        </section>

        {loadError ? (
          <div
            role="alert"
            className="mt-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={refreshReport}
              disabled={isLoading}
              className="shrink-0 self-start rounded-lg bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800 disabled:opacity-60 sm:self-auto"
            >
              重试读取
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-5 rounded-2xl border border-[#e5e3dc] bg-white px-5 py-16 text-center text-sm text-[#858d87]">
            正在读取本地账目并生成报表…
          </div>
        ) : reportData?.ok && reportData.records.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-[#e5e3dc] bg-white px-5 py-16 text-center">
            <h2 className="text-lg font-semibold text-[#3f4b43]">
              {records.length === 0
                ? "还没有任何账目记录"
                : "当前范围没有账目记录"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#858d87]">
              {records.length === 0
                ? "先返回首页记录第一笔进账或成本，再回来查看经营报表。"
                : "可以切换今天、最近 7 天、最近 30 天，或调整自定义日期范围。"}
            </p>
          </div>
        ) : reportData?.ok && hasData ? (
          <div className="mt-5 space-y-5">
            <section
              aria-labelledby="category-summary-heading"
              className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2
                    id="category-summary-heading"
                    className="text-lg font-semibold tracking-tight"
                  >
                    分类汇总
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[#858d87]">
                    会员充值单独列示，不计入普通进账。
                  </p>
                </div>
                <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-xs text-[#727a74]">
                  {reportData.summary.recordCount} 条记录
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="普通进账总额"
                  amountCents={reportData.summary.categories.普通进账.amountCents}
                  note={`${reportData.summary.categories.普通进账.count} 笔`}
                  cardClass="border-[#e5e3dc] bg-white"
                  valueClass="text-emerald-700"
                />
                <MetricCard
                  label="会员充值总额"
                  amountCents={reportData.summary.categories.会员充值.amountCents}
                  note={`${reportData.summary.categories.会员充值.count} 笔`}
                  cardClass="border-[#dce8ef] bg-[#f6fafc]"
                  valueClass="text-sky-700"
                />
                <MetricCard
                  label="备菜成本总额"
                  amountCents={reportData.summary.categories.备菜成本.amountCents}
                  note={`${reportData.summary.categories.备菜成本.count} 笔`}
                  cardClass="border-[#eee5d7] bg-[#fcfaf6]"
                  valueClass="text-amber-800"
                />
                <MetricCard
                  label="其他成本总额"
                  amountCents={reportData.summary.categories.其他成本.amountCents}
                  note={`${reportData.summary.categories.其他成本.count} 笔`}
                  cardClass="border-[#e8e4df] bg-[#faf9f7]"
                  valueClass="text-stone-700"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MetricCard
                  label="总收款"
                  amountCents={reportData.summary.receiptsCents}
                  note="普通进账 + 会员充值"
                  cardClass="border-[#c9dbcf] bg-[#edf5ef]"
                  valueClass="text-[#215c46]"
                />
                <MetricCard
                  label="总成本"
                  amountCents={reportData.summary.costsCents}
                  note="备菜成本 + 其他成本"
                  cardClass="border-[#eadacb] bg-[#fbf3eb]"
                  valueClass="text-[#a6532e]"
                />
                <MetricCard
                  label="收支差额"
                  amountCents={reportData.summary.differenceCents}
                  note="总收款 - 总成本，不等同于净利润"
                  cardClass={`border-[#dedfd9] ${
                    reportData.summary.differenceCents < 0
                      ? "bg-rose-50"
                      : "bg-[#f4f3ee]"
                  }`}
                  valueClass={
                    reportData.summary.differenceCents < 0
                      ? "text-rose-700"
                      : "text-[#2b372f]"
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5">
              <h2 className="text-lg font-semibold tracking-tight">每日趋势</h2>
              <p className="mt-1 text-xs leading-5 text-[#858d87]">
                按本地日期汇总每日总收款和总成本；范围较长时可横向滚动。
              </p>
              <div className="mt-4">
                <DailyTrendChart days={reportData.daily} />
              </div>
            </section>

            <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5">
              <h2 className="text-lg font-semibold tracking-tight">按日汇总</h2>
              <p className="mt-1 text-xs leading-5 text-[#858d87]">
                普通进账和会员充值分别展示后，再计算总收款。
              </p>
              <div className="mt-4">
                <DailySummaryTable days={reportData.daily} />
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <PeriodSummaryTable
                title="按周汇总"
                description="按自然周（周一至周日）分组，只统计当前日期范围内的记录。"
                periods={reportData.weekly}
              />
              <PeriodSummaryTable
                title="按月汇总"
                description="按本地月份分组，只统计当前日期范围内的记录。"
                periods={reportData.monthly}
              />
            </div>

            <p className="rounded-xl border border-[#e3e0d8] bg-[#f2f0e9] px-4 py-3 text-xs leading-5 text-[#69736c]">
              指标规则：总收款 = 普通进账 + 会员充值；总成本 = 备菜成本 +
              其他成本；收支差额 = 总收款 - 总成本。会员充值单独列示，收支差额不使用“净利润”表述。
            </p>
          </div>
        ) : null}

        <footer className="mt-8 border-t border-[#dfded7] pt-5 text-center text-xs leading-5 text-[#858d87]">
          报表仅根据当前浏览器 IndexedDB 中的记录计算，不上传账目数据。编辑或删除记录后，可返回本页或点击“刷新数据”获取最新结果。
        </footer>
      </main>
    </div>
  );
}
