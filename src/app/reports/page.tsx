import type { Metadata } from "next";
import LedgerReport from "../ledger-report";

export const metadata: Metadata = {
  title: "经营报表 | 餐厅账本",
  description: "根据当前浏览器中保存的账目生成的经营报表。",
};

export default function ReportsPage() {
  return <LedgerReport />;
}
