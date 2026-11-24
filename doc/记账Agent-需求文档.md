# 「一句话记账」AI Agent 应用 — 需求文档（PRD v2.0）

> 本文档以**当前实际实现**为准（v1.0 规划稿中的 Prisma / Neon / Whisper / shadcn / Recharts / Auth.js 等均未采用）。
> 项目代号：`voice-ledger`  |  版本：v2.0（多用户 · 多账本 · AI 对话记账）  |  日期：2026-11-23

---

## 0. 一句话定义

通过**自然语言对话**完成记账、查账、统计的 AI 应用。用户打字或说话，AI 抽取结构化信息落库，并以**结构化卡片**回执；无需填表。

**核心体验标准：** 用户说「今天午饭 35，微信付的」→ 3 秒内出现一张记账卡片（分类图标 + 餐饮 + `-¥35.00` + 微信 · 今天 + 状态角标），数据已入库。

---

## 1. 范围与状态

### 1.1 已实现（P0）

| 功能 | 说明 |
| --- | --- |
| 文字 / 语音记账 | 自然语言 → AI 抽取金额/分类/支付方式/日期 → 落库；语音用浏览器 `webkitSpeechRecognition` |
| 智能查账 / 统计 | 「最近5笔」「本月花了多少」→ 工具查库 → 账单列表卡片 / 统计卡片 |
| 结构化卡片回执 | 记账卡、查账卡、统计卡、AI 文字卡（统一玻璃拟态视觉） |
| 会话历史 | 对话自动落库，历史抽屉可切换/新建/删除会话 |
| 多用户 + 登录 | Supabase Auth，邮箱密码登录/注册，服务端 Cookie 会话 |
| 多账本 + 共享 | 账本切换器、成员邀请 `invite_ledger_member()`、RLS 隔离 |
| 预算与超支提醒 | `budgets` / `notifications` / `budget_usage()` |
| 个人资料 | 昵称写入 `profiles` |
| 统计快览列表 | 首页消息区顶部常驻「今日支出 / 本月支出 / 本月收入」金额列表 |
| 撤销（即时纠错） | 本次会话内新产生的记账卡片带「撤销」按钮，刷新或切会话后消失 |

### 1.2 表设计就绪、UI 未开放

`exports`、`receipts`、`categories`、`payment_methods`、`tags`、`recurring_rules`、`transaction_revisions` 等表、索引、RLS 与聚合函数已在迁移脚本中完备，接口/界面可增量开发，无需再改表。

---

## 2. 用户故事

| # | 故事 | 验收要点 |
| --- | --- | --- |
| U1 | 「今天午饭35，微信付的」 | 入库 35/支出/餐饮/微信/今天；出现记账卡片 |
| U2 | 「昨天打车去机场 58 刷的银行卡」 | 日期=昨天、分类=交通、支付=银行卡 |
| U3 | 「这个月餐饮花了多少」 | 统计卡片显示总额 + 分类分解 |
| U4 | 「最近 5 笔账单」 | 账单列表卡片，含日期/分类/金额 |
| U5 | 「刚才那笔错了，改成 45」 | 先 list 确认再 update，卡片状态变「已修改」 |
| U6 | 「买了个东西 100 块」 | 分类「其他」，回复中说明 |
| U7 | 语音「地铁 4 块」 | 转文字后走 U1 流程 |
| U8 | 记完下一笔发现上一笔有误 | 上一笔卡片的「撤销」按钮仍在，可一键删除 |

---

## 3. AI 交互设计

### 3.1 架构

```
用户输入(文字/语音)
  → useChat (AI SDK v7)  →  POST /api/chat
  → DeepSeek deepseek-chat (streamText + tool calling)
  → 服务端执行 tools (lib/tools.ts)  →  Supabase Postgres (RLS)
  → 工具结果回流 LLM  →  流式返回 UIMessage parts
  → 前端渲染：文字卡片 / 记账卡 / 账单列表卡 / 统计卡
```

**原则：LLM 只产出参数；所有数据读写在服务端工具函数中完成；账本 ID 由服务端从请求上下文注入，模型不可指定，杜绝跨账本写入。**

### 3.2 系统提示词要点（`app/api/chat/route.ts`）

