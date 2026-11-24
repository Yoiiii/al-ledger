import { requireUserId } from "@/lib/supabase/require-user";

export type TxnType = "expense" | "income";
export type TxnCategory =
  | "餐饮"
  | "交通"
  | "购物"
  | "居住"
  | "娱乐"
  | "医疗"
  | "教育"
  | "通讯"
  | "人情"
  | "其他";
export type TxnPayment = "微信" | "支付宝" | "银行卡" | "现金" | "其他";
export type TxnSource = "ai" | "voice" | "manual" | "ocr" | "recurring" | "import";

// 与 DB 枚举保持一致的金额上限（DB: amount < 1000000）
export const MAX_AMOUNT = 1_000_000;

export interface Transaction {
  id: string;
  user_id: string;
  ledger_id: string;
  amount: number;
  currency: string;
  type: TxnType;
  category: TxnCategory;
  payment_method: TxnPayment;
  occurred_date: string; // YYYY-MM-DD
  note: string | null;
  raw_text: string | null;
  source: TxnSource;
  client_request_id: string | null;
  recurring_rule_id: string | null;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionInput = {
  amount: number;
  type?: TxnType;
  // 允许字典表里的自定义分类/支付方式（系统预设值保留类型提示）
  category: TxnCategory | (string & {});
  payment_method?: TxnPayment | (string & {});
  occurred_date: string;
  note?: string | null;
  ledger_id?: string;
  currency?: string;
  source?: TxnSource;
  raw_text?: string | null;
  client_request_id?: string;
  recurring_rule_id?: string;
};

export type ListParams = {
  limit?: number;
  startDate?: string;
  endDate?: string;
  category?: TxnCategory | (string & {});
  type?: TxnType;
  ledgerId?: string;
  orderBy?: "date_desc" | "date_asc";
};

export type StatsParams = {
  period: "today" | "week" | "month" | "custom";
  startDate?: string;
  endDate?: string;
  type?: TxnType;
  ledgerId?: string;
};

export type StatsResult = {
  total: number;
  count: number;
  byCategory: { category: TxnCategory; total: number; count: number }[];
};

export type CategoryRow = {
  user_id: string;
  kind: TxnType;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_system: boolean;
  archived_at: string | null;
};

export type PaymentMethodRow = {
  user_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  archived_at: string | null;
};

function toNumber(v: unknown): number {
  return typeof v === "string" ? Number(v) : (v as number);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function mapRow(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    ledger_id: row.ledger_id as string,
    amount: toNumber(row.amount),
    currency: (row.currency as string) ?? "CNY",
    type: row.type as TxnType,
    category: row.category as TxnCategory,
    payment_method: row.payment_method as TxnPayment,
    occurred_date: row.occurred_date as string,
    note: (row.note as string) ?? null,
    raw_text: (row.raw_text as string) ?? null,
    source: (row.source as TxnSource) ?? "manual",
    client_request_id: (row.client_request_id as string) ?? null,
    recurring_rule_id: (row.recurring_rule_id as string) ?? null,
    created_by: row.created_by as string,
    deleted_at: (row.deleted_at as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function createTransaction(
  input: TransactionInput,
): Promise<Transaction> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      ...(input.ledger_id ? { ledger_id: input.ledger_id } : {}),
      amount: input.amount,
      ...(input.currency ? { currency: input.currency } : {}),
      type: input.type ?? "expense",
      category: input.category,
      payment_method: input.payment_method ?? "其他",
      occurred_date: input.occurred_date,
      note: input.note ?? null,
      raw_text: input.raw_text ?? null,
      source: input.source ?? "manual",
      ...(input.client_request_id
        ? { client_request_id: input.client_request_id }
        : {}),
      ...(input.recurring_rule_id
        ? { recurring_rule_id: input.recurring_rule_id }
        : {}),
    })
    .select()
    .single();

  // 幂等：同一 client_request_id 重复提交（LLM 重试）时返回已有记录
  if (error) {
    if (error.code === "23505" && input.client_request_id) {
      const { data: existing } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .eq("client_request_id", input.client_request_id)
        .maybeSingle();
      if (existing) return mapRow(existing as Record<string, unknown>);
    }
    throw error;
  }
  return mapRow(data as Record<string, unknown>);
}

export async function listTransactions(
  params: ListParams = {},
): Promise<Transaction[]> {
  const { supabase } = await requireUserId();
  // 软删：只返回未删除记录
  let query = supabase.from("transactions").select("*").is("deleted_at", null);

  if (params.startDate) query = query.gte("occurred_date", params.startDate);
  if (params.endDate) query = query.lte("occurred_date", params.endDate);
  if (params.category) query = query.eq("category", params.category);
  if (params.type) query = query.eq("type", params.type);
  if (params.ledgerId) query = query.eq("ledger_id", params.ledgerId);

  // 二级排序保证同一天多笔的「最近 N 笔」顺序稳定
  const asc = params.orderBy === "date_asc";
  query = query
    .order("occurred_date", { ascending: asc })
    .order("created_at", { ascending: asc });
  if (params.limit) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(mapRow);
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function updateTransaction(
  id: string,
  patch: Partial<TransactionInput>,
): Promise<Transaction> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("transactions")
    .update({
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.payment_method !== undefined
        ? { payment_method: patch.payment_method }
        : {}),
      ...(patch.occurred_date !== undefined
        ? { occurred_date: patch.occurred_date }
        : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.raw_text !== undefined ? { raw_text: patch.raw_text } : {}),
      ...(patch.ledger_id !== undefined ? { ledger_id: patch.ledger_id } : {}),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();
  if (error) throw error;
  // 改前快照由 DB 触发器写入 transaction_revisions
  if (!data) throw new Error("NOT_FOUND");
  return mapRow(data as Record<string, unknown>);
}

/** 软删除：写 deleted_at，可被 restoreTransaction 恢复 */
export async function deleteTransaction(id: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
}

/** 恢复误删记录（撤销/回收站） */
export async function restoreTransaction(id: string): Promise<Transaction> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("transactions")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  return mapRow(data as Record<string, unknown>);
}

// ---- 时区：统一按 Asia/Shanghai 计算「今天/本周/本月」边界 --------
// 将 UTC 时间平移 8 小时后，其 UTC 日期字段即上海日历（上海无 DST）。
// 与 /api/chat 注入给 LLM 的时区口径一致，避免 UTC 部署时跨日错位。
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const shanghaiNow = () => new Date(Date.now() + SHANGHAI_OFFSET_MS);

function periodRange(p: StatsParams): { start: string; end: string } {
  const now = shanghaiNow();
  const end = ymd(now);
  const fmt = (d: Date) => ymd(d);
  if (p.period === "today") {
    return { start: end, end };
  }
  if (p.period === "week") {
    const day = now.getUTCDay() || 7; // 周一为一周开始
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - day + 1);
    return { start: fmt(monday), end };
  }
  if (p.period === "month") {
    const first = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    return { start: fmt(first), end };
  }
  // custom
  return { start: p.startDate ?? end, end: p.endDate ?? end };
}

