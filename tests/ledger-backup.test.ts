import assert from "node:assert/strict";
import { test } from "node:test";
import type { LedgerRecord } from "../src/lib/ledger";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildLedgerBackup,
  parseLedgerBackup,
  previewBackupMerge,
  serializeLedgerBackup,
} from "../src/lib/ledger-backup";

interface MutableBackup {
  format: string;
  version: number;
  exportedAt: string;
  recordCount: number;
  records: Array<Record<string, unknown>>;
}

function atLocal(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const exportedAt = atLocal(2026, 10, 25, 12);
const records: LedgerRecord[] = [
  {
    id: "backup-1",
    category: "普通进账",
    amount: 100.1,
    createdAt: atLocal(2026, 10, 25, 9),
    note: "恢复测试",
  },
  {
    id: "backup-2",
    category: "备菜成本",
    amount: 20.05,
    createdAt: atLocal(2026, 10, 25, 10),
    note: "含,逗号",
  },
];

function parseMutatedBackup(mutator: (backup: MutableBackup) => void) {
  const backup = JSON.parse(
    JSON.stringify(buildLedgerBackup(records, exportedAt)),
  ) as MutableBackup;
  mutator(backup);
  return parseLedgerBackup(JSON.stringify(backup));
}

test("valid backups serialize and parse with version and record count", () => {
  const content = serializeLedgerBackup(records, exportedAt);
  const serialized = JSON.parse(content) as MutableBackup;

  assert.equal(serialized.format, BACKUP_FORMAT);
  assert.equal(serialized.version, BACKUP_VERSION);
  assert.equal(serialized.exportedAt, new Date(exportedAt).toISOString());
  assert.equal(serialized.recordCount, 2);
  assert.deepEqual(serialized.records, records);

  const parsed = parseLedgerBackup(content);
  if (!parsed.ok) assert.fail(parsed.error);
  assert.deepEqual(parsed.backup.records, records);
  assert.equal(parsed.backup.recordCount, 2);
});

test("malformed JSON and unsupported backup versions are rejected", () => {
  const malformed = parseLedgerBackup("{broken json");
  const unsupported = parseMutatedBackup((backup) => {
    backup.version = BACKUP_VERSION + 1;
  });

  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.match(malformed.error, /无法解析/);
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.match(unsupported.error, /不支持的备份版本/);
});

test("record count mismatches and duplicate IDs are rejected", () => {
  const countMismatch = parseMutatedBackup((backup) => {
    backup.recordCount = 3;
  });
  const duplicateId = parseMutatedBackup((backup) => {
    backup.records[1].id = backup.records[0].id;
  });

  assert.equal(countMismatch.ok, false);
  if (!countMismatch.ok) assert.match(countMismatch.error, /记录数量与实际/);
  assert.equal(duplicateId.ok, false);
  if (!duplicateId.ok) assert.match(duplicateId.error, /重复记录 ID/);
});

test("invalid IDs, categories, amounts, and dates are rejected", () => {
  const invalidId = parseMutatedBackup((backup) => {
    backup.records[0].id = "   ";
  });
  const invalidCategory = parseMutatedBackup((backup) => {
    backup.records[0].category = "未知类别";
  });
  const invalidAmount = parseMutatedBackup((backup) => {
    backup.records[0].amount = -1;
  });
  const invalidDate = parseMutatedBackup((backup) => {
    backup.records[0].createdAt = 0;
  });

  assert.equal(invalidId.ok, false);
  if (!invalidId.ok) assert.match(invalidId.error, /ID 无效/);
  assert.equal(invalidCategory.ok, false);
  if (!invalidCategory.ok) assert.match(invalidCategory.error, /类别无效/);
  assert.equal(invalidAmount.ok, false);
  if (!invalidAmount.ok) assert.match(invalidAmount.error, /金额必须/);
  assert.equal(invalidDate.ok, false);
  if (!invalidDate.ok) assert.match(invalidDate.error, /创建时间无效/);
});

test("merge preview separates new records from duplicate IDs", () => {
  const preview = previewBackupMerge(records, [records[0]]);

  assert.equal(preview.newRecordCount, 1);
  assert.equal(preview.duplicateIdCount, 1);
  assert.deepEqual(preview.existingIds, ["backup-1"]);
});

test("merge preview supports empty backups and does not mutate inputs", () => {
  const originalRecords = structuredClone(records);
  const originalExisting = structuredClone([records[0]]);
  const emptyPreview = previewBackupMerge([], records);
  const preview = previewBackupMerge(records, [records[0]]);

  assert.equal(emptyPreview.newRecordCount, 0);
  assert.equal(emptyPreview.duplicateIdCount, 0);
  assert.equal(preview.newRecordCount, 1);
  assert.deepEqual(records, originalRecords);
  assert.deepEqual([records[0]], originalExisting);
});
