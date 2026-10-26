import assert from "node:assert/strict";
import { test } from "node:test";
import type { LedgerRecord } from "../src/lib/ledger";
import { buildLedgerCsv, sanitizeCsvText } from "../src/lib/ledger-csv";

function atLocal(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const records: LedgerRecord[] = [
  {
    id: "csv-1",
    category: "普通进账",
    amount: 10.5,
    createdAt: atLocal(2026, 10, 25, 9, 5),
    note: '午市, "招牌菜"\n第二行',
  },
  {
    id: "csv-2",
    category: "备菜成本",
    amount: 20,
    createdAt: atLocal(2026, 10, 25, 10, 6),
    note: "=SUM(1,2)",
  },
];

test("CSV export includes UTF-8 BOM, headers, direction, and two-decimal amounts", () => {
  const csv = buildLedgerCsv(records);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.startsWith("\uFEFF序号,记录时间,类别,收支方向,金额,备注\r\n"));
  assert.ok(csv.includes("普通进账,进账,10.50"));
  assert.ok(csv.includes("备菜成本,成本,20.00"));
  assert.ok(!csv.includes("'10.50"));
  assert.ok(!csv.includes("'20.00"));
});

test("CSV export preserves Chinese and escapes commas, quotes, and newlines", () => {
  const csv = buildLedgerCsv(records);

  assert.ok(csv.includes("午市"));
  assert.ok(csv.includes('"午市, ""招牌菜""\n第二行"'));
});

test("CSV text cells beginning with spreadsheet formula characters are neutralized", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "  =1+1"]) {
    assert.equal(sanitizeCsvText(value), `'${value}`);
  }

  assert.equal(sanitizeCsvText("正常备注"), "正常备注");
  assert.ok(buildLedgerCsv(records).includes(`"\'=SUM(1,2)"`));
});
