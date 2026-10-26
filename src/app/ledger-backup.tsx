"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_BACKUP_FILE_SIZE,
  createBackupFilename,
  downloadBackupJson,
  parseLedgerBackup,
  previewBackupMerge,
  serializeLedgerBackup,
} from "@/lib/ledger-backup";
import type { BackupPreview, LedgerBackup } from "@/lib/ledger-backup";
import { mergeLedgerRecords } from "@/lib/ledger";
import type { LedgerRecord } from "@/lib/ledger";

interface LedgerBackupPanelProps {
  records: LedgerRecord[];
  isLoading: boolean;
  storageError: string;
  onLoadLatestRecords: () => Promise<{
    records: LedgerRecord[];
    refreshedAt: number;
  }>;
  onRestoreComplete: () => Promise<void>;
}

interface BackupFeedback {
  tone: "success" | "error" | "warning";
  message: string;
}

interface PendingRestore {
  fileName: string;
  backup: LedgerBackup;
  preview: BackupPreview;
}

const EXPORT_DUPLICATE_GUARD_MS = 1000;

const exportedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function feedbackClass(tone: BackupFeedback["tone"]): string {
  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export default function LedgerBackupPanel({
  records,
  isLoading,
  storageError,
  onLoadLatestRecords,
  onRestoreComplete,
}: LedgerBackupPanelProps) {
  const [exportFeedback, setExportFeedback] =
    useState<BackupFeedback | null>(null);
  const [restoreFeedback, setRestoreFeedback] =
    useState<BackupFeedback | null>(null);
  const [pendingRestore, setPendingRestore] =
    useState<PendingRestore | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
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

  async function exportBackup() {
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
          message: "账目仍在读取中，请稍后再导出备份。",
        });
        return;
      }

      if (storageError) {
        setExportFeedback({
          tone: "error",
          message: "本地账本当前不可用，无法生成备份。",
        });
        return;
      }

      const { records: latestRecords } = await onLoadLatestRecords();

      if (!isMountedRef.current) return;

      if (latestRecords.length === 0) {
        setExportFeedback({
          tone: "error",
          message: "当前没有已保存记录，未生成备份文件。",
        });
        return;
      }

      const exportedAt = Date.now();
      const content = serializeLedgerBackup(latestRecords, exportedAt);
      const filename = createBackupFilename(exportedAt);
      downloadBackupJson(content, filename);
      setExportFeedback({
        tone: "success",
        message: `已生成并开始下载 ${latestRecords.length} 条记录的完整备份：${filename}`,
      });
    } catch (error) {
      if (isMountedRef.current) {
        setExportFeedback({
          tone: "error",
          message:
            error instanceof Error && error.message
              ? `读取最新账目失败，未生成备份文件：${error.message}`
              : "读取最新账目失败，未生成备份文件，请重试。",
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

  async function handleBackupFile(file: File) {
    setPendingRestore(null);
    setRestoreFeedback(null);

    if (file.size > MAX_BACKUP_FILE_SIZE) {
      setRestoreFeedback({
        tone: "error",
        message: "备份文件超过 10 MB，已拒绝读取。",
      });
      return;
    }

    try {
      const text = await file.text();
      const result = parseLedgerBackup(text);

      if (!result.ok) {
        setRestoreFeedback({ tone: "error", message: result.error });
        return;
      }

      const preview = previewBackupMerge(result.backup.records, records);
      setPendingRestore({
        fileName: file.name,
        backup: result.backup,
        preview,
      });
    } catch {
      setRestoreFeedback({
        tone: "error",
        message: "无法读取备份文件，请重新选择有效的 JSON 文件。",
      });
    }
  }

  async function confirmRestore() {
    if (!pendingRestore || isRestoring) return;

    setIsRestoring(true);
    setRestoreFeedback(null);

    let mergeResult;

    try {
      mergeResult = await mergeLedgerRecords(pendingRestore.preview.records);
    } catch (error) {
      setRestoreFeedback({
        tone: "error",
        message:
          error instanceof Error && error.message
            ? `恢复失败：${error.message} 本次导入事务未完成。`
            : "恢复失败，本次导入事务未完成，请重试。",
      });
      setIsRestoring(false);
      return;
    }

    try {
      await onRestoreComplete();
      setRestoreFeedback({
        tone: "success",
        message: `恢复完成：新增 ${mergeResult.importedCount} 条，跳过 ${mergeResult.skippedCount} 条相同 ID 记录。`,
      });
      setPendingRestore(null);
    } catch {
      setRestoreFeedback({
        tone: "warning",
        message: `数据已合并（新增 ${mergeResult.importedCount} 条，跳过 ${mergeResult.skippedCount} 条），但页面刷新失败。请手动刷新页面确认数据。`,
      });
      setPendingRestore(null);
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <section
      id="backup"
      aria-labelledby="backup-heading"
      className="mt-5 scroll-mt-5 rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-[0_1px_2px_rgba(35,45,38,0.04)] sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="backup-heading"
            className="text-lg font-semibold tracking-tight"
          >
            完整数据备份
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#858d87]">
            JSON 备份包含完整记录，可用于恢复；CSV 仅适合查看和表格处理。
          </p>
        </div>
        <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-xs text-[#727a74]">
          JSON · 格式版本 1
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#dce5dd] bg-[#f5f8f5] p-4">
          <h3 className="text-sm font-semibold text-[#2f4c3d]">
            导出完整备份
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#66746b]">
            将全部 {records.length} 条记录导出为 JSON。文件会保存到浏览器下载位置，不会上传。
          </p>
          <button
            type="button"
            onClick={() => void exportBackup()}
            disabled={
              isLoading || Boolean(storageError) || isExporting || isRestoring
            }
            aria-busy={isExporting}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#215c46] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#194b39] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {isExporting
              ? "正在读取最新数据…"
              : `导出完整备份（${records.length} 条）`}
          </button>

          {exportFeedback ? (
            <p
              role={exportFeedback.tone === "error" ? "alert" : "status"}
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${feedbackClass(exportFeedback.tone)}`}
            >
              {exportFeedback.message}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-[#e2ded6] bg-[#faf9f5] p-4">
          <h3 className="text-sm font-semibold text-[#4a4239]">
            从备份合并恢复
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#776e64]">
            仅新增数据库中不存在的 ID，不覆盖现有记录，也不会清空数据。
          </p>
          <label
            htmlFor="backup-file-input"
            className={`mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-[#c9c5bb] bg-white px-3 py-2.5 text-sm font-medium text-[#4f4a43] hover:bg-[#f3f1eb] sm:w-auto ${
              isRestoring || isExporting
                ? "pointer-events-none opacity-55"
                : ""
            }`}
          >
            选择 JSON 备份文件
          </label>
          <input
            id="backup-file-input"
            type="file"
            accept=".json,application/json"
            disabled={isRestoring || isExporting}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";

              if (file) {
                void handleBackupFile(file);
              }
            }}
            className="sr-only"
          />

          {restoreFeedback ? (
            <p
              role={restoreFeedback.tone === "error" ? "alert" : "status"}
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${feedbackClass(restoreFeedback.tone)}`}
            >
              {restoreFeedback.message}
            </p>
          ) : null}
        </div>
      </div>

      {pendingRestore ? (
        <div className="mt-4 rounded-xl border border-[#d8d4ca] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#3f4b43]">
                确认合并恢复
              </h3>
              <p className="mt-1 break-all text-xs text-[#7f8781]">
                文件：{pendingRestore.fileName}
              </p>
            </div>
            <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-xs text-[#727a74]">
              {pendingRestore.backup.recordCount} 条记录
            </span>
          </div>

          <dl className="mt-3 grid gap-2 rounded-lg bg-[#f7f6f1] p-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-[#858d87]">备份导出时间</dt>
              <dd className="mt-1 text-[#3f4b43]">
                {exportedAtFormatter.format(
                  new Date(pendingRestore.backup.exportedAt),
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[#858d87]">可新增记录</dt>
              <dd className="mt-1 font-semibold text-[#215c46]">
                {pendingRestore.preview.newRecordCount} 条
              </dd>
            </div>
            <div>
              <dt className="text-[#858d87]">相同 ID 跳过</dt>
              <dd className="mt-1 font-semibold text-amber-800">
                {pendingRestore.preview.duplicateIdCount} 条
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-5 text-[#776e64]">
            合并策略：现有记录保持不变；相同 ID 一律跳过，即使内容不同也不会覆盖。确认前不会写入 IndexedDB。
          </p>

          {pendingRestore.preview.newRecordCount === 0 ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              该备份中的记录 ID 都已存在，没有可新增的记录。
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setPendingRestore(null);
                setRestoreFeedback(null);
              }}
              disabled={isRestoring}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#d8dad3] bg-white px-4 py-2.5 text-sm font-medium text-[#4f5a52] hover:bg-[#f7f7f3] disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void confirmRestore()}
              disabled={
                isRestoring ||
                isExporting ||
                pendingRestore.preview.newRecordCount === 0
              }
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#215c46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#194b39] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isRestoring
                ? "正在合并…"
                : `确认合并 ${pendingRestore.preview.newRecordCount} 条`}
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
        备份文件包含完整经营数据。下载后会脱离 IndexedDB 的本地存储保护，请保存到安全位置并妥善保管。
      </p>
    </section>
  );
}
