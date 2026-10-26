import assert from "node:assert/strict";
import { test } from "node:test";
import type { LedgerCategory, LedgerRecord } from "../src/lib/ledger";
import {
  filterHistoryRecords,
  getHistoryDateRange,
  selectHistoryExportRecords,
} from "../src/lib/ledger-history";

function atLocal(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function makeRecord(
  id: string,
  category: LedgerCategory,
  amount: number,
  createdAt: number,
): LedgerRecord {
  return { id, category, amount, createdAt, note: id };
}

const now = atLocal(2026, 10, 25, 12);
const records = [
  makeRecord("oct18", "其他成本", 30, atLocal(2026, 10, 18, 23, 59)),
  makeRecord("oct19", "会员充值", 50, atLocal(2026, 10, 19, 0, 0)),
  makeRecord("oct25", "普通进账", 100, atLocal(2026, 10, 25, 23, 59)),
  makeRecord("oct26", "备菜成本", 20, atLocal(2026, 10, 26, 0, 0)),
];

test("today range starts at local midnight and excludes tomorrow", () => {
  const range = getHistoryDateRange(
    { datePreset: "today", customStart: "", customEnd: "" },
    now,
  );

  if (!range.ok) assert.fail(range.error);
  assert.equal(range.start, atLocal(2026, 10, 25, 0));
  assert.equal(range.end, atLocal(2026, 10, 26, 0));
});

test("last 7 and last 30 days include today and the preceding calendar days", () => {
  const last7 = getHistoryDateRange(
    { datePreset: "last7", customStart: "", customEnd: "" },
    now,
  );
  const last30 = getHistoryDateRange(
    { datePreset: "last30", customStart: "", customEnd: "" },
    now,
  );

  if (!last7.ok) assert.fail(last7.error);
  if (!last30.ok) assert.fail(last30.error);
  assert.equal(last7.start, atLocal(2026, 10, 19, 0));
  assert.equal(last7.end, atLocal(2026, 10, 26, 0));
  assert.equal(last30.start, atLocal(2026, 9, 26, 0));
  assert.equal(last30.end, atLocal(2026, 10, 26, 0));
});

test("custom ranges include the entire end date", () => {
  const range = getHistoryDateRange(
    {
      datePreset: "custom",
      customStart: "2026-10-19",
      customEnd: "2026-10-19",
    },
    now,
  );

  if (!range.ok) assert.fail(range.error);
  assert.equal(range.start, atLocal(2026, 10, 19, 0));
  assert.equal(range.end, atLocal(2026, 10, 20, 0));
});

test("invalid custom date ranges are rejected", () => {
  const reversed = getHistoryDateRange(
    {
      datePreset: "custom",
      customStart: "2026-10-25",
      customEnd: "2026-10-19",
    },
    now,
  );
  const missing = getHistoryDateRange(
    { datePreset: "custom", customStart: "", customEnd: "" },
    now,
  );

  assert.equal(reversed.ok, false);
  if (!reversed.ok) assert.match(reversed.error, /开始日期不能晚于结束日期/);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /请选择开始日期和结束日期/);
});

test("combined filters return matching records in descending time order", () => {
  const result = filterHistoryRecords(
    records,
    {
      datePreset: "last7",
      category: "all",
      direction: "all",
      customStart: "",
      customEnd: "",
    },
    now,
  );

  assert.equal(result.error, "");
  assert.deepEqual(
    result.records.map((record) => record.id),
    ["oct25", "oct19"],
  );
});

test("category, direction, and date filters work together", () => {
  const result = filterHistoryRecords(
    records,
    {
      datePreset: "last7",
      category: "会员充值",
      direction: "income",
      customStart: "",
      customEnd: "",
    },
    now,
  );

  assert.deepEqual(
    result.records.map((record) => record.id),
    ["oct19"],
  );
});

test("no-match filters return a clear empty result", () => {
  const result = filterHistoryRecords(
    records,
    {
      datePreset: "last7",
      category: "会员充值",
      direction: "cost",
      customStart: "",
      customEnd: "",
    },
    now,
  );

  assert.equal(result.error, "");
  assert.deepEqual(result.records, []);
});

test("export-all uses the latest record set in descending time order", () => {
  const latestRecords = [
    makeRecord("latest-new", "普通进账", 80, atLocal(2026, 10, 25, 18)),
    makeRecord("latest-old", "其他成本", 10, atLocal(2026, 10, 24, 9)),
  ];
  const result = selectHistoryExportRecords(
    "all",
    latestRecords,
    {
      datePreset: "last7",
      category: "all",
      direction: "all",
      customStart: "",
      customEnd: "",
    },
    now,
  );

  assert.equal(result.error, "");
  assert.deepEqual(
    result.records.map((record) => record.id),
    ["latest-new", "latest-old"],
  );
});

test("filtered export reapplies current filters to latest records and refreshed time", () => {
  const latestRecords = [
    makeRecord("new-member", "会员充值", 75, atLocal(2026, 10, 26, 8, 30)),
    makeRecord("old-member", "会员充值", 50, atLocal(2026, 10, 25, 18)),
  ];
  const refreshedNow = atLocal(2026, 10, 26, 12);
  const result = selectHistoryExportRecords(
    "filtered",
    latestRecords,
    {
      datePreset: "today",
      category: "会员充值",
      direction: "income",
      customStart: "",
      customEnd: "",
    },
    refreshedNow,
  );

  assert.equal(result.error, "");
  assert.deepEqual(result.records.map((record) => record.id), ["new-member"]);
});