/** 统计聚合下推到数据库（RPC tx_stats），不再拉全量行到 Node 累加 */
export async function getStats(p: StatsParams): Promise<StatsResult> {
  const { supabase } = await requireUserId();
  const { start, end } = periodRange(p);

  const { data, error } = await supabase.rpc("tx_stats", {
    p_start: start,
    p_end: end,
    p_type: p.type ?? "expense",
    p_ledger: p.ledgerId ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as {
    category: TxnCategory;
    total: unknown;
    cnt: unknown;
  }[];

  const byCategory = rows
    .map((r) => ({
      category: r.category,
      total: round2(toNumber(r.total)),
      count: Number(toNumber(r.cnt)),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total: round2(byCategory.reduce((s, c) => s + c.total, 0)),
    count: byCategory.reduce((s, c) => s + c.count, 0),
    byCategory,
  };
}

/** 每日趋势聚合下推到数据库（RPC tx_daily_trend），缺天补 0 */
export async function getDailyTrend(
  days = 7,
  ledgerId?: string,
): Promise<{ date: string; total: number }[]> {
  const { supabase } = await requireUserId();
  const end = shanghaiNow();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));

  const { data, error } = await supabase.rpc("tx_daily_trend", {
    p_days: days,
    p_type: "expense",
    p_ledger: ledgerId ?? null,
  });
  if (error) throw error;

  const map = new Map<string, number>();
  for (const row of (data ?? []) as { d: string; total: unknown }[]) {
    map.set(row.d, toNumber(row.total));
  }

  const out: { date: string; total: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = ymd(d);
    out.push({ date: key, total: round2(map.get(key) ?? 0) });
  }
  return out;
}

// ---- 字典表 CRUD（自定义分类 / 支付方式）-------------------------
export async function listCategories(kind?: TxnType): Promise<CategoryRow[]> {
  const { supabase } = await requireUserId();
  let q = supabase
    .from("categories")
    .select("user_id, kind, name, icon, color, sort_order, is_system, archived_at")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function createCategory(input: {
  kind: TxnType;
  name: string;
  icon?: string;
  color?: string;
}): Promise<CategoryRow> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      kind: input.kind,
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      is_system: false,
    })
    .select("user_id, kind, name, icon, color, sort_order, is_system, archived_at")
    .single();
  if (error) throw error;
  return data as CategoryRow;
}

export async function listPaymentMethods(): Promise<PaymentMethodRow[]> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("user_id, name, icon, sort_order, is_system, archived_at")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaymentMethodRow[];
}

export async function createPaymentMethod(input: {
  name: string;
  icon?: string;
}): Promise<PaymentMethodRow> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({
      user_id: userId,
      name: input.name,
      icon: input.icon ?? null,
      is_system: false,
    })
    .select("user_id, name, icon, sort_order, is_system, archived_at")
    .single();
  if (error) throw error;
  return data as PaymentMethodRow;
}
