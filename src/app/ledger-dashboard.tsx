"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CATEGORY_DETAILS,
  LEDGER_CATEGORIES,
  MAX_NOTE_LENGTH,
  calculateAmount,
  deleteLedgerRecord,
  isLedgerCategory,
  loadLedgerRecords,
  saveLedgerRecord,
  updateLedgerRecord,
} from "@/lib/ledger";
import type {
  LedgerCategory,
  LedgerDirection,
  LedgerRecord,
} from "@/lib/ledger";
import {
  buildDailyLedgerSummaries,
  centsToYuan,
  summarizeLedgerRecords,
} from "@/lib/ledger-report";
import LedgerBackupPanel from "./ledger-backup";
import LedgerHistory from "./ledger-history";

const DIRECTION_CATEGORIES: Record<
  LedgerDirection,
  readonly LedgerCategory[]
> = {
  income: ["普通进账", "会员充值"],
  cost: ["备菜成本", "其他成本"],
};

const SUMMARY_DEFINITIONS: Array<{
  category: LedgerCategory;
  dotClass: string;
}> = [
  { category: "普通进账", dotClass: "bg-emerald-500" },
  { category: "会员充值", dotClass: "bg-sky-500" },
  { category: "备菜成本", dotClass: "bg-amber-500" },
  { category: "其他成本", dotClass: "bg-rose-400" },
];

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const monthDayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const recordDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  weekday: "short",
});

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameLocalDay(left: number, right: number): boolean {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function formatRecordTime(createdAt: number, now: number): string {
  const time = timeFormatter.format(new Date(createdAt));

  if (isSameLocalDay(createdAt, now)) {
    return `今天 ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameLocalDay(createdAt, yesterday.getTime())) {
    return `昨天 ${time}`;
  }

  return `${monthDayFormatter.format(new Date(createdAt))} ${time}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "当前浏览器本地存储空间不足，请释放空间后重试。";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3.75v2.5M17.25 3.75v2.5M4.5 9h15M5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
  );
}

function LedgerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3.75h10.5a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 8.25h6M9 12h6M9 15.75h3.75"
      />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={
          direction === "up"
            ? "M12 19V5m0 0-5 5m5-5 5 5"
            : "M12 5v14m0 0-5-5m5 5 5-5"
        }
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0 opacity-70"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export default function LedgerDashboard() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [formDirection, setFormDirection] = useState<LedgerDirection | null>(
    null,
  );
  const [selectedCategory, setSelectedCategory] =
    useState<LedgerCategory>("普通进账");
  const [amountExpression, setAmountExpression] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<LedgerRecord | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");
  const latestRecordsRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const currentTime = Date.now();

      try {
        const storedRecords = await loadLedgerRecords();
        if (cancelled) return;
        setRecords(storedRecords);
        setNow(currentTime);
      } catch (error) {
        if (cancelled) return;
        setStorageError(
          getErrorMessage(error, "无法读取当前浏览器中的本地账目。"),
        );
        setNow(currentTime);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!formDirection && !deletingRecord) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (formDirection && !isSaving) {
        setFormDirection(null);
        setEditingRecord(null);
        setFormError("");
      } else if (deletingRecord && !isDeleting) {
        setDeletingRecord(null);
        setDeleteError("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deletingRecord, formDirection, isDeleting, isSaving]);

  const summaryItems = useMemo(() => {
    if (now === null) {
      return SUMMARY_DEFINITIONS.map((definition) => ({
        ...definition,
        total: 0,
        count: 0,
      }));
    }

    const todayRecords = records.filter((record) =>
      isSameLocalDay(record.createdAt, now),
    );
    const totals = summarizeLedgerRecords(todayRecords);

    return SUMMARY_DEFINITIONS.map((definition) => {
      const categoryTotals = totals.categories[definition.category];

      return {
        ...definition,
        total: centsToYuan(categoryTotals.amountCents),
        count: categoryTotals.count,
      };
    });
  }, [now, records]);

  const weeklyData = useMemo(() => {
    if (now === null) {
      return [];
    }

    const finalDay = startOfLocalDay(now);
    const rangeStart = new Date(finalDay);
    rangeStart.setDate(finalDay.getDate() - 6);
    const rangeEnd = new Date(finalDay);
    rangeEnd.setDate(finalDay.getDate() + 1);

    return buildDailyLedgerSummaries(
      records,
      rangeStart.getTime(),
      rangeEnd.getTime(),
    ).map((day) => {
      const date = new Date(day.dateStart);

      return {
        date,
        dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
        weekday: weekdayFormatter.format(date),
        income: centsToYuan(day.receiptsCents),
        cost: centsToYuan(day.costsCents),
        isToday: isSameLocalDay(day.dateStart, now),
      };
    });
  }, [now, records]);

  const totalIncome = weeklyData.reduce((sum, day) => sum + day.income, 0);
  const totalCost = weeklyData.reduce((sum, day) => sum + day.cost, 0);
  const totalBalance = totalIncome - totalCost;
  const chartMaximum = Math.max(
    1,
    ...weeklyData.flatMap((day) => [day.income, day.cost]),
  );
  const hasWeeklyRecords = weeklyData.some(
    (day) => day.income > 0 || day.cost > 0,
  );
  const recentRecords = records.slice(0, 8);
  const formCategories = editingRecord
    ? LEDGER_CATEGORIES
    : formDirection
      ? DIRECTION_CATEGORIES[formDirection]
      : [];
  const amountPreview = amountExpression.trim()
    ? calculateAmount(amountExpression)
    : null;

  async function retryLoadingRecords() {
    setIsLoading(true);
    setStorageError("");
    const currentTime = Date.now();

    try {
      const storedRecords = await loadLedgerRecords();
      setRecords(storedRecords);
      setNow(currentTime);
    } catch (error) {
      setStorageError(
        getErrorMessage(error, "无法读取当前浏览器中的本地账目。"),
      );
      setNow(currentTime);
    } finally {
      setIsLoading(false);
    }
  }

  async function reloadRecordsAfterRestore() {
    const currentTime = Date.now();

    try {
      const storedRecords = await loadLedgerRecords();
      setRecords(storedRecords);
      setNow(currentTime);
      setStorageError("");
    } catch (error) {
      setStorageError(
        getErrorMessage(error, "恢复后无法重新读取本地账目。"),
      );
      throw error;
    }
  }

  async function loadLatestRecordsForExport(): Promise<{
    records: LedgerRecord[];
    refreshedAt: number;
  }> {
    const requestId = latestRecordsRequestId.current + 1;
    latestRecordsRequestId.current = requestId;

    try {
      const storedRecords = await loadLedgerRecords();

      if (requestId !== latestRecordsRequestId.current) {
        throw new Error("数据刷新已被更新的请求取代，请重试。");
      }

      const refreshedAt = Date.now();
      setRecords(storedRecords);
      setNow(refreshedAt);
      setStorageError("");

      return { records: storedRecords, refreshedAt };
    } catch (error) {
      const message = getErrorMessage(error, "无法读取最新账目。");

      if (requestId === latestRecordsRequestId.current) {
        setStorageError(message);
      }

      throw new Error(message);
    }
  }

  function openEntryForm(direction: LedgerDirection) {
    const categories = DIRECTION_CATEGORIES[direction];
    setEditingRecord(null);
    setSelectedCategory(categories[0]);
    setAmountExpression("");
    setNote("");
    setFormError("");
    setFormDirection(direction);
  }

  function closeEntryForm() {
    if (isSaving) return;
    setFormDirection(null);
    setEditingRecord(null);
    setFormError("");
  }

  function openEditForm(record: LedgerRecord) {
    setEditingRecord(record);
    setFormDirection(CATEGORY_DETAILS[record.category].direction);
    setSelectedCategory(record.category);
    setAmountExpression(record.amount.toFixed(2));
    setNote(record.note);
    setFormError("");
  }

  function openDeleteConfirmation(record: LedgerRecord) {
    setDeletingRecord(record);
    setDeleteError("");
  }

  function closeDeleteConfirmation() {
    if (isDeleting) return;
    setDeletingRecord(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deletingRecord || isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteLedgerRecord(deletingRecord.id);
      setRecords((current) =>
        current.filter((record) => record.id !== deletingRecord.id),
      );
      setToast(
        `已删除：${deletingRecord.category} ¥${moneyFormatter.format(deletingRecord.amount)}`,
      );
      setDeletingRecord(null);
    } catch (error) {
      setDeleteError(
        getErrorMessage(error, "删除失败，原记录仍然保留，请重试。"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function appendOperator(operator: string) {
    setAmountExpression((current) => {
      const base = current.trimEnd();
      return base ? `${base} ${operator} ` : "";
    });
    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!formDirection) {
      return;
    }

    if (storageError) {
      setFormError("本地账本当前不可用，请关闭表单后重试读取。");
      return;
    }

    const amountResult = calculateAmount(amountExpression);
    if (!amountResult.ok) {
      setFormError(amountResult.error);
      return;
    }

    if (!isLedgerCategory(selectedCategory)) {
      setFormError("请选择有效的账目类别。");
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > MAX_NOTE_LENGTH) {
      setFormError(`备注不能超过 ${MAX_NOTE_LENGTH} 个字符。`);
      return;
    }

    setIsSaving(true);

    try {
      const recordInput = {
        category: selectedCategory,
        amount: amountResult.amount,
        note: trimmedNote,
      };

      if (editingRecord) {
        const updatedRecord = await updateLedgerRecord(
          editingRecord.id,
          recordInput,
        );

        setRecords((current) =>
          current
            .map((record) =>
              record.id === updatedRecord.id ? updatedRecord : record,
            )
            .sort((left, right) => right.createdAt - left.createdAt),
        );
        setFormDirection(null);
        setEditingRecord(null);
        setToast(
          `已更新：${updatedRecord.category} ¥${moneyFormatter.format(updatedRecord.amount)}`,
        );
      } else {
        const savedRecord = await saveLedgerRecord(recordInput);

        setRecords((current) =>
          [savedRecord, ...current].sort(
            (left, right) => right.createdAt - left.createdAt,
          ),
        );
        setFormDirection(null);
        setToast(
          `已保存：${savedRecord.category} ¥${moneyFormatter.format(savedRecord.amount)}`,
        );
      }

      setNow(Date.now());
    } catch (error) {
      setFormError(
        getErrorMessage(
          error,
          editingRecord
            ? "修改失败，原记录未改变，请重试。"
            : "保存失败，请检查浏览器是否允许本地存储后重试。",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  const dateLabel = now === null ? "正在读取日期" : fullDateFormatter.format(new Date(now));
  const weeklyRangeLabel =
    weeklyData.length > 0
      ? `${monthDayFormatter.format(weeklyData[0].date)}－${monthDayFormatter.format(weeklyData[weeklyData.length - 1].date)}`
      : "最近 7 天";

  return (
    <div className="min-h-screen bg-[#f6f4ee] font-sans text-[#1e2a23]">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#215c46] text-white shadow-sm">
              <LedgerIcon />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  餐厅账本
                </h1>
                <span className="rounded-full bg-[#e5ebe4] px-2.5 py-1 text-xs font-medium text-[#42604e]">
                  仅本机保存
                </span>
              </div>
              <p className="mt-1 text-sm text-[#69736c]">
                把每天的收入和支出，记清楚一点。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/reports"
              className="rounded-full border border-[#bfcbc2] bg-white px-3.5 py-2 text-sm font-medium text-[#215c46] shadow-sm hover:bg-[#edf3ef]"
            >
              经营报表
            </Link>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dcded7] bg-white/80 px-3.5 py-2 text-sm text-[#59645c] shadow-sm">
              <CalendarIcon />
              <span>{dateLabel}</span>
            </div>
          </div>
        </header>

        {storageError ? (
          <div
            role="alert"
            className="mt-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{storageError}</span>
            <button
              type="button"
              onClick={() => void retryLoadingRecords()}
              className="shrink-0 self-start rounded-lg bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800 sm:self-auto"
            >
              重试读取
            </button>
          </div>
        ) : null}

        <section aria-labelledby="overview-heading" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="overview-heading"
                className="text-lg font-semibold tracking-tight sm:text-xl"
              >
                今日概览
              </h2>
              <p className="mt-1 text-sm text-[#7a827c]">
                根据当前浏览器中已保存的记录统计
              </p>
            </div>
            <span className="text-xs font-medium text-[#7a827c]">
              {isLoading
                ? "读取中…"
                : storageError
                  ? "数据不可用"
                  : "实际记录"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <article
                key={item.category}
                className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-[#667067]">
                    {item.category}
                  </h3>
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${item.dotClass}`}
                  />
                </div>
                <p className="mt-4 break-words text-[15px] font-semibold leading-6 tabular-nums tracking-tight sm:text-2xl">
                  {isLoading ? (
                    <span className="text-base font-medium text-[#858d87]">
                      读取中…
                    </span>
                  ) : storageError ? (
                    <span className="text-base font-medium text-[#858d87]">
                      不可用
                    </span>
                  ) : (
                    <>
                      <span className="mr-1 text-sm font-normal text-[#818a83]">
                        ¥
                      </span>
                      {moneyFormatter.format(item.total)}
                    </>
                  )}
                </p>
                <p className="mt-1.5 text-xs text-[#858d87]">
                  {isLoading
                    ? "正在读取…"
                    : storageError
                      ? "无法读取本地数据"
                      : `今日共 ${item.count} 笔`}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section aria-label="记账入口" className="mt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => openEntryForm("income")}
              disabled={isLoading || Boolean(storageError)}
              className="flex min-h-28 w-full items-center gap-4 rounded-2xl bg-[#215c46] px-5 py-5 text-left text-white shadow-[0_8px_22px_rgba(33,92,70,0.18)] transition-colors hover:bg-[#194b39] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#215c46] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/14">
                <ArrowIcon direction="up" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-semibold">记进账</span>
                <span className="mt-1 block text-sm text-white/70">
                  普通营业款、会员充值
                </span>
              </span>
              <ChevronRightIcon />
            </button>

            <button
              type="button"
              onClick={() => openEntryForm("cost")}
              disabled={isLoading || Boolean(storageError)}
              className="flex min-h-28 w-full items-center gap-4 rounded-2xl bg-[#b75f34] px-5 py-5 text-left text-white shadow-[0_8px_22px_rgba(183,95,52,0.16)] transition-colors hover:bg-[#9d4f2b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b75f34] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/14">
                <ArrowIcon direction="down" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-semibold">记成本</span>
                <span className="mt-1 block text-sm text-white/70">
                  备菜采购、其他支出
                </span>
              </span>
              <ChevronRightIcon />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-[#858d87]">
            记录只保存在当前浏览器中，不会上传到服务器。
          </p>
        </section>

        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <section
            aria-labelledby="records-heading"
            className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-[0_1px_2px_rgba(35,45,38,0.04)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#eeede8] px-4 py-4 sm:px-5">
              <div>
                <h2
                  id="records-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  最近记录
                </h2>
                <p className="mt-1 text-xs text-[#858d87]">
                  按保存时间从新到旧
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-xs text-[#727a74]">
                  {isLoading ? "读取中" : `共 ${records.length} 条`}
                </span>
                <a
                  href="#history"
                  className="text-xs font-medium text-[#215c46] hover:underline"
                >
                  查看完整历史
                </a>
              </div>
            </div>

            {isLoading ? (
              <div className="px-5 py-12 text-center text-sm text-[#858d87]">
                正在读取本地账目…
              </div>
            ) : storageError ? (
              <div className="px-5 py-12 text-center text-sm text-rose-700">
                本地记录暂时无法读取。
              </div>
            ) : recentRecords.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="font-medium text-[#4a554d]">还没有账目记录</p>
                <p className="mt-2 text-sm leading-6 text-[#858d87]">
                  点击上方“记进账”或“记成本”，保存第一笔记录。
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#efeee9]">
                {recentRecords.map((record) => {
                  const details = CATEGORY_DETAILS[record.category];
                  const isIncome = details.direction === "income";

                  return (
                    <li
                      key={record.id}
                      className="flex items-start gap-3 px-4 py-4 sm:px-5"
                    >
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
                        </div>
                        <p className="mt-1.5 text-xs text-[#858d87]">
                          {now === null
                            ? "刚刚"
                            : formatRecordTime(record.createdAt, now)}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 pt-0.5 text-sm font-semibold tabular-nums sm:text-base ${
                          isIncome ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {isIncome ? "+" : "-"}¥
                        {moneyFormatter.format(record.amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="weekly-heading"
            className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="weekly-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  近 7 天经营概览
                </h2>
                <p className="mt-1 text-xs text-[#858d87]">
                  {weeklyRangeLabel}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[#747d76]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#2b7a5d]" />
                  进账含充值
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#d18a52]" />
                  成本
                </span>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 divide-x divide-[#ecebe6] rounded-xl bg-[#f7f7f3] px-2 py-3">
              <div className="px-2">
                <dt className="text-[11px] text-[#7f8781]">7 天进账</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums sm:text-base">
                  {isLoading ? "…" : `¥${moneyFormatter.format(totalIncome)}`}
                </dd>
              </div>
              <div className="px-2">
                <dt className="text-[11px] text-[#7f8781]">7 天成本</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums sm:text-base">
                  {isLoading ? "…" : `¥${moneyFormatter.format(totalCost)}`}
                </dd>
              </div>
              <div className="px-2">
                <dt className="text-[11px] text-[#7f8781]">结余</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-[#215c46] sm:text-base">
                  {isLoading ? "…" : `¥${moneyFormatter.format(totalBalance)}`}
                </dd>
              </div>
            </dl>

            {isLoading ? (
              <div className="flex h-44 items-center justify-center text-sm text-[#858d87]">
                正在整理近 7 天数据…
              </div>
            ) : storageError ? (
              <div className="flex h-44 items-center justify-center text-sm text-rose-700">
                本地数据暂时不可用。
              </div>
            ) : hasWeeklyRecords ? (
              <div className="mt-5 flex h-40 items-end gap-1.5 sm:gap-3">
                {weeklyData.map((day) => (
                  <div
                    key={day.dateLabel}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    title={`${day.dateLabel}：进账 ${moneyFormatter.format(day.income)} 元，成本 ${moneyFormatter.format(day.cost)} 元`}
                  >
                    <div className="flex min-h-0 flex-1 items-end justify-center gap-1">
                      <div
                        className="w-[38%] max-w-4 rounded-t-sm bg-[#2b7a5d]"
                        style={{
                          height: `${(day.income / chartMaximum) * 100}%`,
                        }}
                      />
                      <div
                        className="w-[38%] max-w-4 rounded-t-sm bg-[#d18a52]"
                        style={{
                          height: `${(day.cost / chartMaximum) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 text-center">
                      <p
                        className={`text-[11px] font-medium ${
                          day.isToday ? "text-[#215c46]" : "text-[#5e6860]"
                        }`}
                      >
                        {day.weekday}
                      </p>
                      <p className="mt-0.5 hidden text-[10px] tabular-nums text-[#9aa09b] sm:block">
                        {day.dateLabel}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-44 flex-col items-center justify-center text-center">
                <p className="text-sm font-medium text-[#566159]">
                  近 7 天还没有数据
                </p>
                <p className="mt-2 max-w-56 text-xs leading-5 text-[#858d87]">
                  保存账目后，这里会根据实际记录生成概览。
                </p>
              </div>
            )}
          </section>
        </div>

        {now !== null ? (
          <LedgerHistory
            records={records}
            now={now}
            isLoading={isLoading}
            storageError={storageError}
            onLoadLatestRecords={loadLatestRecordsForExport}
            onEdit={openEditForm}
            onDelete={openDeleteConfirmation}
          />
        ) : null}

        {now !== null ? (
          <LedgerBackupPanel
            records={records}
            isLoading={isLoading}
            storageError={storageError}
            onLoadLatestRecords={loadLatestRecordsForExport}
            onRestoreComplete={reloadRecordsAfterRestore}
          />
        ) : null}

        <footer className="mt-8 border-t border-[#dfded7] pt-5 text-center text-xs leading-5 text-[#858d87]">
          账目仅保存在当前浏览器的 IndexedDB 中，不会上传到服务器。IndexedDB
          不天然等于加密存储，请只在可信设备上使用，并自行保留后续备份。
        </footer>
      </main>

      {formDirection ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEntryForm();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="entry-form-title"
            className="max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 shadow-2xl supports-[height:100dvh]:max-h-[92dvh] sm:max-w-lg sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="entry-form-title"
                  className="text-xl font-semibold tracking-tight"
                >
                  {editingRecord
                    ? "编辑记录"
                    : formDirection === "income"
                      ? "记进账"
                      : "记成本"}
                </h2>
                <p className="mt-1 text-sm text-[#7c857e]">
                  {editingRecord
                    ? `原记账时间：${recordDateTimeFormatter.format(new Date(editingRecord.createdAt))}`
                    : "保存后立即计入今日统计和最近记录"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEntryForm}
                disabled={isSaving}
                aria-label="关闭表单"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f1f1ed] text-[#626c65] hover:bg-[#e7e7e1] disabled:opacity-50"
              >
                <CloseIcon />
              </button>
            </div>

            <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
              <fieldset>
                <legend className="text-sm font-medium text-[#3f4b43]">
                  类别
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {formCategories.map((category) => {
                    const isSelected = selectedCategory === category;

                    return (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedCategory(category);
                          setFormError("");
                        }}
                        className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                          isSelected
                            ? "border-[#215c46] bg-[#edf3ef] text-[#215c46]"
                            : "border-[#dedfd9] bg-white text-[#4e5951] hover:border-[#aeb8b1]"
                        }`}
                      >
                        <span className="block text-sm font-semibold">
                          {category}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#7f8781]">
                          {CATEGORY_DETAILS[category].description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="amount-expression"
                  className="text-sm font-medium text-[#3f4b43]"
                >
                  金额
                </label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-[#727c75]">
                    ¥
                  </span>
                  <input
                    id="amount-expression"
                    required
                    autoComplete="off"
                    inputMode="text"
                    value={amountExpression}
                    onChange={(event) => {
                      setAmountExpression(event.target.value);
                      setFormError("");
                    }}
                    placeholder="例如 128.50 或 100+20*2"
                    aria-describedby="amount-help amount-preview"
                    className="w-full rounded-xl border border-[#d9dbd4] bg-white py-3 pl-8 pr-3 text-lg tabular-nums text-[#26332a] outline-none transition focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
                  />
                </div>
                <p id="amount-help" className="mt-2 text-xs text-[#858d87]">
                  支持 +、-、*、/ 和括号，例如 (80+20)*2。
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["+", "-", "*", "/"].map((operator) => (
                    <button
                      key={operator}
                      type="button"
                      onClick={() => appendOperator(operator)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#dedfd9] bg-[#f7f7f3] px-2 py-2 text-sm font-medium text-[#4e5951] hover:border-[#aeb8b1]"
                      aria-label={`输入运算符 ${operator}`}
                    >
                      {operator === "*" ? "×" : operator === "/" ? "÷" : operator}
                    </button>
                  ))}
                </div>
                <div id="amount-preview" className="mt-2 min-h-5 text-sm">
                  {amountPreview?.ok ? (
                    <span className="text-[#215c46]">
                      计算结果：¥{moneyFormatter.format(amountPreview.amount)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <label
                  htmlFor="record-note"
                  className="text-sm font-medium text-[#3f4b43]"
                >
                  备注
                  <span className="ml-1 font-normal text-[#8a918c]">选填</span>
                </label>
                <input
                  id="record-note"
                  type="text"
                  value={note}
                  maxLength={MAX_NOTE_LENGTH}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setFormError("");
                  }}
                  placeholder="例如：午市营业款、早市采购"
                  className="mt-2 w-full rounded-xl border border-[#d9dbd4] bg-white px-3 py-3 text-sm text-[#26332a] outline-none transition focus:border-[#215c46] focus:ring-3 focus:ring-[#215c46]/12"
                />
                <p className="mt-1 text-right text-[11px] text-[#9aa09b]">
                  {note.length}/{MAX_NOTE_LENGTH}
                </p>
              </div>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"
                >
                  {formError}
                </p>
              ) : null}

              <div className="sticky bottom-0 z-10 -mx-5 flex gap-3 border-t border-[#eeede8] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 sm:pb-0">
                <button
                  type="button"
                  onClick={closeEntryForm}
                  disabled={isSaving}
                  className="flex-1 rounded-xl border border-[#d8dad3] bg-white px-4 py-3 text-sm font-medium text-[#4f5a52] hover:bg-[#f7f7f3] disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-[1.4] rounded-xl bg-[#215c46] px-4 py-3 text-sm font-semibold text-white hover:bg-[#194b39] disabled:cursor-wait disabled:opacity-60"
                >
                  {isSaving
                    ? "正在保存…"
                    : editingRecord
                      ? "保存修改"
                      : "保存记录"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deletingRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteConfirmation();
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            className="w-full rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
          >
            <h2
              id="delete-dialog-title"
              className="text-xl font-semibold tracking-tight text-[#2b372f]"
            >
              确认删除这条记录？
            </h2>
            <p
              id="delete-dialog-description"
              className="mt-2 text-sm leading-6 text-[#737c75]"
            >
              删除后无法恢复，该记录将不再出现在历史记录和 CSV 导出中。
            </p>

            <dl className="mt-4 space-y-2 rounded-xl bg-[#f7f6f1] p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#7b847d]">类别</dt>
                <dd className="font-medium text-[#2b372f]">
                  {deletingRecord.category}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#7b847d]">金额</dt>
                <dd className="font-semibold tabular-nums text-[#b42318]">
                  ¥{moneyFormatter.format(deletingRecord.amount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#7b847d]">记账时间</dt>
                <dd className="text-right tabular-nums text-[#3f4b43]">
                  {recordDateTimeFormatter.format(
                    new Date(deletingRecord.createdAt),
                  )}
                </dd>
              </div>
              {deletingRecord.note ? (
                <div className="flex justify-between gap-4 border-t border-[#e7e5de] pt-2">
                  <dt className="shrink-0 text-[#7b847d]">备注</dt>
                  <dd className="break-words text-right text-[#3f4b43]">
                    {deletingRecord.note}
                  </dd>
                </div>
              ) : null}
            </dl>

            {deleteError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"
              >
                {deleteError}
              </p>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={isDeleting}
                className="flex-1 rounded-xl border border-[#d8dad3] bg-white px-4 py-3 text-sm font-medium text-[#4f5a52] hover:bg-[#f7f7f3] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-[#b42318] px-4 py-3 text-sm font-semibold text-white hover:bg-[#912018] disabled:cursor-wait disabled:opacity-60"
              >
                {isDeleting ? "正在删除…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-[#1f3d30] px-4 py-3 text-center text-sm text-white shadow-xl"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
