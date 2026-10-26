import {
  MAX_NOTE_LENGTH,
  MAX_RECORD_AMOUNT,
  isLedgerCategory,
} from "./ledger";
import type { LedgerRecord } from "./ledger";

export const BACKUP_FORMAT = "restaurant-ledger-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024;

export interface LedgerBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  recordCount: number;
  records: LedgerRecord[];
}

export type BackupParseResult =
  | { ok: true; backup: LedgerBackup }
  | { ok: false; error: string };

export interface BackupPreview {
  records: LedgerRecord[];
  newRecordCount: number;
  duplicateIdCount: number;
  existingIds: string[];
}

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidRecordId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= 200 &&
    id.trim() === id &&
    !/[\u0000-\u001f\u007f]/.test(id)
  );
}

function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    Number.isFinite(new Date(value).getTime())
  );
}

function validateRecord(
  value: unknown,
  index: number,
): { ok: true; record: LedgerRecord } | { ok: false; error: string } {
  const label = `第 ${index + 1} 条记录`;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `${label}不是有效对象。` };
  }

  const candidate = value as Partial<LedgerRecord>;

  if (
    typeof candidate.id !== "string" ||
    !isValidRecordId(candidate.id)
  ) {
    return { ok: false, error: `${label}的 ID 无效。` };
  }

  if (!isLedgerCategory(candidate.category)) {
    return { ok: false, error: `${label}的类别无效。` };
  }

  if (
    typeof candidate.amount !== "number" ||
    !Number.isFinite(candidate.amount) ||
    candidate.amount <= 0
  ) {
    return { ok: false, error: `${label}的金额必须是大于 0 的有效数值。` };
  }

  if (candidate.amount > MAX_RECORD_AMOUNT) {
    return {
      ok: false,
      error: `${label}的金额超过单笔上限 ¥${MAX_RECORD_AMOUNT.toLocaleString("zh-CN")}。`,
    };
  }

  if (Math.abs(candidate.amount * 100 - Math.round(candidate.amount * 100)) > 1e-6) {
    return { ok: false, error: `${label}的金额最多保留两位小数。` };
  }

  if (!isValidTimestamp(candidate.createdAt)) {
    return { ok: false, error: `${label}的创建时间无效。` };
  }

  if (typeof candidate.note !== "string") {
    return { ok: false, error: `${label}的备注必须是字符串。` };
  }

  if (candidate.note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `${label}的备注超过 ${MAX_NOTE_LENGTH} 个字符限制。`,
    };
  }

  return {
    ok: true,
    record: {
      id: candidate.id,
      category: candidate.category,
      amount: candidate.amount,
      createdAt: candidate.createdAt,
      note: candidate.note,
    },
  };
}

export function buildLedgerBackup(
  records: LedgerRecord[],
  exportedAt = Date.now(),
): LedgerBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    recordCount: records.length,
    records: records.map((record) => ({
      id: record.id,
      category: record.category,
      amount: record.amount,
      createdAt: record.createdAt,
      note: record.note,
    })),
  };
}

export function serializeLedgerBackup(
  records: LedgerRecord[],
  exportedAt = Date.now(),
): string {
  return JSON.stringify(buildLedgerBackup(records, exportedAt), null, 2);
}

export function parseLedgerBackup(text: string): BackupParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 文件格式损坏，无法解析。" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "备份文件顶层必须是 JSON 对象。" };
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.format !== BACKUP_FORMAT) {
    return { ok: false, error: "这不是餐厅账本完整备份文件。" };
  }

  if (typeof candidate.version !== "number" || !Number.isInteger(candidate.version)) {
    return { ok: false, error: "备份文件缺少有效的格式版本号。" };
  }

  if (candidate.version !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `不支持的备份版本 ${candidate.version}，当前仅支持版本 ${BACKUP_VERSION}。`,
    };
  }

  if (
    typeof candidate.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.exportedAt))
  ) {
    return { ok: false, error: "备份文件的导出时间无效。" };
  }

  if (!Array.isArray(candidate.records)) {
    return { ok: false, error: "备份文件缺少 records 记录数组。" };
  }

  if (
    typeof candidate.recordCount !== "number" ||
    !Number.isInteger(candidate.recordCount) ||
    candidate.recordCount < 0
  ) {
    return { ok: false, error: "备份文件的记录数量无效。" };
  }

  if (candidate.recordCount !== candidate.records.length) {
    return { ok: false, error: "备份文件的记录数量与实际 records 不一致。" };
  }

  const records: LedgerRecord[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < candidate.records.length; index += 1) {
    const result = validateRecord(candidate.records[index], index);

    if (!result.ok) {
      return result;
    }

    if (ids.has(result.record.id)) {
      return {
        ok: false,
        error: `备份中存在重复记录 ID：${result.record.id}`,
      };
    }

    ids.add(result.record.id);
    records.push(result.record);
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: candidate.exportedAt,
      recordCount: candidate.recordCount,
      records,
    },
  };
}

export function previewBackupMerge(
  backupRecords: LedgerRecord[],
  existingRecords: LedgerRecord[],
): BackupPreview {
  const existingIds = new Set(existingRecords.map((record) => record.id));
  const duplicateIds = backupRecords
    .filter((record) => existingIds.has(record.id))
    .map((record) => record.id);

  return {
    records: backupRecords,
    newRecordCount: backupRecords.length - duplicateIds.length,
    duplicateIdCount: duplicateIds.length,
    existingIds: duplicateIds,
  };
}

export function createBackupFilename(exportedAt: number): string {
  const date = new Date(exportedAt);
  const datePart = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
  const timePart = `${padNumber(date.getHours())}${padNumber(date.getMinutes())}${padNumber(date.getSeconds())}`;
  return `餐厅账本_完整备份_${datePart}_${timePart}.json`;
}

export function downloadBackupJson(content: string, filename: string): void {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
