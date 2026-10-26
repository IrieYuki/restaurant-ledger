# 餐厅账本

一个面向小型餐厅日常记账的轻量 Web 应用，重点是为手机和电脑提供简单、低成本的进账与成本记录方式。当前版本是纯前端应用，通过 Next.js 静态导出构建，并部署在 Cloudflare Workers 的 `workers.dev` 域名上。

线上地址：[https://restaurant-ledger.rujiangyuxia.workers.dev](https://restaurant-ledger.rujiangyuxia.workers.dev)

> 当前版本没有账号登录、云端备份或多设备同步。账目数据只保存在当前浏览器中，请勿把不同设备上的账本理解为同一份数据。

## 当前功能

以下清单按当前代码实现整理：

- **记录进账**：支持“普通进账”和“会员充值”两类收入。
- **记录成本**：支持“备菜成本”和“其他成本”两类支出。
- **金额表达式**：金额输入支持加、减、乘、除、括号和运算优先级，例如 `100+20*2`、`(80+20)*2`；也提供 `+`、`-`、`×`、`÷` 快捷输入按钮。结果按人民币保留两位小数，单笔金额必须大于 0 且不超过 ¥1,000,000。
- **账目管理**：可查看最近记录，编辑或删除已有记录；完整历史支持按日期、类别和收支方向筛选。
- **经营统计**：首页展示今日分类汇总和近 7 天概览；独立报表页支持今天、最近 7 天、最近 30 天和自定义日期范围，并提供总收款、总成本、收支差额、分类统计、每日趋势、按日汇总、按周汇总和按月汇总。
- **CSV 导出**：历史记录页可导出全部记录或当前筛选结果，字段包括记录时间、类别、收支方向、金额和备注。CSV 适合查看与表格处理，不支持导入。
- **JSON 完整备份与恢复**：可将全部记录导出为带格式版本号的 JSON 文件；恢复时按记录 ID 合并，只新增本地不存在的记录，相同 ID 会跳过，不覆盖现有记录，也不会清空现有数据。
- **响应式界面**：使用 Tailwind CSS 断点适配手机和桌面；手机端表单采用底部弹层并考虑安全区，统计卡片和操作按钮会重排，宽报表可横向滚动。当前检查包含源码与构建验证，尚未进行覆盖真实机型的自动化视觉测试。

## 技术栈

- Next.js `16.4.3`（App Router，`output: "export"` 静态导出）
- React `19.3.0`
- TypeScript `5`
- Tailwind CSS `4` / `@tailwindcss/turbopack`
- 浏览器 IndexedDB
- Node.js 内置测试运行器（`node:test`）

## 本地开发环境要求

- Node.js `>= 20.9.0`（Next.js `16.4.3` 的最低要求）
- npm
- 支持 IndexedDB 和现代 JavaScript 的浏览器

建议使用项目中的 `package-lock.json` 安装依赖，以保持版本一致。

## 本地启动

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。经营报表位于 [http://localhost:3000/reports](http://localhost:3000/reports)。

常用命令：

```bash
npm run lint   # ESLint 检查
npm test       # TypeScript 测试编译并运行 34 项单元测试
npm run build  # 生产构建并生成静态导出
```

## 构建与静态导出

`next.config.ts` 已设置：

```ts
output: "export"
```

运行 `npm run build` 后，Next.js 会将可直接托管的静态文件生成到 `out/` 目录。`out/`、`.next/` 和测试产物都是可重新生成的构建输出，默认不纳入 Git；不需要把真实构建目录提交到仓库。

本次整理环境的验证结果：

- `npm run lint`：通过。
- `npm test`：34 项测试全部通过。
- `npm run build`：默认 Turbopack 模式在构建 Tailwind CSS loader 时因执行环境禁止子进程绑定端口而失败，错误为 `Operation not permitted (os error 1)`。
- `npx next build --webpack`：同一份源码成功编译、通过 TypeScript 检查，并静态生成 `/`、`/reports` 和 `/_not-found`。

该 Turbopack 失败是否能在普通本地终端复现尚未确认，详见 [已知问题](docs/KNOWN_ISSUES.md#3-构建环境问题turbopack-子进程权限)。排查时不要把临时构建故障误判为线上功能故障。

## 部署方式

当前线上地址：

[https://restaurant-ledger.rujiangyuxia.workers.dev](https://restaurant-ledger.rujiangyuxia.workers.dev)

项目通过 Next.js 静态导出生成 `out/`，当前线上版本部署在 Cloudflare Workers 的 `workers.dev` 子域名。仓库中目前没有 `wrangler` 配置、GitHub Actions 或其它可复现的 Cloudflare 部署脚本，因此无法仅凭仓库完整还原线上发布流程；现有部署可能依赖控制台或仓库外的配置。

重新发布时应继续使用当前已经验证的 Cloudflare 发布流程，并上传构建后的 `out/` 静态资源。本 README 不提供未经项目验证的 `wrangler` 命令，也不在本次整理中修改线上部署配置。

## 数据存储与隐私

- 账目数据保存在浏览器 **IndexedDB** 的 `restaurant-ledger` 数据库中，object store 名为 `records`。当前代码没有使用 `localStorage`、后端数据库或云同步服务。
- IndexedDB 与站点来源（协议、域名和端口）及浏览器配置绑定。同一台设备上的不同浏览器通常各自拥有独立数据；不同设备之间不会自动共享。
- 更换设备或浏览器、使用不同的浏览器用户配置、清理网站数据、卸载浏览器，或浏览器回收/阻止本地存储，都可能导致账目无法再访问。请定期手动导出 JSON 完整备份。
- 账目只保存在本机浏览器存储中，不等同于加密存储。应仅在可信设备上使用，并保护设备的系统账户。
- CSV 和 JSON 文件由浏览器直接下载到本地，不会由应用上传。它们包含真实经营数据，下载后不再受站点 IndexedDB 的隔离保护，应保存在安全位置并及时清理不需要的副本。
- 当前没有云端自动备份、账号登录、跨设备同步或多人协作能力。手动导出不是云端备份。
- 仓库中不应提交 `.env` 文件、数据库、真实账本导出、备份文件或其它密钥与个人数据；相关模式已加入 `.gitignore`，但提交前仍需人工检查。

## 已知问题

### 1. 部分中国大陆网络无法访问线上网站

已确认线上地址是 [https://restaurant-ledger.rujiangyuxia.workers.dev](https://restaurant-ledger.rujiangyuxia.workers.dev)。在部分中国大陆手机网络和家庭 Wi-Fi 中曾无法打开；部分测试需要开启 VPN 才能访问。GreatFire 对该域名的测试结果曾显示无法访问，但该结果不代表所有网络环境都必然失败。

已有排查包括 TLS 握手阶段的 `Connection reset by peer`、指定 Cloudflare IP 后仍出现握手重置、强制 HTTP/1.1 或 TLS 1.2 时出现 TCP 超时、不同 DNS 返回不同地址，以及同一设备在关闭 VPN 后可访问 `https://www.cloudflare.com/`。这些测试来自不同时刻，尚不能确定具体原因，也不能断言是 DNS、TLS、Cloudflare 配置或某一方拦截。

当前建议是继续验证不同运营商网络、评估中国大陆用户可用的静态托管方案、域名与备案要求、成本和维护成本。迁移前保留现有线上版本，暂不通过修改业务代码“修复”该连通性问题。

### 2. 数据缺少多设备同步能力

当前账目只保存在当前浏览器或设备的 IndexedDB 中。更换设备、浏览器或浏览器用户配置后看不到原账本；清理网站数据也可能造成无法恢复的数据丢失。CSV 是人工导出文件，不支持导入；JSON 是完整备份，可手动导出并在另一浏览器中合并恢复，但不会自动同步，也不是云端备份。当前没有账号登录、云端备份或任何多设备同步能力。

更完整的现象、影响和建议见 [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)。

## 后续开发计划

以下为方向性计划，不代表已有功能：

- 在明确隐私、数据归属和运维成本后，评估账号体系与多设备云同步。
- 继续评估对中国大陆用户更可靠的静态托管、域名和备案方案，迁移前做好验证与回滚。
- 增加备份提醒、恢复演练和更清晰的导出说明，降低本地数据丢失风险。
- 增加真实手机/桌面浏览器测试与部署流程自动化，减少人工发布和响应式回归风险。

## 项目结构

```text
src/app/            页面、首页账本界面、历史记录、备份与报表界面
src/lib/            账目、IndexedDB、CSV、JSON 备份和统计逻辑
tests/              金额解析、备份、CSV、筛选、报表和 IndexedDB 读取测试
docs/               已知问题与排查记录
```
