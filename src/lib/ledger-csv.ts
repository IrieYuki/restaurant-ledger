import { CATEGORY_DETAILS } from "./ledger";
import type { LedgerRecord } from "./ledger";

export type CsvExportScope = "all" | "filtered";

const CSV_BOM = "\uFEFF";
const CSV_HEADERS = [
  "序号",
  "记录时间",
  "类别",
  "收支方向",
  "金额",
  "备注",
];

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatCsvDateTime(timestamp: number): string {
  const date = new Date(timestamp);

  return [
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`,
  ].join(" ");
}

export function sanitizeCsvText(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function buildLedgerCsv(records: LedgerRecord[]): string {
  const rows = records.map((record, index) => {
    const direction = CATEGORY_DETAILS[record.category].direction;
    const cells = [
      String(index + 1),
      formatCsvDateTime(record.createdAt),
      sanitizeCsvText(record.category),
      direction === "income" ? "进账" : "成本",
      record.amount.toFixed(2),
      sanitizeCsvText(record.note),
    ];

    return cells.map(escapeCsvCell).join(",");
  });

  return `${CSV_BOM}${[CSV_HEADERS.join(","), ...rows].join("\r\n")}\r\n`;
}

export function createCsvFilename(
  scope: CsvExportScope,
  exportedAt: number,
): string {
  const date = new Date(exportedAt);
  const datePart = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
  const timePart = `${padNumber(date.getHours())}${padNumber(date.getMinutes())}${padNumber(date.getSeconds())}`;
  const scopeLabel = scope === "all" ? "全部记录" : "筛选结果";

  return `餐厅账本_${scopeLabel}_${datePart}_${timePart}.csv`;
}

export function downloadCsvFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
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