- 记账必须调 `add_transaction`，禁止只口头确认；
- 金额正数、日期按注入的 `{{currentTime}}`（Asia/Shanghai）换算，分类/支付走固定枚举；
- 查询必须调 `list_transactions` / `query_stats`，严禁编造数字；
- **文字只给简短结论**（如「已记好」「本月餐饮最多」），金额明细由卡片展示，避免文字与卡片重复；
- 无关输入礼貌拉回记账主题。

### 3.3 工具（`lib/tools.ts`）

| 工具 | 作用 | 返回 |
| --- | --- | --- |
| `add_transaction` | 记一笔 | 完整记录（id/金额/分类/支付/日期/备注） |
| `list_transactions` | 查账单 | `{ count, transactions[] }` |
| `query_stats` | 汇总统计 | `{ total, count, byCategory[] }` |
| `update_transaction` | 改一笔 | 变更后的字段 |
| `delete_transaction` | 软删一笔 | `{ ok, id }` |

聚合下推数据库（`getStats` 用 `GROUP BY`），不在 JS 里累加；金额范围 `0 < amount < 1,000,000` 由 Zod schema 在服务端二次校验。

---

## 4. UI 设计

### 4.1 页面结构

底部 Tab：💬 记账 / 📋 账单 / 📊 统计；另有登录页、个人资料页、账本切换器。移动端优先（max-width 480px 居中）。

### 4.2 首页（记账）

自上而下：

1. **Header**：账本切换器、会话历史入口
2. **消息流**（滚动区）
   - 欢迎语（AI 文字卡片）
   - **统计快览列表**：今日支出 / 本月支出 / 本月收入，直接显示金额，点击发对应问句给 AI
   - 用户消息：右侧渐变气泡
   - AI 文字：带「小账房」标题栏的卡片
   - 工具结果：记账卡 / 账单列表卡 / 统计卡
   - 同一消息的连续 text part 合并渲染为一个气泡（避免分片导致短文本换行）
3. **输入区**（固定底部）：快捷 chips（`本月花了多少` / `最近5笔` / `今天支出`）、文本框、语音、发送

### 4.3 卡片规格

- **记账卡**：分类渐变图标 + 分类名 + 支付方式 · 相对日期 + 备注 + 带符号金额（支出玫红 `-¥`、收入绿 `+¥`）+ 状态角标（已入账/已修改）+ 撤销按钮（条件显示）
- **账单列表卡**：逐行图标 + 分类 + 金额 + 合计
- **统计卡**：总额大字 + 分类进度条排行
- **AI 文字卡**：`Sparkles` 图标 + 「小账房」标题栏 + 文字内容

### 4.4 撤销机制（v2.0 重点）

**定位**：撤销 = 当前操作上下文内的即时纠错，不是长期编辑入口，也不是编辑功能的替代品。

**规则：**

| 场景 | 是否显示撤销按钮 |
| --- | --- |
| 本次会话中新产生的记账 | ✅ 显示，直到会话结束 |
| 记了下一笔后发现上一笔有误 | ✅ 上一笔按钮仍在，可撤销 |
| 撤销成功后 | ❌ 该按钮立即本地隐藏 |
| 刷新页面 | ❌ 全部消失 |
| 切换到历史会话再切回 | ❌ 全部消失 |
| 从数据库恢复的历史消息 | ❌ 不显示 |

**实现**：Chat 组件以 `useRef(new Set(initialMessages.map(m => m.id)))` 记录挂载时的历史消息 id；渲染时消息 id 不在该集合中即 `canUndo=true`。组件因切会话（`key={view.key}`）或刷新而重挂载时集合重建，历史消息自动失去撤销权限。无定时器、无本地持久化。

**为何不用「10 秒消失」**：AI 一句话即落库，用户可能在说完多笔后才发现问题；10 秒窗口太短，而「只保留最后一条」又解决不了「记了下一笔才发现上一笔错」的场景。长期编辑/删除仍由账单页承担，两套入口职责清晰。

### 4.5 视觉规范

