import type { Metadata } from "next";
import LedgerDashboard from "./ledger-dashboard";

export const metadata: Metadata = {
  title: "餐厅账本",
  description: "仅保存在当前浏览器中的餐厅日常进账与成本账本。",
};

export default function Home() {
  return <LedgerDashboard />;
}
