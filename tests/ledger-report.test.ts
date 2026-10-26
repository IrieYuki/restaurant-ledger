import assert from "node:assert/strict";
import { test } from "node:test";
import type { LedgerCategory, LedgerRecord } from "../src/lib/ledger";
import {
  buildDailyLedgerSummaries,
  buildMonthlyLedgerSummaries,
  buildWeeklyLedgerSummaries,
  summarizeLedgerRecords,
} from "../src/lib/ledger-report";

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
  note = "",
): LedgerRecord {
  return { id, category, amount, createdAt, note };
}

const records = [
  makeRecord("ordinary", "普通进账", 100.1, atLocal(2026, 10, 25, 9), "普通进账"),
  makeRecord("member", "会员充值", 50.2, atLocal(2026, 10, 25, 10), "会员充值"),
  makeRecord("prep", "备菜成本", 30.05, atLocal(2026, 10, 25, 11), "备菜成本"),
  makeRecord("other", "其他成本", 20.05, atLocal(2026, 10, 25, 23, 59), "其他成本"),
];

test("category summaries keep categories separate and calculate totals in cents", () => {
  const summary = summarizeLedgerRecords(records);

  assert.equal(summary.categories.普通进账.amountCents, 10_010);
  assert.equal(summary.categories.会员充值.amountCents, 5_020);
  assert.equal(summary.categories.备菜成本.amountCents, 3_005);
  assert.equal(summary.categories.其他成本.amountCents, 2_005);
  assert.equal(summary.categories.普通进账.count, 1);
  assert.equal(summary.receiptsCents, 15_030);
  assert.equal(summary.costsCents, 5_010);
  assert.equal(summary.differenceCents, 10_020);
  assert.equal(summary.recordCount, 4);
});

test("category summaries avoid floating point drift", () => {
  const summary = summarizeLedgerRecords([
    makeRecord("a", "普通进账", 0.1, atLocal(2026, 10, 25)),
    makeRecord("b", "普通进账", 0.2, atLocal(2026, 10, 25)),
  ]);

  assert.equal(summary.receiptsCents, 30);
  assert.equal(summary.differenceCents, 30);
});

test("empty records produce zero-valued summaries", () => {
  const summary = summarizeLedgerRecords([]);

  assert.equal(summary.recordCount, 0);
  assert.equal(summary.receiptsCents, 0);
  assert.equal(summary.costsCents, 0);
  assert.equal(summary.differenceCents, 0);
  assert.equal(summary.categories.普通进账.count, 0);
});

test("daily summaries include empty days and records at the end of the day", () => {
  const days = buildDailyLedgerSummaries(
    records,
    atLocal(2026, 10, 19, 0),
    atLocal(2026, 10, 26, 0),
  );

  assert.equal(days.length, 7);
  assert.equal(days[0].dateKey, "2026-10-19");
  assert.equal(days[6].dateKey, "2026-10-25");
  assert.equal(days[6].receiptsCents, 15_030);
  assert.equal(days[6].costsCents, 5_010);
  assert.equal(days[6].differenceCents, 10_020);
});

test("weekly summaries group dates by Monday-to-Sunday calendar weeks", () => {
  const days = buildDailyLedgerSummaries(
    records,
    atLocal(2026, 10, 19, 0),
    atLocal(2026, 10, 26, 0),
  );
  const weeks = buildWeeklyLedgerSummaries(days);

  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].label, "10/19–10/25");
  assert.equal(weeks[0].receiptsCents, 15_030);
  assert.equal(weeks[0].costsCents, 5_010);
});

test("monthly summaries split records across local calendar months", () => {
  const crossMonthRecords = [
    makeRecord("september", "普通进账", 40, atLocal(2026, 9, 30)),
    ...records,
  ];
  const days = buildDailyLedgerSummaries(
    crossMonthRecords,
    atLocal(2026, 9, 1, 0),
    atLocal(2026, 11, 1, 0),
  );
  const months = buildMonthlyLedgerSummaries(days);

  assert.deepEqual(
    months.map((month) => month.label),
    ["2026年9月", "2026年10月"],
  );
  assert.equal(months[0].receiptsCents, 4_000);
  assert.equal(months[1].receiptsCents, 15_030);
  assert.equal(months[1].costsCents, 5_010);
});