- 暗色玻璃拟态：`#0B0D17` 底 + `rgba(255,255,255,0.06)` 卡片 + `backdrop-blur` + 半透明描边
- 主色：靛蓝→紫罗兰渐变；支出 `#FB7185` 玫红、收入 `#4ADE80` 绿
- 图标：lucide-react；金额 `tabular-nums`
- 账本弹层：`max-h-[85dvh]` + 内部滚动，移动端不自动聚焦输入框（防键盘顶掉标题）

---

## 5. 数据模型

Supabase Postgres，DDL 见 `supabase/migrations/0001_init.sql`（可重复执行，自动为存量用户回填默认资料/账本/字典）。16 张表全部启用 RLS：

`profiles` / `ledgers` / `ledger_members` / `categories` / `payment_methods` / `tags` / `receipts` / `recurring_rules` / `transactions`（核心流水，软删 `deleted_at`）/ `transaction_tags` / `transaction_revisions` / `budgets` / `notifications` / `exports` / `chat_sessions` / `chat_messages`（`seq` 保证会话内顺序）。

关键决策：分类/支付用字典表而非 PG enum；`security definer` 成员判断函数避免 RLS 递归；统计用 SQL 函数 `tx_stats()` / `tx_daily_trend()` / `budget_usage()`；时区统一 `Asia/Shanghai`。

---

## 6. 鉴权与服务端架构（v2.0）

**架构：网页端 → Next.js 服务端 → Supabase。** 业务数据全部由服务端访问 Supabase，前端只调本站 `/api/*`。

- **会话存储**：Supabase Auth 会话写入 Cookie（`@supabase/ssr` 的 `createBrowserClient`），服务端可读；不用 localStorage。
- **页面守卫**：`proxy.ts` → `lib/supabase/proxy.ts`，服务端读 Cookie 判定。未登录页面请求 307 到 `/auth/login?redirectTo=...`；`/api/*` 不重定向，由路由返回 401，前端 `apiFetch` 统一跳登录。登录页不在服务端做自动回跳（防 401 循环），由客户端组件在确认已登录后整页跳首页。
- **会话自动刷新（关键）**：`lib/supabase/proxy.ts`（中间件）每次页面请求用 `createServerClient` 调 `auth.getUser()`，access token 过期时 SDK 自动用 refresh token 续期并把新 cookie 写回响应——这是「会话能长期保持、不会过一段时间 API 变 401」的根本机制。`getUser()` 带 8 秒超时，服务端网络不通时不拖慢请求。
- **服务端鉴权**：`lib/supabase/require-user.ts` 优先用轻量工具 `lib/supabase/cookie-session.ts` 直接解析会话 Cookie 判断 token 是否过期；未过期则跳过网络校验（避免 `/api/stats` 多次重复调 `getUser()`）；已过期才走 SSR `getUser()` 触发刷新；两者都失败才回退本地 cookie 判定，不无差别 401。
- **数据客户端**：`lib/supabase/server.ts` 的 `createSSRClient` / `createAuthClient` 用 `@supabase/ssr` 构造可读写 cookie 的服务端客户端，PostgREST + RLS 用会话 token 校验每次读写。
- **401 防循环**：`apiFetch` 对 401 统一清理会话并跳登录，带 5 秒防重入与 `sessionStorage` 来源标记；全局账本初始化请求用 `skipAuthRedirect`，不驱动整页跳转；服务端网络故障映射 503 而非 401。
- **服务端出站代理**：`instrumentation.ts` 在配置 `HTTPS_PROXY` 时用 Next 自带 undici 的 `EnvHttpProxyAgent` 为 Node 出站请求设全局代理，无需新增依赖；未配置时零影响。仅在 Node.js runtime 生效，不在顶层 import `node:*` 模块（避免 Edge Runtime 告警）。

---

## 7. API 一览

| 路由 | 方法 | 职责 |
| --- | --- | --- |
| `/api/chat` | POST | AI 对话端点：登录校验前置、账本归属校验、`streamText` + tools 流式返回 |
| `/api/ledgers` | GET/POST | 账本列表 / 新建 |
| `/api/ledgers/[id]` | 等 | 账本详情、成员邀请 |
| `/api/transactions` | GET | 账单列表（筛选/分页） |
| `/api/transactions/[id]` | PATCH/DELETE | 修改 / 软删（撤销走 DELETE） |
| `/api/stats` | GET | 周期统计（供首页快览列表） |
| `/api/budgets` | 等 | 预算 |
| `/api/chat/sessions` | GET/POST | AI 会话列表 / 新建 |
| `/api/chat/sessions/[id]` | GET/PUT/PATCH/DELETE | 消息读写、重命名、删除 |
| `/api/profile` | GET/PUT | 个人资料（服务端读写 `profiles`） |
| `/api/auth/session` | GET | 调试用登录态探测（读 Cookie） |
| `/auth/confirm` | GET | 邮件确认（`verifyOtp` 写回会话 Cookie） |

---

## 8. 非功能需求

| 项 | 要求 / 现状 |
| --- | --- |
| 响应 | 记账端到端 ≤ 3s；统计聚合在数据库完成 |
| 流式 | AI 回复流式；工具结果实时渲染为卡片 |
| 安全 | API Key 仅服务端；金额/日期/枚举 Zod 校验；账本 ID 服务端注入；RLS 按用户 + 账本成员隔离 |
| 鉴权 | 未登录任何页面导航跳登录；登录页已登录自动回首页；API 401 统一处理不循环 |
| 兼容 | Chrome / Safari 最新两版；移动端优先；语音为浏览器原生 API（不支持时降级） |
| 构建 | `pnpm exec tsc --noEmit`、`pnpm lint` 必须通过 |

---

## 9. 技术栈（实际）

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16.4.3（App Router）+ React 19 + TypeScript |
| AI | Vercel AI SDK v7（`ai` 7.0.x / `@ai-sdk/react` / `@ai-sdk/openai`），DeepSeek `deepseek-chat`（OpenAI 兼容） |
| 数据库 / 鉴权 | Supabase（Postgres + Auth + RLS），`@supabase/ssr` + `@supabase/supabase-js` |
| 校验 | Zod 4 |
| 样式 | Tailwind CSS 3.4（`globals.css` 自定义玻璃拟态主题），lucide-react |
| 语音 | 浏览器 `webkitSpeechRecognition` |
| 包管理 | pnpm |

环境变量：`.env.local` 配 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `DEEPSEEK_API_KEY`；可选 `HTTPS_PROXY` 用于服务端出站代理。

---

## 10. 验收标准

- [ ] 「今天午饭35，微信付的」→ 入库正确，出现记账卡片
- [ ] 「昨天打车58刷卡」→ 日期=昨天、分类=交通、支付=银行卡
- [ ] 「这个月餐饮花了多少」→ 统计卡数字与账单页一致（±0.01）
- [ ] 「最近5笔账单」→ 列表卡与数据库最近 5 条一致
- [ ] 「午饭35打车12」→ 入库两条；记完第二笔后第一笔的撤销按钮仍在
- [ ] 新记账卡片撤销 → 记录软删、按钮立即消失
- [ ] 刷新页面 / 切换会话后，历史消息不再有撤销按钮
- [ ] 首页统计快览列表显示今日/本月金额，账本切换与记账后自动刷新
- [ ] 未登录访问任意业务页 → 跳登录；登录后回首页；API 401 不无限循环
- [ ] AI 文字与卡片内容不重复；短文本气泡不异常换行
- [ ] `pnpm exec tsc --noEmit`、`pnpm lint` 通过

---

## 11. 目录结构（实际）

```
app/
  page.tsx                      # 首页：聊天 + 统计快览 + 卡片渲染 + 撤销
  bills/page.tsx                # 账单列表
  stats/page.tsx                # 统计
  profile/page.tsx              # 个人资料
  auth/login, confirm, error    # 登录与邮件确认
  api/chat/route.ts             # AI 端点
  api/chat/sessions/…           # 会话历史
  api/transactions/…            # 账单 CRUD
  api/ledgers/…                 # 账本与成员
  api/stats, budgets, profile, auth/session
components/
  ledger-switcher.tsx ledger-provider.tsx chat-session-drawer.tsx stats-quick-list.tsx …
lib/
  tools.ts transactions.ts ledgers.ts api.ts
  supabase/{client,server,require-user,cookie-session,proxy}.ts
supabase/migrations/0001_init.sql
proxy.ts instrumentation.ts
doc/记账Agent-需求文档.md
```
